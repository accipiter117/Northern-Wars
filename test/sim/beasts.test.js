// Beasts and the supernatural (M24 follow-up): companies sent after a lair
// in the wilds reach it and finish the hunt; any troops, even the town
// militia, put down wolves, drowners and harpies; the supernatural is
// witchers' work. An escort for pilgrims rides on the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, huntOdds } from '../../src/sim/index.js';
import { foeKind, speciesOf } from '../../src/sim/combat.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
const company = (type, men) => ({ type, men, morale: 70, xp: 0 });
const beast = (terrain, species, count) => ({ kind: 'monsters', terrain, species, count, morale: 70, x: 300, y: 300 });

test('a company sent after a lair off the road reaches it and finishes the hunt', () => {
  // Seed 1's wolves lie some way off the road past Anchor: before the fix
  // the company walked back and forth between the town and the lair for ever.
  // An ordinary lair (the supernatural is witchers' work, below). Which
  // lairs stand by day 200 shifts with the North's dice, so the first seed
  // that has one sighted is used.
  const ordinary = (st) => st.threats.list.filter((x) => x.kind === 'monsters' && !x.abroad && x.sighted && !speciesOf(world, x).supernatural).sort((a, b) => a.count - b.count)[0];
  let s = null;
  for (let seed = 1; seed <= 6 && !(s && ordinary(s)); seed++) s = run(createState(world, seed), 200);
  const t = ordinary(s);
  assert.ok(t, 'a lair to hunt');
  s.treasury = 20000;
  s = act(s, { type: 'recruit', settlement: 'vizima', kind: 'menatarms' });
  const c = s.forces.companies.at(-1);
  s = act(s, { type: 'company', id: c.id, order: { kind: 'hunt', threat: t.id } });
  for (let d = 0; d < 70 && s.threats.list.some((x) => x.id === t.id); d += 3) s = run(s, 3);
  assert.ok(!s.threats.list.some((x) => x.id === t.id), 'the lair is cleared');
});

test('even the town militia puts down wolves, drowners and harpies', () => {
  const s = createState(world, 1);
  for (const [terrain, species] of [['forest', 'wolves'], ['marsh', 'drowners'], ['hills', 'harpies']]) {
    const pack = beast(terrain, species, 12);
    assert.equal(foeKind(pack, world), 'monsters');
    const odds = huntOdds(s, world, [company('militia', 150)], pack);
    assert.ok(odds.chance >= 0.9, `militia against ${species}: ${odds.chance}`);
    assert.equal(odds.word, 'Sure to win');
  }
});

test('the supernatural is witchers\' work: militia and archers are hopeless, men-at-arms pay dearly', () => {
  const s = createState(world, 1);
  for (const [terrain, species] of [['forest', 'werewolf'], ['forest', 'leshen'], ['hills', 'griffin'], ['marsh', 'hag']]) {
    const it = beast(terrain, species, 1);
    assert.ok(speciesOf(world, it).supernatural);
    assert.equal(foeKind(it, world), 'supernatural');
    assert.ok(huntOdds(s, world, [company('militia', 150)], it).chance < 0.05, `militia against a ${species}`);
    assert.ok(huntOdds(s, world, [company('archers', 100)], it).chance < 0.05, `archers against a ${species}`);
    assert.ok(huntOdds(s, world, [company('menatarms', 100)], it).chance < 0.5, `men-at-arms against a ${species}`);
  }
});

test('an escort sent with pilgrims rides to the Temple of Melitele on the map', () => {
  let s = createState(world, 1);
  const from = Object.keys(s.settlements).find((id) => id !== 'temple_melitele' && world.byId[id].type === 'town');
  s.petitions = [{ id: 99, petition: 'pilgrim_escort', place: from, day: s.day }];
  s.treasury = 5000;
  s = act(s, { type: 'petition', id: 99, choice: 0 });
  const f = (s.figures ?? []).find((x) => x.kind === 'escort');
  assert.ok(f, 'the escort is on the road');
  assert.equal(f.from, from);
  assert.equal(f.to, 'temple_melitele');
});
