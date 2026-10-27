import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, hasBit, visionOf, canSee, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { pointInPolygon } from '../../src/sim/geometry.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days, ambient = true) => step(s, days, world, { ambient });
const act = (s, a) => applyAction(s, world, a);
const g = world.grid;
const cellOf = (x, y) => Math.floor((y - g.y0) / g.cell) * g.cols + Math.floor((x - g.x0) / g.cell);

test('the wider world: every foreign place sits in its own realm and is joined by road', () => {
  for (const s of world.foreign) {
    assert.ok(world.geography.neighbours[s.realm].shapes.some((sh) => pointInPolygon(s.x, s.y, sh)), s.id);
    assert.ok(world.realms.startByType[s.type], s.id);
  }
  for (const [rid, r] of Object.entries(world.realms.realms)) assert.equal(world.realmOf[r.capital], rid);
  // Domestic roads stay domestic: Temeria's road network has no foreign places.
  for (const id of Object.keys(world.adjacency)) assert.ok(!world.realmOf[id]);
});

test('at the start Temeria is mapped, its borders watched, and distant capitals unknown', () => {
  const s = createState(world, 1);
  const bits = s.ambient.intel.explored;
  assert.ok(hasBit(bits, cellOf(world.byId.vizima.x, world.byId.vizima.y)));
  assert.ok(!hasBit(bits, cellOf(world.byId.tretogor.x, world.byId.tretogor.y)));
  assert.equal(s.ambient.intel.seen.tretogor, undefined);
});

test('a spy shows a whole realm; when he leaves, it is remembered as it was', () => {
  // No foreign trade at all, so no Temerian merchants pass through Carbon
  // and see it for themselves.
  const realms = Object.fromEntries(Object.entries(world.neighbours.realms).map(([id, r]) => [id, { ...r, trade: 0 }]));
  const quiet = { ...world, neighbours: { ...world.neighbours, realms } };
  const run = (x, days) => step(x, days, quiet, { ambient: true });
  let s = createState(quiet, 2);
  s.spies.mahakam = s.day + 30;
  s = run(s, 1);
  assert.ok(s.ambient.intel.seen.carbon);
  for (const i of g.realmCells.mahakam) assert.ok(hasBit(s.ambient.intel.explored, i));
  const seenOn = s.ambient.intel.seen.carbon.day;
  s = run(s, 120);
  assert.equal(s.ambient.intel.seen.carbon.day, seenOn + 28, 'last seen on the spy\'s last day');
  assert.ok(!canSee(quiet, visionOf(s, quiet), world.byId.carbon.x, world.byId.carbon.y));
});

test('an embassy watches a foreign capital; friends share their towns', () => {
  let s = createState(world, 3);
  s = act(s, { type: 'embassy', realm: 'cintra' }).state;
  s.neighbours.redania.stance = 'friendly';
  s.neighbours.redania.relation = 50;
  s = run(s, 1);
  assert.ok(s.ambient.intel.seen.cintra_city);
  assert.ok(s.ambient.intel.seen.tretogor);
  assert.ok(s.ambient.intel.seen.novigrad);
  assert.equal(s.ambient.intel.seen.ard_carraigh, undefined);
});

test('the fog is cosmetic: what the crown sees never changes the game', () => {
  const strip = (x) => JSON.stringify({ ...x, ambient: null, rng: { game: x.rng.game } });
  assert.equal(strip(run(createState(world, 9), 300)), strip(run(createState(world, 9), 300, false)));
});

test('neighbouring realms grow over the years, and mend their works', () => {
  const s0 = createState(world, 4);
  const s = run(s0, 3650, false);
  const pop = (x, rid) => Object.values(x.realms[rid].settlements).reduce((a, t) => a + t.population, 0);
  assert.ok(pop(s, 'redania') > pop(s0, 'redania'));
  // Since M20 every realm starts with its works, and its ruler keeps them up.
  const conds = Object.values(s.realms.redania.settlements).flatMap((t) => t.buildings.map((b) => t.cond?.[b] ?? 100));
  assert.ok(conds.length >= 20 && conds.reduce((a, b) => a + b, 0) / conds.length >= 55, `Redania's works at ${conds.reduce((a, b) => a + b, 0) / conds.length}`);
  assert.equal(Object.values(s.realms.brokilon.settlements)[0].buildings.length, 0, 'the dryads keep no works');
});

test('news from abroad reaches Vizima only through friends, trade, embassies or spies', () => {
  // A world where no realm trades with Temeria and none is friendly.
  const closed = { ...world, neighbours: { ...world.neighbours, realms: Object.fromEntries(Object.entries(world.neighbours.realms).map(([k, r]) => [k, { ...r, trade: 0 }])) } };
  let s = createState(closed, 5);
  s = step(s, 1825, closed, { ambient: false });
  assert.ok(!s.chronicle.some((d) => d.kind === 'abroad' && / in (Redania|Kaedwen|Aedirn|Cintra)/.test(d.text) && /^(Fire|Bandits|Sickness|A great fair|A rich harvest)/.test(d.text)));
});

test('watchtowers stand on the border, and see further', () => {
  const s = createState(world, 1);
  assert.ok(!s.settlements.vizima.buildings.includes('watchtower'));
  assert.ok(s.settlements.houtborg.buildings.includes('watchtower'));
  const r = (x) => visionOf(x, world).circles.find((c) => c.x === world.byId.houtborg.x).r;
  const blind = structuredClone(s);
  blind.settlements.houtborg.buildings = blind.settlements.houtborg.buildings.filter((b) => b !== 'watchtower');
  assert.ok(r(s) > r(blind));
});

test('embassies cost each month; a spy may be caught', () => {
  let s = act(createState(world, 6), { type: 'embassy', realm: 'redania' }).state;
  s = run(s, 35, false);
  assert.equal(s.ledger.history.at(-1).expenses.embassies, world.realms.intelligence.embassy.monthly);
  let caught = false;
  for (let seed = 1; seed < 30 && !caught; seed++) {
    const t = createState(world, seed);
    const out = act(t, { type: 'spy', realm: 'kaedwen' }).state;
    caught = out.neighbours.kaedwen.relation < t.neighbours.kaedwen.relation;
  }
  assert.ok(caught);
});

test('a version 7 save gains living realms', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 7;
  for (const k of ['realms', 'embassies', 'spies']) delete s.state[k];
  delete s.state.ambient.intel;
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.realms.redania.settlements.novigrad.population > 20000);
  const later = run(up, 5);
  assert.ok(later.ambient.intel.explored.length > 0);
});
