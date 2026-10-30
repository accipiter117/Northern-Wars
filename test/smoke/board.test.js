// The two levels of the map in the browser (M20 D and E): the kingdom view
// with its works pips, the cross-fade, and the board of the North with a
// realm's card, orders and a march. Keeps screenshots of each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';

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

// Two months in, with Cintra's army marching on Sodden for the dashed line.
function realm() {
  const s = step(createState(world, 20), 60, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const a = s.armies.find((x) => x.side === 'cintra');
  a.target = Object.keys(s.realms.sodden.settlements)[0];
  a.order = 'siege';
  return s;
}

async function open(vp, save) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), save);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

const zoom = async (page, rel) => {
  await page.evaluate((r) => window.northernWars.zoomTo(r), rel);
  await page.waitForTimeout(300);
  return page.evaluate(() => window.northernWars.boardness);
};

test('one map, two levels: pips up close, a cross-fade, and the board of the North', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 }, serialize(realm()));
  // Up close: the kingdom view, with works pips beside the settlements.
  assert.equal(await zoom(page, 1.6), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.map-board')).opacity), '0');
  assert.doesNotMatch(await page.textContent('#topbar'), /The North/);
  await page.screenshot({ path: join(OUT, 'portrait-kingdom-pips.png') });
  // Two thirds of the opening zoom: halfway through the cross-fade.
  const half = await zoom(page, 0.66);
  assert.ok(half > 0.3 && half < 0.7, `boardness ${half}`);
  await page.screenshot({ path: join(OUT, 'portrait-crossfade.png') });
  // Further out: the board, its top bar and its orders.
  assert.equal(await zoom(page, 0.45), 1);
  assert.match(await page.textContent('#topbar'), /The North/);
  assert.match(await page.textContent('#pressure'), /0 of 3 orders set/);
  // Tapping a realm opens its short card, with the three orders.
  const red = await page.evaluate(() => window.northernWars.markerOf('redania'));
  await page.touchscreen.tap(red.x, red.y);
  await page.waitForSelector('#sheet:not([hidden])');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.northernWars.ui.route), 'board:redania');
  assert.match(await page.textContent('#sheet-body'), /Men[\s\S]*Places[\s\S]*Works[\s\S]*0 of 3 orders set[\s\S]*March[\s\S]*Envoy[\s\S]*Trade/);
  await page.click('[data-board-order="envoy"]');
  await page.waitForTimeout(200);
  // A trade order in the five goods (M21): 25 loads a month of what they want.
  await page.click('[data-form="deal:redania"] [data-set="sellQty:25"]');
  await page.click('[data-board-order="trade"]');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.northernWars.state.orders.list.length), 2);
  assert.match(await page.textContent('#sheet-body'), /2 of 3 orders set/);
  assert.match(await page.textContent('#pressure'), /2 of 3 orders set/);
  await page.evaluate(() => { document.getElementById('sheet-body').scrollTop = 0; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(OUT, 'portrait-board-orders.png') });
  // The month's orders, from the top bar.
  await page.click('#pressure');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.northernWars.ui.route), 'orders');
  assert.match(await page.textContent('#sheet-body'), /An envoy to Redania[\s\S]*Trade with Redania/);
  await page.click('#sheet-close');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-board.png') });
  // Tapping Temeria glides back into the kingdom view.
  const tem = await page.evaluate(() => window.northernWars.markerOf('temeria'));
  await page.touchscreen.tap(tem.x, tem.y);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.northernWars.boardness), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the board in landscape, and its frames stay cheap', async () => {
  const { context, page, errors } = await open({ width: 844, height: 390 }, serialize(realm()));
  assert.equal(await zoom(page, 0.45), 1);
  await page.screenshot({ path: join(OUT, 'landscape-board.png') });
  // A pan across the board on a CPU four times slower, the realm running:
  // the overlay keeps within a sixtieth of a second a frame.
  await page.waitForTimeout(600);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => window.northernWars.setSpeed(1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.northernWars.resetFrameStats());
  await page.mouse.move(420, 200);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(420 + Math.sin(i / 6) * 160, 200 + Math.cos(i / 6) * 80); await page.waitForTimeout(30); }
  await page.mouse.up();
  const f = await page.evaluate(() => window.northernWars.frameStats);
  assert.ok(f.frames > 30, `${f.frames} frames drawn`);
  // The interface's own cost a frame (days of the realm fall on fewer, capped frames since M22 A).
  assert.ok(f.meanCalm < 8, `${f.meanCalm.toFixed(1)} ms a frame on average`);
  assert.ok(f.p95Calm < 1000 / 60, `${f.p95Calm.toFixed(1)} ms for the slowest frames`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => window.northernWars.setSpeed(0));
  assert.deepEqual(errors, []);
  await context.close();
});
