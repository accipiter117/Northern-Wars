// Wealth in the browser (M21 A and B): the five goods with their surplus
// and shortage, a deal agreed on a partner's card, the three estates' tax
// settings with what each would yield, and a loan from the bank. Keeps
// portrait screenshots of each.
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

test('the Treasury: five goods, a deal with a partner, taxes by estate and a loan', async () => {
  const s = step(createState(world, 21), 92, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // The five goods.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="trade"]');
  const goods = await page.textContent('[data-part="goods"]');
  assert.match(goods, /Grain[\s\S]*Timber and stone[\s\S]*Iron and arms[\s\S]*Cloth[\s\S]*Luxuries/);
  assert.match(goods, /surplus \d+ a month/);
  assert.match(goods, /short \d+ a month/);
  await page.screenshot({ path: join(OUT, 'portrait-goods.png') });
  // Holding a good back is one tap.
  await page.click('[data-hold="iron"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.market.hold.iron), true);

  // A deal with Redania, from its card.
  await page.click('[data-partner="redania"]');
  await page.click('[data-sec="trade"] summary');
  await page.click('[data-form="deal:redania"] [data-set="sell:materials"]');
  await page.click('[data-form="deal:redania"] [data-set="sellQty:50"]');
  await page.click('[data-form="deal:redania"] [data-set="buy:iron"]');
  await page.click('[data-form="deal:redania"] [data-set="buyQty:10"]');
  assert.match(await page.textContent('[data-part="deal-preview"]'), /Sell 50 loads[\s\S]*Buy 10 loads/);
  await page.evaluate(() => document.querySelector('[data-part="sec-trade"]').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(OUT, 'portrait-deal.png') });
  await page.click('[data-deal-go="redania"]');
  assert.deepEqual(await page.evaluate(() => window.northernWars.state.market.deals.redania), { sell: { good: 'materials', qty: 50 }, buy: { good: 'iron', qty: 10 }, since: s.day });

  // Taxes by estate, with what each setting would yield.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="taxes"]');
  const taxes = await page.textContent('[data-part="taxes"]');
  assert.match(taxes, /Taxes on the towns[\s\S]*Light[\s\S]*\d+ a month[\s\S]*Fair[\s\S]*Heavy[\s\S]*Taxes on the villages[\s\S]*Taxes on the lords/);
  const before = await page.evaluate(() => window.northernWars.state.laws.tax_towns.option);
  assert.equal(before, 'fair');
  await page.click('[data-tax="tax_towns:heavy"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.laws.tax_towns.option), 'heavy');
  assert.match(await page.textContent('[data-estate="towns"]'), /Taking hold/);
  await page.screenshot({ path: join(OUT, 'portrait-taxes.png') });

  // A loan.
  const t0 = await page.evaluate(() => window.northernWars.state.treasury);
  await page.click('[data-loan="2000"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.treasury), t0 + 2000);
  assert.match(await page.textContent('[data-part="loans"]'), /2,000 borrowed: \d+ a month, 24 payments left/);
  await page.evaluate(() => document.querySelector('[data-part="loans"]').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(OUT, 'portrait-loans.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
