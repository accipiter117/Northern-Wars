// The Empire and Toussaint (M30 C): Nazair, Metinna, Mag Turga and Ebbing
// as one great power under Emperor Emhyr, each province with a governor;
// disciplined imperial companies; regiments from the heartland on a
// schedule, faster at war; Toussaint as the Empire's vassal from the start;
// the Empire within reach of the North's petty kingdoms; older saves gain it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, tierOf, suzerainOf, rulerOf, canOfferProtection } from '../../src/sim/index.js';
import { realmCompanies } from '../../src/sim/companies.js';
import { stepEmpireDay, governors, arrivalTown, reinforcementGap } from '../../src/sim/empire.js';
import { greatPowers, distance } from '../../src/sim/suzerainty.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });

test('the Empire is one great power over four provinces, each under a governor', () => {
  assert.equal(tierOf(world, 'nilfgaard'), 'great');
  assert.equal(rulerOf(world, 'nilfgaard').name, 'Emhyr var Emreis');
  assert.equal(rulerOf(world, 'nilfgaard').title, 'Emperor');
  const g = governors(world, 'nilfgaard');
  assert.deepEqual(g.map((p) => p.name).sort(), ['Ebbing', 'Mag Turga', 'Metinna', 'Nazair']);
  for (const p of g) assert.ok(p.governor, `${p.name} has a governor`);
  for (const id of ['nazair_city', 'metinna_city', 'ebbing_city', 'assengard', 'rhys_rhun']) assert.equal(world.realmOf[id], 'nilfgaard', id);
  const s = createState(world, 1);
  assert.ok(s.realms.nilfgaard && !s.realms.nazair && !s.realms.ebbing, 'one realm, not four');
  assert.ok(!Object.keys(s.houses).some((h) => world.houses.houses[h]?.realm === 'nilfgaard'), 'no great houses');
});

test('imperial companies are disciplined, mixed and many', () => {
  const bands = realmCompanies(world, 'nilfgaard', 1000, 1000);
  const types = new Set(bands.map((b) => b.type));
  for (const t of ['menatarms', 'knights', 'crossbows']) assert.ok(types.has(t), t);
  assert.ok(bands.filter((b) => b.type !== 'militia').every((b) => b.xp >= 0.4), 'seasoned');
  assert.equal(Math.round(bands.reduce((a, b) => a + b.men, 0)), 2000);
  // A northern realm keeps its usual levies and bowmen.
  assert.ok(realmCompanies(world, 'cintra', 0, 1000).some((b) => b.type === 'archers'));
  const s = createState(world, 1);
  const garrison = (rid) => Object.values(s.realms[rid].settlements).reduce((a, x) => a + x.garrison, 0);
  for (const rid of ['cintra', 'kaedwen', 'aedirn']) assert.ok(garrison('nilfgaard') > garrison(rid), `more men under arms than ${rid}`);
});

test('fresh regiments march in from the heartland, faster at war', () => {
  const s = createState(world, 1);
  const c = world.war.empire;
  const before = s.realms.nilfgaard.army ?? 0;
  for (let d = 0; d < 365; d++) {
    s.day += 1;
    stepEmpireDay(s, world);
  }
  const peace = (s.realms.nilfgaard.army ?? 0) - before;
  assert.ok(peace >= c.men * 3 && peace <= c.men * 5, `${peace} men in a year of peace`);
  assert.ok(world.byId[arrivalTown(s, world, 'nilfgaard')], 'they arrive at a town');
  assert.ok(['nazair_city', 'wyndhal', 'dun_turga', 'vellmont', 'saltreeve', 'metinna_city', 'tarnmouth'].includes(s.empire.last.at), s.empire.last.at);
  // At war the gap shortens; once the clock reaches War, shorter still.
  s.wars = [{ id: 99, sides: [['nilfgaard'], ['cintra']], start: s.day, aims: {}, taken: [] }];
  assert.equal(reinforcementGap(s, world), c.war);
  s.nilfgaard = { stage: 'war' };
  assert.ok(reinforcementGap(s, world) < c.war);
  // Never beyond the cap.
  s.realms.nilfgaard.army = c.cap;
  s.empire.next = s.day;
  stepEmpireDay(s, world);
  assert.equal(s.realms.nilfgaard.army, c.cap);
});

test('Toussaint starts as the Empire\'s vassal, and the North may court it', () => {
  const s = createState(world, 1);
  assert.equal(suzerainOf(s, 'toussaint'), 'nilfgaard');
  assert.ok(s.realms.toussaint.vassal.loyalty > 50);
  assert.equal(rulerOf(world, 'toussaint').title, 'Duchess');
  assert.ok(canOfferProtection(s, world, 'toussaint').ok, 'the crown can offer its protection');
  // The Empire reaches the North's petty kingdoms, Brugge and Sodden above all.
  assert.ok(greatPowers(s, world).includes('nilfgaard'));
  for (const rid of ['brugge', 'sodden']) assert.ok(distance(world, rid, 'nilfgaard') <= world.diplomacy.suzerainty.ai.reach, rid);
});

test('the Empire lives by the common rules, and an older save gains it', () => {
  const s = run(createState(world, 3), 365);
  assert.ok(s.realms.nilfgaard.treasury > 0);
  assert.ok(s.realms.nilfgaard.posture, 'it takes a posture like any ruler');
  const old = JSON.parse(serialize(s));
  old.version = 31;
  old.state.version = 31;
  for (const rid of ['nilfgaard', 'toussaint']) {
    delete old.state.realms[rid];
    delete old.state.neighbours[rid];
    delete old.state.faiths?.realms?.[rid];
    delete old.state.diplomacy.trust[rid];
    for (const row of Object.values(old.state.diplomacy.trust)) delete row[rid];
    delete old.state.conquest?.fear?.[rid];
  }
  old.state.wars = [];
  old.state.armies = old.state.armies.filter((a) => !['nilfgaard', 'toussaint'].includes(a.side));
  old.state.musters = [];
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.realms.nilfgaard && up.realms.toussaint);
  assert.equal(suzerainOf(up, 'toussaint'), 'nilfgaard');
  assert.ok(run(up, 60).realms.nilfgaard);
});
