// The four northern realms in the browser (M30 B): Kovir and Lyria among
// the middle crowns, Hengfors among the petty kingdoms, Angren under
// "Lawless lands" with its own card; an audience with Queen Meve. Portrait
// screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { transferTown } from '../../src/sim/lands.js';

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

test('the new realms in their tiers, Angren\'s frontier card, and an audience with Meve', async () => {
  const s = step(createState(world, 3), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  for (const rid of Object.keys(s.realms)) delete s.realms[rid].suzerain;
  // Lyria and Rivia has taken one of Angren's towns.
  transferTown(s, world, 'glevitzingen', 'lyria_rivia', { quiet: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.click('[data-tab="diplomacy"]');
  await page.waitForSelector('[data-part="middle"]');
  const ids = (part) => page.$$eval(`[data-part="${part}"] [data-realm]`, (els) => els.map((e) => e.dataset.realm));
  const middle = await ids('middle');
  for (const rid of ['kovir', 'lyria_rivia', 'cintra']) assert.ok(middle.includes(rid), `${rid} among the middle crowns`);
  assert.ok((await ids('petty')).includes('hengfors'));
  assert.deepEqual(await ids('lawless'), ['angren']);
  assert.match(await page.textContent('[data-part="lawless"]'), /No ruler\. 3 of 4 towns free/);
  // Esterad, Niedamir and Meve sit among the rulers' portraits; Angren has none.
  for (const rid of ['kovir', 'hengfors', 'lyria_rivia']) assert.equal(await page.locator(`.rulers-row [data-audience="${rid}"]`).count(), 1, rid);
  assert.equal(await page.locator('.rulers-row [data-audience="angren"]').count(), 0);
  await page.evaluate(() => document.querySelector('[data-part="middle"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'portrait-relations-wider-north.png') });
  // Angren's card: no audience, no stance, its towns and who holds them.
  await page.click('[data-part="lawless"] [data-realm="angren"]');
  await page.waitForSelector('[data-part="frontier"]');
  assert.match(await page.textContent('[data-part="frontier"]'), /Glevitzingen: held by Lyria and Rivia/);
  assert.equal(await page.locator('[data-part="stance"]').count(), 0);
  assert.equal(await page.locator('[data-audience="angren"]').count(), 0);
  await page.screenshot({ path: join(OUT, 'portrait-angren.png') });
  // An audience with Queen Meve.
  await page.click('[data-tab="diplomacy"]');
  await page.waitForSelector('.rulers-row [data-audience="lyria_rivia"]');
  await page.click('.rulers-row [data-audience="lyria_rivia"]');
  await page.waitForSelector('#audience:not([hidden]) .aud-big');
  assert.match(await page.textContent('#audience'), /Queen Meve[\s\S]*Lyria and Rivia/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'portrait-audience-meve.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
