// Browser smoke tests: load the real page at phone sizes, check for console
// errors, poke the main interactions and keep screenshots for a human to look at.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT } from '../helpers.js';

const OUT = join(ROOT, 'test-results');
const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

test.after(async () => {
  await browser.close();
  server.close();
});

for (const vp of VIEWPORTS) {
  test(`the realm loads and plays at ${vp.width}x${vp.height} ${vp.name}`, async () => {
    const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());

    await page.goto(`${base}?seed=1262&fresh`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    const startDay = await page.evaluate(() => window.northernWars.state.day);

    // Let traffic build up at full speed, then pause for steady screenshots.
    // With this seed an envoy from Cintra arrives on 1 April: the game pauses
    // and asks for an answer.
    await page.click('[data-speed="4"]');
    await page.waitForSelector('.envoy-from', { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'an envoy pauses the game');
    assert.match(await page.textContent('#sheet-body'), /An envoy from Cintra[\s\S]*border dispute/i);
    await page.screenshot({ path: join(OUT, `${vp.name}-envoy.png`) });
    await page.click('[data-choice="1"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.envoys.length), 0);
    await page.click('[data-speed="4"]');
    await page.waitForFunction((d) => window.northernWars.state.day >= d + 40, startDay, { timeout: 20000 });
    await page.click('[data-speed="0"]');
    const paused = await page.evaluate(() => window.northernWars.state.day);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.northernWars.state.day), paused, 'pause stops the calendar');
    assert.match(await page.textContent('#date'), /\d+ \w+ 1262/);
    assert.match(await page.textContent('#season'), /Spring|Summer/);
    const units = await page.evaluate(() => window.northernWars.state.ambient.units.map((u) => u.kind));
    assert.ok(units.includes('caravan') && units.includes('patrol') && units.includes('barge'), `traffic: ${units}`);
    assert.match(await page.textContent('#m-granary'), /^[\d,]+$/);
    await page.screenshot({ path: join(OUT, `${vp.name}-map.png`) });

    // Tap Vizima: its card opens.
    const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
    await page.touchscreen.tap(viz.x, viz.y);
    await page.waitForSelector('#sheet:not([hidden])');
    assert.match(await page.textContent('#sheet-body'), /Vizima[\s\S]*Population[\s\S]*Crown demesne[\s\S]*Stores[\s\S]*Raise a building/);
    await page.screenshot({ path: join(OUT, `${vp.name}-card.png`) });

    // Order a market hall in Vizima: coin leaves the treasury, works begin.
    const treasury = await page.evaluate(() => window.northernWars.state.treasury);
    await page.click('[data-build="market"]');
    await page.waitForFunction(() => window.northernWars.state.settlements.vizima.construction, null, { timeout: 5000 });
    assert.match(await page.textContent('[data-part="works"]'), /Raising: Market hall/);
    assert.equal(await page.evaluate(() => window.northernWars.state.treasury), treasury - 600);
    assert.equal(await page.evaluate(() => window.northernWars.state.settlements.vizima.construction.building), 'market');
    await page.locator('[data-part="works"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `${vp.name}-building.png`) });
    await page.click('#sheet-close');
    assert.equal(await page.isHidden('#sheet'), true);

    // Tap a moving unit: a label says what it is.
    const target = await page.evaluate(() => {
      const nw = window.northernWars;
      for (const u of nw.state.ambient.units) {
        const p = nw.unitScreenOf(u.id);
        if (p && p.x > 30 && p.x < innerWidth - 30 && p.y > 160 && p.y < innerHeight - 30) return p;
      }
      return null;
    });
    if (target) {
      await page.touchscreen.tap(target.x, target.y - 4);
      await page.waitForSelector('#unit-label:not([hidden])');
      assert.match(await page.textContent('#unit-label'), /caravan|Patrol|barge/i);
      await page.screenshot({ path: join(OUT, `${vp.name}-unit.png`) });
    }

    // Pinch-free zoom check via the wheel, then the realm menu and chronicle.
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(OUT, `${vp.name}-zoomed.png`) });
    await page.click('#menu-button');
    await page.click('[data-action="save"]');
    assert.ok(await page.evaluate(() => localStorage.getItem('northern-wars.save')?.includes('northern-wars-save')));
    // Decree heavy taxes from the Laws screen.
    await page.click('[data-action="laws"]');
    assert.match(await page.textContent('#sheet-body'), /The realm's mood[\s\S]*Peasants[\s\S]*Taxation/);
    const authority = await page.evaluate(() => window.northernWars.state.authority);
    await page.click('[data-law="taxation"]');
    await page.click('[data-decree="taxation:heavy"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.laws.taxation.option), 'heavy');
    assert.equal(await page.evaluate(() => window.northernWars.state.authority), authority - 10);
    assert.match(await page.textContent('[data-law="taxation"]'), /Heavy taxes[\s\S]*Taking hold/);
    await page.screenshot({ path: join(OUT, `${vp.name}-laws.png`) });
    await page.click('[data-action="back"]');

    // Neighbouring realms: warm to Redania.
    await page.click('[data-action="neighbours"]');
    await page.click('[data-realm="redania"]');
    assert.match(await page.textContent('#sheet-body'), /Redania[\s\S]*Vizimir[\s\S]*Our stance/);
    await page.click('[data-stance="friendly"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.neighbours.redania.stance), 'friendly');
    await page.screenshot({ path: join(OUT, `${vp.name}-realm.png`) });
    await page.click('[data-action="neighbours"]');
    await page.click('[data-action="back"]');

    await page.click('[data-action="ledger"]');
    assert.match(await page.textContent('#sheet-body'), /Taxes[\s\S]*Garrisons[\s\S]*The past year/);
    await page.screenshot({ path: join(OUT, `${vp.name}-ledger.png`) });
    await page.click('[data-action="back"]');
    await page.click('[data-action="chronicle"]');
    assert.match(await page.textContent('#sheet-body'), /Spring comes late/);
    await page.screenshot({ path: join(OUT, `${vp.name}-chronicle.png`) });

    // A reload resumes the saved reign.
    await page.goto(base);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    assert.ok(await page.evaluate(() => window.northernWars.state.day) >= paused);

    assert.deepEqual(errors, []);
    await context.close();
  });
}

// A realm with works raised and garrisons swollen: buildings, scaffolding,
// walls, soldiers and banners are drawn beside their settlements without errors.
test('buildings and garrisons show beside their settlements', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  const s = step(createState(world, 1262), 20, world);
  s.envoys = [];
  s.settlements.vizima.buildings = ['mill', 'granary', 'market', 'workshop', 'walls'];
  s.settlements.vizima.construction = { building: 'shrine', daysLeft: 20, days: 30 };
  s.settlements.vizima.garrison = 1100;
  s.settlements.white_orchard.buildings = ['fields', 'mill', 'shrine'];
  s.unpaid = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.mouse.move(viz.x, viz.y);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'infrastructure.png') });
  // A tap on the soldiers beside Vizima opens Vizima.
  const z = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(z.x - 34, z.y + 2);
  await page.waitForSelector('#sheet:not([hidden])');
  assert.match(await page.textContent('#sheet-body'), /Vizima[\s\S]*unpaid[\s\S]*Raising: Shrine/);
  assert.deepEqual(errors, []);
  await context.close();
});
