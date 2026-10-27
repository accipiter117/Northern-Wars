// The native feel (M15 A): long press as a game gesture, no browser menus or
// selection, map gestures with momentum, an installable app that plays
// offline, saving and pausing when put away, and no needless drawing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { swSource } from '../../tools/sw.mjs';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction, wildSites } from '../../src/sim/index.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();

test.after(async () => {
  await browser.close();
  server.close();
});

function realm() {
  let s = step(createState(world, 1262), 30, world);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.treasury = 6000;
  const marsh = wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
  s.threats.list = [{ id: 1, kind: 'bandits', terrain: 'marsh', x: marsh.x, y: marsh.y, near: 'anchor', men: 40, morale: 70, born: s.day, band: null, sighted: true, campSeen: true, alerted: true, rumour: null }];
  s.threats.nextId = 2;
  s = applyAction(s, world, { type: 'recruit', settlement: 'gors_velen', kind: 'menatarms' }).state;
  return { s, marsh };
}

async function open(save, query = '?paused&nohints', vp = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  if (save) await page.addInitScript((sv) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('northern-wars.save', sv); sessionStorage.setItem('seeded', '1'); } }, save);
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

const centre = (page, id) => page.evaluate((p) => { const st = window.northernWars.world.byId[p]; window.northernWars.lookAt(st.x, st.y); return window.northernWars.screenOf(p); }, id);
async function hold(page, x, y, ms = 650) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('a long press on the map opens quick actions, and selects nothing', async () => {
  const { s, marsh } = realm();
  const { context, page, errors } = await open(serialize(s));
  const v = await centre(page, 'vizima');
  await page.mouse.move(v.x, v.y);
  await page.mouse.down();
  await page.waitForTimeout(250);
  assert.equal(await page.isVisible('#press-ring'), true, 'a ring fills under the finger');
  await page.waitForTimeout(400);
  await page.mouse.up();
  const ring = await page.textContent('#quick-ring');
  for (const label of ['Works', 'Recruit', 'Garrison', 'Trade route', 'Open card']) assert.match(ring, new RegExp(label));
  assert.equal(await page.evaluate(() => getSelection().toString()), '', 'no text selected');
  assert.equal(await page.isHidden('#sheet'), true, 'a long press is not a tap');
  await page.screenshot({ path: join(OUT, 'm15-quick-ring.png') });
  await page.click('.quick-btn:has-text("Works")');
  assert.equal(await page.evaluate(() => window.northernWars.ui.route), 'town:vizima');
  assert.match(await page.textContent('.segs .seg.on'), /Works/);
  await page.click('#sheet-close');

  // A crown company: its orders.
  await page.evaluate(() => { const st = window.northernWars.world.byId.gors_velen; window.northernWars.lookAt(st.x, st.y); });
  const c = await page.evaluate(() => {
    const nw = window.northernWars;
    for (let dy = -40; dy <= 40; dy += 4) for (let dx = -40; dx <= 40; dx += 4) {
      const g = nw.screenOf('gors_velen');
      const hit = nw.pickAt(g.x + dx, g.y + dy);
      if (hit?.company) return { x: g.x + dx, y: g.y + dy };
    }
    return null;
  });
  assert.ok(c, 'the company is on the map');
  await hold(page, c.x, c.y);
  assert.match(await page.textContent('#quick-ring'), /Station[\s\S]*Patrol[\s\S]*Escort[\s\S]*Hunt[\s\S]*Respond/);
  await page.click('.quick-btn:has-text("Respond")');
  assert.equal(await page.evaluate(() => window.northernWars.state.forces.companies[0].order.kind), 'respond');

  // A threat: send the nearest suitable company.
  const t = await page.evaluate(([x, y]) => { window.northernWars.lookAt(x, y); return window.northernWars.screenOfPoint(x, y); }, [marsh.x, marsh.y]);
  await hold(page, t.x, t.y);
  assert.match(await page.textContent('#quick-ring'), /Send nearest[\s\S]*Open card/);
  await page.click('.quick-btn:has-text("Send nearest")');
  assert.equal(await page.evaluate(() => window.northernWars.state.forces.companies[0].order.kind), 'hunt');

  // Open land: what is here.
  await page.evaluate(() => window.northernWars.lookAt(500, 420));
  const empty = await page.evaluate(() => {
    for (let y = 200; y < 600; y += 13) for (let x = 40; x < 350; x += 17) if (!window.northernWars.pickAt(x, y)) return { x, y };
    return null;
  });
  await hold(page, empty.x, empty.y);
  assert.match(await page.textContent('#peek'), /What.s here[\s\S]*Temeria[\s\S]*miles from/);
  await page.screenshot({ path: join(OUT, 'm15-whats-here.png') });
  assert.equal(await page.evaluate(() => getSelection().toString()), '');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a long press on a list row shows a quick look without leaving the list', async () => {
  const { context, page, errors } = await open(serialize(realm().s));
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="houses"]');
  await page.locator('[data-house="brodowin"]').scrollIntoViewIfNeeded();
  const row = await page.locator('[data-house="brodowin"]').boundingBox();
  await hold(page, row.x + 60, row.y + row.height / 2);
  assert.match(await page.textContent('#peek'), /Brodowin[\s\S]*Loyalty/);
  assert.equal(await page.evaluate(() => window.northernWars.ui.route), 'tab:court', 'still on the list');
  assert.deepEqual(errors, []);
  await context.close();
});

