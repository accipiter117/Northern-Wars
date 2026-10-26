import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, canDecree, enactment, lawEffects, reactions, serialize, deserialize, totalPopulation } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const decree = (s, law, option) => applyAction(s, world, { type: 'law', law, option });

test('every law has a valid default and every option names known groups and effects', () => {
  const groups = Object.keys(world.groups.groups);
  const known = ['tax', 'trade', 'garrison', 'garrisonUpkeep', 'foodYield', 'court', 'authority', 'monthly', 'storage', 'growth', 'nonhumanExodus', 'unrest', 'prosperity'];
  for (const [id, law] of Object.entries(world.laws.laws)) {
    assert.ok(law.options[law.default], `${id} default`);
    for (const opt of Object.values(law.options)) {
      for (const g of Object.keys(opt.opinion)) assert.ok(groups.includes(g), `${id}: ${g}`);
      for (const k of Object.keys(opt.effects)) assert.ok(known.includes(k), `${id}: ${k}`);
      assert.doesNotMatch(opt.blurb + opt.name, /\u2014/);
    }
  }
});

test('a decree costs Authority and crowns, and jolts the groups it touches', () => {
  const s0 = createState(world, 1);
  const { state: s, error } = decree(s0, 'taxation', 'heavy');
  assert.equal(error, undefined);
  assert.equal(s.authority, s0.authority - 10);
  assert.equal(s.treasury, s0.treasury - 50);
  assert.ok(s.opinion.peasants < 50 && s.opinion.burghers < 50);
  assert.equal(s.opinion.melitele, 50);
  assert.match(s.chronicle.at(-1).text, /By royal decree: heavy taxes/);
});

test('a new law phases in over a month and cannot be changed again meanwhile', () => {
  let s = decree(createState(world, 1), 'taxation', 'heavy').state;
  assert.equal(enactment(s, world, 'taxation'), 0);
  assert.equal(canDecree(s, world, 'taxation', 'light').ok, false);
  s = run(s, 15);
  assert.ok(Math.abs(lawEffects(s, world).tax - 0.175) < 1e-9);
  s = run(s, 15);
  assert.equal(enactment(s, world, 'taxation'), 1);
  assert.equal(lawEffects(s, world).tax, 0.35);
  assert.equal(canDecree(s, world, 'taxation', 'light').ok, true);
});

test('without enough Authority the crown cannot decree', () => {
  const s = createState(world, 1);
  s.authority = 5;
  assert.equal(canDecree(s, world, 'nonhumans', 'charter').reason, 'Needs 20 Authority.');
  assert.equal(canDecree(s, world, 'taxation', 'standard').reason, 'Already the law of the land.');
});

test('heavy taxes bring in more coin but sour the villages', () => {
  const base = run(createState(world, 2), 120);
  const taxed = run(decree(createState(world, 2), 'taxation', 'heavy').state, 120);
  assert.ok(taxed.ledger.history.at(-1).income.taxes > base.ledger.history.at(-1).income.taxes * 1.25);
  assert.ok(taxed.opinion.peasants < 45);
  // The villages as a whole, so one village's luck with raids or events
  // does not decide it.
  const villages = (x) => {
    const v = world.geography.settlements.filter((st) => st.type === 'village');
    return v.reduce((a, st) => a + x.settlements[st.id].unrest, 0) / v.length;
  };
  assert.ok(villages(taxed) > villages(base), `${villages(taxed).toFixed(1)} vs ${villages(base).toFixed(1)}`);
});

test('opinion settles where the laws put it', () => {
  // Compared with a reign that left the law alone, so petitions and envoys
  // along the way do not decide the result.
  const base = run(createState(world, 3), 365);
  const s = run(decree(createState(world, 3), 'nonhumans', 'charter').state, 365);
  assert.ok(s.opinion.elf > base.opinion.elf + 8, `${s.opinion.elf} vs ${base.opinion.elf}`);
  assert.ok(s.opinion.eternal_fire < base.opinion.eternal_fire - 6);
});

test('expulsion drives non-humans from the realm', () => {
  const people = (s, p) => Object.values(s.settlements).reduce((n, st) => n + st.population[p], 0);
  const s0 = createState(world, 4);
  const s = run(decree(s0, 'nonhumans', 'expulsion').state, 180);
  assert.ok(people(s, 'dwarf') < people(s0, 'dwarf') * 0.95);
  assert.ok(people(s, 'human') >= people(s0, 'human'));
  assert.ok(s.chronicle.some((d) => /left the realm/.test(d.text)));
});

test('a standing muster fills the garrisons and costs more to keep', () => {
  const base = run(createState(world, 5), 365);
  const muster = run(decree(createState(world, 5), 'conscription', 'standing').state, 365);
  const soldiers = (s) => Object.values(s.settlements).reduce((n, st) => n + st.garrison, 0);
  assert.ok(soldiers(muster) > soldiers(base) * 1.25);
  assert.ok(muster.ledger.history.at(-1).expenses.garrisons > base.ledger.history.at(-1).expenses.garrisons);
});

test('patronage is paid every month as an edict', () => {
  const s = run(decree(createState(world, 6), 'patronage', 'melitele').state, 62);
  assert.equal(s.ledger.history.at(-1).expenses.edicts, 150);
});

test('reactions name who is pleased and who is angered', () => {
  const r = reactions(createState(world, 1), world, 'nonhumans', 'charter');
  assert.ok(r.pleased.includes('elf') && r.angered.includes('eternal_fire'));
});

test('a version 2 save gains the customary laws', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 2;
  delete s.state.laws;
  delete s.state.opinion;
  s.state.version = 2;
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.laws.taxation.option, 'standard');
  assert.equal(up.opinion.nobles, 50);
  assert.ok(Number.isFinite(run(up, 40).treasury));
});

test('every law option survives ten years without breaking the realm', () => {
  for (const [id, law] of Object.entries(world.laws.laws)) {
    for (const opt of Object.keys(law.options)) {
      let s = createState(world, 7);
      s.laws[id] = { option: opt, previous: s.laws[id].option, since: s.day };
      s = run(s, 3650);
      const pop = Object.values(s.settlements).reduce((n, st) => n + totalPopulation(st), 0);
      assert.ok(Number.isFinite(s.treasury) && pop > 0, `${id}/${opt}`);
      for (const v of Object.values(s.opinion)) assert.ok(v >= 0 && v <= 100);
    }
  }
});
