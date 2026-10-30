// The three meters in the browser (M22 D): Treasury, Granary, Trust, Unrest
// and Dread fit a 360px phone in one row, each a button that opens why it
// changed. Keeps portrait screenshots of the top bar and each meter's sheet.
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

test('five meters fit a 360px phone, and each tells why it moved', async () => {
  // Five months in: every meter has reasons to give.
  const s = step(createState(world, 7), 150, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // One row, nothing cut off or spilling past the edge.
  const boxes = await page.$$eval('.meters .meter', (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    const name = e.querySelector('.m-name');
    return { key: e.dataset.go, left: r.left, right: r.right, top: r.top, w: r.width, h: r.height, clipped: name.scrollWidth > name.clientWidth + 1 };
  }));
  assert.deepEqual(boxes.map((b) => b.key), ['meter:treasury', 'meter:granary', 'meter:trust', 'meter:unrest', 'meter:dread']);
  for (const b of boxes) {
    assert.ok(b.left >= 0 && b.right <= 360, `${b.key} within the screen`);
    assert.ok(Math.abs(b.top - boxes[0].top) < 1, `${b.key} on one row`);
    assert.ok(b.h >= 40 && b.w >= 44, `${b.key} is a fair touch target (${b.w}x${b.h})`);
    assert.equal(b.clipped, false, `${b.key} name not cut off`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 360), true);
  await page.screenshot({ path: join(OUT, 'portrait-meters-topbar.png'), clip: { x: 0, y: 0, width: 360, height: 120 } });

  // Each meter opens its reasons: a few lines, biggest first.
  for (const [key, title] of [['trust', 'Trust in the Crown'], ['unrest', 'Unrest'], ['dread', 'Dread']]) {
    await page.click(`.meter[data-go="meter:${key}"]`);
    await page.waitForSelector('#sheet-title');
    assert.match(await page.textContent('#sheet-title'), new RegExp(title));
    const lines = await page.$$eval('[data-part="why"] [data-part="reasons"] > div', (els) => els.map((e) => e.textContent));
    assert.ok(lines.length >= 1 && lines.length <= 5, `${key}: ${lines.length} reasons`);
    await page.evaluate(() => document.querySelector('[data-part="why"]').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, `portrait-meter-${key}.png`) });
    await page.click('#sheet-close');
  }
  assert.deepEqual(errors, []);
  await context.close();
});
