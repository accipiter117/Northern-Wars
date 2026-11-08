// The v2 war table in the browser (steps 1 and 2): it loads at phone size in
// portrait and landscape with no errors, a piece dragged to a lit region
// marches there, a tap opens a region's card, and End turn moves the month on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT } from '../helpers.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/v2/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

test.after(async () => {
  await browser.close();
  server.close();
});

async function open(viewport) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  return { context, page, errors };
}

test('the war table: drag a piece to march, tap a place, end the turn (portrait)', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  assert.match(await page.textContent('#date'), /March 1262/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-table.png') });

  // Drag Temeria's army at Vizima to a region it can reach.
  const { id, dest, from, to } = await page.evaluate(() => {
    const { app, view } = window.northernWarsV2;
    const a = app.state.armies.find((x) => x.owner === 'temeria' && x.region === 'vizima');
    app.select({ army: a.id });
    const reach = Object.keys(app.selected.reach);
    const target = reach.includes('ellander') ? 'ellander' : reach[0];
    app.select(null);
    return { id: a.id, dest: target, from: view.pieceOf(a.id), to: view.screenOf(target) };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.screenshot({ path: join(OUT, 'v2-portrait-drag.png') });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const region = await page.evaluate((armyId) => window.northernWarsV2.state.armies.find((a) => a.id === armyId).region, id);
  assert.equal(region, dest);

  // A tap on Maribor opens its card, with its yields and a company to raise.
  const m = await page.evaluate(() => window.northernWarsV2.view.screenOf('maribor'));
  await page.evaluate(() => window.northernWarsV2.app.select(null));
  await page.mouse.click(m.x, m.y);
  assert.match(await page.textContent('#sheet'), /Maribor[\s\S]*Food[\s\S]*Production[\s\S]*Raise a company/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-region.png') });

  // End turn: April, and the save remembers it.
  await page.click('#sheet-close');
  await page.click('#end');
  await page.waitForFunction(() => /April 1262/.test(document.getElementById('date').textContent));
  if (await page.isVisible('#sheet')) await page.click('#sheet-close');
  assert.ok(await page.evaluate(() => localStorage.getItem('northern-wars.v2.save').includes('"turn":1')));
  await page.click('[data-open="war"]');
  assert.match(await page.textContent('#sheet'), /Declare war/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-war.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('goals, the smaller crowns and a city\'s focus (portrait)', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  await page.click('[data-open="goals"]');
  assert.match(await page.textContent('#sheet'), /The Dawn of the Reign[\s\S]*Muster the crown's host[\s\S]*Unlocks Temerian crossbowmen/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-goals.png') });
  await page.click('#sheet-close');
  // Renown for envoys: three to Brugge, and the seal by pressure.
  await page.evaluate(() => { window.northernWarsV2.state.realms.temeria.renown = 120; });
  await page.click('[data-open="courts"]');
  for (let i = 0; i < 3; i++) await page.click('[data-envoy="brugge"]');
  assert.match(await page.textContent('#sheet'), /Seal: pressure/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-courts.png') });
  await page.click('[data-seal="brugge:pressure"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.minors.brugge.suzerain), 'temeria');
  await page.click('#sheet-close');
  // A city's focus.
  await page.evaluate(() => window.northernWarsV2.app.select({ region: 'maribor' }));
  await page.click('[data-focus="production"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.cities.maribor.focus), 'production');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the battle screen: place companies in lanes, fight a round, fight it out', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  // War with Redania, and a Redanian army just over the Pontar in our reach.
  const target = await page.evaluate(() => {
    const { app } = window.northernWarsV2;
    const s = app.state;
    s.wars.push('redania|temeria');
    const a = s.armies.find((x) => x.owner === 'temeria' && x.region === 'vizima');
    app.select({ army: a.id });
    const t = Object.keys(app.selected.reach).find((id) => s.cities[id].owner === 'redania');
    s.armies.push({ id: 999, owner: 'redania', region: t, companies: [{ type: 'foot', str: 100 }, { type: 'bow', str: 100 }], points: 0 });
    app.select(null);
    app.march(a.id, t);
    return t;
  });
  assert.ok(target);
  await page.waitForSelector('.lanes');
  assert.match(await page.textContent('#sheet'), /Battle at[\s\S]*Left[\s\S]*Centre[\s\S]*Right[\s\S]*Reserve[\s\S]*to win/);
  // Move a company to the right lane.
  const chip = await page.$('[data-chip]');
  await chip.click();
  await page.click('[data-lane="right"]');
  await page.screenshot({ path: join(OUT, 'v2-portrait-battle.png') });
  await page.click('[data-b="round"]');
  assert.match(await page.textContent('#sheet'), /Round 1:/);
  await page.click('[data-b="auto"]');
  await page.waitForSelector('[data-b="done"]');
  assert.match(await page.textContent('#sheet'), /Victory|Defeat/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-battle-over.png') });
  await page.click('[data-b="done"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.battle), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the war table in landscape', async () => {
  const { context, page, errors } = await open({ width: 844, height: 390 });
  await page.click('[data-open="realm"]');
  assert.match(await page.textContent('#sheet'), /Temeria[\s\S]*Taxes/);
  await page.screenshot({ path: join(OUT, 'v2-landscape-realm.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
