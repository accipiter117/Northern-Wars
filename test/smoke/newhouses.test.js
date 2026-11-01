// A new house in the browser (M27 E): the lands-without-a-lord decision,
// raising a commander, the new banner over its towns, and the scaffold at
// the old seat. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction } from '../../src/sim/index.js';
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

test('a traitor beheaded, his lands given to a loyal captain, and the new banner raised', async () => {
  let s = step(createState(world, 3), 40, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 20000;
  s = applyAction(s, world, { type: 'raise', muster: 'maribor', levy: 'third', nobles: false }).state;
  rise(s, world, 'dravnik');
  s.armies = s.armies.filter((a) => a.side !== 'rebel:dravnik');
  setOwner(s, world, 'mayena', 'temeria');
  stepRebellionDay(s, world, makeRng(1));
  s = applyAction(s, world, { type: 'judgement', id: s.judgements[0].id, choice: 4 }).state;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="inbox"]');
  const card = page.locator('[data-decision^="raising:"]');
  await card.waitFor();
  assert.match(await card.textContent(), /Raise a new house to hold[\s\S]*Mayena[\s\S]*Captain of The First Army/);
  await card.locator('.choices button').first().click();
  await page.waitForFunction(() => !(window.northernWars.state.raisings ?? []).length);
  const holder = await page.evaluate(() => window.northernWars.state.settlements.mayena.holder);
  assert.ok(holder.startsWith('house'));
  await page.click('[data-sub="houses"]');
  assert.equal(await page.locator(`[data-house="${holder}"]`).count(), 1);
  await page.click('#sheet-close').catch(() => {});
  await page.evaluate(() => { const nw = window.northernWars; const m = nw.world.byId.mayena; nw.zoomTo(2.6); nw.lookAt(m.x, m.y); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, 'portrait-new-house.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
