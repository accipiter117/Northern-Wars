// The Road to War in the browser (M33 C): the tracker with three of five
// boxes ticked, and the war's opening with the Call of the North at court.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { beginFirstWar } from '../../src/sim/road.js';
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

function past(s) {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  // The Dawn over, Foltest's path behind him, 1263.
  for (const p of Object.values(s.dawn.places)) { p.done = s.day; for (const c of Object.values(p.chains)) c.done = s.day; }
  s.dawn.done = s.day;
  s.paths.temeria.step = world.paths.temeria.steps.length;
  s.spycraft.nets.nilfgaard.cintra = 78;
  s.day += 300;
  return s;
}

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

test('the Road to War with three boxes ticked', async () => {
  const s = past(step(createState(world, 1), 20, world, { ambient: false }));
  const { context, page, errors } = await open(s);
  await page.click('#tabbar [data-tab="court"]');
  await page.click('[data-sub="dawn"]');
  await page.waitForSelector('[data-part="road"]');
  assert.match(await page.textContent('[data-part="road"]'), /The Road to War\s*3 of 5[\s\S]*Foltest's path is complete[\s\S]*Emhyr's path[\s\S]*network in Cintra[\s\S]*A pretext[\s\S]*1263/);
  assert.equal(await page.locator('.road-box.done').count(), 3);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-road.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('the war\'s opening: the Call of the North at court', async () => {
  const s = past(step(createState(world, 1), 20, world, { ambient: false }));
  s.paths.nilfgaard.step = world.paths.nilfgaard.steps.length;
  s.road = { pretext: { day: s.day, text: 'Queen Calanthe spurns an imperial envoy.' }, began: null, calls: {} };
  s.nilfgaard.stage = 'war';
  beginFirstWar(s, world, makeRng(1));
  const { context, page, errors } = await open(s);
  await page.click('#tabbar [data-tab="court"]');
  await page.click('[data-sub="inbox"]');
  await page.waitForSelector('#sheet-body [data-choice="0"]');
  assert.match(await page.textContent('#sheet-body'), /The Call of the North[\s\S]*Join the coalition[\s\S]*Stand aside/);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-war-opening.png') });
  await page.click('[data-sub="dawn"]');
  await page.waitForSelector('[data-part="road"]');
  assert.match(await page.textContent('[data-part="road"]'), /the war began[\s\S]*The First Northern War is under way/);
  assert.deepEqual(errors, []);
  await context.close();
});
