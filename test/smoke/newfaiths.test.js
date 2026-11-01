// Five more faiths in the browser (M32 A): the Great Sun spreading on the
// Faith screen, its power, and a cult come to light in Decisions. Portrait
// screenshots.
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

async function open(s) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

function quiet(s) {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  return s;
}

test('the Great Sun spreading, and its power', async () => {
  const s = quiet(step(createState(world, 1), 30, world, { ambient: false }));
  // Years of imperial agents: the Sun has a foothold in the southern towns.
  for (const [id, t] of Object.entries(s.settlements)) {
    const add = ['mayena', 'razwan', 'maribor', 'vizima'].includes(id) ? 14 : 5;
    const rest = Object.keys(t.faith).filter((f) => f !== 'great_sun');
    const pool = rest.reduce((a, f) => a + t.faith[f], 0);
    for (const f of rest) t.faith[f] -= (add * t.faith[f]) / pool;
    t.faith.great_sun += add;
  }
  s.faiths.devotion.great_sun = 62;
  s.treasury = 6000;
  const { context, page, errors } = await open(s);
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="faith"]');
  await page.waitForSelector('[data-part="faiths"]');
  assert.equal(await page.locator('.faith-bar').count(), 7);
  await page.click('.faith-bar[data-faith="great_sun"]');
  await page.waitForSelector('[data-part="faith-great_sun"]');
  assert.equal(await page.locator('[data-part="faith-great_sun"] .perks li.has').count(), 3);
  assert.equal(await page.locator('[data-faith-act="order"]:not([disabled])').count(), 1);
  await page.evaluate(() => document.querySelector('[data-part="faith-great_sun"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-great-sun.png') });
  await page.evaluate(() => document.querySelector('[data-part="faith"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  assert.match(await page.textContent('[data-part="faith"]'), /Great Sun/);
  await page.screenshot({ path: join(OUT, 'portrait-faiths-mix.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('a cult come to light', async () => {
  const s = quiet(step(createState(world, 1), 30, world, { ambient: false }));
  s.cult = { towns: { anchor: 48, tegmond: 22 }, last: s.day, found: 2 };
  s.dilemmas ??= { open: [], later: [], seen: {}, nextId: 1, last: -Infinity, lastDemand: -Infinity, promises: [], silenced: {} };
  s.dilemmas.open = [{ id: s.dilemmas.nextId++, cult: 'anchor', place: 'anchor', finding: 1, day: s.day }];
  const { context, page, errors } = await open(s);
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="inbox"]');
  const dec = page.locator('.decision', { hasText: 'cult cellar' });
  await dec.waitFor();
  assert.equal(await dec.locator('[data-choice]').count(), 4);
  await dec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'portrait-cult-dilemma.png') });
  await dec.locator('[data-choice="0"]').click();
  await page.waitForFunction(() => !window.northernWars.state.dilemmas.open.some((o) => o.cult));
  await page.click('[data-sub="faith"]');
  await page.waitForSelector('[data-part="cult"]');
  assert.match(await page.textContent('[data-part="cult"]'), /Tegmond/);
  assert.deepEqual(errors, []);
  await context.close();
});
