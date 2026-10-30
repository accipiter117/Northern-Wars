// The fuller map in the browser (M23 D): the countryside drawn into the
// map, its fields burnt round a sacked town, thinned under Battery saver;
// townsfolk in a city close up within the life budget. Keeps portrait
// screenshots.
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

async function open(save) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), save);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

test('the countryside: its season, burnt round a sacked town, thinned under Battery saver', async () => {
  // High summer, and Maribor sacked.
  const s = step(createState(world, 3), 120, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.settlements.maribor.smoulder = s.day + 20;
  const { context, page, errors } = await open(serialize(s));
  const stats = () => page.evaluate(() => window.northernWars.renderer.countryStats);
  let st = await stats();
  assert.ok(st.marks > 3000);
  assert.equal(st.look.season, 'summer');
  assert.ok(st.look.burnt >= 1, 'Maribor\'s fields burnt');
  await page.evaluate(() => { const nw = window.northernWars; const m = nw.world.byId.maribor; nw.zoomTo(3); nw.lookAt(m.x, m.y + 30); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, 'portrait-countryside-burnt.png') });
  // Battery saver thins it: the look changes and the tiles are drawn afresh.
  await page.evaluate(() => window.northernWars.renderer.setSaver(false));
  assert.equal((await stats()).look.thin, false);
  await page.evaluate(() => window.northernWars.renderer.setSaver(true));
  assert.equal((await stats()).look.thin, true);
  // From the board, the countryside is not drawn: the board stays clean.
  await page.evaluate(() => window.northernWars.zoomTo(0.3));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'portrait-countryside-board.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('townsfolk in a city close up, within the life budget', async () => {
  const s = step(createState(world, 4), 60, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.dread = 10;
  const { context, page, errors } = await open(serialize(s));
  await page.evaluate(() => window.northernWars.renderer.setSaver(false));
  await page.evaluate(() => { const nw = window.northernWars; const v = nw.world.byId.vizima; nw.zoomTo(8); nw.lookAt(v.x, v.y); });
  await page.waitForTimeout(1200);
  const drawn = await page.evaluate(() => window.northernWars.renderer.flags.lifeDrawn);
  await page.screenshot({ path: join(OUT, 'portrait-city-life.png') });
  assert.ok(drawn > 0 && drawn <= 240, `${drawn} figures`);
  assert.deepEqual(errors, []);
  await context.close();
});
