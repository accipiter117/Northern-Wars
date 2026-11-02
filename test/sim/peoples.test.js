// What each people brings (M32 C): dwarven smiths and miners, gnome blades,
// halfling farms and inns, elven healers and archers, the dwarven bank, and
// volunteers in war; all of it waxing and waning with their goodwill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, goodsYield, foodYield, creditLimit, applyAction } from '../../src/sim/index.js';
import { giftWeight, townGifts, refreshGifts, bankRate, monthlyPeoples } from '../../src/sim/peoples.js';
import { canRecruit, recruit, disbandCompany } from '../../src/sim/forces.js';
import { companyStrength } from '../../src/sim/combat.js';
import { loanTerms, loanCap } from '../../src/sim/loans.js';
import { startWar } from '../../src/sim/war.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const withOpinion = (o) => {
  const s = createState(world, 1);
  Object.assign(s.opinion, o);
  refreshGifts(s, world);
  return s;
};

test('a people\'s gift grows with its share of the town and with its goodwill', () => {
  const s = createState(world, 1);
  const c = s.settlements.carreras;
  const v = s.settlements.vizima;
  assert.ok(giftWeight(s, world, c, 'dwarf') > giftWeight(s, world, v, 'dwarf'), 'a dwarven town gets more than a city with a few');
  s.opinion.dwarf = 85;
  const warm = giftWeight(s, world, c, 'dwarf');
  s.opinion.dwarf = 20;
  assert.equal(giftWeight(s, world, c, 'dwarf'), 0, 'nothing from a people the crown has wronged');
  assert.ok(warm > 1, `${warm}`);
});

test('dwarves raise the smithies\' takings and the mines\' output', () => {
  const warm = withOpinion({ dwarf: 85 });
  const cold = withOpinion({ dwarf: 20 });
  assert.ok(warm.settlements.carreras.gifts.crafts.smithy > 0.3);
  assert.equal(cold.settlements.carreras.gifts?.crafts?.smithy ?? 0, 0);
  const mine = Object.keys(warm.settlements).find((id) => ['iron', 'stone'].includes(warm.settlements[id].production) && warm.settlements[id].population.dwarf > 30);
  assert.ok(mine, 'a mining town with dwarves');
  assert.ok(goodsYield(world, mine, warm.settlements[mine]) > goodsYield(world, mine, cold.settlements[mine]));
  // The month's ledger shows it.
  const a = step(warm, 31, world, { ambient: false }).ledger.history.at(-1).income.crafts.smithy;
  const b = step(cold, 31, world, { ambient: false }).ledger.history.at(-1).income.crafts.smithy;
  assert.ok(a > b, `${a} vs ${b}`);
});

test('gnomes make more arms where they live; halflings more grain and a richer town', () => {
  const warm = withOpinion({ gnome: 85, halfling: 85 });
  const cold = withOpinion({ gnome: 20, halfling: 20 });
  assert.ok(warm.settlements.carreras.gifts.arms > 0.15);
  assert.ok(foodYield(world, 'old_bottoms', warm.settlements.old_bottoms, 7) > foodYield(world, 'old_bottoms', cold.settlements.old_bottoms, 7));
  warm.settlements.old_bottoms.prosperity = 50;
  cold.settlements.old_bottoms.prosperity = 50;
  monthlyPeoples(warm, world, makeRng(1));
  monthlyPeoples(cold, world, makeRng(1));
  assert.ok(warm.settlements.old_bottoms.prosperity > cold.settlements.old_bottoms.prosperity);
});

test('elves heal: fewer plague deaths where they live', () => {
  const warm = withOpinion({ elf: 85 });
  assert.ok(warm.settlements.flotsam.gifts.plague > 0.3);
  assert.equal(withOpinion({ elf: 20 }).settlements.flotsam.gifts?.plague ?? 0, 0);
});

test('the town card says what each people brings, in its own works only', () => {
  const s = withOpinion({ dwarf: 80, gnome: 80 });
  const lines = townGifts(s, world, s.settlements.carreras).lines;
  const dwarves = lines.find((l) => l.people === 'dwarf');
  assert.match(dwarves.line, /smithy[\s\S]*\+\d+%[\s\S]*mines \+\d+%/);
  assert.ok(!townGifts(s, world, s.settlements.vizima).lines.find((l) => l.people === 'dwarf').line.includes('mines'), 'no mines in Vizima');
});

