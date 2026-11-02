// Cards, ledger and reports in the browser (M34 D): no card head shows more
// than four figures before Details, the ledger in its groups, and repeated
// reports folded in the chronicle. Portrait screenshots.
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

test('card heads at four figures, the grouped ledger and a merged report', async () => {
  const s = step(createState(world, 1), 95, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  // Three bandit camps sighted in one month: one report, two more one tap down.
  for (const [id, men] of [['tegmond', 22], ['razwan', 17], ['carcano', 30]]) s.chronicle.push({ day: s.day, kind: 'military', text: `Bandit camp sighted near ${world.byId[id].name}: about ${men} men.` });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  const heads = async (where) => {
    const n = await page.$$eval('#sheet-body [data-part="head"] > .figs', (els) => els.map((e) => e.querySelectorAll(':scope > .fig').length));
    for (const x of n) assert.ok(x <= 4, `${where}: ${x} figures before Details`);
  };
  const subs = { realm: ['labour', 'overview'], court: ['inbox', 'laws', 'faith', 'houses'], treasury: ['ledger', 'trade'], military: ['forces', 'threats', 'war'], diplomacy: ['realms', 'envoys', 'spies'] };
  for (const [tab, list] of Object.entries(subs)) {
    await page.click(`[data-tab="${tab}"]`);
    for (const sub of list) {
      await page.click(`.segs [data-sub="${sub}"]`);
      await heads(`${tab}/${sub}`);
    }
  }
  for (const m of ['treasury', 'granary', 'love', 'fear', 'authority', 'unrest']) {
    await page.click(`#topbar [data-go="meter:${m}"]`);
    await page.waitForSelector('#sheet:not([hidden])');
    await heads(`meter ${m}`);
  }
  // The ledger: income in its groups, expenses in four, no group at 0.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="ledger"]');
  const out = await page.$$eval('[data-part="ledger"] [data-side="out"] .lgroup', (els) => els.map((e) => e.dataset.line));
  assert.ok(out.every((g) => ['armies', 'garrisons', 'upkeep', 'court', 'other'].includes(g)), out.join());
  assert.ok(out.includes('garrisons') && out.includes('court'));
  const vals = await page.$$eval('[data-part="ledger"] .lgroup .lg-val', (els) => els.map((e) => e.textContent.trim()));
  assert.ok(!vals.slice(1).includes('0'), 'no group at 0 but the taxes');
  await page.evaluate(() => document.querySelector('[data-part="ledger"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-ledger-groups.png') });
  // The chronicle: the three camps as one report.
  await page.click('#more-button');
  await page.click('[data-more="chronicle"]');
  await page.waitForSelector('[data-part="entries"]');
  // (The month's own camp sightings join them.)
  const merged = page.locator('.chronicle li', { has: page.locator('.like') }).filter({ hasText: 'Bandit camp sighted' });
  assert.equal(await merged.count(), 1);
  assert.ok(Number(await merged.locator('.like').getAttribute('data-merged')) >= 3);
  await merged.locator('.like summary').click();
  await merged.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-merged-report.png') });
  // Every symbol on the top bar has a name for a long press.
  const unnamed = await page.$$eval('#topbar .good, #topbar .meter, #topbar .hand-button', (els) => els.filter((e) => !e.dataset.name).length);
  assert.equal(unnamed, 0);
  assert.deepEqual(errors, []);
  await context.close();
});
