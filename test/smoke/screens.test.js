// Fewer, clearer screens in the browser (M34 C): the new sub-screens, a
// merged screen's folds, and an old link landing in its new home with its
// fold open. Portrait screenshots.
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

test('fourteen sub-screens, merged screens in folds, old links in their new homes', async () => {
  const s = step(createState(world, 1), 60, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  const counts = {};
  for (const tab of ['realm', 'court', 'treasury', 'military', 'diplomacy']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForSelector('.segs');
    counts[tab] = await page.locator('.segs [data-sub]').count();
  }
  assert.deepEqual(counts, { realm: 2, court: 4, treasury: 2, military: 3, diplomacy: 3 });
  await page.click('[data-sub="spies"]');
  await page.waitForSelector('[data-part="networks"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-screens-diplomacy.png') });
  // The ledger with its folds: taxes and loans, the repair order.
  await page.click('[data-tab="treasury"]');
  await page.click('[data-sub="ledger"]');
  await page.waitForSelector('[data-sec="taxes"]');
  assert.equal(await page.locator('[data-sec="taxes"][open]').count(), 0, 'folded at first');
  await page.evaluate(() => document.querySelector('[data-sec="taxes"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-screens-ledger.png') });
  // An old link (the Steward's costs once led to military:garrisons) lands
  // on Forces with the garrisons fold open.
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.dataset.tabGo = 'military:garrisons';
    b.id = 'old-link';
    document.getElementById('sheet-body').prepend(b);
  });
  await page.click('#old-link');
  await page.waitForSelector('[data-sec="garrisons"][open]');
  assert.match(await page.textContent('.segs .seg.on'), /Forces/);
  assert.deepEqual(errors, []);
  await context.close();
});
