// Money from fighting in the browser (M24 D): a threat card with its purse
// (and a witcher's fee netted off), the loot a raid would bring shown before
// the order, and war's takings in the Steward's report. Portrait
// screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, threatPurse, raidPreview } from '../../src/sim/index.js';
import { startWar } from '../../src/sim/war.js';
import { newArmy } from '../../src/sim/armies.js';
import { destroyThreat } from '../../src/sim/threats.js';
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

const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};

test('a threat card shows its purse, and a beast\'s card the purse less a witcher\'s fee', async () => {
  // The first seed with a camp and a beast at home by day 200 (which stand
  // shifts with the North's dice).
  const both = (x) => x && x.threats.list.some((t) => t.kind === 'bandits' && !t.abroad) && x.threats.list.some((t) => t.kind === 'monsters' && !t.abroad);
  let s = null;
  for (let seed = 1; seed <= 8 && !both(s); seed++) s = quiet(step(createState(world, seed), 200, world, { ambient: false }));
  const camp = s.threats.list.find((t) => t.kind === 'bandits' && !t.abroad);
  const beast = s.threats.list.find((t) => t.kind === 'monsters' && !t.abroad);
  for (const t of [camp, beast]) t.sighted = true;
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="military"]');
  await go(page, `threat:${camp.id}`);
  await page.waitForSelector('[data-part="purse"]');
  const purse = threatPurse(s, world, camp);
  assert.match(await page.textContent('[data-part="purse"]'), new RegExp(`Purse: about ${purse.total.toLocaleString('en-GB')} crowns \\(their hoard [\\d,]+, the burghers' bounty [\\d,]+\\)`));
  await page.screenshot({ path: join(OUT, 'portrait-threat-purse.png') });
  await go(page, `threat:${beast.id}`);
  await page.waitForFunction(() => /witcher's fee/.test(document.querySelector('[data-part="purse"]')?.textContent ?? ''));
  assert.match(await page.textContent('[data-witcher]'), /after the purse/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the loot a raid would bring, on the army card before the order; war\'s takings in the Steward\'s report', async () => {
  const s = quiet(createState(world, 2));
  startWar(s, world, makeRng(5), 'temeria', 'redania', 'claim');
  s.armies = [];
  const a = newArmy(s, world, 'temeria', 'vizima', 2400, {}, { name: 'The army of Vizima', order: 'defend', target: 'vizima' });
  // A camp broken last month, so the report has war's takings to show.
  let r = step(s, 40, world, { ambient: false });
  quiet(r);
  const camp = r.threats.list.find((t) => t.kind === 'bandits' && !t.abroad);
  if (camp) destroyThreat(r, world, camp);
  r = quiet(step(r, 31, world, { ambient: false }));
  const loot = raidPreview(r, world, 'redania').loot;
  const { context, page, errors } = await open(serialize(r));
  await page.click('[data-tab="military"]');
  await go(page, `army:${a.id}`);
  await page.waitForSelector('[data-raid="redania"]');
  assert.match(await page.textContent('[data-raid="redania"]'), new RegExp(`about ${loot.toLocaleString('en-GB')} in loot`));
  await page.evaluate(() => document.querySelector('[data-raid="redania"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-raid-loot.png') });
  await page.click('#sheet-close');
  await page.click('[data-tab="court"]');
  await page.click('.segs [data-sub="inbox"]');
  if (camp) assert.match(await page.textContent('[data-part="war-takings"]'), /Purses from outlaws and beasts/);
  assert.deepEqual(errors, []);
  await context.close();
});
