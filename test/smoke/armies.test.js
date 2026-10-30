// Many armies in the browser (M24 E): the War tab lists every army with its
// men, spirit, pay and orders and merges any two standing together; a
// town's card sends its levy to hunt, hold, join or merge. Portrait
// screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction, crownArmies } from '../../src/sim/index.js';

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

async function go(page, route) {
  await page.evaluate((r) => {
    const b = document.createElement('button');
    b.dataset.go = r;
    document.querySelector('#sheet-body').append(b);
    b.click();
    b.remove();
  }, route);
}

const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};

function realm() {
  let s = createState(world, 2);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 40000;
  // Three armies: two at Vizima, one at Maribor; then Ellander's levy.
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false });
  s = act(s, { type: 'raise', muster: 'maribor', levy: 'third', nobles: false });
  s = step(s, 12, world, { ambient: false });
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false });
  s = act(s, { type: 'muster', settlement: 'ellander' });
  return step(s, 2, world, { ambient: false });
}

test('the War tab lists every army with men, spirit, pay and orders, and merges two standing together', async () => {
  const s = realm();
  const ours = crownArmies(s);
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="war"]');
  await page.waitForSelector('[data-part="armies"] [data-army]');
  assert.equal(await page.locator('[data-part="armies"] [data-army]').count(), ours.length);
  const text = await page.textContent('[data-part="armies"]');
  assert.match(text, /The First Army[\s\S]*The Second Army[\s\S]*The Third Army/);
  assert.match(text, /\d+ men[\s\S]*(eager|steady|shaken|broken)/);
  assert.match(text, / under (Captain|[A-Z])/);
  await page.evaluate(() => document.querySelector('[data-part="armies"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-armies.png') });
  // The two at Vizima can merge from the list, with Undo.
  const merge = page.locator('[data-part="merges"] [data-merge]').first();
  assert.ok(await merge.count(), 'a merge offered');
  await merge.click();
  await page.waitForFunction((n) => window.northernWars.state.armies.filter((a) => a.side === 'temeria').length === n - 1, ours.length);
  assert.equal(await page.isVisible('#undo'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a town\'s levy, from the town card, marches to join an army', async () => {
  const s = realm();
  const levy = crownArmies(s).find((a) => a.muster === 'ellander');
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="military"]');
  await go(page, 'town:ellander');
  await page.waitForSelector('#sheet-body');
  // The town card's Military section, wherever it sits.
  const mil = page.locator('[data-tsub="military"]').first();
  if (await mil.count()) await mil.click();
  await page.waitForSelector('[data-part="levy-orders"]');
  const march = page.locator('[data-levy-order="join"]').first();
  assert.ok(await march.count(), 'a march to join is offered');
  await page.evaluate(() => document.querySelector('[data-part="levy-orders"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-levy-join.png') });
  await march.click();
  await page.waitForFunction((id) => window.northernWars.state.armies.find((a) => a.id === id)?.order === 'join', levy.id);
  assert.deepEqual(errors, []);
  await context.close();
});
