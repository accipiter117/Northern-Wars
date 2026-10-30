// Many armies (M24 E): no limit beyond the treasury and the men, numbered
// names and captains, levies converging on several musters at once, and a
// town's levy that hunts a threat near, marches to join or merges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, crownArmies, describeArmy } from '../../src/sim/index.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};

test('four armies raised at once, numbered and led, each with its levies on the road to its muster', () => {
  let s = quiet(createState(world, 1));
  s.treasury = 60000;
  for (const muster of ['vizima', 'maribor', 'ellander', 'wyzima_castle'].filter((id) => world.byId[id])) {
    s = act(s, { type: 'raise', muster, levy: 'third', nobles: false });
  }
  const ours = crownArmies(s);
  assert.ok(ours.length >= 3, `${ours.length} armies`);
  assert.deepEqual(ours.map((a) => a.name).slice(0, 3), ['The First Army', 'The Second Army', 'The Third Army']);
  for (const a of ours) {
    assert.ok(a.marshal || a.captain, `${a.name} has a leader`);
    assert.match(describeArmy(s, world, a), / under (Captain|[A-Z])/);
  }
  assert.equal(new Set(ours.map((a) => a.captain).filter(Boolean)).size, ours.filter((a) => a.captain).length, 'one captain to an army');
  // Levies walk the roads to each muster.
  const levies = (s.figures ?? []).filter((f) => f.kind === 'levy');
  assert.ok(new Set(levies.map((f) => f.to)).size >= 2, 'levies converging on more than one muster');
  // A name freed when an army stands down is used again.
  s = act(s, { type: 'disband', army: ours[0].id });
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false });
  assert.equal(crownArmies(s).at(-1).name, 'The First Army');
});

test('a town\'s levy hunts a threat near and breaks it for its purse, then holds', () => {
  let s = quiet(run(createState(world, 1), 200));
  // A camp, and the town nearest it that can call a muster.
  const t = s.threats.list.find((x) => !x.abroad && x.kind === 'bandits');
  assert.ok(t);
  const at = world.byId[t.near];
  const town = Object.keys(s.settlements).filter((id) => !applyAction(s, world, { type: 'muster', settlement: id }).error)
    .sort((x, y) => Math.hypot(world.byId[x].x - at.x, world.byId[x].y - at.y) - Math.hypot(world.byId[y].x - at.x, world.byId[y].y - at.y))[0];
  s = run(act(s, { type: 'muster', settlement: town }), 2);
  const a = crownArmies(s).find((x) => x.muster === town);
  a.soldiers *= 12; // enough men to be sure of it
  for (const b of a.bands ?? []) b.men *= 12;
  s = act(s, { type: 'army', army: a.id, order: 'hunt', target: t.id });
  const before = s.treasury;
  for (let i = 0; i < 20 && s.threats.list.some((x) => x.id === t.id); i++) s = run(s, 3);
  assert.ok(!s.threats.list.some((x) => x.id === t.id), 'the camp is broken');
  const after = crownArmies(s).find((x) => x.id === a.id);
  assert.equal(after.order, 'defend');
  assert.ok(s.treasury > before - 400, 'its purse came in');
  assert.ok(s.chronicle.some((d) => /broke/.test(d.text)));
});

test('a levy marches to join an army and becomes one with it; two armies in one place merge', () => {
  let s = quiet(createState(world, 2));
  s.treasury = 30000;
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false });
  const main = crownArmies(s)[0];
  s = act(s, { type: 'muster', settlement: 'maribor' });
  s = run(s, 2);
  const levy = crownArmies(s).find((x) => x.muster === 'maribor');
  const men = main.soldiers + levy.soldiers;
  s = act(s, { type: 'army', army: levy.id, order: 'join', target: main.id });
  for (let i = 0; i < 30 && crownArmies(s).some((x) => x.id === levy.id); i++) s = run(s, 2);
  assert.ok(!crownArmies(s).some((x) => x.id === levy.id), 'the levy has joined');
  assert.ok(crownArmies(s)[0].soldiers > men * 0.85, 'with its men');
});
