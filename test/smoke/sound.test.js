// Music and sound (M18): the soundtrack loops and waits for the first tap;
// interface actions ask for their sounds; muted means silent; settings are
// kept; the service worker keeps music out of the install but serves it with
// Range answers once cached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { swSource } from '../../tools/sw.mjs';
import { ROOT } from '../helpers.js';

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });

test.after(async () => {
  await browser.close();
  server.close();
});

async function open(prefs = null) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  if (prefs) await page.addInitScript((p) => localStorage.setItem('northern-wars.prefs', p), JSON.stringify(prefs));
  await page.goto(`${base}?seed=7&fresh&paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

const nw = (page, f) => page.evaluate(f);

test('the soundtrack is in place, small enough, and not part of the install', async () => {
  const s = await stat(join(ROOT, 'assets/audio/march-of-the-shadow.m4a'));
  assert.ok(s.size > 1_000_000 && s.size < 4_000_000, `track is ${s.size} bytes`);
  const sw = await swSource();
  assert.ok(!sw.includes('assets/audio/'.concat('march')), 'music is not precached');
  assert.ok(sw.includes("'Content-Range'"), 'the worker answers Range requests for music');
});

test('nothing plays before the first tap; the first tap starts the looping music', async () => {
  const { context, page, errors } = await open();
  let a = await nw(page, () => window.northernWars.audio);
  assert.equal(a.unlocked, false);
  assert.equal(a.musicPlaying, false);
  await page.click('#tabbar [data-tab="realm"]');
  await page.waitForFunction(() => window.northernWars.audio.musicPlaying, null, { timeout: 5000 });
  a = await nw(page, () => window.northernWars.audio);
  assert.equal(a.unlocked, true);
  assert.equal(a.src, 'assets/audio/march-of-the-shadow.m4a');
  const loop = await page.evaluate(() => [...document.querySelectorAll('audio')].length === 0);
  assert.ok(loop, 'the music element is not left in the page');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a finger tap (not just a mouse click) starts the music on a phone', async () => {
  const { context, page, errors } = await open();
  const box = await page.locator('#tabbar [data-tab="court"]').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.northernWars.audio.unlocked && window.northernWars.audio.musicPlaying, null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('interface actions ask for their sounds', async () => {
  const { context, page, errors } = await open();
  await page.click('#tabbar [data-tab="realm"]');
  await page.waitForFunction(() => window.northernWars.audio.unlocked);
  await page.waitForTimeout(200);
  let heard = await nw(page, () => window.northernWars.heard);
  assert.ok(heard.includes('flick'), `tab switch: ${heard}`);
  assert.ok(heard.includes('open'), `sheet opens: ${heard}`);

  await page.click('[data-speed="2"]');
  await page.waitForTimeout(100);
  heard = await nw(page, () => window.northernWars.heard);
  assert.ok(heard.includes('clock'), `speed change: ${heard}`);

  await page.click('#sheet-close');
  await page.waitForTimeout(100);
  heard = await nw(page, () => window.northernWars.heard);
  assert.ok(heard.includes('close'), `sheet closes: ${heard}`);

  // A decree is sealed; spending coin clinks; a refused order knocks.
  await page.waitForTimeout(600);
  await nw(page, () => window.northernWars.order({ type: 'law', law: 'taxation', option: 'heavy' }));
  await page.waitForTimeout(300);
  let asked = await nw(page, () => window.northernWars.sounds);
  assert.ok(asked.includes('seal'), `law: ${asked}`);
  await nw(page, () => window.northernWars.order({ type: 'build', settlement: 'nowhere', building: 'none' }));
  asked = await nw(page, () => window.northernWars.sounds);
  assert.equal(asked.at(-1), 'knock');
  assert.deepEqual(errors, []);
  await context.close();
});

test('muted effects stay silent, muted music does not start, and settings are kept', async () => {
  const { context, page, errors } = await open({ musicOn: false, sfxOn: false });
  await page.click('#tabbar [data-tab="realm"]');
  await page.waitForTimeout(400);
  const a = await nw(page, () => window.northernWars.audio);
  assert.equal(a.unlocked, true);
  assert.equal(a.musicPlaying, false);
  const asked = await nw(page, () => window.northernWars.sounds);
  const heard = await nw(page, () => window.northernWars.heard);
  assert.ok(asked.length > 0, 'sounds were asked for');
  assert.deepEqual(heard, [], 'but none were heard');

  // Turn the music back on from Help; it starts and the choice is saved.
  await page.click('#more-button');
  await page.click('[data-more="help"]');
  await page.click('[data-action="music-on"]');
  await page.waitForFunction(() => window.northernWars.audio.musicPlaying, null, { timeout: 5000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('northern-wars.prefs')));
  assert.equal(saved.musicOn, true);
  assert.equal(saved.sfxOn, false);

  // The volume slider is kept too.
  await page.$eval('[data-volume="music"]', (r) => { r.value = '25'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  const vol = await page.evaluate(() => JSON.parse(localStorage.getItem('northern-wars.prefs')).musicVolume);
  assert.equal(vol, 0.25);
  assert.deepEqual(errors, []);
  await context.close();
});
