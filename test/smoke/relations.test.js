// The relations screen and the crown's style (M29 A): great powers first,
// then our vassals, the middle crowns, other powers' spheres folded under
// their suzerain, the petty kingdoms last; Foltest's style on the Court with
// the titles he has won. Portrait screenshots.
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

test('the relations screen in order of weight, with spheres folded, and the crown\'s style', async () => {
  const s = step(createState(world, 3), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.realms.sodden.suzerain = 'temeria';
  s.realms.brugge.suzerain = 'temeria';
  s.realms.kerack.suzerain = 'redania';
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
  const order = await page.$$eval('[data-part="realms"] > [data-part]', (els) => els.map((e) => e.dataset.part));
  assert.deepEqual(order, ['great', 'vassals', 'middle', 'spheres', 'petty', 'lawless']);
  assert.deepEqual(await page.$$eval('[data-part="great"] [data-realm]', (els) => els.map((e) => e.dataset.realm)), ['redania', 'kaedwen', 'aedirn']);
  assert.deepEqual((await page.$$eval('[data-part="vassals"] [data-realm]', (els) => els.map((e) => e.dataset.realm))).sort(), ['brugge', 'sodden']);
  assert.equal(await page.locator('[data-part="sphere-redania"]').count(), 1);
  assert.equal(await page.locator('[data-part="sphere-redania"]').getAttribute('open'), null, 'folded');
  assert.ok(!(await page.$$eval('[data-part="petty"] [data-realm]', (els) => els.map((e) => e.dataset.realm))).includes('kerack'));
  await page.evaluate(() => document.querySelector('[data-part="realms"]').scrollIntoView({ block: 'start' }));
  await page.click('[data-part="sphere-redania"] summary');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, 'portrait-relations.png') });
  await page.click('[data-tab="court"]');
  assert.equal(await page.textContent('[data-part="style"]'), 'Foltest, King of Temeria, Prince of Sodden, Protector of Brugge');
  await page.screenshot({ path: join(OUT, 'portrait-style.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
