// What each people brings, in the browser (M32 C): the gifts on a town's
// People tab and the dwarven bank's terms by the loans. Portrait shots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, refreshGifts } from '../../src/sim/index.js';

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

test('the gifts of a town\'s peoples, and the dwarven bank\'s terms', async () => {
  let s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  Object.assign(s.opinion, { dwarf: 78, gnome: 72 });
  refreshGifts(s, world);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('#tabbar [data-tab="realm"]');
  await page.click('[data-sub="overview"]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('#sheet-body details')) d.open = true; });
  await page.locator('#sheet-body [data-go="town:carreras"]').first().click();
  await page.click('.segs [data-tsub="people"]');
  await page.waitForSelector('[data-part="gifts"]');
  assert.match(await page.textContent('[data-part="gifts"]'), /What they bring[\s\S]*Dwarven smiths and miners[\s\S]*mines \+\d+%[\s\S]*Gnome smiths/);
  await page.evaluate(() => document.querySelector('[data-part="gifts"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-peoples-gifts.png') });
  // The bank's terms follow the dwarves.
  await page.click('#sheet-close');
  await page.click('#tabbar [data-tab="treasury"]');
  await page.click('[data-sub="ledger"]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('#sheet-body details')) d.open = true; });
  await page.waitForSelector('[data-part="bank-dwarves"]');
  assert.match(await page.textContent('[data-part="bank-dwarves"]'), /dwarves[\s\S]*think well of the crown \(78\): interest 28% lower/);
  assert.deepEqual(errors, []);
  await context.close();
});
