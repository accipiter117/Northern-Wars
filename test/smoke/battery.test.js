// Battery (M22 A): frames only when something needs drawing. Paused and
// idle, next to none; paused with travellers in sight, a gentle few a
// second; running, no more than 30 a second; put away, none at all, with
// the sound suspended and the screen free to sleep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

test.after(async () => {
  await browser.close();
  server.close();
});

// A stand-in for the Screen Wake Lock, so the test sees when it is held.
function fakeWakeLock() {
  let held = 0;
  window.__wake = { get held() { return held; } };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async () => {
        held += 1;
        const lock = new EventTarget();
        lock.release = async () => { held -= 1; lock.dispatchEvent(new Event('release')); };
        return lock;
      },
    },
  });
}

async function open(prefs = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(fakeWakeLock);
  await page.addInitScript((p) => localStorage.setItem('northern-wars.prefs', JSON.stringify(p)), prefs);
  await page.goto(`${base}?seed=3&fresh&paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  // The map's tiles fill in over the first moments; then it rests.
  await page.waitForFunction(() => !window.northernWars.renderer.unfinished(), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  return { context, page, errors };
}

const frames = (page) => page.evaluate(() => window.northernWars.frameStats.frames);
const setVis = (page, v) => page.evaluate((state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, v);

// Close on Vizima, running until travellers are on the roads in sight.
async function travellersInSight(page) {
  await page.evaluate(() => { const v = window.northernWars.world.byId.vizima; window.northernWars.lookAt(v.x, v.y); window.northernWars.zoomTo(1.6); window.northernWars.setSpeed(1); });
  await page.waitForFunction(() => window.northernWars.renderer.flags.live.life >= 3, null, { timeout: 30000 });
}

test('paused and idle for ten seconds, the map asks for next to no frames', async () => {
  const { context, page, errors } = await open({ batterySaver: false });
  const a = await frames(page);
  await page.waitForTimeout(10000);
  const n = (await frames(page)) - a;
  assert.ok(n <= 3, `${n} frames in ten idle seconds`);
  // A tap wakes it; then it rests again.
  await page.mouse.click(200, 400);
  await page.waitForTimeout(300);
  assert.ok((await frames(page)) > a + n, 'a tap draws');
  assert.deepEqual(errors, []);
  await context.close();
});

test('paused with travellers in sight, a gentle eight frames a second; running, thirty at most', async () => {
  const { context, page, errors } = await open({ batterySaver: false });
  await travellersInSight(page);
  // Running: capped at 30 a second while the camera is still.
  let a = await frames(page);
  await page.waitForTimeout(5000);
  const running = ((await frames(page)) - a) / 5;
  assert.ok(running <= 32 && running >= 15, `${running.toFixed(1)} frames a second running`);
  await page.waitForFunction(() => window.northernWars.renderer.flags.live.life >= 2, null, { timeout: 30000 });
  await page.evaluate(() => window.northernWars.setSpeed(0));
  await page.waitForTimeout(300);
  a = await frames(page);
  await page.waitForTimeout(10000);
  const paused = ((await frames(page)) - a) / 10;
  assert.ok(paused >= 4 && paused <= 10, `${paused.toFixed(1)} frames a second paused with life in sight`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('put away, nothing draws, the sound is suspended and the screen may sleep; back, it resumes', async () => {
  const { context, page, errors } = await open({ batterySaver: false, keepAwake: true });
  // The first tap starts the sound.
  await page.mouse.click(200, 400);
  await page.waitForFunction(() => window.northernWars.audio.unlocked, null, { timeout: 5000 });
  await travellersInSight(page);
  assert.equal(await page.evaluate(() => window.__wake.held), 1, 'held while the realm runs');
  // Paused: released.
  await page.evaluate(() => window.northernWars.setSpeed(0));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__wake.held), 0, 'released on pause');
  // Running again, then put away.
  await page.evaluate(() => window.northernWars.setSpeed(1));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__wake.held), 1);
  await setVis(page, 'hidden');
  await page.waitForTimeout(800);
  const a = await frames(page);
  await page.waitForTimeout(2000);
  assert.equal((await frames(page)) - a, 0, 'nothing drawn while hidden');
  assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'the realm paused');
  assert.equal(await page.evaluate(() => window.__wake.held), 0, 'released when hidden');
  const audio = await page.evaluate(() => window.northernWars.audio);
  assert.equal(audio.context, 'suspended', 'the sound suspended');
  assert.equal(audio.musicPlaying, false, 'the music stopped');
  // Back: drawing and sound resume; the realm stays paused until played.
  await setVis(page, 'visible');
  await page.waitForTimeout(800);
  assert.ok((await frames(page)) > a, 'drawing again');
  assert.equal(await page.evaluate(() => window.northernWars.audio.context), 'running', 'the sound resumed');
  assert.equal(await page.evaluate(() => window.northernWars.speed), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Battery saver: set in Help, 30 frames even while panning, half the travellers, no wake lock', async () => {
  const { context, page, errors } = await open({ batterySaver: false, keepAwake: true });
  await travellersInSight(page);
  const full = await page.evaluate(() => window.northernWars.state.ambient.units.length);
  await page.click('#more-button');
  await page.click('[data-more="help"]');
  await page.click('[data-action="saver-on"]');
  assert.equal(await page.evaluate(() => window.northernWars.prefs.batterySaver), true);
  assert.match(await page.textContent('[data-action="saver-off"]'), /Battery saver is on/);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__wake.held), 0, 'no wake lock under Battery saver');
  // Half the travellers: only those with even numbers are drawn.
  const drawn = await page.evaluate(() => window.northernWars.renderer.flags.live.life);
  assert.ok(drawn <= Math.ceil(full / 2) + 1, `${drawn} drawn of ${full}`);
  // A long pan stays at 30 frames a second.
  await page.click('#sheet-close');
  const a = await frames(page);
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(200, 300);
    await page.mouse.down();
    await page.mouse.move(150, 300, { steps: 10 });
    await page.mouse.up();
  }
  const rate = ((await frames(page)) - a) / ((Date.now() - t0) / 1000);
  assert.ok(rate > 0 && rate <= 33, `${rate.toFixed(1)} frames a second while panning`);
  assert.deepEqual(errors, []);
  await context.close();
});
