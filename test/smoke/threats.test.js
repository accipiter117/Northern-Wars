// Threats and clutter in the browser (M21 E and F): a threat's card with its
// size against the nearest force, the one Treasury ledger, and the town card
// cut to a few lines plus Details. Keeps portrait screenshots of each.
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

test('a threat against the nearest force, the Treasury ledger, and a decluttered town card', async () => {
  let s = createState(world, 3);
  for (const st of Object.values(s.settlements)) st.prosperity = 25;
  s = step(s, 300, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const t = s.threats.list.find((x) => !x.abroad && x.kind === 'bandits') ?? s.threats.list.find((x) => !x.abroad);
  assert.ok(t, 'a threat at home');
  t.sighted = true;
  t.campSeen = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // The threat, from the Military tab's list, then its card.
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="threats"]');
  assert.match(await page.textContent(`[data-threat="${t.id}"]`), /about \d+ men\. .+'s levy: [\d,]+, odds: [\w ]+|: [\d,]+, odds: [\w ]+/);
  await page.click(`[data-threat="${t.id}"]`);
  await page.waitForSelector('[data-part="versus"]');
  const versus = await page.textContent('[data-part="versus"]');
  assert.match(versus, /^(Bandit camp|Bandits|Wolves|Drowners|Harpies|A |Wyverns)[^:]*: .+\. .+: [\d,]+, odds: (sure to win|likely to win|even|risky|hopeless)\.$/);
  await page.screenshot({ path: join(OUT, 'portrait-threat.png') });

  // The one ledger.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="ledger"]');
  const ledger = await page.textContent('[data-part="ledger"]');
  assert.match(ledger, /Income[\s\S]*Taxes[\s\S]*Towns [\d,]+[\s\S]*Total income[\s\S]*Expenses[\s\S]*War[\s\S]*Other[\s\S]*Total expenses/);
  // The groups add up to the totals (M24 C: Taxes, Trade and sales, Crafts
  // and goods, War, Other), and each group's lines add up to the group.
  const sums = await page.evaluate(() => [...document.querySelectorAll('[data-part="ledger"] .lgroups')].map((side) => {
    const v = (el) => Number(el.textContent.replace(/[^\d−-]/g, '').replace('−', '-'));
    const groups = [...side.querySelectorAll('.lgroup')];
    for (const g of groups) {
      const parts = [...g.querySelectorAll('dl [data-sub] dd')].map(v).reduce((a, b) => a + b, 0);
      if (Math.abs(parts - v(g.querySelector('.lg-val'))) > 3) return { bad: g.dataset.line, parts, group: v(g.querySelector('.lg-val')) };
    }
    return { lines: groups.map((g) => v(g.querySelector('.lg-val'))).reduce((a, b) => a + b, 0), total: v(side.querySelector('.total dd')) };
  }));
  for (const x of sums) assert.ok(Math.abs(x.lines - x.total) <= 3, JSON.stringify(sums));
  // Drag the sheet up to full height to see the whole ledger.
  const h = await page.locator('#sheet-head').boundingBox();
  await page.mouse.move(h.x + 80, h.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(h.x + 80, h.y + 20 - (h.y * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-ledger.png') });

  // A town card: four chips, three lines, then Details.
  await page.click('#sheet-close');
  await page.evaluate(() => { const st = window.northernWars.world.byId.maribor; window.northernWars.lookAt(st.x, st.y); });
  const mar = await page.evaluate(() => window.northernWars.screenOf('maribor'));
  await page.touchscreen.tap(mar.x, mar.y);
  await page.waitForSelector('#sheet:not([hidden])');
  assert.equal(await page.locator('#sheet-body [data-part="head"] .figs .fig').count(), 4, 'four chips');
  assert.match(await page.textContent('[data-part="stores"]'), /Food for [\d,]+ days/);
  assert.match(await page.textContent('[data-line="works"]'), /\d+ works, (all in good repair|\d+ in need of repair)/);
  await page.click('[data-sec="details"] > summary');
  assert.match(await page.textContent('[data-sec="details"]'), /Stores[\s\S]*Lasts[\s\S]*Eaten a day/);
  assert.deepEqual(errors, []);
  await context.close();
});
