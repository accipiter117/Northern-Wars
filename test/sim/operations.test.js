// Spy operations (M31 B): bribe at 50, stir at 60, sabotage at 70,
// assassinate at 85; coin, a season's rest, and the risk of exposure, which
// costs depth, trust and sometimes the agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction } from '../../src/sim/index.js';
import { opTargets, exposureOf, canOperate, operate } from '../../src/sim/operations.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const O = world.spies.operations;
const never = { chance: () => false, next: () => 0, int: () => 0, pick: (l) => l[0] };
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };
const trust = (s, a, b) => s.diplomacy.trust[a]?.[b] ?? world.diplomacy.trust.start;

function deep(rid, d = 90) {
  const s = createState(world, 1);
  s.spycraft.nets.temeria[rid] = d;
  s.treasury = 20000;
  return s;
}

test('each operation needs its depth, coin and a rested network', () => {
  const s = deep('kaedwen', 55);
  assert.ok(canOperate(s, world, 'kaedwen', 'bribe', 'court').ok);
  assert.match(canOperate(s, world, 'kaedwen', 'stir', 'land').reason, /60 deep/);
  assert.ok(!canOperate(s, world, 'temeria', 'bribe', 'court').ok, 'not at home');
  assert.ok(!canOperate(s, world, 'kaedwen', 'bribe', 'vassal').ok, 'Kaedwen is no one\'s vassal');
  const coin = s.treasury;
  operate(s, world, never, 'kaedwen', 'bribe', 'court');
  assert.equal(s.treasury, coin - O.kinds.bribe.coin);
  assert.match(canOperate(s, world, 'kaedwen', 'bribe', 'court').reason, /lying low/);
  s.day += O.cooldown;
  assert.ok(canOperate(s, world, 'kaedwen', 'bribe', 'court').ok);
});

test('bribes buy trust, or loosen a vassal from its overlord', () => {
  const s = deep('toussaint');
  const t0 = trust(s, 'toussaint', 'temeria');
  operate(s, world, never, 'toussaint', 'bribe', 'court');
  assert.equal(trust(s, 'toussaint', 'temeria'), t0 + O.kinds.bribe.trust);
  assert.ok(opTargets(s, world, 'toussaint', 'bribe').some((t) => t.id === 'vassal'), 'Toussaint is the Empire\'s vassal');
  const l0 = s.realms.toussaint.vassal.loyalty;
  s.day += O.cooldown;
  operate(s, world, never, 'toussaint', 'bribe', 'vassal');
  assert.equal(s.realms.toussaint.vassal.loyalty, l0 - O.kinds.bribe.loyalty);
});

test('a rising, sabotage and a dead commander or spymaster', () => {
  const s = deep('redania');
  const towns = Object.entries(s.realms.redania.settlements).map(([id, x]) => [id, x.prosperity]);
  operate(s, world, never, 'redania', 'stir', 'land');
  const fell = towns.filter(([id, p]) => s.realms.redania.settlements[id].prosperity < p);
  assert.equal(fell.length, O.kinds.stir.towns);
  s.day += O.cooldown;
  const cap = world.realms.realms.redania.capital;
  const p0 = s.realms.redania.settlements[cap].prosperity;
  operate(s, world, never, 'redania', 'sabotage', 'works');
  assert.equal(s.realms.redania.settlements[cap].prosperity, Math.max(0, p0 - O.kinds.sabotage.prosperity));
  s.day += O.cooldown;
  const n0 = s.spycraft.nets.redania.temeria;
  operate(s, world, never, 'redania', 'assassinate', 'spymaster');
  assert.equal(s.spycraft.nets.redania.temeria, Math.max(0, n0 - O.kinds.assassinate.networks));
  s.day += O.cooldown;
  s.realms.redania.army = 5000;
  assert.ok(opTargets(s, world, 'redania', 'assassinate').some((t) => t.id === 'commander'));
  const a0 = s.realms.redania.army;
  const field = (s.armies ?? []).filter((a) => a.side === 'redania').reduce((n, a) => n + a.soldiers, 0);
  operate(s, world, never, 'redania', 'assassinate', 'commander');
  const field1 = (s.armies ?? []).filter((a) => a.side === 'redania').reduce((n, a) => n + a.soldiers, 0);
  assert.ok(field1 < field || s.realms.redania.army < a0);
  // No operation strikes a crowned ruler.
  for (const k of ['bribe', 'stir', 'sabotage', 'assassinate']) assert.ok(!opTargets(s, world, 'redania', k).some((t) => /king|queen|ruler/i.test(t.id)));
});

