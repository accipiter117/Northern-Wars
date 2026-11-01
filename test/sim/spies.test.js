// Spies (M31 A): networks in every court, growing with skill, coin and how
// open the target is; depths that show armies and plans; the crown's
// spymaster, appointed from candidates and at risk from foreign networks;
// the cost in the ledger; older saves gain the networks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, applyAction, informed } from '../../src/sim/index.js';
import { monthlySpies, netGrowth, settlesAt, hasSpy, knowsPlans, ourDepth, netDepth, foreignAtHome, spyExpense } from '../../src/sim/spies.js';
import { intentions } from '../../src/sim/strategy.js';
import { visionOf } from '../../src/sim/vision.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const never = { chance: () => false, next: () => 0.99, int: () => 0, pick: (l) => l[0] };
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };

test('the great powers start with networks from the lore', () => {
  const s = createState(world, 1);
  const n = s.spycraft.nets;
  assert.deepEqual(Object.keys(n).sort(), ['aedirn', 'kaedwen', 'nilfgaard', 'redania', 'temeria']);
  // Nilfgaard is deep in Cintra and Toussaint; Redania deepest in Temeria
  // among the northern crowns; Kaedwen's crude.
  assert.ok(n.nilfgaard.cintra > n.redania.cintra);
  assert.ok(n.nilfgaard.toussaint >= 60);
  assert.ok(n.redania.temeria > n.aedirn.temeria && n.aedirn.temeria > n.kaedwen.temeria);
  // Petty crowns keep none abroad.
  assert.equal(n.kerack, undefined);
  assert.equal(s.spycraft.spymaster, null);
  assert.equal(s.spycraft.candidates.length, world.spies.spymaster.candidates);
});

test('networks grow fastest for Nilfgaard and slowest in closed realms', () => {
  const s = createState(world, 1);
  assert.ok(netGrowth(s, world, 'nilfgaard', 'aedirn') > netGrowth(s, world, 'redania', 'aedirn'));
  assert.ok(netGrowth(s, world, 'redania', 'aedirn') > netGrowth(s, world, 'kaedwen', 'aedirn'));
  assert.ok(netGrowth(s, world, 'nilfgaard', 'kerack') > netGrowth(s, world, 'nilfgaard', 'mahakam') * 3, 'Mahakam is hard');
  assert.ok(settlesAt(s, world, 'nilfgaard', 'brokilon') < 15, 'Brokilon very hard');
  // Ten years on, the Empire's networks are deep across the North.
  let t = s;
  for (let m = 0; m < 120; m++) monthlySpies(t, world, never);
  assert.ok(t.spycraft.nets.nilfgaard.temeria > 50);
  assert.ok(t.spycraft.nets.nilfgaard.cintra > t.spycraft.nets.redania.cintra);
  assert.ok(t.spycraft.nets.kaedwen.temeria < 15);
  for (const row of Object.values(t.spycraft.nets)) for (const d of Object.values(row)) assert.ok(d >= 0 && d <= 100 && Number.isFinite(d));
});

test('the crown\'s budget and spymaster deepen its networks, and cost them', () => {
  let s = createState(world, 1);
  const base = settlesAt(s, world, 'temeria', 'kaedwen');
  assert.equal(spyExpense(s, world), 0);
  s = applyAction(s, world, { type: 'spyBudget', amount: 500 }).state;
  const funded = settlesAt(s, world, 'temeria', 'kaedwen');
  assert.ok(funded > base * 4);
  assert.ok(applyAction(s, world, { type: 'spyBudget', amount: 333 }).error, 'only the listed sums');
  const best = s.spycraft.candidates.reduce((a, b) => (b.skill > a.skill ? b : a));
  s = applyAction(s, world, { type: 'spymaster', id: best.id }).state;
  assert.equal(s.spycraft.spymaster.name, best.name);
  assert.equal(spyExpense(s, world), 500 + world.spies.spymaster.wage);
  assert.ok(applyAction(s, world, { type: 'spymaster', id: s.spycraft.candidates[0]?.id ?? 0 }).error, 'one at a time');
  if (best.skill > world.spies.owners.temeria.skill) assert.ok(settlesAt(s, world, 'temeria', 'kaedwen') > funded);
  // The ledger carries it.
  const t = step(s, 31, world, { ambient: false });
  const last = t.ledger.history.at(-1);
  assert.equal(last.expenses.spies, 500 + world.spies.spymaster.wage);
  // Dismissed, new candidates come forward.
  const d = applyAction(t, world, { type: 'spymaster', dismiss: true }).state;
  assert.equal(d.spycraft.spymaster, null);
  assert.ok(d.spycraft.candidates.length >= 1);
});

