// The Empire in the browser (M30 C): Nilfgaard among the great powers,
// Toussaint folded into its sphere, its card with its provinces and their
// governors, and the southern board. Portrait screenshots.
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

test('Nilfgaard among the great powers, Toussaint in its sphere, and its provinces', async () => {
  const s = step(createState(world, 3), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('[data-tab="diplomacy"]');
  await page.waitForSelector('[data-part="great"]');
  assert.ok((await page.$$eval('[data-part="great"] [data-realm]', (els) => els.map((e) => e.dataset.realm))).includes('nilfgaard'));
  assert.equal(await page.locator('[data-part="sphere-nilfgaard"] [data-realm="toussaint"]').count(), 1, 'Toussaint in the Empire\'s sphere');
  await page.click('[data-part="great"] [data-realm="nilfgaard"]');
  await page.waitForSelector('[data-part="provinces"]');
  const text = await page.textContent('[data-part="provinces"]');
  for (const p of ['Nazair', 'Metinna', 'Mag Turga', 'Ebbing']) assert.match(text, new RegExp(p));
  await page.evaluate(() => document.querySelector('[data-part="provinces"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'portrait-empire.png') });
  await page.click('#sheet-close');
  await page.evaluate(() => { const nw = window.northernWars; nw.zoomTo(0.45); nw.lookAt(700, 1350); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, 'portrait-board-south.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
