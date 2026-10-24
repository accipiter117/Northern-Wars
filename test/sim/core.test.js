import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, streamSeed } from '../../src/sim/rng.js';
import { dateOf, dayNumber, formatDate, YEAR_DAYS } from '../../src/sim/calendar.js';
import { roadPath, createState, step, serialize, deserialize } from '../../src/sim/index.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

test('rng is seeded and stays in [0, 1)', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = a.next();
    assert.equal(v, b.next());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(streamSeed(7, 1), streamSeed(7, 2));
});

test('calendar round-trips dates and knows its seasons', () => {
  const start = { year: 1262, month: 3, day: 1 };
  const n = dayNumber(start);
  assert.deepEqual(dateOf(n), { ...start, season: 'spring' });
  assert.equal(formatDate(n + 30), '31 March 1262');
  assert.equal(formatDate(n + 31), '1 April 1262');
  assert.equal(dateOf(n + YEAR_DAYS).year, 1263);
  assert.equal(dateOf(dayNumber({ year: 1262, month: 12, day: 31 })).season, 'winter');
  assert.equal(dateOf(dayNumber({ year: 1263, month: 1, day: 1 })).year, 1263);
});

test('every settlement can be reached by road from Vizima', () => {
  for (const s of world.geography.settlements) {
    const path = roadPath(world, 'vizima', s.id);
    assert.ok(path, `no road to ${s.id}`);
    assert.equal(path[0], 'vizima');
    assert.equal(path[path.length - 1], s.id);
  }
});

test('the start state covers every settlement with sane values', () => {
  const state = createState(world, 1);
  assert.equal(Object.keys(state.settlements).length, world.geography.settlements.length);
  assert.equal(state.settlements.vizima.population.human + state.settlements.vizima.population.dwarf
    + state.settlements.vizima.population.elf + state.settlements.vizima.population.halfling, 18000);
  assert.ok(state.stability > 0 && state.stability < 100);
});

test('step does not mutate its input and advances the calendar', () => {
  const s0 = createState(world, 3);
  const before = JSON.stringify(s0);
  const s1 = step(s0, 10, world);
  assert.equal(JSON.stringify(s0), before);
  assert.equal(s1.day, s0.day + 10);
});

test('ambient traffic spawns every kind on roads and rivers', () => {
  let s = createState(world, 5);
  s.settlements.vizima.stock.food = 0; // Starts grain moving, so carts appear.
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    s = step(s, 1, world);
    for (const u of s.ambient.units) seen.add(u.kind);
  }
  assert.deepEqual([...seen].sort(), ['barge', 'caravan', 'foreign', 'grain', 'patrol']);
  for (const u of s.ambient.units) {
    if (u.river) assert.ok(['Pontar', 'Ismena'].includes(u.river));
    if (u.entry) assert.ok(world.neighbours.realms[u.entry].trade > 0);
    if (!u.river) for (let i = 1; i < u.route.length; i++) {
      const linked = world.adjacency[u.route[i - 1]].some((e) => e.to === u.route[i]);
      assert.ok(linked, `${u.route[i - 1]} to ${u.route[i]} is not a road`);
    }
  }
});

test('ambient traffic never changes the game', () => {
  const strip = (s) => JSON.stringify({ ...s, ambient: null, rng: { game: s.rng.game } });
  const withTraffic = step(createState(world, 9), 400, world);
  const without = step(createState(world, 9), 400, world, { ambient: false });
  assert.equal(strip(withTraffic), strip(without));
});

test('a save resumes exactly where it left off', () => {
  const mid = step(createState(world, 11), 100, world);
  const loaded = deserialize(serialize(mid), world);
  assert.equal(JSON.stringify(step(loaded, 100, world)), JSON.stringify(step(mid, 100, world)));
});

test('bad saves are refused with a plain reason', () => {
  assert.throws(() => deserialize('nonsense', world), /not a readable save/);
  assert.throws(() => deserialize('{"format":"other"}', world), /not a Northern Wars save/);
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 999;
  assert.throws(() => deserialize(JSON.stringify(s), world), /newer version/);
  s.version = 1;
  s.state.kingdom = 'redania';
  assert.throws(() => deserialize(JSON.stringify(s), world), /another kingdom/);
});