test('the Vivaldi bank lends cheaper and more to a crown the dwarves trust', () => {
  const warm = withOpinion({ dwarf: 80 });
  const cold = withOpinion({ dwarf: 20 });
  assert.ok(Math.abs(bankRate(warm, world) - 0.7) < 1e-9 && Math.abs(bankRate(cold, world) - 1.3) < 1e-9);
  assert.ok(creditLimit(warm, world) > creditLimit(cold, world));
  assert.ok(loanTerms(warm, world, 2000).payment < loanTerms(cold, world, 2000).payment);
  assert.ok(loanCap(warm, world) > loanCap(cold, world));
  // Overdraft interest too.
  warm.treasury = cold.treasury = -2000;
  const iw = step(warm, 31, world, { ambient: false }).ledger.history.at(-1).expenses.interest;
  const ic = step(cold, 31, world, { ambient: false }).ledger.history.at(-1).expenses.interest;
  assert.ok(iw < ic, `${iw} vs ${ic}`);
});

test('dwarven axemen: only with dwarves enough and their goodwill, raised from the dwarves', () => {
  const s = withOpinion({ dwarf: 50 });
  s.treasury = 5000;
  const id = 'carreras';
  assert.match(canRecruit(s, world, id, 'dwarves').reason, /will not serve/);
  assert.equal(canRecruit(s, world, 'anchor', 'dwarves').ok, false);
  s.opinion.dwarf = 65;
  assert.ok(canRecruit(s, world, id, 'dwarves').ok, canRecruit(s, world, id, 'dwarves').reason);
  const before = { ...s.settlements[id].population };
  const c = recruit(s, world, id, 'dwarves');
  assert.equal(s.settlements[id].population.dwarf, before.dwarf - c.men);
  assert.equal(s.settlements[id].population.human, before.human);
  assert.equal(c.people, 'dwarf');
  const men = companyStrength(world, { type: 'menatarms', men: 80, morale: 70 }, 'soldiers');
  assert.ok(companyStrength(world, c, 'soldiers') > men * 1.3, 'the sturdiest foot');
  disbandCompany(s, world, c);
  assert.equal(s.settlements[id].population.dwarf, before.dwarf, 'home to their own');
  // With Mahakam under the crown's protection, less goodwill will do.
  s.opinion.dwarf = 50;
  s.realms.mahakam.suzerain = 'temeria';
  const r = canRecruit(s, world, id, 'dwarves');
  assert.ok(r.ok || !/will not serve/.test(r.reason), r.reason);
});

test('archers raised where willing elves live shoot with elven skill', () => {
  const s = withOpinion({ elf: 70 });
  s.treasury = 5000;
  const id = Object.keys(s.settlements).find((k) => s.settlements[k].population.elf >= 30 && canRecruit(s, world, k, 'archers').ok);
  assert.ok(id, 'a town with elves that can raise archers');
  const c = recruit(s, world, id, 'archers');
  assert.ok(c.bonus > 0);
  assert.ok(companyStrength(world, c, 'bandits') > companyStrength(world, { ...c, bonus: 0 }, 'bandits'));
});

test('at war, a people that loves the crown sends volunteers, once a year', () => {
  const s = withOpinion({ dwarf: 80 });
  startWar(s, world, makeRng(1), 'kaedwen', 'temeria', 'test');
  const sure = { ...world, culture: { ...world.culture, gifts: { ...world.culture.gifts, volunteers: { ...world.culture.gifts.volunteers, chance: 1 } } } };
  const n = s.forces.companies.length;
  monthlyPeoples(s, sure, makeRng(1));
  const v = s.forces.companies.filter((c) => c.volunteer);
  assert.equal(v.length, 1);
  assert.equal(v[0].type, 'dwarves');
  assert.ok(s.forces.companies.length === n + 1);
  monthlyPeoples(s, sure, makeRng(2));
  assert.equal(s.forces.companies.filter((c) => c.volunteer).length, 1, 'not again within the year');
  assert.match(s.chronicle.at(-1).text, /come forward to fight for the crown/);
  // At peace, none.
  const p = withOpinion({ dwarf: 80 });
  monthlyPeoples(p, sure, makeRng(1));
  assert.ok(!p.forces.companies.some((c) => c.volunteer));
});
