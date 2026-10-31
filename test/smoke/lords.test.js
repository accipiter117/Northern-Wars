// The great houses in the browser (M27 A and B): a house card on one
// screen with what the lord gives and wants, granting his want, and a
// house's men clearing a camp in its lands. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { monthlyGuard } from '../../src/sim/lords.js';
import { makeRng } from '../../src/sim/rng.js';

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
  return s;
}

test('a house card: what he gives, what he wants, and the want granted', async () => {
  const s = realm();
  s.houses.wolbrecht.loyalty = 72;
  s.houses.wolbrecht.ambition = 55;
  s.houses.wolbrecht.want = { kind: 'honours', since: s.day };
  // A camp near Bondar, put down by the house's men.
  const st = world.byId.bondar;
  s.threats.list = [{ id: s.threats.nextId++, kind: 'bandits', men: 40, x: st.x + 20, y: st.y + 10, near: 'bondar', born: s.day, sighted: true, morale: 60 }];
  const rng = makeRng(2);
  for (let m = 0; m < 12 && s.threats.list.length; m++) monthlyGuard(s, world, rng);
  assert.equal(s.threats.list.length, 0);
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="houses"]');
  await page.click('[data-house="wolbrecht"]');
  await page.waitForSelector('[data-part="gives"]');
  assert.match(await page.textContent('[data-give="guard"]'), /^Guards (Houtborg|Bondar|Moën)/);
  assert.match(await page.textContent('[data-give="retinue"]'), /^Retinue about \d+ men$/);
  assert.match(await page.textContent('[data-give="dues"]'), /^Dues about \d+ crowns a month$/);
  assert.match(await page.textContent('[data-part="wants"]'), /Wants honours/);
  await page.screenshot({ path: join(OUT, 'portrait-house-card.png') });
  await page.click('[data-house-action="honours"]');
  await page.waitForFunction(() => window.northernWars.state.houses.wolbrecht.want === null);
  assert.match(await page.textContent('[data-part="wants"]'), /Nothing for now/);
  // The house's men cleared the camp: the chronicle says so.
  await page.click('#more-button');
  await page.click('[data-more="chronicle"]');
  await page.click('[data-chronicle="nobles"]');
  assert.match(await page.textContent('#sheet-body'), /House Wolbrecht's men put down the .* near Bondar/);
  await page.getByText(/men put down the/).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, 'portrait-house-guard.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
