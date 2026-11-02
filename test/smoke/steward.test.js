// A rich crown at peace in the browser (M24 C): the Steward's report at
// the top of Decisions and the Treasury, its three costs each with a
// one-tap fix, the warning for work under half manned in the pressure
// strip, and the ledger in five groups that open to their lines. Portrait
// screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, stewardReport } from '../../src/sim/index.js';

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

function realm() {
  // Seven months in, the accounts kept, nothing waiting.
  let s = step(createState(world, 3), 212, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
}

test('the Steward\'s report on Decisions and the Treasury: in, out, net, and a fix for each of the three costs', async () => {
  const s = realm();
  const r = stewardReport(s, world);
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="court"]');
  await page.click('.segs [data-sub="inbox"]');
  await page.waitForSelector('[data-part="steward"]');
  const text = await page.textContent('[data-part="steward"]');
  assert.match(text, /The Steward's report[\s\S]*In[\s\S]*Out[\s\S]*Net[\s\S]*What cost most/);
  assert.equal(await page.locator('[data-part="steward"] .st-cost').count(), 3);
  assert.equal(await page.locator('[data-part="steward"] .st-cost [data-fix]').count(), 3, 'a fix for each cost');
  const shown = await page.$$eval('[data-part="steward"] .st-cost', (els) => els.map((e) => e.dataset.cost));
  assert.deepEqual(shown, r.costs.map((c) => c.key));
  await page.screenshot({ path: join(OUT, 'portrait-steward.png') });
  // The court's fix is the decree itself, with Undo on offer.
  if (shown.includes('court') && await page.locator('[data-fix="court"][data-order]').count()) {
    await page.click('[data-fix="court"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.laws.court.option), 'frugal');
    assert.equal(await page.isVisible('#undo'), true);
  }
  // Any other fix opens where the cost is trimmed.
  const other = page.locator('[data-part="steward"] [data-fix][data-tab-go]').first();
  if (await other.count()) {
    const where = await other.getAttribute('data-tab-go');
    await other.click();
    await page.waitForFunction((w) => document.querySelector(`.segs [data-sub="${w.split(':')[1]}"].on`), where);
  }
  // The same report heads the Treasury, above the grouped ledger.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="ledger"]');
  await page.waitForSelector('[data-part="steward"]');
  const groups = await page.$$eval('[data-part="ledger"] [data-side="in"] .lgroup', (els) => els.map((e) => e.dataset.line));
  for (const g of ['taxes', 'trade', 'crafts']) assert.ok(groups.includes(g), `income group ${g} in ${groups}`);
  assert.ok(groups.every((g) => ['taxes', 'trade', 'crafts', 'war', 'other'].includes(g)));
  // A group opens to its lines one tap deeper.
  await page.click('[data-part="ledger"] [data-line="crafts"] > summary');
  assert.ok(await page.locator('[data-part="ledger"] [data-line="crafts"] dl [data-sub]').count() >= 2);
  await page.evaluate(() => document.querySelector('[data-part="ledger"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-ledger-grouped.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('work under half manned is the first thing the pressure strip says, and the report says it too', async () => {
  const s = realm();
  // The masons and levies to the workshops too, or on call (M34 A) they
  // would fill the mines' gap.
  const sp = s.labour.split;
  s.labour.split = { ...sp, mines: 1, repairs: 0, levies: 0, crafts: sp.crafts + sp.mines - 1 + sp.repairs + sp.levies };
  s.labour.report = null;
  const { context, page, errors } = await open(serialize(step(s, 1, world, { ambient: false })));
  await page.waitForFunction(() => /under half manned/.test(document.getElementById('pressure').textContent));
  assert.match(await page.textContent('#pressure'), /^Mines and quarries under half manned/);
  await page.click('#pressure');
  await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-close');
  await page.click('[data-tab="court"]');
  await page.click('.segs [data-sub="inbox"]');
  assert.match(await page.textContent('[data-part="steward"] .warn'), /Mines and quarries \d+% manned/);
  assert.deepEqual(errors, []);
  await context.close();
});