test('no browser menus on the map or the interface; fields stay selectable', async () => {
  const { context, page, errors } = await open(null, '?seed=3&fresh&paused&nohints');
  const blocked = (sel) => page.evaluate((q) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector(q).dispatchEvent(e);
    return e.defaultPrevented;
  }, sel);
  assert.equal(await blocked('#map'), true, 'no menu on the map');
  assert.equal(await blocked('#date'), true, 'no menu on the top bar');
  assert.equal(await blocked('[data-tab="realm"]'), true, 'no menu on a tab');
  const css = await page.evaluate(() => {
    const b = getComputedStyle(document.body);
    return [b.userSelect || b.webkitUserSelect, b.webkitTouchCallout, document.querySelectorAll('img[draggable="true"]').length];
  });
  assert.equal(css[0], 'none');
  assert.equal(css[2], 0, 'no draggable images');
  await page.click('#more-button');
  await page.click('[data-more="help"]');
  assert.equal(await blocked('[data-field="q"]'), false, 'a search field keeps its menu');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-field="q"]')).userSelect), 'text');
  assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-field="q"]')).fontSize)) >= 16, 'no zoom on focus');
  // A button looks pressed as soon as it is touched.
  const pressed = await page.evaluate(() => {
    const b = document.querySelector('[data-tab="military"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const on = b.classList.contains('pressed');
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return on && !b.classList.contains('pressed');
  });
  assert.equal(pressed, true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('map gestures: momentum comes to rest, double-tap zooms in, two-finger tap zooms out', async () => {
  const { context, page, errors } = await open(null, '?seed=3&fresh&paused&nohints');
  const at = () => page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.waitForFunction(() => !window.northernWars.tileStats.pending);
  // A flick: the map glides on after the finger lifts, then stops.
  await page.mouse.move(200, 500);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(200 - i * 25, 500); await page.waitForTimeout(8); }
  await page.mouse.up();
  const lifted = await at();
  await page.waitForTimeout(250);
  const gliding = await at();
  assert.ok(lifted.x - gliding.x > 5, `glides on after the flick (${lifted.x} then ${gliding.x})`);
  await page.waitForTimeout(1800);
  const a = await at();
  await page.waitForTimeout(300);
  const b = await at();
  assert.ok(Math.abs(a.x - b.x) < 0.5, 'and comes to rest');

  // Double tap on open land zooms in.
  // A hard flick can carry the view off over a neighbour, where every spot
  // picks that realm: back home first, then find a spot with nothing to pick.
  await page.evaluate(() => { const v = window.northernWars.world.byId.vizima; window.northernWars.lookAt(v.x, v.y); });
  const empty = await page.evaluate(() => {
    for (let y = 160; y < innerHeight - 160; y += 7) for (let x = 30; x < innerWidth - 30; x += 7) if (!window.northernWars.pickAt(x, y)) return { x, y };
    return null;
  });
  assert.ok(empty, 'open land to double tap');
  const scale = () => page.evaluate(() => { const nw = window.northernWars; const p = nw.screenOfPoint(0, 0); const q = nw.screenOfPoint(100, 0); return (q.x - p.x) / 100; });
  const s0 = await scale();
  await page.touchscreen.tap(empty.x, empty.y);
  await page.touchscreen.tap(empty.x, empty.y);
  await page.waitForTimeout(400);
  const s1 = await scale();
  assert.ok(s1 > s0 * 1.6, `double tap zooms in (${s0.toFixed(2)} to ${s1.toFixed(2)})`);

  // A two-finger tap zooms back out.
  const cdp = await context.newCDPSession(page);
  const pts = [{ x: 150, y: 400, id: 1 }, { x: 250, y: 400, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  const s2 = await scale();
  assert.ok(s2 < s1 * 0.7, `two-finger tap zooms out (${s1.toFixed(2)} to ${s2.toFixed(2)})`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('put away, the reign is saved and paused, and stays paused on return', async () => {
  const { context, page, errors } = await open(null, '?seed=3&fresh&nohints');
  await page.evaluate(() => { localStorage.removeItem('northern-wars.save'); window.northernWars.setSpeed(2); });
  const setVis = (v) => page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  await setVis('hidden');
  assert.ok(await page.evaluate(() => localStorage.getItem('northern-wars.save')?.includes('northern-wars-save')), 'saved when hidden');
  assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'paused when hidden');
  await setVis('visible');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'still paused on return');
  assert.deepEqual(errors, []);
  await context.close();
});

test('paused with nothing moving, the map is not redrawn', async () => {
  const { context, page, errors } = await open(null, '?seed=3&fresh&paused&nohints');
  // The painted map's tiles fill in over the first moments; then it rests.
  await page.waitForFunction(() => !window.northernWars.tileStats.pending);
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => window.northernWars.renderStats.draws);
  await page.waitForTimeout(1000);
  const b = await page.evaluate(() => window.northernWars.renderStats.draws);
  assert.equal(b - a, 0, `${b - a} draws while idle`);
  // The canvas is never denser than two pixels to one.
  assert.ok(await page.evaluate(() => document.getElementById('map').width / document.getElementById('map').clientWidth) <= 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('an installable app: a valid manifest and icons, and a service worker that plays offline', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'any');
  assert.ok(manifest.name && manifest.short_name && manifest.start_url && manifest.theme_color && manifest.background_color);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const i of manifest.icons) {
    const png = await readFile(join(ROOT, i.src));
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, i.sizes, `${i.src} is ${i.sizes}`);
  }
  // sw.js lists every game file and is current.
  assert.equal(await readFile(join(ROOT, 'sw.js'), 'utf8'), await swSource(), 'sw.js is out of date: run npm run sw');

  const { context, page, errors } = await open(null, '?sw&seed=3&fresh&paused&nohints');
  assert.equal(await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href')), 'manifest.webmanifest');
  assert.ok(await page.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && !!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  // Every file is in the cache before going offline.
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    const c = keys.find((k) => k.startsWith('northern-wars-'));
    return c && (await (await caches.open(c)).keys()).length > 50;
  }, null, { timeout: 15000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden, null, { timeout: 15000 });
  assert.match(await page.textContent('#date'), /1262/);
  await context.setOffline(false);
  assert.deepEqual(errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED/.test(e)), []);
  await context.close();
});
