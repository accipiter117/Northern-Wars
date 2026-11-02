// The non-human quarters in the browser (M32 B): a pogrom warning under
// Needs attention leads to the town, whose People tab shows the quarter.
// Portrait screenshots.
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

test('a quarter on the town card, and a pogrom warning that leads to it', async () => {
  let s = step(createState(world, 1), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  signLaws(s, world, 'restrictions');
  // Maribor's quarter, frightened after a Scoia'tael strike nearby and a
  // hungry month.
  const m = s.settlements.maribor;
  m.tension = 82;
  m.hunger = 0.3;
  m.scoiaNear = s.day;
  // White Bridge remembers an old pogrom.
  s.settlements.white_bridge.quarter = { pogrom: s.day - 400, lost: 120, dead: 35 };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('#tabbar [data-tab="realm"]');
  await page.click('[data-sub="overview"]');
  const alert = page.locator('[data-go="town:maribor"]', { hasText: 'Pogrom feared in Maribor' });
  assert.equal(await alert.count(), 1, 'the warning under Needs attention');
  await alert.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-pogrom-warning.png') });
  await alert.click();
  await page.click('.segs [data-tsub="people"]');
  await page.waitForSelector('[data-part="quarter"]');
  const text = await page.textContent('[data-part="quarter"]');
  assert.match(text, /The non-human quarter[\s\S]*halflings[\s\S]*Regards the crown[\s\S]*With its neighbours[\s\S]*Pogrom risk\s*\d+% a month/);
  assert.equal(await page.locator('[data-part="pogrom-warning"]').count(), 1);
  await page.click('.quarter-why summary');
  assert.match(await page.textContent('.quarter-why'), /Restrictions on non-humans[\s\S]*\+/);
  await page.evaluate(() => document.querySelector('[data-part="quarter"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-quarter.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
