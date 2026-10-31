// The faiths and the Book on the map close up (M26 E): a pyre, a
// procession, hospice banners, groves, the king's riders and the capital's
// gibbets drawn round Vizima without errors. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld, signLaws } from '../helpers.js';
import { createState, step, serialize, dateOf } from '../../src/sim/index.js';
import { faithMarks } from '../../src/sim/marks.js';

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

test('a pyre, a procession, banners, groves, riders and gibbets round Vizima', async () => {
  const s = step(createState(world, 3), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const fest = world.devotion.faiths.eternal_fire.festival.months;
  while (!fest.includes(dateOf(s.day).month)) s.day += 10;
  s.faiths.festivals.eternal_fire = dateOf(s.day).year;
  s.faiths.pyre = { town: 'vizima', until: s.day + 10 };
  Object.assign(s.faiths.devotion, { melitele: 45, old_ways: 65 });
  signLaws(s, world, 'curfews', 'executions', 'riders');
  const kinds = new Set(faithMarks(s, world).map((m) => m.kind));
  for (const k of ['pyre', 'procession', 'riders', 'gibbets', 'grove']) assert.ok(kinds.has(k), k);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.evaluate(() => { const nw = window.northernWars; const v = nw.world.byId.vizima; nw.zoomTo(2.6); nw.lookAt(v.x, v.y); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'portrait-faith-map.png') });
  await page.evaluate(() => { const nw = window.northernWars; const b = nw.world.byId.burdorff; nw.lookAt(b.x, b.y); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'portrait-faith-grove.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
