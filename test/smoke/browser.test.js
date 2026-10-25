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

    await page.goto(`${base}?seed=1262&fresh&nohints`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    const startDay = await page.evaluate(() => window.northernWars.state.day);

    // Let traffic build up at full speed, then pause for steady screenshots.
    // With this seed, decisions arrive on 1 April (an envoy from Cintra and
    // a demand from a great house): the game pauses for each in turn.
    await page.click('[data-speed="4"]');
    await page.waitForSelector('.envoy-from', { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'a decision pauses the game');
    await page.screenshot({ path: join(OUT, `${vp.name}-envoy.png`) });
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const pending = await page.evaluate(() => {
        const st = window.northernWars.state;
        return st.envoys.length + st.petitions.length + st.demands.length;
      });
      if (!pending) break;
      if (!(await page.isVisible('.envoy-from'))) {
        await page.click('[data-speed="1"]');
        await page.waitForSelector('.envoy-from', { timeout: 5000 });
      }
      seen.push(await page.textContent('.envoy-from'));
      await page.click('[data-choice="1"]');
    }
    assert.ok(seen.some((t) => /An envoy from Cintra/.test(t)), `decisions seen: ${seen}`);
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
        if (!p) continue;
        // Towns win taps close to them, so pick a unit out on the open road.
        const clear = [...nw.world.geography.settlements, ...nw.world.foreign].every((st) => {
          const q = nw.screenOf(st.id);
          return Math.hypot(q.x - p.x, q.y - p.y) > 50;
        });
        if (clear && p.x > 30 && p.x < innerWidth - 30 && p.y > 160 && p.y < innerHeight - 120) return p;
      }
      return null;
    });
    if (target) {
      await page.touchscreen.tap(target.x, target.y - 4);
      await page.waitForSelector('#unit-label:not([hidden])');
      assert.match(await page.textContent('#unit-label'), /caravan|Patrol|barge|Pilgrims|Refugees|Grain cart|merchants/i);
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
    await page.goto(`${base}?nohints`);
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
  await page.goto(`${base}?paused&nohints`);
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

// Faith and peoples: a riot-struck town is marked on the map, the Faith
// screen lists the tensest places and waiting petitions, and a petition can
// be answered from there.
test('faith screen, petitions and riot markers', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  const s = step(createState(world, 1262), 20, world);
  s.envoys = [];
  s.settlements.maribor.tension = 70;
  s.settlements.maribor.troubled = 40;
  s.sympathy = 55;
  s.petitions = [{ id: 1, petition: 'fire_preacher', place: 'vizima', day: s.day }];
  s.nextPetitionId = 2;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.screenshot({ path: join(OUT, 'riot-marker.png') });

  await page.click('#menu-button');
  await page.click('[data-action="faith"]');
  const text = await page.textContent('#sheet-body');
  assert.match(text, /Petitions waiting[\s\S]*preacher[\s\S]*Faith across the realm[\s\S]*Scoia'tael[\s\S]*Maribor \(riot-struck\)/);
  await page.screenshot({ path: join(OUT, 'faith.png') });

  await page.click('[data-petition="1"]');
  assert.match(await page.textContent('#sheet-body'), /A petition from Vizima/);
  await page.screenshot({ path: join(OUT, 'petition.png') });
  await page.click('[data-choice="1"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.petitions.length), 0);

  // The riot-struck town's card says so.
  const c = await page.evaluate(() => window.northernWars.screenOf('maribor'));
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForSelector('#sheet:not([hidden])');
  assert.match(await page.textContent('#sheet-body'), /Maribor[\s\S]*Tension between peoples[\s\S]*Riots or raiders/);
  assert.deepEqual(errors, []);
  await context.close();
});

// The great houses: their screen and cards, honours and a grant of land, a
// rebel banner on the map, and a deposition when the crisis runs its course.
test('great houses, rebellion and deposition', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  const s = step(createState(world, 1262), 20, world);
  s.envoys = [];
  s.petitions = [];
  s.demands = [];
  s.houses.ostrowicz.rebel = { since: s.day, months: 1 };
  s.houses.ostrowicz.loyalty = 5;
  s.authority = 2;
  s.crisisMonths = 5;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  await page.click('#menu-button');
  await page.click('[data-action="nobles"]');
  assert.match(await page.textContent('#sheet-body'), /The great houses[\s\S]*regency[\s\S]*House Ostrowicz[\s\S]*In rebellion/);
  await page.screenshot({ path: join(OUT, 'nobles.png') });

  await page.click('[data-house="brodowin"]');
  assert.match(await page.textContent('#sheet-body'), /Wenzel Brodowin[\s\S]*Loyalist[\s\S]*Dorndal \(seat\)/);
  const t = await page.evaluate(() => window.northernWars.state.treasury);
  await page.click('[data-house-action="honours"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.treasury), t - 300);
  await page.click('[data-house-pick="grant"]');
  await page.click('[data-grant="white_orchard"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.settlements.white_orchard.holder), 'brodowin');
  await page.screenshot({ path: join(OUT, 'house.png') });
  await page.click('#sheet-close');

  // Let the crisis run: within a month or so the houses depose the crown.
  await page.click('[data-speed="4"]');
  await page.waitForSelector('[data-regency]', { timeout: 20000 });
  assert.match(await page.textContent('#sheet-body'), /The crown is deposed[\s\S]*Reign 1/);
  await page.screenshot({ path: join(OUT, 'deposed.png') });
  await page.click('[data-regency]');
  assert.equal(await page.evaluate(() => window.northernWars.state.reign.number), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

// Military and threats: order a patrol, strengthen a garrison, see plague and
// raids marked on the map, and answer an event when the clock runs.
test('military screen, patrols, garrisons and events', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  const s = step(createState(world, 1262), 20, world);
  for (const k of ['envoys', 'petitions', 'demands']) s[k] = [];
  s.settlements.maribor.plague = s.day + 100;
  s.settlements.murky_waters.raided = s.day + 30;
  s.settlements.murky_waters.raidKind = 'bandits';
  s.events = [{ id: 1, event: 'witcher', place: 'pontaria', day: s.day }];
  s.nextEventId = 2;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  await page.click('#menu-button');
  await page.click('[data-action="military"]');
  assert.match(await page.textContent('#sheet-body'), /Military and threats[\s\S]*Crown soldiers[\s\S]*Where danger lies/);
  await page.selectOption('[data-pick="from"]', 'vizima');
  await page.selectOption('[data-pick="to"]', 'pontaria');
  await page.click('[data-order-patrol]');
  assert.equal(await page.evaluate(() => window.northernWars.state.patrols.length), 1);
  await page.screenshot({ path: join(OUT, 'military.png') });
  await page.click('#sheet-close');

  const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(viz.x, viz.y);
  await page.waitForSelector('[data-garrison="strong"]');
  await page.click('[data-garrison="strong"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.garrisonLevel.vizima), 'strong');
  await page.click('#sheet-close');
  await page.screenshot({ path: join(OUT, 'threats-map.png') });

  // The waiting witcher speaks up once the clock runs.
  await page.click('[data-speed="1"]');
  await page.waitForSelector('.envoy-from', { timeout: 10000 });
  assert.match(await page.textContent('#sheet-body'), /News from Chippira[\s\S]*witcher/i);
  const t = await page.evaluate(() => window.northernWars.state.treasury);
  await page.click('[data-choice="0"]');
  assert.ok(await page.evaluate((x) => window.northernWars.state.treasury <= x - 150, t));
  assert.deepEqual(errors, []);
  await context.close();
});

// Hints: the welcome note, the town note once a card is opened, and turning
// them off and on again from Help.
test('tutorial hints appear once and can be turned off', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?seed=3&fresh&paused`);
  await page.waitForSelector('#hint:not([hidden])', { timeout: 5000 });
  assert.match(await page.textContent('#hint'), /The crown of Temeria/);
  await page.screenshot({ path: join(OUT, 'hint.png') });
  await page.click('[data-hint="ok"]');
  const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(viz.x, viz.y);
  await page.waitForSelector('#hint:not([hidden])', { timeout: 5000 });
  assert.match(await page.textContent('#hint'), /A town's card/);
  await page.click('[data-hint="off"]');
  await page.click('#menu-button');
  await page.click('[data-action="help"]');
  assert.match(await page.textContent('#sheet-body'), /Help[\s\S]*Turn hints back on[\s\S]*The great houses/);
  await page.click('[data-action="hints-on"]');
  assert.match(await page.textContent('#sheet-body'), /Turn hints off/);
  assert.deepEqual(errors, []);
  await context.close();
});

// Performance guard: in steady play the painted map is not redrawn, and the
// settlement layer only rarely, so phones are spared needless work.
test('steady play does not redraw the painted map', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${base}?seed=7&fresh&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({ ...window.northernWars.renderStats }));
  await page.evaluate(() => window.northernWars.setSpeed(4));
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ ...window.northernWars.renderStats, day: window.northernWars.state.day }));
  assert.equal(after.base - before.base, 0, 'painted map redrawn during play');
  assert.ok(after.overlay - before.overlay <= 3, `settlement layer redrawn ${after.overlay - before.overlay} times`);
  await context.close();
});

// The wider North: a spy in Redania shows it on the map and the realm card,
// a foreign town opens its own card, and an embassy can be opened.
test('foreign realms under the fog of war', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  let s = createState(world, 1262);
  s.spies.redania = s.day + 200;
  s = step(s, 30, world);
  for (const k of ['envoys', 'petitions', 'demands', 'events']) s[k] = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // Pull back to see the whole North under its fog.
  await page.mouse.move(195, 500);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(50); }
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'north.png') });

  await page.click('#menu-button');
  await page.click('[data-action="neighbours"]');
  await page.click('[data-realm="redania"]');
  assert.match(await page.textContent('#sheet-body'), /What we see[\s\S]*through our agent[\s\S]*Places we know[\s\S]*Novigrad/);
  await page.click('[data-foreign="novigrad"]');
  assert.match(await page.textContent('#sheet-body'), /Novigrad[\s\S]*In sight now[\s\S]*People[\s\S]*about/);
  await page.screenshot({ path: join(OUT, 'foreign-card.png') });

  // Back to the realm list, and open an embassy in Kaedwen.
  await page.click('[data-realm="redania"]');
  await page.click('[data-action="neighbours"]');
  await page.click('[data-realm="kaedwen"]');
  const t = await page.evaluate(() => window.northernWars.state.treasury);
  await page.click('[data-embassy="open"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.embassies.kaedwen), true);
  assert.equal(await page.evaluate(() => window.northernWars.state.treasury), t - 250);
  assert.deepEqual(errors, []);
  await context.close();
});

test('war: declare, raise an army, send it to besiege, and see an invasion on the map', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const { startWar } = await import('../../src/sim/war.js');
  const { makeRng } = await import('../../src/sim/rng.js');
  const world = await nodeWorld();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${base}?seed=1262&fresh&paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // Declare war from Kaedwen's card; the war panel opens.
  await page.click('#menu-button');
  await page.click('[data-action="neighbours"]');
  await page.click('[data-realm="kaedwen"]');
  assert.match(await page.textContent('#sheet-body'), /Declare war[\s\S]*Authority/);
  await page.click('[data-declare]');
  assert.match(await page.textContent('#sheet-body'), /Against Kaedwen[\s\S]*Raise an army/);

  // Raise an army at Ellander: half the crown levy and two free companies.
  await page.selectOption('[data-pick="muster"]', 'ellander');
  await page.click('[data-set="levy:half"]');
  await page.click('[data-set="companies:2"]');
  await page.click('[data-set="stance:bold"]');
  await page.click('[data-raise]');
  assert.match(await page.textContent('#sheet-body'), /The army of Ellander[\s\S]*Orders/);

  // Send it against Ban Ard.
  await page.selectOption('[data-pick="siege"]', 'ban_ard');
  await page.click('[data-order="siege"]');
  const army = await page.evaluate(() => window.northernWars.state.armies.find((a) => a.side === 'temeria'));
  assert.equal(army.order, 'siege');
  assert.equal(army.target, 'ban_ard');
  assert.equal(army.stance, 'bold');
  await page.screenshot({ path: join(OUT, 'army-card.png') });
  await page.click('#sheet-close');

  // A few days on, the army is on the map and a tap opens its card.
  await page.click('[data-speed="4"]');
  await page.waitForFunction(() => window.northernWars.state.armies.some((a) => a.side === 'temeria' && a.to), null, { timeout: 15000 });
  await page.click('[data-speed="0"]');
  await page.evaluate(() => {
    const nw = window.northernWars;
    const a = nw.state.armies.find((x) => x.side === 'temeria');
    const p = nw.world.byId[a.at];
    nw.lookAt(p.x, p.y);
  });
  await page.waitForTimeout(150);
  const pos = await page.evaluate(() => window.northernWars.armyScreenOf(window.northernWars.state.armies.find((a) => a.side === 'temeria').id));
  await page.mouse.click(pos.x, pos.y - 6);
  await page.waitForSelector('[data-order]');
  assert.match(await page.textContent('#sheet-body'), /marching on Ban Ard/);
  assert.deepEqual(errors, []);
  await context.close();

  // An invasion: Redania besieges and takes Temerian towns.
  let s = createState(world, 1262);
  startWar(s, world, makeRng(5), 'redania', 'temeria', 'invasion');
  let lost = false;
  for (let d = 0; d < 300 && !lost; d += 5) {
    s = step(s, 5, world);
    lost = Object.values(s.settlements).some((x) => x.occupier) && s.armies.some((a) => a.siege);
  }
  assert.ok(lost, 'a town falls and another is besieged');
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  p2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p2.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await p2.goto(`${base}?paused&nohints`);
  await p2.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await p2.evaluate(() => {
    const nw = window.northernWars;
    const a = nw.state.armies.find((x) => x.siege);
    const p = nw.world.byId[a.at];
    nw.lookAt(p.x, p.y);
  });
  await p2.waitForTimeout(150);
  await p2.screenshot({ path: join(OUT, 'invasion.png') });
  // The occupied town's card says who holds it.
  const occupied = await p2.evaluate(() => Object.keys(window.northernWars.state.settlements).find((id) => window.northernWars.state.settlements[id].occupier));
  await p2.click('#menu-button');
  await p2.click('[data-action="war"]');
  assert.match(await p2.textContent('#sheet-body'), /Against Redania[\s\S]*They hold/);
  await p2.screenshot({ path: join(OUT, 'war-panel.png') });
  assert.ok(occupied);
  assert.deepEqual(errors, []);
  await ctx2.close();
});

// Trade and gold: open a crown route from a town's card, see it drawn on the
// map, and send prospectors into the hills.
test('trade routes and gold from the town cards and the Trade screen', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${base}?seed=1262&fresh&paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(viz.x, viz.y);
  await page.click('[data-route-from="vizima"]');
  assert.match(await page.textContent('#sheet-body'), /Trade and gold[\s\S]*Open a route/);
  await page.selectOption('[data-pick="to"]', 'maribor');
  await page.click('[data-open-route]');
  const routes = await page.evaluate(() => window.northernWars.state.routes);
  assert.equal(routes.length, 1);
  assert.deepEqual([routes[0].from, routes[0].to], ['vizima', 'maribor']);
  assert.match(await page.textContent('#sheet-body'), /Vizima to Maribor[\s\S]*crowns a month/);
  await page.screenshot({ path: join(OUT, 'trade.png') });
  await page.click('#sheet-close');
  // Prospectors go into the Tukaj Hills above Napeys.
  await page.evaluate(() => { const st = window.northernWars.world.byId.napeys; window.northernWars.lookAt(st.x, st.y); });
  const nap = await page.evaluate(() => window.northernWars.screenOf('napeys'));
  await page.touchscreen.tap(nap.x, nap.y);
  await page.waitForSelector('[data-prospect]');
  await page.click('[data-prospect]');
  assert.equal(await page.evaluate(() => window.northernWars.state.gold.prospects.length), 1);
  assert.match(await page.textContent('#sheet-body'), /Prospectors are in the hills/);
  assert.deepEqual(errors, []);
  await context.close();
});

// The busy map: a well-built Vizima close up in portrait and landscape, and
// the frame rate held while zoomed in and panning on a slowed CPU.
test('a busy Vizima close up, within a sixtieth of a second a frame on a slowed CPU', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  // Early May: the measured run ends before the first of June brings news
  // that would pause the game.
  const s = step(createState(world, 1262), 62, world);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.settlements.vizima.buildings = ['mill', 'granary', 'market', 'workshop', 'walls', 'harbour', 'smithy', 'guildhall', 'cathedral', 'bank', 'paving'];
  s.settlements.vizima.construction = { building: 'bathhouse', daysLeft: 20, days: 50 };
  s.settlements.vizima.population.human += 6000;
  s.settlements.white_orchard.buildings = ['fields', 'mill', 'brewery'];
  s.settlements.murky_waters.buildings = ['fields', 'granary'];
  s.routes = [{ id: 1, from: 'vizima', to: 'maribor', since: s.day, last: 40, raided: false, closed: null }];
  s.nextRouteId = 2;
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
    await page.goto(`${base}?paused&nohints`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    await page.evaluate(() => window.northernWars.lookAt(523, 343));
    await page.screenshot({ path: join(OUT, `${vp.name}-map.png`) });
    for (let i = 0; i < 5; i++) { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.wheel(0, -600); await page.waitForTimeout(50); }
    await page.evaluate(() => window.northernWars.lookAt(523, 343));
    // A few days of life: smoke, workers, the builders at the bathhouse.
    await page.evaluate(() => window.northernWars.setSpeed(1));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.northernWars.setSpeed(0));
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, `${vp.name}-vizima.png`) });
    const plan = await page.evaluate(() => window.northernWars.planOf('vizima'));
    assert.ok(plan.items.filter((i) => i.kind === 'house').length >= 30, 'Vizima is full of houses');
    for (const b of ['cathedral', 'harbour', 'market', 'bank']) assert.ok(plan.items.some((i) => i.sprite === b), `${b} stands in Vizima`);
    assert.ok(plan.items.some((i) => i.kind === 'scaffold'), 'the bathhouse is going up');
    assert.ok(plan.walls);

    if (vp.name === 'portrait') {
      // Four times slower CPU, the realm running, zoomed in, panning about. What
      // is measured is the game's own work in each frame (its days and its
      // drawing), which must fit easily in a sixtieth of a second; the
      // headless browser's software compositing is not the phone's.
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.evaluate(() => window.northernWars.setSpeed(1));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.northernWars.resetFrameStats());
      await page.mouse.move(195, 500);
      await page.mouse.down();
      for (let i = 0; i < 40; i++) { await page.mouse.move(195 + Math.sin(i / 6) * 100, 500 + Math.cos(i / 6) * 100); await page.waitForTimeout(30); }
      await page.mouse.up();
      const f = await page.evaluate(() => window.northernWars.frameStats);
      assert.ok(f.frames > 30, `${f.frames} frames drawn`);
      assert.ok(f.mean < 8, `${f.mean.toFixed(1)} ms a frame on average`);
      assert.ok(f.p95 < 1000 / 60, `${f.p95.toFixed(1)} ms for the slowest frames`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});
