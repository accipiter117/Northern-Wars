// The Spies screen in the browser (M31 A): the budget, the spymaster's
// candidates and office, our networks by realm and the foreign agents known
// at home. Portrait screenshots.
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

test('the Spies screen: budget, spymaster and networks', async () => {
  const s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  s.spycraft.nets.temeria.redania = 38;
  s.spycraft.nets.temeria.kaedwen = 24;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  // Since M34 C the Spies screen is under Diplomacy.
  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-sub="spies"]');
  await page.waitForSelector('[data-part="networks"]');
  // No spymaster yet: candidates offered; of the foreign agents only
  // Redania's are known, read from their own letters.
  assert.equal(await page.locator('[data-candidate]').count(), world.spies.spymaster.candidates);
  assert.equal(await page.locator('[data-foreign]').count(), 1);
  assert.match(await page.textContent('[data-foreign="redania"]'), /deep, from their own letters/);
  // Redania first among our networks; its plans are open to us.
  assert.equal(await page.locator('.spy-net').first().getAttribute('data-net'), 'redania');
  assert.match(await page.textContent('[data-net="redania"]'), /plans and spies/);
  // Set a budget and name a spymaster.
  await page.click('[data-spy-budget="500"]');
  await page.waitForSelector('[data-spy-budget="500"][aria-pressed="true"]');
  await page.click('[data-candidate]');
  await page.waitForSelector('[data-spymaster="dismiss"]');
  assert.ok(await page.evaluate(() => !!window.northernWars.state.spycraft.spymaster));
  assert.equal(await page.evaluate(() => window.northernWars.state.spycraft.budget), 500);
  assert.ok(await page.locator('[data-foreign]').count() >= 3);
  assert.match(await page.textContent('[data-foreign="nilfgaard"]'), /As far as our spymaster can tell/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-spies.png') });
  await page.evaluate(() => document.querySelector('[data-part="networks"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-spies-networks.png') });
  await page.evaluate(() => document.querySelector('[data-part="foreign-spies"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-spies-foreign.png') });
  // Tap Kaedwen's network: its card, with the operations our depth allows.
  await page.evaluate(() => {
    const nw = window.northernWars;
    nw.state.spycraft.nets.temeria.kaedwen = 72;
  });
  await page.click('[data-net="kaedwen"]');
  await page.waitForSelector('[data-part="operations"]');
  assert.equal(await page.locator('[data-op^="bribe:"]').count(), 1);
  assert.equal(await page.locator('[data-op="sabotage:works"]').count(), 1);
  assert.equal(await page.locator('[data-op-locked="assassinate"]').count(), 1);
  await page.evaluate(() => document.querySelector('[data-part="operations"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-spy-operations.png') });
  await page.click('[data-op="stir:land"]');
  await page.click('#dialog-yes');
  await page.waitForFunction(() => window.northernWars.state.spycraft.last?.kind === 'stir');
  await page.waitForSelector('[data-op="stir:land"][disabled]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-spy-operation-done.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('a caught agent before the crown, and troubles without a name', async () => {
  const s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.dilemmas ??= { open: [], later: [], seen: {}, nextId: 1, last: -Infinity, lastDemand: -Infinity, promises: [], silenced: {} };
  s.dilemmas.open = [{ id: s.dilemmas.nextId++, agent: 'nilfgaard', realm: 'nilfgaard', op: 'sabotage', day: s.day }];
  s.spycraft.spymaster = { id: 1, name: 'Dame Ysolde Carrow', from: 'a widowed courtier', trait: 'cautious', skill: 58, since: s.day - 200 };
  s.spycraft.clues = [
    { id: 2, owner: 'redania', kind: 'bribe', day: s.day - 120, what: 'House Brodowin', named: true },
    { id: 3, owner: 'nilfgaard', kind: 'stir', day: s.day - 20, what: 'Maribor', named: false },
  ];
  s.spycraft.caught = 3;
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
  const dec = page.locator('.decision', { hasText: 'An agent of' });
  await dec.waitFor();
  assert.match(await dec.textContent(), /tinderbox in the granaries/);
  assert.equal(await dec.locator('[data-choice]').count(), 4);
  await dec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-caught-agent.png') });
  // Follow the spy.
  await dec.locator('[data-choice="3"]').click();
  await page.waitForFunction(() => !window.northernWars.state.dilemmas.open.some((o) => o.agent));
  assert.ok(await page.evaluate(() => window.northernWars.state.spycraft.known.nilfgaard > window.northernWars.state.day));
  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-sub="spies"]');
  await page.waitForSelector('[data-part="clues"]');
  assert.equal(await page.locator('[data-clue]').count(), 2);
  assert.match(await page.textContent('[data-clue="2"]'), /Redania/);
  assert.match(await page.textContent('[data-clue="3"]'), /Unknown/);
  assert.match(await page.textContent('[data-foreign="nilfgaard"]'), /agents we followed/);
  await page.evaluate(() => document.querySelector('[data-part="foreign-spies"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-spies-clues.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
