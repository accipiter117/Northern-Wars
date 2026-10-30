// The camera follows an order (M24 follow-up): sending a company after a
// threat glides the map there, zoomed in, and drops the panel to its title
// bar so the hunt can be watched. Portrait screenshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction, threatPos } from '../../src/sim/index.js';

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

test('sending a company after wolves glides the camera to them and lowers the panel', async () => {
  let s = step(createState(world, 1), 200, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 20000;
  s = applyAction(s, world, { type: 'recruit', settlement: 'vizima', kind: 'militia' }).state;
  const t = s.threats.list.filter((x) => x.kind === 'monsters' && !x.abroad && x.sighted && x.species === 'wolves')[0]
    ?? s.threats.list.find((x) => x.kind === 'monsters' && !x.abroad && x.sighted);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('[data-tab="military"]');
  await page.evaluate((id) => {
    const b = document.createElement('button');
    b.dataset.go = `threat:${id}`;
    document.querySelector('#sheet-body').append(b);
    b.click();
    b.remove();
  }, t.id);
  await page.waitForSelector(`[data-send="${t.id}"]`);
  assert.match(await page.textContent('#sheet-body'), /Any company, even the town militia, can put them down|Sure to win|Likely to win/);
  await page.click(`[data-send="${t.id}"]`);
  // The glide takes under a second.
  await page.waitForTimeout(1300);
  const p = threatPos(t);
  const where = await page.evaluate((q) => window.northernWars.screenOfPoint(q.x, q.y), p);
  const canvas = await page.$eval('#map', (c) => { const r = c.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
  assert.ok(Math.hypot(where.x - canvas.cx, where.y - canvas.cy) < 30, `the quarry at ${JSON.stringify(where)}, the centre at ${JSON.stringify(canvas)}`);
  assert.equal(await page.$eval('#sheet', (e) => e.dataset.snap), 'peek', 'the panel drops to its title bar');
  await page.screenshot({ path: join(OUT, 'portrait-follow-hunt.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
