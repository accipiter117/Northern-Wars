// The Crown's hand in the browser (M34 B): the top bar's sceptre with the
// count of acts ready, and the sheet with ready acts on top and resting ones
// with their rings. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld, signLaws } from '../helpers.js';
import { createState, step, serialize, applyAction } from '../../src/sim/index.js';

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

test('the crown\'s hand: ready acts first, resting ones with their rings', async () => {
  let s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  s.treasury = 8000;
  signLaws(s, world, 'royal_feasts', 'pardons');
  // A feast held a fortnight ago rests; a progress is ready.
  s = applyAction(s, world, { type: 'act', kind: 'feast' }).state;
  s = step(s, 14, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  // Lebioda strong enough for her power (set after the days pass, which
  // would let her Devotion drift back).
  s.faiths.devotion.lebioda = 64;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.waitForSelector('#hand-count:not([hidden])');
  const count = Number(await page.textContent('#hand-count'));
  assert.ok(count >= 3, `${count} ready`);
  await page.screenshot({ path: join(OUT, 'portrait-hand-topbar.png'), clip: { x: 0, y: 0, width: 390, height: 140 } });
  await page.click('#hand-button');
  await page.waitForSelector('[data-part="hand"]');
  assert.equal(await page.locator('.hand-ready').count(), count, 'as many ready as the badge says');
  assert.equal(await page.locator('.cool-wrap.cooling [data-hand="act:feast"]').count(), 1, 'the feast rests, with its ring');
  assert.ok(await page.locator('[data-hand="faith:alms:lebioda"]').count() === 1, 'a faith power');
  // Ready ones first within a group.
  const people = await page.$$eval('[data-part="hand-people"] [data-hand]', (els) => els.map((e) => e.classList.contains('hand-ready')));
  assert.deepEqual(people, [...people].sort((a, b) => Number(b) - Number(a)));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-hand.png') });
  await page.evaluate(() => document.querySelector('[data-hand="act:feast"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-hand-resting.png') });
  // An act from the hand: a royal progress.
  await page.click('[data-hand="act:progress"]');
  await page.waitForFunction(() => !!window.northernWars.state.meters.progress);
  assert.deepEqual(errors, []);
  await context.close();
});
