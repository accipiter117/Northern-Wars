// The Dawn screen in the browser (M33 A): the five places and their quests,
// what to do next, a quest in progress, and a tap through to where it is done.
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

test('the Dawn screen: places, quests, the next step and a tap through', async () => {
  let s = step(createState(world, 1), 40, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  // Ellander's temple endowed already: one chain done.
  ((s.faiths.endowed ??= {}).ellander ??= {}).melitele = s.day;
  s = step(s, 1, world, { ambient: false });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('#tabbar [data-tab="court"]');
  await page.click('[data-sub="dawn"]');
  await page.waitForSelector('[data-part="dawn"]');
  const text = await page.textContent('[data-part="dawn"]');
  assert.match(text, /of 5 places in order[\s\S]*Next:[\s\S]*Vizima[\s\S]*The Old Manor[\s\S]*Maribor[\s\S]*Gors Velen[\s\S]*Ellander[\s\S]*Melitele's temple: done[\s\S]*White Bridge/);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-dawn.png') });
  // A quest in progress: the lake marshes, with its drowners still there.
  const marsh = page.locator('[data-dawn-place="vizima"] [data-dawn-chain="marsh"]');
  assert.match(await marsh.textContent(), /Drowners[\s\S]*Still there[\s\S]*Pays 250 crowns[\s\S]*Go to Threats/);
  await marsh.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-dawn-quest.png') });
  await marsh.click();
  await page.waitForSelector('[data-part="threats"]');
  assert.match(await page.textContent('[data-part="threats"]'), /drowner|Beasts/i);
  assert.deepEqual(errors, []);
  await context.close();
});
