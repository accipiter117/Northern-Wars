// Five more faiths (M32 A): the Great Sun, Kreve, Lebioda and Freya on the
// M26 model, and Coram Agh Tera as a cult the crown cannot grow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, applyAction, dilemmaText, realmFaith } from '../../src/sim/index.js';
import { faithEffects, faithLevel, monthlyFaiths, realmLean } from '../../src/sim/faiths.js';
import { monthlyCult, cultIn, resolveCult } from '../../src/sim/cult.js';
import { lawEffects } from '../../src/sim/laws.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const NEW = ['great_sun', 'kreve', 'lebioda', 'freya'];
const never = { chance: () => false, next: () => 0.99, int: () => 0, pick: (l) => l[0] };

test('four more faiths on the M26 model, the cult apart from them', () => {
  for (const f of NEW) {
    const fa = world.devotion.faiths[f];
    assert.ok(fa, f);
    assert.equal(fa.perks.length, 5);
    assert.ok(Object.values(fa.powers).some((p) => p.level === 3), `${f} has a power at level 3`);
    assert.ok(world.book.faiths.includes(f), `${f} can be the crown's faith`);
  }
  assert.ok(!world.devotion.faiths.coram_agh_tera && !world.book.faiths.includes('coram_agh_tera'));
  assert.ok(world.devotion.cult);
});

test('every town keeps a share for the new faiths, and the shares still add to a hundred', () => {
  const s = createState(world, 1);
  for (const [id, t] of Object.entries(s.settlements)) {
    const sum = Object.values(t.faith).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-6, `${id} ${sum}`);
    assert.ok(t.faith.kreve > 0 && t.faith.great_sun > 0);
  }
  assert.ok(s.settlements.vizima.faith.lebioda > s.settlements.tegmond.faith.lebioda, 'Lebioda in the towns');
  const share = realmFaith(s);
  assert.ok(share.eternal_fire > share.kreve && share.kreve > share.freya);
});

test('foreign realms carry their own mix: the Sun in the Empire, Freya on the isles, Kreve in the north', () => {
  const s = createState(world, 1);
  assert.ok(s.faiths.realms.nilfgaard.great_sun > 50);
  assert.ok(s.faiths.realms.skellige.freya > 40);
  assert.ok(s.faiths.realms.kaedwen.kreve > (s.faiths.realms.cintra.kreve ?? 0));
});

test('each new faith\'s perks reach the realm as it rises', () => {
  const s = createState(world, 1);
  for (const f of NEW) s.faiths.devotion[f] = 100;
  const fx = faithEffects(s, world);
  assert.ok(fx.armyMorale >= 15, 'Kreve: bolder armies');
  assert.ok(fx.persecutionUnrest <= -0.25, 'Lebioda: persecution soothed');
  const law = lawEffects(s, world);
  assert.ok(law.tax >= 0.05, 'the Great Sun: obedient taxpayers');
  assert.ok(law.growth >= 0.2, 'Freya: children');
  assert.ok(law.garrison >= 0.25, 'the Sun and Kreve: stronger garrisons');
  for (const f of NEW) assert.equal(faithLevel(s, world, f), 5);
});

test('their powers: imperial order, an oath of arms, alms, Freya\'s blessing', () => {
  let s = createState(world, 1);
  s.treasury = 10000;
  for (const f of NEW) s.faiths.devotion[f] = 65;
  s.settlements.maribor.unrest = 60;
  let r = applyAction(s, world, { type: 'faith', kind: 'order', faith: 'great_sun', settlement: 'maribor' });
  assert.ok(!r.error, r.error);
  assert.equal(r.state.settlements.maribor.unrest, 40);
  assert.ok(applyAction(s, world, { type: 'faith', kind: 'oath', faith: 'kreve' }).error, 'no army to swear');
  s.armies.push({ id: 900, side: 'temeria', at: 'vizima', soldiers: 500, morale: 50 });
  r = applyAction(s, world, { type: 'faith', kind: 'oath', faith: 'kreve' });
  assert.equal(r.state.armies.find((a) => a.id === 900).morale, 65);
  s.settlements.vizima.unrest = 30;
  r = applyAction(s, world, { type: 'faith', kind: 'alms', faith: 'lebioda' });
  assert.equal(r.state.settlements.vizima.unrest, 22);
  r = applyAction(s, world, { type: 'faith', kind: 'freya', faith: 'freya' });
  assert.ok(faithEffects(r.state, world).growth >= 0.3);
});

