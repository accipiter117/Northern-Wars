// The faiths in the browser (M26 C and D): the faith sheet with its bars,
// perks (the next greyed), a power resting with its ring and a long press
// saying how long; an act done from the sheet; the Court's badge when a
// power comes ready; and a clash of faiths in the chronicle. Portrait
// screenshots.
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

async function open(save, memory = null) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), save);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};

// A realm where Melitele stands at level 3 with her blessing used a month
// ago, and the Fire and the Old Ways strong enough to come to blows.
function realm() {
  let s = quiet(step(createState(world, 3), 60, world, { ambient: false }));
  for (let m = 0; m < 8 && !s.faiths.clashes; m++) {
    Object.assign(s.faiths.devotion, { eternal_fire: 62, old_ways: 56 });
    s = quiet(step(s, 30, world, { ambient: false }));
  }
  s.faiths.devotion.melitele = 64;
  s.faiths.acted['blessing:melitele'] = s.day - 30;
  s.faiths.blessing = s.day + 60;
  s.treasury = 20000;
  // No other matter waiting, so the Court's badge is the faith's alone
  // (since M28 and M29 dilemmas and petty kings' requests also wait there).
  if (s.dilemmas) s.dilemmas.open = [];
  return s;
}

test('the faith sheet: bars, perks, a power resting with its ring, and an act done', async () => {
  const s = realm();
  assert.ok(s.faiths.clashes > 0, 'the fixture has a clash to report');
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="faith"]');
  await page.waitForSelector('[data-part="faiths"]');
  assert.deepEqual(await page.$$eval('.faith-bar', (els) => els.map((e) => e.dataset.faith)), ['eternal_fire', 'melitele', 'old_ways']);
  // Melitele at level 3: three perks held, the fourth next and greyed.
  assert.equal(await page.locator('[data-part="faith-melitele"] .perks li.has').count(), 3);
  assert.equal(await page.locator('[data-part="faith-melitele"] .perks li.next').count(), 1);
  // Her blessing rests: a ring, the days left, and a long press says so.
  const ring = page.locator('.cool-wrap.cooling:has([data-faith-act="blessing"])');
  assert.equal(await ring.count(), 1);
  assert.equal(await ring.getAttribute('data-left'), '335');
  await ring.scrollIntoViewIfNeeded();
  const box = await ring.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  assert.match(await page.textContent('#toast'), /Ready in 335 days/);
  await page.evaluate(() => document.querySelector('[data-part="faith-melitele"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-faith-sheet.png') });
  // Endow a temple from the sheet: coin spent, and the act starts to rest.
  const coin = await page.evaluate(() => window.northernWars.state.treasury);
  await page.click('[data-faith-act="endow"]');
  await page.waitForFunction((c) => window.northernWars.state.treasury < c, coin);
  await page.waitForSelector('.cool-wrap.cooling:has([data-faith-act="endow"])');
  // Another faith on the same screen.
  await page.click('.faith-bar[data-faith="old_ways"]');
  await page.waitForSelector('[data-part="faith-old_ways"]');
  assert.match(await page.textContent('[data-part="faith-old_ways"]'), /Belleteyn/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the Court is badged when a power comes ready, and a clash of faiths is reported', async () => {
  const s = realm();
  // The blessing ready again today: news for the Court.
  s.faiths.acted['blessing:melitele'] = s.day - 400;
  const { context, page, errors } = await open(serialize(s));
  const badge = () => page.$eval('[data-tab="court"]', (b) => b.querySelector('.tab-badge:not([hidden])')?.textContent ?? '');
  assert.notEqual(await badge(), '');
  await page.click('[data-tab="court"]');
  assert.ok(await page.locator('[data-sub="faith"] .seg-badge').count() >= 1, 'the Faith sub-tab carries it');
  await page.click('[data-sub="faith"]');
  await page.waitForSelector('.cool-wrap.ready:has([data-faith-act="blessing"])');
  // Read: the badge goes.
  await page.waitForFunction(() => document.querySelector('[data-tab="court"] .tab-badge').hidden);
  await page.click('#more-button');
  await page.click('[data-more="chronicle"]');
  await page.click('[data-chronicle="faith"]');
  await page.waitForTimeout(150);
  assert.match(await page.textContent('#sheet-body'), /Clash of faiths at/);
  await page.getByText(/Clash of faiths at/).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, 'portrait-faith-clash.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
