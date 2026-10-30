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
    page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });

    await page.goto(`${base}?seed=1262&fresh&nohints`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    const startDay = await page.evaluate(() => window.northernWars.state.day);

    // Let traffic build up at full speed, then pause for steady screenshots.
    // With this seed, decisions arrive on 1 April (a petition, a demand
    // from a great house, a ruler's request). They do not open over the map: the game
    // pauses, a toast says so and the Court tab shows a badge.
    await page.click('[data-speed="4"]');
    await page.waitForSelector('[data-tab="court"] .tab-badge:not([hidden])', { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'a decision pauses the game');
    assert.equal(await page.isHidden('#sheet'), true, 'no decision opens by itself');
    assert.match(await page.textContent('#toast'), /waits at court/);
    await page.screenshot({ path: join(OUT, `${vp.name}-decision-badge.png`) });
    const seen = [];
    await page.click('[data-tab="court"]');
    await page.screenshot({ path: join(OUT, `${vp.name}-inbox.png`) });
    for (let i = 0; i < 8; i++) {
      const pending = await page.evaluate(() => {
        const st = window.northernWars.state;
        return st.envoys.length + st.petitions.length + st.demands.length + st.events.length + (st.diplomacy?.requests.length ?? 0);
      });
      if (!pending) break;
      seen.push(...await page.$$eval('#sheet-body .envoy-from', (els) => els.map((e) => e.textContent)));
      await page.click('#sheet-body [data-choice="1"]');
    }
    assert.ok(seen.length >= 1, `decisions seen: ${seen}`);
    await page.click('#sheet-close');
    await page.click('[data-speed="4"]');
    await page.waitForFunction((d) => window.northernWars.state.day >= d + 40, startDay, { timeout: 20000 });
    await page.click('[data-speed="0"]');
    const paused = await page.evaluate(() => window.northernWars.state.day);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.northernWars.state.day), paused, 'pause stops the calendar');
    assert.match(await page.textContent('#date'), /\d+ \w+ 1262/);
    assert.match(await page.textContent('#season'), /Spring|Summer/);
    const units = await page.evaluate(() => window.northernWars.state.ambient.units.map((u) => u.kind));
    // Every traveller has a real source (M22 B): pilgrims and goods carts in
    // a fresh reign, but no patrols until a company rides on patrol orders.
    assert.ok(units.includes('pilgrim') && units.includes('goods') && !units.includes('patrol'), `traffic: ${units}`);
    assert.match(await page.textContent('#m-granary'), /^[\d,.]+k?$/);
    await page.screenshot({ path: join(OUT, `${vp.name}-map.png`) });

    // Tap Vizima: its card opens.
    const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
    await page.touchscreen.tap(viz.x, viz.y);
    await page.waitForSelector('#sheet:not([hidden])');
    assert.match(await page.textContent('#sheet-title'), /Vizima/);
    assert.match(await page.textContent('#sheet-body'), /crown demesne[\s\S]*Population[\s\S]*Overview[\s\S]*Food for [\d,]+ days[\s\S]*Works[\s\S]*Details/);
    await page.screenshot({ path: join(OUT, `${vp.name}-card.png`) });

    // Mend Vizima's fire-damaged brewery from the Works tab (M20): coin
    // leaves the treasury, the masons go in.
    await page.evaluate(() => {
      const s = window.northernWars.state.settlements.vizima;
      s.cond = { ...(s.cond ?? {}), brewery: 40 };
      s.worn = { ...(s.worn ?? {}), brewery: { why: 'Gutted by fire in March', day: 0 } };
    });
    const treasury = await page.evaluate(() => window.northernWars.state.treasury);
    await page.click('.segs [data-tsub="works"]');
    assert.match(await page.textContent('[data-part="spaces"]'), /Lake Vizima[\s\S]*The Ismena[\s\S]*City square/i);
    await page.click('[data-works="brewery"]');
    assert.match(await page.textContent('[data-part="repair"]'), /Rebuild it[\s\S]*crowns[\s\S]*days[\s\S]*hands[\s\S]*Patch it up/);
    await page.screenshot({ path: join(OUT, `${vp.name}-repair.png`) });
    const cost = await page.evaluate(() => window.northernWars.repairOptions('vizima', 'brewery').rebuild.coin);
    await page.click('[data-repair="rebuild"]');
    await page.waitForFunction(() => window.northernWars.state.settlements.vizima.repair?.brewery, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.northernWars.state.treasury), treasury - cost);
    await page.screenshot({ path: join(OUT, `${vp.name}-works.png`) });
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
    await page.click('#more-button');
    await page.click('[data-more="save"]');
    assert.ok(await page.evaluate(() => localStorage.getItem('northern-wars.save')?.includes('northern-wars-save')));
    // Decree price controls from the Laws screen.
    await page.click('[data-tab="court"]');
    await page.click('[data-sub="laws"]');
    assert.match(await page.textContent('#sheet-body'), /Peasants[\s\S]*Grain prices/);
    assert.doesNotMatch(await page.textContent('#sheet-body'), /Taxes on the towns/, 'taxes are set in the Treasury');
    const love = await page.evaluate(() => window.northernWars.state.love);
    await page.click('[data-law="grain_prices"]');
    await page.click('[data-decree="grain_prices:controlled"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.laws.grain_prices.option), 'controlled');
    assert.equal(await page.evaluate(() => window.northernWars.state.love), love - 10);
    assert.match(await page.textContent('[data-law="grain_prices"]'), /Price controls[\s\S]*Taking hold/);
    await page.screenshot({ path: join(OUT, `${vp.name}-laws.png`) });

    // Neighbouring realms: warm to Redania.
    await page.click('[data-tab="diplomacy"]');
    await page.click('[data-realm="redania"]');
    assert.match(await page.textContent('#sheet'), /Redania[\s\S]*Vizimir[\s\S]*Our stance/);
    await page.click('[data-stance="friendly"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.neighbours.redania.stance), 'friendly');
    await page.screenshot({ path: join(OUT, `${vp.name}-realm.png`) });

    await page.click('[data-tab="treasury"]');
    assert.match(await page.textContent('#sheet-body'), /Taxes[\s\S]*Garrisons[\s\S]*The past year/);
    await page.screenshot({ path: join(OUT, `${vp.name}-ledger.png`) });
    await page.click('#more-button');
    await page.click('[data-more="chronicle"]');
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
  // A works being mended (M20): the masons are in at the market hall.
  s.settlements.vizima.cond = { market: 40 };
  s.settlements.vizima.repair = { market: { kind: 'rebuild', days: 30, daysLeft: 20, to: 100, hands: 40, since: s.day } };
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
  assert.match(await page.textContent('#sheet'), /Vizima[\s\S]*unpaid[\s\S]*Market hall\s*40/);
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

  await page.click('[data-tab="court"]');
  await page.click('[data-sub="faith"]');
  const text = await page.textContent('#sheet-body');
  assert.match(text, /Petitions waiting[\s\S]*Faith across the realm[\s\S]*Scoia'tael[\s\S]*Maribor \(riot-struck\)/);
  await page.screenshot({ path: join(OUT, 'faith.png') });

  await page.click('[data-tab-go="court:inbox"]');
  assert.match(await page.textContent('#sheet-body'), /A petition from Vizima[\s\S]*preacher/i);
  await page.screenshot({ path: join(OUT, 'petition.png') });
  await page.click('[data-choice="1"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.petitions.length), 0);

  // The riot-struck town's card says so.
  await page.click('#sheet-close');
  const c = await page.evaluate(() => window.northernWars.screenOf('maribor'));
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForSelector('#sheet:not([hidden])');
  assert.match(await page.textContent('#sheet'), /Maribor[\s\S]*Riots or raiders/);
  await page.click('.segs [data-tsub="people"]');
  assert.match(await page.textContent('#sheet-body'), /Tension between peoples/);
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
  s.love = 2;
  s.fear = 2;
  for (const st of Object.values(s.settlements)) st.unrest = Math.max(st.unrest, 85);
  s.crisisMonths = 5;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // The rebellion raises a banner across the top.
  assert.match(await page.textContent('#urgent'), /Ostrowicz is in open rebellion/);
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="houses"]');
  assert.match(await page.textContent('#sheet-body'), /regency[\s\S]*House Ostrowicz[\s\S]*In rebellion/);
  await page.screenshot({ path: join(OUT, 'nobles.png') });

  await page.click('[data-house="brodowin"]');
  assert.match(await page.textContent('#sheet-body'), /Wenzel Brodowin[\s\S]*Dorndal \(seat\)[\s\S]*Loyalist/);
  const t = await page.evaluate(() => window.northernWars.state.treasury);
  await page.click('[data-house-action="honours"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.treasury), t - 300);
  await page.click('[data-house-pick="grant"]');
  await page.click('[data-grant="white_orchard"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.settlements.white_orchard.holder), 'brodowin');
  await page.screenshot({ path: join(OUT, 'house.png') });
  await page.click('#sheet-close');

  // Let the crisis run: within a month or so the houses depose the crown.
  // A banner says so; tapping it leads to the inbox.
  await page.click('[data-speed="4"]');
  await page.waitForFunction(() => /deposed/.test(document.getElementById('urgent').textContent), null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'the deposition pauses the game');
  await page.click('.urgent-go');
  assert.match(await page.textContent('#sheet-body'), /The crown is deposed[\s\S]*Continue under a regency/);
  await page.screenshot({ path: join(OUT, 'deposed.png') });
  await page.click('[data-go="deposition"]');
  assert.match(await page.textContent('#sheet-body'), /Reign 1/);
  await page.click('#sheet-back');
  await page.click('[data-regency]');
  assert.equal(await page.evaluate(() => window.northernWars.state.reign.number), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

// Garrisons and danger: recruit a company and set it patrolling, strengthen a
// garrison, see plague and raids marked on the map, and answer an event.
test('military screen, companies, garrisons and events', async () => {
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

  await page.click('[data-tab="military"]');
  await page.click('[data-sub="garrisons"]');
  assert.match(await page.textContent('#sheet-body'), /Garrison soldiers[\s\S]*Where danger lies/);
  await page.screenshot({ path: join(OUT, 'military.png') });
  await page.click('#sheet-close');

  // Recruit light horse at Vizima from its card, and set them riding a road
  // picked on the map.
  const viz = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(viz.x, viz.y);
  await page.click('[data-recruit-here]');
  await page.click('[data-recruit="lightcav"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.forces.companies.length), 1);
  await page.click('[data-part="companies"] [data-company]');
  await page.click('[data-order-kind="patrol"]');
  await page.waitForSelector('#pickbar:not([hidden])');
  for (const id of ['vizima', 'pontaria']) {
    await page.evaluate((p) => { const st = window.northernWars.world.byId[p]; window.northernWars.lookAt(st.x, st.y); }, id);
    const q = await page.evaluate((p) => window.northernWars.screenOf(p), id);
    await page.touchscreen.tap(q.x, q.y);
  }
  assert.match(await page.textContent('#pickbar'), /Patrol Vizima to Chippira/);
  await page.screenshot({ path: join(OUT, 'pick-patrol.png') });
  await page.click('[data-pick-confirm]');
  const order = await page.evaluate(() => window.northernWars.state.forces.companies[0].order);
  assert.deepEqual([order.kind, order.from, order.to], ['patrol', 'vizima', 'pontaria']);
  await page.click('#sheet-close');

  const v2 = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(v2.x, v2.y);
  await page.click('.segs [data-tsub="military"]');
  await page.click('[data-garrison="strong"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.garrisonLevel.vizima), 'strong');
  await page.click('#sheet-close');
  await page.screenshot({ path: join(OUT, 'threats-map.png') });

  // The waiting witcher is in the Court inbox.
  await page.click('[data-tab="court"]');
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
  await page.click('#more-button');
  await page.click('[data-more="help"]');
  assert.match(await page.textContent('#sheet-body'), /Turn hints back on[\s\S]*Finding your way[\s\S]*The great houses/);
  // Help is a searchable list of short topics.
  await page.fill('[data-field="q"]', 'witcher');
  await page.waitForFunction(() => !/Finding your way/.test(document.getElementById('sheet-body').textContent));
  assert.match(await page.textContent('#sheet-body'), /Something in the wilds/);
  await page.fill('[data-field="q"]', '');
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
  // The painted map's tiles fill in over the first moments; then it rests.
  await page.waitForFunction(() => !window.northernWars.tileStats.pending);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({ ...window.northernWars.renderStats }));
  await page.evaluate(() => window.northernWars.setSpeed(4));
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ ...window.northernWars.renderStats, day: window.northernWars.state.day }));
  assert.equal(after.base - before.base, 0, 'painted map redrawn during play');
  // A handful of redraws as the month turns (garrisons and foreign news
  // settle on the first), never one a frame.
  assert.ok(after.overlay - before.overlay <= 4, `settlement layer redrawn ${after.overlay - before.overlay} times`);
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
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // Pull back to see the whole North under its fog.
  await page.mouse.move(195, 500);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(50); }
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'north.png') });

  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-realm="redania"]');
  assert.match(await page.textContent('#sheet-body'), /What we see[\s\S]*through our agent[\s\S]*Places we know[\s\S]*Novigrad/);
  await page.click('[data-foreign="novigrad"]');
  assert.match(await page.textContent('#sheet'), /Novigrad[\s\S]*In sight now[\s\S]*People[\s\S]*about/);
  await page.screenshot({ path: join(OUT, 'foreign-card.png') });

  // Back twice to the realm list, and open an embassy in Kaedwen.
  await page.click('#sheet-back');
  await page.click('#sheet-back');
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
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.goto(`${base}?seed=1262&fresh&paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // Declare war from Kaedwen's card; the war panel opens.
  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-realm="kaedwen"]');
  assert.match(await page.textContent('#sheet-body'), /Declare war[\s\S]*Authority/);
  await page.click('[data-declare]');
  assert.match(await page.textContent('#sheet-body'), /Against Kaedwen[\s\S]*Raise an army/);

  // Raise an army at Ellander, picked on the map: half the crown levy and
  // the lords' men.
  const tapPlace = async (pg, id) => {
    await pg.evaluate((p) => { const st = window.northernWars.world.byId[p]; window.northernWars.lookAt(st.x, st.y); }, id);
    const q = await pg.evaluate((p) => window.northernWars.screenOf(p), id);
    await pg.touchscreen.tap(q.x, q.y);
  };
  await page.click('[data-pick-start*="muster"]');
  await tapPlace(page, 'ellander');
  await page.click('[data-pick-confirm]');
  await page.click('[data-set="levy:half"]');
  await page.click('[data-set="nobles:true"]');
  await page.click('[data-set="stance:bold"]');
  await page.click('[data-raise]');
  assert.match(await page.textContent('#sheet'), /The First Army[\s\S]*holding Ellander[\s\S]*Orders/);

  // The levies take days to gather (M21); let them come in.
  await page.evaluate(() => { for (const a of window.northernWars.state.armies) if (a.side === 'temeria') a.gatherUntil = 0; });
  // Send it against Ban Ard: tap it on the map and see what it would face.
  await page.click('[data-order-kind="siege"]');
  await tapPlace(page, 'ban_ard');
  assert.match(await page.textContent('#pickbar'), /Besiege Ban Ard[\s\S]*Kaedwen/);
  await page.screenshot({ path: join(OUT, 'pick-siege.png') });
  await page.click('[data-pick-confirm]');
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
  await page.waitForSelector('[data-order-kind="siege"]');
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
  assert.match(await p2.textContent('#urgent'), /besieged by Redania/);
  await p2.click('[data-tab="military"]');
  await p2.click('[data-sub="war"]');
  assert.match(await p2.textContent('#sheet-body'), /Against Redania[\s\S]*They hold/);
  await p2.screenshot({ path: join(OUT, 'war-panel.png') });
  assert.ok(occupied);
  assert.deepEqual(errors, []);
  await ctx2.close();
});

// Trade and gold: the five goods and a deal with a partner from the
// Treasury's Trade screen (M21), and prospectors sent into the hills.
test('trade deals and gold from the Trade screen and the town cards', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  const s = step(createState(world, 1262), 62, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  // Trade (M21): the five goods, then a deal with Redania from its card.
  await page.click('[data-tab="treasury"]');
  await page.click('.segs [data-sub="trade"]');
  assert.match(await page.textContent('[data-part="goods"]'), /Grain[\s\S]*Timber and stone: surplus[\s\S]*Iron and arms[\s\S]*Cloth: short[\s\S]*Luxuries/);
  await page.screenshot({ path: join(OUT, 'trade.png') });
  await page.click('[data-partner="redania"]');
  await page.click('[data-sec="trade"] summary');
  await page.click('[data-form="deal:redania"] [data-set="sell:materials"]');
  await page.click('[data-form="deal:redania"] [data-set="sellQty:50"]');
  assert.match(await page.textContent('[data-part="deal-preview"]'), /Sell 50 loads of timber and stone a month: \+\d+ crowns/);
  await page.click('[data-deal-go="redania"]');
  assert.deepEqual(await page.evaluate(() => window.northernWars.state.market.deals.redania.sell), { good: 'materials', qty: 50 });
  await page.click('#sheet-close');
  // Prospectors go into the Tukaj Hills above Napeys.
  await page.evaluate(() => { const st = window.northernWars.world.byId.napeys; window.northernWars.lookAt(st.x, st.y); });
  const nap = await page.evaluate(() => window.northernWars.screenOf('napeys'));
  await page.touchscreen.tap(nap.x, nap.y);
  await page.click('.segs [data-tsub="overview"]');
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
  // Many tokens on screen: a dozen companies at Vizima and on the roads
  // round it, and camps, lairs and bands in sight.
  const types = Object.keys(world.forces.companies);
  const roads = [['vizima', 'murky_waters'], ['vizima', 'white_orchard'], ['vizima', 'la_valette'], ['vizima', 'pontaria']];
  for (let i = 0; i < 12; i++) {
    const type = types[i % types.length];
    const t = world.forces.companies[type];
    const [from, to] = roads[i % roads.length];
    const v = world.byId.vizima;
    s.forces.companies.push({
      id: s.forces.nextId++, type, name: `Vizima ${t.name} ${i}`, home: 'vizima', station: 'vizima', men: t.men, max: t.men, wounded: 0, morale: 50 + i * 4, xp: 0,
      order: i < 6 ? { kind: 'patrol', from, to } : { kind: 'station' }, task: null, x: v.x, y: v.y, node: 'vizima', way: [], army: null, wins: 0, fought: -1, routed: 0,
    });
  }
  for (const [i, [x, y]] of [[470, 300], [560, 300], [500, 400], [580, 380], [450, 360], [540, 420]].entries()) {
    s.threats.list.push({
      id: s.threats.nextId++, kind: i % 2 ? 'monsters' : 'bandits', terrain: 'forest', species: 'wolves', x, y, near: 'vizima', men: 40 + i * 10, count: 6 + i,
      morale: 70, born: s.day, band: i > 3 ? { men: 25, count: 4, x: x + 20, y: y - 10, way: [{ x: x + 60, y: y - 20 }], phase: 'out', seg: 'vizima|murky_waters', lurk: 30, until: 0 } : null,
      sighted: true, campSeen: true, alerted: true, rumour: null,
    });
  }
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
      // The interface's own cost a frame (days of the realm fall on fewer, capped frames since M22 A).
      assert.ok(f.meanCalm < 8, `${f.meanCalm.toFixed(1)} ms a frame on average`);
      assert.ok(f.p95 < 1000 / 60, `${f.p95.toFixed(1)} ms for the slowest frames`);
      // Again with a panel open and its sheet being dragged up and down, the
      // realm still running. The realm's days were held to the budget above;
      // here what counts is that the panel and the drag add nothing, so the
      // slowest frames are taken from those that did not also run a day.
      await page.click('[data-tab="military"]');
      await page.evaluate(() => window.northernWars.resetFrameStats());
      const head = await page.locator('#sheet-head').boundingBox();
      await page.mouse.move(head.x + 60, head.y + 20);
      await page.mouse.down();
      for (let i = 0; i < 40; i++) { await page.mouse.move(head.x + 60, head.y + 20 - 220 * Math.abs(Math.sin(i / 7))); await page.waitForTimeout(30); }
      await page.mouse.up();
      const g = await page.evaluate(() => window.northernWars.frameStats);
      assert.ok(g.frames > 30, `${g.frames} frames drawn while dragging`);
      assert.ok(g.meanCalm < 8, `${g.meanCalm.toFixed(1)} ms a frame on average while dragging`);
      assert.ok(g.p95Calm < 1000 / 60, `${g.p95Calm.toFixed(1)} ms for the slowest frames while dragging (${g.dayFrames} frames also ran a day; ${g.p95.toFixed(1)} with them)`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// The whole North on screen at once: every forest, peak, river and town of
// twenty-four lands. The terrain is painted once into cached tiles, so a pan
// across the continent on a slowed CPU still fits in a sixtieth of a second.
test('the whole North zoomed out, within a sixtieth of a second a frame on a slowed CPU', async () => {
  const context = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  await page.mouse.move(195, 420);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(40); }
  // Let the coarse tiles fill in, as they would in the first moment of play.
  await page.waitForTimeout(600);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => window.northernWars.setSpeed(1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.northernWars.resetFrameStats());
  await page.mouse.move(195, 420);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(195 + Math.sin(i / 6) * 120, 420 + Math.cos(i / 6) * 160); await page.waitForTimeout(30); }
  await page.mouse.up();
  const f = await page.evaluate(() => window.northernWars.frameStats);
  assert.ok(f.frames > 30, `${f.frames} frames drawn`);
  // The interface's own cost a frame (days of the realm fall on fewer, capped frames since M22 A).
  assert.ok(f.meanCalm < 8, `${f.meanCalm.toFixed(1)} ms a frame on average`);
  assert.ok(f.p95 < 1000 / 60, `${f.p95.toFixed(1)} ms for the slowest frames`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => window.northernWars.setSpeed(0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'portrait-north.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

// A working economy: the red-treasury hint leads to the Treasury, which
// shows a line for every source of money and the places that earned most;
// a town's card shows what it earned and cost; the new industries stand on
// the map with their life about them.
test('the Treasury, town accounts and the industries close up', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const { createState, step, serialize } = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  let s = createState(world, 1262);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.settlements.vizima.buildings = ['market', 'quarter', 'fishery', 'weavers', 'brewery', 'alchemist', 'smithy', 'weaponsmith'];
  s.settlements.white_orchard.buildings = ['pasture', 'fields'];
  s.settlements.cleves.buildings = ['stud', 'fields'];
  s.settlements.findetann.buildings = ['charcoal'];
  s.settlements.la_valette.buildings = ['tollbridge'];
  s.neighbours.redania.relation = 45;
  s.routes = [{ id: 1, from: 'vizima', to: 'oxenfurt', since: s.day, last: 0, raided: false, closed: null }];
  s.nextRouteId = 2;
  s = step(s, 62, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.treasury = -400;
  const allButDebt = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../data/hints.json', import.meta.url), 'utf8')).hints.map((h) => h.id).filter((id) => id !== 'debt');
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: vp.width < vp.height, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(([save, seen]) => {
      localStorage.setItem('northern-wars.save', save);
      localStorage.setItem('northern-wars.hints', JSON.stringify({ seen, off: false }));
    }, [serialize(s), allButDebt]);
    await page.goto(`${base}?paused`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    await page.waitForSelector('#hint:not([hidden])', { timeout: 5000 });
    assert.match(await page.textContent('#hint'), /Into the red[\s\S]*Treasury/);
    await page.screenshot({ path: join(OUT, `${vp.name}-debt-hint.png`) });
    await page.click('[data-hint="open"]');
    await page.waitForSelector('#sheet:not([hidden])');
    const text = await page.textContent('#sheet-body');
    // One ledger of grouped lines first (M21), the full breakdown under Details.
    assert.match(await page.textContent('[data-part="ledger"]'), /Income[\s\S]*Taxes[\s\S]*Trade and sales[\s\S]*Crafts and goods[\s\S]*Total income[\s\S]*Expenses[\s\S]*War[\s\S]*Crafts and goods[\s\S]*Repairs[\s\S]*Total expenses/);
    assert.match(text, /Treasury[\s\S]*Head tax[\s\S]*Crafts[\s\S]*Market hall[\s\S]*Goods from the chains[\s\S]*Cloth sold[\s\S]*Bridge tolls[\s\S]*Rents[\s\S]*Crown trade routes[\s\S]*Where the money came from/);
    await page.screenshot({ path: join(OUT, `${vp.name}-treasury.png`), fullPage: false });
    await page.click('[data-sec="places"] > summary');
    await page.locator('.place-list').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `${vp.name}-treasury-places.png`) });
    await page.click('.place-row[data-place="vizima"]');
    await page.waitForSelector('.accounts');
    assert.match(await page.textContent('.accounts'), /earned the crown [\d,]+ crowns and cost it [\d,]+/);
    await page.screenshot({ path: join(OUT, `${vp.name}-card-accounts.png`) });
    await page.click('#sheet-close');
    // The industries close up: Vizima's new trades, then the pastures and
    // paddocks of the south.
    for (let i = 0; i < 12; i++) { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.wheel(0, -600); await page.waitForTimeout(50); }
    for (const [x, y, name] of [[523, 343, 'vizima'], [584, 398, 'orchard'], [595, 589, 'cleves']]) {
      await page.evaluate(([a, b]) => window.northernWars.lookAt(a, b), [x, y]);
      await page.evaluate(() => window.northernWars.setSpeed(1));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.northernWars.setSpeed(0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(OUT, `${vp.name}-industry-${name}.png`) });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// A realm under arms: a bandit camp, a beasts' lair and a band on the road in
// sight, a rumour beyond it, and the crown's companies on Hunt, Respond and
// Patrol orders; the Forces screen with odds in words, a company's card and
// a threat's card.
test('threats and companies on the map, the Forces screen and a Hunt order', async () => {
  const { nodeWorld } = await import('../helpers.js');
  const sim = await import('../../src/sim/index.js');
  const world = await nodeWorld();
  let s = sim.step(sim.createState(world, 1262), 62, world);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.treasury = 8000;
  // Without the watchtowers and inns every place has since M20 (they see
  // further), so the wolves stay a rumour.
  for (const t of Object.values(s.settlements)) t.buildings = t.buildings.filter((b) => b !== 'watchtower' && b !== 'inn');
  const marsh = sim.wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
  const forest = sim.wildSites(world, 'anchor').find((x) => x.terrain === 'forest');
  const base0 = { morale: 70, born: s.day, band: null, sighted: false, alerted: true, rumour: null };
  s.threats.list = [
    { ...base0, id: 1, kind: 'bandits', terrain: 'marsh', x: marsh.x, y: marsh.y, near: 'anchor', men: 70 },
    { ...base0, id: 2, kind: 'monsters', terrain: 'marsh', species: 'drowners', x: 222, y: 470, near: 'anchor', count: 9 },
    { ...base0, id: 3, kind: 'monsters', terrain: 'forest', species: 'wolves', x: forest.x + 5, y: forest.y + 8, near: 'anchor', count: 12 },
    { ...base0, id: 4, kind: 'bandits', terrain: 'forest', x: 260, y: 560, near: 'napeys', men: 40, band: { men: 30, x: 300, y: 520, way: [{ x: 330, y: 500 }], phase: 'out', seg: 'dorian|napeys', lurk: 8, until: 0 } },
  ];
  s.threats.nextId = 5;
  const act = (a) => {
    const out = sim.applyAction(s, world, a);
    assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
    s = out.state;
  };
  act({ type: 'recruit', settlement: 'gors_velen', kind: 'menatarms' });
  act({ type: 'recruit', settlement: 'gors_velen', kind: 'archers' });
  act({ type: 'recruit', settlement: 'pontaria', kind: 'lightcav' });
  s = sim.step(s, 1, world, { ambient: false });
  assert.ok(s.threats.list.find((t) => t.id === 1).campSeen, 'the camp is in sight');
  assert.ok(s.threats.list.find((t) => t.id === 3).rumour, 'the wolves further off are only a rumour');
  act({ type: 'company', id: 1, order: { kind: 'hunt', threat: 1 } });
  act({ type: 'company', id: 2, order: { kind: 'station', place: 'gors_velen' } });
  act({ type: 'company', id: 3, order: { kind: 'patrol', from: 'pontaria', to: 'findetann' } });
  s = sim.step(s, 2, world);
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: vp.width < vp.height, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), sim.serialize(s));
    await page.goto(`${base}?paused&nohints`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    for (let i = 0; i < 3; i++) { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.wheel(0, -600); await page.waitForTimeout(50); }
    await page.evaluate(() => window.northernWars.lookAt(225, 470));
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${vp.name}-forces-map.png`) });
    // The Forces screen lists the companies and every threat in sight.
    await page.click('[data-tab="military"]');
    await page.click('[data-sub="threats"]');
    const text = await page.textContent('#sheet-body');
    assert.match(text, /Bandit camp[\s\S]*Drowners[\s\S]*rumour/);
    assert.match(text, /(Sure to win|Likely to win|Even|Risky|Hopeless) for/);
    await page.screenshot({ path: join(OUT, `${vp.name}-threats.png`) });
    await page.click('[data-sub="forces"]');
    assert.match(await page.textContent('#sheet-body'), /The crown's companies[\s\S]*Gors Velen Men-at-arms/);
    await page.screenshot({ path: join(OUT, `${vp.name}-forces.png`) });
    // A company's card: its orders, and the odds of each hunt.
    await page.click('[data-company="2"]');
    await page.waitForSelector('[data-hunt]');
    assert.match(await page.textContent('#sheet-body'), /Orders[\s\S]*Hunt: Drowners[\s\S]*(Sure to win|Likely to win|Even|Risky|Hopeless)/);
    await page.screenshot({ path: join(OUT, `${vp.name}-company.png`) });
    await page.click('[data-hunt="2"]');
    assert.equal(await page.evaluate(() => window.northernWars.state.forces.companies.find((c) => c.id === 2).order.kind), 'hunt');
    await page.click('#sheet-close');
    // A threat's card, from the map.
    const lair = await page.evaluate(() => window.northernWars.screenOfPoint(222, 470));
    await page.mouse.click(lair.x, lair.y);
    await page.waitForSelector('#sheet:not([hidden])');
    assert.match(await page.textContent('#sheet'), /Drowners[\s\S]*Hire a witcher/);
    await page.screenshot({ path: join(OUT, `${vp.name}-threat.png`) });
    assert.deepEqual(errors, []);
    await context.close();
  }
});
