// The Book of Laws in the browser (M26 A and B): a chapter as two columns,
// a signed law with its seal and a locked rival path; signing a law with
// its reaction; the ink-drying countdown; the court and bounties as quick
// settings; and an act the Book unlocks on a town's card. Portrait
// screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld, signLaws } from '../helpers.js';
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

async function open(save) {
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

function realm() {
  const s = step(createState(world, 3), 60, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 20000;
  s.love = 55;
  s.fear = 30;
  return s;
}

test('a chapter of the Book: rival paths side by side, a law signed with its reaction, its rival locked, the ink drying', async () => {
  const { context, page, errors } = await open(serialize(realm()));
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="laws"]');
  await page.waitForSelector('[data-part="book"]');
  assert.deepEqual(await page.$$eval('.book-chapters [data-chapter]', (els) => els.map((e) => e.dataset.chapter)), ['order', 'economy', 'war', 'people', 'faith']);
  assert.deepEqual(await page.$$eval('[data-part="book"] [data-path]', (els) => els.map((e) => e.dataset.path)), ['justice', 'iron']);
  // Pick a law: its headline, cost and who will cheer or grumble.
  await page.click('[data-book-law="assizes"]');
  const card = await page.textContent('[data-book-law="assizes"]');
  assert.match(card, /Unrest in every town and city falls by 8[\s\S]*300 crowns[\s\S]*Cheered by[\s\S]*Grumbled at by/);
  await page.screenshot({ path: join(OUT, 'portrait-book-sign.png') });
  await page.click('[data-sign="assizes"]');
  await page.click('#dialog-yes');
  await page.waitForFunction(() => !!window.northernWars.state.book.signed.assizes);
  // The reaction from the people and the court, at once.
  assert.match(await page.textContent('#toast'), /Signed into the Book of Laws: Assizes\. The commons crowd/);
  assert.match(await page.textContent('[data-part="ink"]'), /The ink is drying: 30 days/);
  assert.match(await page.textContent('[data-book-law="curfews"]'), /Locked while The King's Justice stands/);
  assert.equal(await page.locator('[data-book-law="assizes"] .seal').count(), 1);
  assert.equal(await page.locator('[data-book-law="curfews"].locked').count(), 1);
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.querySelector('[data-part="book"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-book-chapter.png') });
  // Another chapter.
  await page.click('[data-chapter="faith"]');
  assert.match(await page.textContent('[data-part="book"]'), /Tolerance[\s\S]*One faith/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the court in the Treasury and bounties in Military are quick settings that rest between changes; a pardon from a town\'s card', async () => {
  const s = realm();
  signLaws(s, world, 'assizes', 'pardons');
  const town = Object.keys(s.settlements).find((id) => world.byId[id].type === 'town');
  s.settlements[town].unrest = 50;
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="taxes"]');
  await page.click('[data-setting="court:frugal"]');
  await page.waitForFunction(() => window.northernWars.state.laws.court.option === 'frugal');
  assert.match(await page.textContent('[data-part="setting-court"]'), /Can be changed again in 30 days/);
  assert.equal(await page.isDisabled('[data-setting="court:splendid"]'), true);
  await page.click('#sheet-close');
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="threats"]');
  assert.ok(await page.locator('[data-part="setting-bounties"] [data-setting]').count() >= 2);
  await page.click('#sheet-close');
  await page.evaluate((id) => {
    const b = document.createElement('button');
    b.dataset.go = `town:${id}`;
    document.querySelector('#sheet-body').append(b);
    b.click();
    b.remove();
  }, town);
  await page.waitForSelector('[data-part="crown-acts"] [data-act="pardon"]');
  await page.click('[data-act="pardon"]');
  await page.waitForFunction((id) => window.northernWars.state.settlements[id].unrest <= 35.5, town);
  assert.deepEqual(errors, []);
  await context.close();
});
