// The compact top bar (M24 A): the realm's goods as symbols and numbers
// (coin with the month's change, grain, fuel, iron, cloth), then the
// meters, each a symbol, a number and a thin bar. No words in the rows;
// each fits one line at 360px in portrait and sits neatly in landscape;
// every symbol opens its detail, and a long press names it.
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

const GOODS = ['meter:treasury', 'meter:granary', 'meter:fuel', 'meter:iron', 'meter:cloth'];

function realm() {
  // Five months in: every meter has reasons to give; a rich treasury and a
  // big granary for long numbers.
  const s = step(createState(world, 7), 150, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 128450;
  return s;
}

async function open(vp, save) {
  const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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

const boxesOf = (page, sel) => page.$$eval(sel, (els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  const val = e.querySelector('.g-val, .m-val');
  return { key: e.dataset.go, left: r.left, right: r.right, top: r.top, w: r.width, h: r.height, text: e.textContent.replace(/\s+/g, ''), clipped: val.scrollWidth > val.clientWidth + 1 };
}));

test('the compact top bar fits 360px in portrait: goods in one row, meters in another, no words', async () => {
  const { context, page, errors } = await open({ width: 360, height: 640 }, serialize(realm()));
  const goods = await boxesOf(page, '#topbar .good');
  assert.deepEqual(goods.map((b) => b.key), GOODS);
  const meters = await boxesOf(page, '#topbar .meter');
  assert.ok(meters.length >= 3);
  for (const row of [goods, meters]) {
    for (const b of row) {
      assert.ok(b.left >= 0 && b.right <= 360, `${b.key} within the screen`);
      assert.ok(Math.abs(b.top - row[0].top) < 1, `${b.key} on one row`);
      assert.equal(b.clipped, false, `${b.key} number not cut off`);
      // Symbols and numbers only: no words.
      assert.doesNotMatch(b.text, /[A-Za-z]{2,}/, `${b.key}: ${b.text}`);
    }
  }
  assert.ok(meters[0].top > goods[0].top, 'the meters below the goods');
  assert.ok(goods.every((b) => b.h >= 40), 'the goods are fair touch targets');
  // The coin carries the month's change, green or red.
  assert.match(await page.textContent('#m-treasury'), /^128k$/);
  assert.match(await page.textContent('#m-treasury-change'), /^[+−][\d,.]+k?$/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 360), true);
  await page.screenshot({ path: join(OUT, 'portrait-topbar.png'), clip: { x: 0, y: 0, width: 360, height: 140 } });

  // Every symbol opens its detail.
  for (const key of [...GOODS, ...meters.map((m) => m.key)]) {
    await page.click(`#topbar [data-go="${key}"]`);
    await page.waitForSelector('#sheet:not([hidden])');
    assert.ok((await page.textContent('#sheet-body')).length > 40, `${key} has its detail`);
    if (key === 'meter:iron') await page.screenshot({ path: join(OUT, 'portrait-topbar-iron.png') });
    await page.click('#sheet-close');
  }
  // A long press names it, and opens nothing.
  const fuel = goods[2];
  await page.mouse.move(fuel.left + fuel.w / 2, fuel.top + fuel.h / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForSelector('.tb-tip:not([hidden])');
  assert.equal(await page.textContent('.tb-tip'), 'Fuel');
  assert.equal(await page.isVisible('#sheet'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the compact top bar sits neatly in landscape', async () => {
  const { context, page, errors } = await open({ width: 844, height: 390 }, serialize(realm()));
  const goods = await boxesOf(page, '#topbar .good');
  const meters = await boxesOf(page, '#topbar .meter');
  for (const b of [...goods, ...meters]) {
    assert.ok(b.left >= 0 && b.right <= 844, `${b.key} within the screen`);
    assert.equal(b.clipped, false, `${b.key} number not cut off`);
  }
  for (const row of [goods, meters]) for (const b of row) assert.ok(Math.abs(b.top - row[0].top) < 1, `${b.key} on one row`);
  // The date and the speeds keep their room.
  const date = await page.$eval('#date', (e) => ({ cut: e.scrollWidth > e.clientWidth + 1, right: e.getBoundingClientRect().right }));
  assert.equal(date.cut, false, 'the date is not cut short');
  const speeds = await page.$eval('.speeds', (e) => e.getBoundingClientRect().right);
  assert.ok(speeds <= goods[0].left, 'the speeds stand clear of the goods');
  const bar = await page.$eval('#topbar', (e) => e.getBoundingClientRect().height);
  assert.ok(bar <= 84, `the top bar is ${bar}px tall`);
  await page.screenshot({ path: join(OUT, 'landscape-topbar.png'), clip: { x: 0, y: 0, width: 844, height: 120 } });
  assert.deepEqual(errors, []);
  await context.close();
});
