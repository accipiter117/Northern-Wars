// Becoming suzerain in the browser (M29 B): a petty king's plea for
// protection in the inbox, taken; and a realm card's offer and pressure,
// each with its odds. Portrait screenshots.
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

test('a plea for protection taken, and the odds of offering and pressing', async () => {
  const s = step(createState(world, 3), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  s.treasury = 20000;
  s.suzerainty = { asks: [{ id: 1, realm: 'kerack', day: s.day }], nextId: 2, cooldowns: {} };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="inbox"]');
  const card = page.locator('[data-decision="protection:1"]');
  await card.waitFor();
  assert.match(await card.textContent(), /asks for Temeria's protection[\s\S]*Protector of Kerack/);
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: join(OUT, 'portrait-protection.png') });
  await card.locator('.choices button').first().click();
  await page.waitForFunction(() => window.northernWars.state.realms.kerack.suzerain === 'temeria');
  assert.match(await page.textContent('[data-part="style"]'), /Protector of Kerack/);
  // A realm card: offer and pressure, with their odds.
  await page.evaluate(() => window.northernWars.go?.('realm:verden'));
  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-realm="verden"]');
  await page.waitForSelector('[data-part="suzerain"]');
  assert.match(await page.textContent('[data-part="suzerain"]'), /Independent[\s\S]*Offer protection[\s\S]*Odds \d+%[\s\S]*bend the knee[\s\S]*Odds \d+%/);
  assert.deepEqual(errors, []);
  await context.close();
});
