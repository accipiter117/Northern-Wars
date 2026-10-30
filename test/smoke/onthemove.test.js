// Armies and figures on the move in the browser (M23 C): a column on the
// march with its days to go, a long press for an army's details and for a
// figure on the road, and the army card's merge, march to join and divide.
// Keeps portrait screenshots of each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction } from '../../src/sim/index.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();
const marshals = Object.keys(world.war.marshals);

test.after(async () => {
  await browser.close();
  server.close();
});

const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};

// Two armies of ours (one on the march to Maribor), a third that will
// march to join, and a lord riding to court.
function realm() {
  let s = step(createState(world, 8), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 30000;
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'all', nobles: true, mercs: [], units: [], marshal: marshals[0], stance: 'cautious' });
  s = act(s, { type: 'raise', muster: 'maribor', levy: 'third', nobles: false, mercs: [], units: [], marshal: marshals[1], stance: 'cautious' });
  for (const a of s.armies) a.gatherUntil = 0;
  const a = s.armies.find((x) => x.at === 'vizima');
  s = act(s, { type: 'army', army: a.id, order: 'defend', target: 'maribor' });
  s = act(s, { type: 'house', house: Object.keys(world.houses.houses)[1], kind: 'summon' });
  return step(s, 2, world, { ambient: false });
}

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

async function hold(page, x, y, ms = 650) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('a column on the march, its days to go, and a long press for its details and for a figure', async () => {
  const s = realm();
  const marching = s.armies.find((x) => x.to);
  assert.ok(marching, 'an army on the road');
  const { context, page, errors } = await open(serialize(s));
  await page.evaluate(() => { const nw = window.northernWars; const a = nw.world.byId.vizima; const b = nw.world.byId.maribor; nw.lookAt((a.x + b.x) / 2, (a.y + b.y) / 2); nw.zoomTo(2.2); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'portrait-column.png') });
  // The army's details on a long press.
  await page.evaluate((id) => { const nw = window.northernWars; const a = nw.state.armies.find((x) => x.id === id); const p = nw.world.byId[a.at]; nw.lookAt(p.x, p.y); }, marching.id);
  await page.waitForTimeout(300);
  const p = await page.evaluate((id) => window.northernWars.armyScreenOf(id), marching.id);
  await hold(page, p.x, p.y - 6);
  await page.waitForSelector('#peek:not([hidden])');
  const details = await page.textContent('[data-part="army-details"]');
  assert.match(details, /[\d,]+ men in \d+ compan(y|ies), under .+\. Spirit \d+\./);
  assert.match(await page.textContent('#peek'), /arrives in \d+ days?/);
  await page.screenshot({ path: join(OUT, 'portrait-army-details.png') });
  await page.mouse.click(10, 300);
  // A lord riding to court, named on a long press.
  const lord = s.figures.find((f) => f.kind === 'lord');
  assert.ok(lord);
  await page.evaluate((id) => { const nw = window.northernWars; const f = nw.state.figures.find((x) => x.id === id); const q = nw.world.byId[f.from]; nw.lookAt(q.x, q.y); nw.zoomTo(2.2); }, lord.id);
  await page.waitForTimeout(300);
  const fq = await page.evaluate((id) => window.northernWars.figureScreenOf(id), lord.id);
  const hit = await page.evaluate((pt) => window.northernWars.pickAt(pt.x, pt.y), fq);
  assert.equal(hit?.figure, lord.id, 'the map picks the lord');
  await hold(page, fq.x, fq.y);
  await page.waitForSelector('#peek:not([hidden])');
  assert.match(await page.textContent('[data-part="what-unit"]'), /, riding from .+ to Vizima: summoned to court\. \d+ days to go\.|Arrives tomorrow/);
  await page.screenshot({ path: join(OUT, 'portrait-figure.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('the army card: join under a chosen marshal, march to join, and divide', async () => {
  let s = realm();
  // Both armies at Vizima for the merge; a third at Maribor to march to.
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false, mercs: [], units: [], marshal: marshals[2], stance: 'cautious' });
  const first = s.armies.find((x) => x.marshal === marshals[0]);
  first.to = null; first.path = []; first.at = 'vizima'; first.dest = 'vizima'; first.order = 'defend'; first.target = 'vizima';
  for (const a of s.armies) a.gatherUntil = 0;
  const third = s.armies.find((x) => x.marshal === marshals[2]);
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="forces"]');
  await page.click(`[data-army="${first.id}"]`);
  await page.waitForSelector('[data-part="companies"]');
  // Two ways to join: under either marshal.
  const both = await page.$$eval(`[data-merge="${third.id}"]`, (els) => els.map((e) => e.dataset.mergeMarshal));
  assert.deepEqual(both.sort(), [marshals[0], marshals[2]].sort());
  // March to join the army at Maribor is offered.
  const maribor = s.armies.find((x) => x.marshal === marshals[1]);
  assert.equal(await page.locator(`[data-join="${maribor.id}"]`).count(), 1);
  await page.evaluate(() => document.querySelector('[data-part="companies"]').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(OUT, 'portrait-army-join.png') });
  // Join the third under its own marshal.
  await page.click(`[data-merge="${third.id}"][data-merge-marshal="${marshals[2]}"]`);
  await page.waitForFunction((id) => !window.northernWars.state.armies.some((x) => x.id === id), third.id);
  assert.equal(await page.evaluate((id) => window.northernWars.state.armies.find((x) => x.id === id).marshal, first.id), marshals[2]);
  // Divide: two companies march apart under no marshal.
  await page.evaluate(() => { const d = document.querySelector('details[data-sec="split"]'); if (d) d.open = true; });
  await page.waitForSelector('[data-split-band="0"]', { state: 'attached' });
  await page.evaluate(() => document.querySelector('[data-split-band="0"]').scrollIntoView({ block: 'center' }));
  await page.click('[data-split-band="0"]');
  await page.click('[data-split-band="1"]');
  await page.screenshot({ path: join(OUT, 'portrait-army-split.png') });
  const before = await page.evaluate(() => window.northernWars.state.armies.length);
  await page.evaluate(() => document.querySelector('[data-split]').scrollIntoView({ block: 'center' }));
  await page.click('[data-split]');
  await page.waitForFunction((n) => window.northernWars.state.armies.length === n + 1, before);
  // March to join, from the card: the order is given.
  await page.evaluate(() => document.querySelector('[data-part="companies"]').scrollIntoView({ block: 'start' }));
  await page.click(`[data-join="${maribor.id}"]`);
  assert.equal(await page.evaluate((id) => window.northernWars.state.armies.find((x) => x.id === id).order, first.id), 'join');
  assert.deepEqual(errors, []);
  await context.close();
});
