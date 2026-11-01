// Skellige at sea in the browser (M30 E): longships raiding a coast drawn
// on the water, and the isles' card with the crown's choices (hire them
// against a rival, or pay them off). Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { seaPath, seas } from '../../src/sim/seas.js';

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

test('longships raiding a coast, and the isles\' card', async () => {
  const s = step(createState(world, 2), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  // A raid on its way to Kerack, two thirds of the way there.
  const z = seas(s);
  z.raids = [{ id: 1, to: 'kerack_city', realm: 'kerack', start: s.day - 7, land: s.day + 3, raided: s.day + 5, home: s.day + 15, path: seaPath(world, 'kerack_city'), loot: 0, done: false }];
  s.embassies.skellige = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.evaluate(() => { const nw = window.northernWars; nw.zoomTo(1.3); nw.lookAt(-170, 650); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, 'portrait-longships.png') });
  // The isles' card: hire against Kerack is offered, Cintra never.
  await page.evaluate(() => window.northernWars.go?.('realm:skellige'));
  const opened = await page.locator('[data-part="longships"]').count();
  if (!opened) {
    await page.click('[data-tab="diplomacy"]');
    await page.waitForSelector('[data-realm="skellige"]');
    await page.click('[data-realm="skellige"]');
  }
  await page.waitForSelector('[data-part="longships"]');
  assert.equal(await page.locator('[data-hire="kerack"]').count(), 1);
  assert.equal(await page.locator('[data-hire="cintra"]').count(), 0);
  assert.match(await page.textContent('[data-part="longships"]'), /Longships at sea: Kerack/);
  await page.evaluate(() => document.querySelector('[data-part="longships"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'portrait-skellige.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
