// A rising in the browser (M27 C and D): the rebel host and its banners on
// the map, and the Judgement card with the lord's portrait slot and each
// choice's effects, which pauses the realm. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { rise, stepRebellionDay } from '../../src/sim/rebellion.js';
import { setOwner } from '../../src/sim/conflict.js';
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

async function open(save, query = '?paused&nohints') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), save);
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

function realm() {
  const s = step(createState(world, 3), 40, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 20000;
  return s;
}

test('a rebel host under its banners on the map, its castles turned', async () => {
  const s = realm();
  rise(s, world, 'dravnik');
  const { context, page, errors } = await open(serialize(s));
  assert.equal(await page.evaluate(() => window.northernWars.state.settlements.mayena.occupier), 'rebel:dravnik');
  await page.evaluate(() => { const nw = window.northernWars; const m = nw.world.byId.mayena; nw.zoomTo(2.4); nw.lookAt(m.x, m.y); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'portrait-rebel-host.png') });
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="houses"]');
  assert.match(await page.textContent('[data-house="dravnik"]'), /In rebellion/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the Judgement card: crimes, portrait slot, five choices with their effects; it pauses the realm', async () => {
  const s = realm();
  rise(s, world, 'gelbrand');
  setOwner(s, world, world.houses.houses.gelbrand.seat, 'temeria');
  stepRebellionDay(s, world, makeRng(1));
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="inbox"]');
  const card = page.locator('.decision.judgement');
  await card.waitFor();
  assert.equal(await card.locator('.judge-portrait').count(), 1);
  const text = await card.textContent();
  assert.match(text, /The judgement of Lord Ottokar Gelbrand/);
  assert.match(text, /raised House Gelbrand against the crown/);
  assert.equal(await card.locator('.choices button').count(), 5);
  assert.match(text, /Pardon:[\s\S]*Fine and hostage:[\s\S]*Strip lands and titles:[\s\S]*Exile:[\s\S]*Execute:/);
  await card.evaluate((el) => { el.scrollIntoView({ block: 'start' }); let p = el.parentElement; while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement; p?.scrollBy(0, -70); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-judgement.png') });
  await card.locator('.choices button').nth(4).click();
  await page.waitForFunction(() => !window.northernWars.state.houses.gelbrand);
  assert.ok(await page.evaluate(() => window.northernWars.state.fallenHouses.at(-1).how === 'execute'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('a new judgement pauses a running realm', async () => {
  const s = realm();
  rise(s, world, 'ostrowicz');
  // The host broken and the seat retaken: the next day's step brings the
  // lord to judgement.
  s.armies = s.armies.filter((a) => a.side !== 'rebel:ostrowicz');
  setOwner(s, world, world.houses.houses.ostrowicz.seat, 'temeria');
  const { context, page, errors } = await open(serialize(s), '?nohints');
  await page.click('[data-speed="2"]');
  await page.waitForFunction(() => (window.northernWars.state.judgements ?? []).length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const d = await page.evaluate(() => window.northernWars.state.day);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.northernWars.state.day), d, 'the realm waits on the king');
  assert.deepEqual(errors, []);
  await context.close();
});