test('depth 20 shows a realm like an agent in place; depth 35 its plans', () => {
  const s = createState(world, 1);
  const rid = 'kaedwen';
  s.spies = {};
  s.spycraft.nets.temeria[rid] = 10;
  assert.ok(!hasSpy(s, world, rid));
  s.spycraft.nets.temeria[rid] = 25;
  assert.ok(hasSpy(s, world, rid));
  assert.ok(informed(s, world, rid));
  assert.ok(visionOf(s, world).realms.has(rid));
  assert.ok(!knowsPlans(s, world, rid));
  s.spycraft.nets.temeria[rid] = 40;
  assert.ok(knowsPlans(s, world, rid));
  const i = intentions(s, world, rid);
  if (i) assert.ok(i.posture, 'their posture is known');
});

test('an agent sent in deepens the network there', () => {
  let s = createState(world, 1);
  const before = ourDepth(s, 'redania');
  let sent = null;
  for (let seed = 1; seed < 20 && !sent; seed++) {
    s.rng.game = seed;
    const r = applyAction(s, world, { type: 'spy', realm: 'redania' }).state;
    if ((r.spies.redania ?? 0) > r.day) sent = r;
  }
  assert.ok(sent, 'an agent got through');
  assert.equal(ourDepth(sent, 'redania'), before + world.spies.spyBoost);
});

test('the spymaster counts foreign networks at home, and deep ones buy or kill him', () => {
  let s = createState(world, 1);
  assert.equal(foreignAtHome(s, world).length, 0, 'no one counts them without a spymaster');
  const greedy = { id: 99, name: 'Test Greed', from: 'a test', trait: 'greedy', skill: 50 };
  s.spycraft.candidates.push(greedy);
  s = applyAction(s, world, { type: 'spymaster', id: 99 }).state;
  const known = foreignAtHome(s, world);
  assert.ok(known.length >= 3);
  assert.equal(known[0].owner, 'redania', 'the deepest first');
  assert.ok(known.every((k) => k.depth === null), 'only roughly, without our own deep networks');
  s.spycraft.nets.temeria.redania = 40;
  assert.equal(foreignAtHome(s, world).find((k) => k.owner === 'redania').depth, Math.round(netDepth(s, 'redania', 'temeria')));
  // Deep enough to buy him: quietly turned, our networks slow.
  s.spycraft.nets.nilfgaard.temeria = 60;
  const g0 = netGrowth(s, world, 'temeria', 'kaedwen');
  const turned = structuredClone(s);
  monthlySpies(turned, world, { ...always, chance: (p) => p > 0.008 });
  assert.equal(turned.spycraft.spymaster.turned, 'nilfgaard');
  assert.ok(netGrowth(turned, world, 'temeria', 'kaedwen') < g0);
  // A loyal one is never bought.
  const loyal = structuredClone(s);
  loyal.spycraft.spymaster.trait = 'loyal';
  monthlySpies(loyal, world, { ...always, chance: (p) => p > 0.008 });
  assert.equal(loyal.spycraft.spymaster.turned, undefined);
  // Deeper still, a knife.
  const killed = structuredClone(s);
  killed.spycraft.nets.nilfgaard.temeria = 90;
  const n0 = killed.chronicle.length;
  monthlySpies(killed, world, always);
  assert.equal(killed.spycraft.spymaster, null);
  assert.ok(killed.chronicle.slice(n0).some((c) => /spymaster/.test(c.text)));
});

test('the networks survive a save, and older saves gain them', () => {
  let s = createState(world, 2);
  s = step(s, 120, world, { ambient: false });
  const back = deserialize(serialize(s), world);
  assert.deepEqual(back.spycraft, s.spycraft);
  const old = JSON.parse(serialize(s));
  old.version = 34;
  old.state.version = 34;
  delete old.state.spycraft;
  old.state.spies = { aedirn: old.state.day + 30 };
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.spycraft.nets.nilfgaard.cintra > 0);
  assert.equal(ourDepth(up, 'aedirn'), (world.spies.owners.temeria.start.aedirn ?? 0) + world.spies.spyBoost);
});
