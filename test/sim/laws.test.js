import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, canDecree, canSignLaw, enactment, lawEffects, lawOpinion, serialize, deserialize, totalPopulation } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const decree = (s, law, option) => applyAction(s, world, { type: 'law', law, option });
// Laws of the Book (M26) put in force directly, already taken hold: "id" or
// "id:faith" for the faith of the crown.
const sign = (s, ...ids) => {
  for (const entry of ids) {
    const [id, choice] = entry.split(':');
    s.book.signed[id] = { day: s.day - world.book.enactDays, ...(choice ? { choice } : {}) };
    if (choice) s.book.faith = choice;
  }
  return s;
};

test('every law has a valid default and every option names known groups and effects', () => {
  const groups = Object.keys(world.groups.groups);
  const known = ['tax', 'taxBy', 'nobleTax', 'trade', 'garrison', 'garrisonUpkeep', 'foodYield', 'court', 'love', 'fear', 'monthly', 'storage', 'growth', 'nonhumanExodus', 'unrest', 'prosperity'];
  for (const [id, law] of Object.entries(world.laws.laws)) {
    assert.ok(law.options[law.default], `${id} default`);
    for (const opt of Object.values(law.options)) {
      for (const g of Object.keys(opt.opinion)) assert.ok(groups.includes(g), `${id}: ${g}`);
      for (const k of Object.keys(opt.effects)) assert.ok(known.includes(k), `${id}: ${k}`);
      assert.doesNotMatch(opt.blurb + opt.name, /\u2014/);
    }
  }
});

test('a setting spends Love and crowns, and jolts the groups it touches', () => {
  const s0 = createState(world, 1);
  const { state: s, error } = decree(s0, 'court', 'splendid');
  assert.equal(error, undefined);
  const law = world.laws.laws.court;
  assert.equal(s.love, s0.love - law.love);
  assert.equal(s.treasury, s0.treasury - law.coin);
  const touched = Object.keys(law.options.splendid.opinion);
  for (const g of touched) assert.notEqual(s.opinion[g], 50, g);
  assert.match(s.chronicle.at(-1).text, /By royal decree/);
  // Taxes by estate (M21) are decreed the same way, cheaply.
  const t = decree(s0, 'tax_peasants', 'heavy').state;
  assert.equal(t.love, s0.love - world.laws.laws.tax_peasants.love);
  assert.ok(t.opinion.peasants < 50);
});

test('a new law phases in over a month and cannot be changed again meanwhile', () => {
  let s = decree(createState(world, 1), 'tax_peasants', 'heavy').state;
  assert.equal(enactment(s, world, 'tax_peasants'), 0);
  assert.equal(canDecree(s, world, 'tax_peasants', 'light').ok, false);
  s = run(s, 15);
  assert.ok(Math.abs(lawEffects(s, world).taxBy.village - 0.15) < 1e-9);
  s = run(s, 15);
  assert.equal(enactment(s, world, 'tax_peasants'), 1);
  assert.equal(lawEffects(s, world).taxBy.village, 0.3);
  assert.equal(canDecree(s, world, 'tax_peasants', 'light').ok, true);
});

test('without enough Authority the crown cannot sign a law', () => {
  const s = createState(world, 1);
  s.love = 5;
  s.fear = 0;
  assert.equal(canSignLaw(s, world, 'assizes').reason, 'Needs Authority of 25: the realm would not heed it.');
  assert.equal(canDecree(s, world, 'tax_towns', 'fair').reason, 'Already the law of the land.');
});

test('heavy taxes bring in more coin but sour the villages', () => {
  const base = run(createState(world, 2), 120);
  const taxed = run(decree(createState(world, 2), 'tax_peasants', 'heavy').state, 120);
  // Not the whole three tenths more: the Love the decree costs lowers the
  // crown's Authority, and with it what the collectors gather (M24 B, C).
  assert.ok(taxed.ledger.history.at(-1).estates.peasants > base.ledger.history.at(-1).estates.peasants * 1.15);
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
  const s = run(sign(createState(world, 3), 'freedom_of_worship', 'nonhuman_charter'), 365);
  assert.ok(s.opinion.elf > base.opinion.elf + 8, `${s.opinion.elf} vs ${base.opinion.elf}`);
  assert.ok(s.opinion.eternal_fire < base.opinion.eternal_fire - 6);
});

test('restrictions on non-humans drive them from the realm', () => {
  const people = (s, p) => Object.values(s.settlements).reduce((n, st) => n + st.population[p], 0);
  const s0 = createState(world, 4);
  const s = run(sign(structuredClone(s0), 'faith_of_the_crown:eternal_fire', 'restrictions'), 180);
  assert.ok(people(s, 'dwarf') < people(s0, 'dwarf') * 0.97);
  assert.ok(people(s, 'human') >= people(s0, 'human'));
  assert.ok(s.chronicle.some((d) => /left the realm/.test(d.text)));
});

test('standing companies cost a quarter less to keep', () => {
  let s = createState(world, 5);
  s.treasury = 20000;
  s = applyAction(s, world, { type: 'recruit', settlement: 'vizima', kind: 'menatarms' }).state;
  const pay = (x) => run(x, 40).ledger.history.at(-1).expenses.companies;
  const base = pay(structuredClone(s));
  const cheap = pay(sign(structuredClone(s), 'standing_companies'));
  assert.ok(Math.abs(cheap - base * 0.75) <= 1, `${cheap} against ${base}`);
});

test('the faith of the crown is paid every month as an edict', () => {
  const s = run(sign(createState(world, 6), 'faith_of_the_crown:melitele'), 62);
  assert.equal(s.ledger.history.at(-1).expenses.edicts, 100);
});

test('a law names who it pleases and who it angers', () => {
  const o = lawOpinion(world, 'nonhuman_charter');
  assert.ok(o.elf > 0 && o.eternal_fire < 0);
  assert.ok(lawOpinion(world, 'faith_of_the_crown', 'eternal_fire').old_ways < 0);
});

test('a version 2 save gains the customary laws', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 2;
  delete s.state.laws;
  delete s.state.opinion;
  s.state.version = 2;
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.laws.tax_towns.option, 'fair');
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