test('Lebioda cools while the crown makes war', () => {
  const s = createState(world, 1);
  s.faiths.fervour.lebioda = 20;
  s.wars = [{ id: 1, sides: [['temeria'], ['kaedwen']], start: s.day, reason: 'claim' }];
  monthlyFaiths(s, world, never);
  assert.ok(s.faiths.fervour.lebioda < 20 * (1 - world.devotion.fervourFade));
});

test('the Great Sun spreads north with the Empire\'s agents and armies', () => {
  const s = createState(world, 1);
  const before = s.settlements.vizima.faith.great_sun;
  s.spycraft.nets.nilfgaard.temeria = 90;
  monthlyFaiths(s, world, never);
  assert.ok(s.settlements.vizima.faith.great_sun > before);
  const quiet = createState(world, 1);
  quiet.spycraft.nets.nilfgaard.temeria = 20;
  monthlyFaiths(quiet, world, never);
  assert.equal(quiet.settlements.vizima.faith.great_sun, before, 'not while its agents are few');
  // Abroad: its vassals and the courts its agents fill lean to the Sun.
  const plain = realmLean(s, world, 'sodden').great_sun;
  s.realms.sodden.suzerain = 'nilfgaard';
  assert.ok(realmLean(s, world, 'sodden').great_sun > plain);
});

test('Coram Agh Tera grows in hunger, comes to light, and can be rooted out', () => {
  const s = createState(world, 1);
  s.settlements.anchor.hunger = 0.9;
  s.settlements.anchor.unrest = 80;
  for (let m = 0; m < 8; m++) { s.day += 30; monthlyCult(s, world); }
  assert.ok(cultIn(s, 'anchor') >= world.devotion.cult.dilemmaAt);
  const o = s.dilemmas.open.find((x) => x.cult);
  assert.ok(o, 'a dark dilemma');
  const t = dilemmaText(s, world, o);
  assert.equal(t.choices.length, 4);
  assert.match(t.title + t.text, /Anchor/);
  // Each answer.
  const force = structuredClone(s);
  const v = cultIn(s, 'anchor');
  resolveCult(force, world, o, 0);
  assert.equal(cultIn(force, 'anchor'), Math.max(0, v - world.devotion.cult.force.strength));
  const ease = structuredClone(s);
  ease.treasury = 5000;
  resolveCult(ease, world, o, 2);
  assert.ok(cultIn(ease, 'anchor') < v && ease.settlements.anchor.hunger < 0.9);
  const inq = signLaws(structuredClone(s), world, 'inquisition');
  resolveCult(inq, world, o, 1);
  assert.ok(cultIn(inq, 'anchor') < cultIn(force, 'anchor') + 1);
  // Left unanswered, it grows.
  const t2 = step(s, world.dilemmas.defaultDays + 1, world, { ambient: false });
  assert.ok(!t2.dilemmas.open.some((x) => x.id === o.id));
});

test('a fed and prosperous town starves the cult, and the inquisition slows it', () => {
  const s = createState(world, 1);
  s.cult = { towns: { vizima: 20 }, last: s.day, found: 0 };
  s.settlements.vizima.hunger = 0;
  s.settlements.vizima.unrest = 10;
  s.day += 30;
  monthlyCult(s, world);
  assert.ok(cultIn(s, 'vizima') < 20);
  const a = createState(world, 1);
  const b = signLaws(createState(world, 1), world, 'inquisition');
  for (const x of [a, b]) { x.settlements.anchor.hunger = 0.9; x.day += 30; monthlyCult(x, world); }
  assert.ok(cultIn(b, 'anchor') < cultIn(a, 'anchor'));
});

test('older saves gain the new faiths in every town and the foreign mixes', () => {
  const s = step(createState(world, 3), 60, world, { ambient: false });
  const old = JSON.parse(serialize(s));
  old.version = 35;
  old.state.version = 35;
  for (const t of Object.values(old.state.settlements)) for (const f of NEW) delete t.faith[f];
  for (const f of NEW) { delete old.state.faiths.devotion[f]; delete old.state.faiths.fervour[f]; }
  for (const row of Object.values(old.state.faiths.realms)) for (const f of NEW) delete row[f];
  delete old.state.cult;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  for (const t of Object.values(up.settlements)) {
    assert.ok(t.faith.kreve > 0);
    assert.ok(Math.abs(Object.values(t.faith).reduce((a, b) => a + b, 0) - 100) < 1e-6);
  }
  assert.ok(up.faiths.devotion.lebioda > 0);
  assert.ok(up.faiths.realms.nilfgaard.great_sun > 50);
});