test('a siege camp\'s stores burn and the siege is set back', () => {
  const s = deep('kaedwen');
  const at = world.foreignByRealm.aedirn[0];
  s.armies.push({ id: 9999, side: 'kaedwen', at, soldiers: 3000, morale: 70, siege: { at, days: 30, walls: 20, wallsMax: 100, food: 10, foodMax: 100, sick: 0, sallies: 0, progress: 90, events: [] } });
  assert.ok(opTargets(s, world, 'kaedwen', 'sabotage').some((t) => t.id === 'siege'));
  operate(s, world, never, 'kaedwen', 'sabotage', 'siege');
  const sg = s.armies.find((a) => a.id === 9999).siege;
  assert.equal(sg.food, 10 + 100 * O.kinds.sabotage.siegeFood);
  assert.equal(sg.walls, 20 + 100 * O.kinds.sabotage.siegeWalls);
});

test('exposure fails the work and costs depth, trust and sometimes the agent', () => {
  const s = deep('kaedwen', 60);
  const t0 = trust(s, 'kaedwen', 'temeria');
  const r0 = s.neighbours.kaedwen.relation;
  const out = operate(s, world, always, 'kaedwen', 'bribe', 'court');
  assert.ok(out.exposed && out.lost);
  assert.equal(s.spycraft.nets.temeria.kaedwen, 60 - O.depthLoss - O.agentLostDepth);
  assert.equal(trust(s, 'kaedwen', 'temeria'), t0 - O.trust);
  assert.equal(s.neighbours.kaedwen.relation, r0 - O.relation);
  assert.ok(s.chronicle.at(-1).text.includes('found out'));
});

test('exposure grows with the target\'s watch and the operation, falls with depth and a cautious spymaster', () => {
  const s = deep('kaedwen', 86);
  s.spycraft.nets.temeria.nilfgaard = 86;
  assert.ok(exposureOf(s, world, 'nilfgaard', 'assassinate') > exposureOf(s, world, 'kaedwen', 'assassinate'), 'the Empire watches closer');
  assert.ok(exposureOf(s, world, 'kaedwen', 'assassinate') > exposureOf(s, world, 'kaedwen', 'bribe'));
  s.spycraft.nets.temeria.kaedwen = 52;
  const shallow = exposureOf(s, world, 'kaedwen', 'bribe');
  s.spycraft.nets.temeria.kaedwen = 80;
  assert.ok(exposureOf(s, world, 'kaedwen', 'bribe') < shallow, 'deeper is safer');
  s.spycraft.spymaster = { name: 'T', trait: 'cautious', skill: 50 };
  const cautious = exposureOf(s, world, 'kaedwen', 'bribe');
  s.spycraft.spymaster.trait = 'ruthless';
  assert.ok(exposureOf(s, world, 'kaedwen', 'bribe') > cautious);
});

test('operations are orders, on the game\'s own dice', () => {
  const s = deep('kaedwen', 90);
  const r = applyAction(s, world, { type: 'spyOp', realm: 'kaedwen', kind: 'bribe', target: 'court' });
  assert.ok(!r.error);
  assert.equal(r.state.spycraft.last.realm, 'kaedwen');
  assert.notEqual(r.state.rng.game, s.rng.game);
  assert.ok(applyAction(r.state, world, { type: 'spyOp', realm: 'kaedwen', kind: 'bribe', target: 'court' }).error);
});
