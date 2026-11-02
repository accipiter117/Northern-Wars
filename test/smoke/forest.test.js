// Where the Scoia'tael come from, in the browser (M32 D): the Threats screen
// and a commando's card say where this year's recruits came from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld, signLaws } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { addRecruits } from '../../src/sim/forest.js';
import { spawnScoiatael } from '../../src/sim/threats.js';
import { makeRng } from '../../src/sim/rng.js';

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

test('a commando\'s card says where its recruits came from this year', async () => {
  let s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  signLaws(s, world, 'restrictions');
  addRecruits(s, 'persecution', 41);
  addRecruits(s, 'pogroms', 63);
  addRecruits(s, 'hunger', 9);
  addRecruits(s, 'aedirn', 6);
  s.sympathy = 70;
  s.threats.list = [];
  for (let i = 0; i < 50 && !s.threats.list.length; i++) spawnScoiatael(s, world, makeRng(i));
  const t = s.threats.list[0];
  assert.ok(t, 'a commando');
  t.sighted = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('#tabbar [data-tab="military"]');
  await page.click('[data-sub="threats"]');
  await page.waitForSelector('[data-part="forest"]');
  assert.match(await page.textContent('[data-part="forest"]'), /This year \d+ have gone to the woods[\s\S]*Pogroms\s*63[\s\S]*The laws against them\s*41/);
  await page.locator(`#sheet-body [data-go="threat:${t.id}"]`).first().click();
  await page.waitForSelector('[data-part="forest"]');
  await page.evaluate(() => document.querySelector('[data-part="forest"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-scoiatael-recruits.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
