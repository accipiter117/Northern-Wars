// The great tidying, Part A (M34) in the browser: a flooded gold seam in
// Needs attention, reopened with one tap and shown on the Mines screen; and
// hands on call on the Labour screen. Portrait screenshots.
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

test('a flooded seam in Needs attention, reopened, and hands on call', async () => {
  const s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  s.works.decisions = [];
  s.treasury = 6000;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('[data-tab="realm"]');
  await page.click('.segs [data-sub="overview"]');
  const seam = page.locator('[data-seam]').first();
  await seam.waitFor();
  assert.match(await seam.textContent(), /Old workings at .* could be reopened.*About [\d,]+ crowns, .* then about [\d,]+ crowns a month/s);
  await seam.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-seam-attention.png') });
  const town = await seam.getAttribute('data-seam');
  await seam.click();
  await page.waitForFunction((t) => !!window.northernWars.state.settlements[t].repair?.goldmine, town);
  // The Mines screen shows it being reopened, and the rest waiting.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="trade"]');
  await page.evaluate(() => { const d = document.querySelector('[data-sec="mines"]'); if (d && !d.open) d.open = true; });
  await page.waitForSelector('[data-part="gold"]');
  assert.match(await page.textContent(`[data-part="gold"] [data-seam="${town}"]`), /Being reopened/);
  assert.ok(await page.locator('[data-part="gold"] button[data-seam]').count() >= 1, 'the others can be reopened from here');
  await page.evaluate(() => document.querySelector('[data-part="gold"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-seam-reopened.png') });
  // Labour: hands on call.
  await page.click('[data-tab="realm"]');
  await page.click('.segs [data-sub="labour"]');
  await page.waitForSelector('[data-oncall]');
  await page.click('[data-part="adjust"]');
  await page.waitForSelector('[data-oncall="levies"]');
  assert.match(await page.textContent('[data-oncall="levies"]'), /on call/);
  await page.evaluate(() => document.querySelector('[data-kind="repairs"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-hands-on-call.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
