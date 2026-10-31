// The Book of Laws (M26 A and B): paths that lock their rivals and reopen
// once repealed from the top down; the ink drying between signings and a
// law resting after each change; repeals that cost; reactions that move the
// realm at once; quick settings with their own rest; acts unlocked by laws;
// and old saves mapped onto the Book.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, canSignLaw, canAct, lawEffects, bookEffect, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const fresh = (seed = 1) => {
  const s = quiet(createState(world, seed));
  s.treasury = 50000;
  s.love = 60;
  s.fear = 40;
  return s;
};
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type} ${a.law ?? a.kind}: ${out.error}`);
  return out.state;
};
// Past the ink, and the 90 days a changed law rests.
const wait = (s, days) => quiet(run(s, days));

test('five chapters, each with two rival paths of three laws, each with a headline', () => {
  const ch = world.book.chapters;
  assert.deepEqual(Object.keys(ch), ['order', 'economy', 'war', 'people', 'faith']);
  for (const c of Object.values(ch)) {
    assert.equal(Object.keys(c.paths).length, 2);
    for (const p of Object.values(c.paths)) {
      assert.equal(p.laws.length, 3);
      for (const l of p.laws) assert.ok(l.headline && l.reaction, l.id);
    }
  }
});

test('signing a path locks its rival; tiers go in order; the rival reopens only once the path is repealed from the top down', () => {
  let s = fresh();
  assert.match(canSignLaw(s, world, 'pardons').reason, /Needs Assizes first/);
  s = act(s, { type: 'sign', law: 'assizes' });
  const locked = canSignLaw(s, world, 'curfews');
  assert.equal(locked.locked, true);
  assert.match(locked.reason, /Locked while The King's Justice stands/);
  s = wait(s, 31);
  s = act(s, { type: 'sign', law: 'pardons' });
  s = wait(s, 91);
  // From the top down only.
  assert.match(applyAction(s, world, { type: 'repeal', law: 'assizes' }).error, /Repeal Royal pardons first/);
  s = act(s, { type: 'repeal', law: 'pardons' });
  assert.equal(canSignLaw(s, world, 'curfews').locked, true, 'still locked while Assizes stands');
  s = act(s, { type: 'repeal', law: 'assizes' });
  assert.equal(canSignLaw(s, world, 'curfews').locked, undefined, 'the rival path is open');
});

test('the ink must dry for 30 days after any change, and a law rests 90 days after it is changed', () => {
  let s = fresh();
  s = act(s, { type: 'sign', law: 'assizes' });
  assert.match(canSignLaw(s, world, 'open_markets').reason, /ink is still drying: 30 days/);
  s = wait(s, 20);
  assert.match(canSignLaw(s, world, 'open_markets').reason, /ink is still drying: 10 days/);
  s = wait(s, 11);
  assert.equal(canSignLaw(s, world, 'open_markets').ok, true);
  // Assizes cannot be repealed until it has rested.
  assert.match(applyAction(s, world, { type: 'repeal', law: 'assizes' }).error, /Signed too lately: 59 days/);
  s = wait(s, 60);
  s = act(s, { type: 'repeal', law: 'assizes' });
  // Repealing starts the ink again, and the law rests before it can return.
  assert.match(canSignLaw(s, world, 'open_markets').reason, /ink is still drying/);
  s = wait(s, 31);
  assert.match(canSignLaw(s, world, 'assizes').reason, /Changed too lately/);
});

test('signing moves Love, Fear and Unrest at once and says how it landed; repealing costs', () => {
  let s = fresh();
  const love = s.love;
  const fear = s.fear;
  s = act(s, { type: 'sign', law: 'curfews' });
  assert.ok(s.fear > fear, 'Fear rises at once');
  assert.ok(s.love < love, 'Love falls at once');
  assert.match(s.chronicle.at(-1).text, /Signed into the Book of Laws: Curfews and the watch\. The streets empty/);
  // The groups react at once too.
  const before = fresh().opinion.burghers;
  assert.ok(s.opinion.burghers < before);
  s = wait(s, 91);
  const peasants = s.opinion.peasants;
  const unrest = s.unrest;
  const fear2 = s.fear;
  s = act(s, { type: 'repeal', law: 'curfews' });
  assert.ok(s.fear < fear2, 'the Fear it brought is lost');
  assert.ok(s.unrest > unrest - 0.01, 'Unrest rises');
  assert.ok(s.opinion.nobles < 100 && s.opinion.peasants === peasants, 'only the groups who liked it sour');
  assert.match(s.chronicle.at(-1).text, /Struck from the Book of Laws: Curfews and the watch\. Nobles take it hard/);
});

test('a law takes hold over its enactment days', () => {
  let s = fresh();
  s = act(s, { type: 'sign', law: 'guild_monopolies' });
  assert.equal(bookEffect(s, world, 'crafts'), 0);
  s = run(s, 15);
  assert.ok(Math.abs(bookEffect(s, world, 'crafts') - 0.15) < 0.02);
  s = run(s, 20);
  assert.equal(bookEffect(s, world, 'crafts'), 0.3);
});

test('taxes, the court and bounties are quick settings, each resting 30 days between changes', () => {
  let s = fresh();
  s = act(s, { type: 'law', law: 'tax_towns', option: 'heavy' });
  s = act(s, { type: 'law', law: 'court', option: 'frugal' });
  assert.match(applyAction(s, world, { type: 'law', law: 'tax_towns', option: 'fair' }).error, /Changed too lately/);
  s = run(s, 31);
  s = act(s, { type: 'law', law: 'tax_towns', option: 'fair' });
  // The old laws are gone; only the settings remain.
  assert.deepEqual(Object.keys(world.laws.laws).sort(), ['bounties', 'court', 'tax_nobles', 'tax_peasants', 'tax_towns']);
});

test('acts the Book unlocks: none without their law; with it, each does its work and rests', () => {
  let s = fresh();
  const town = Object.keys(s.settlements).find((id) => world.byId[id].type === 'town');
  s.settlements[town].unrest = 50;
  assert.match(canAct(s, world, 'pardon', town).reason, /Needs the law Royal pardons/);
  assert.match(canAct(s, world, 'hang', town).reason, /Needs the law Public executions/);
  assert.match(canAct(s, world, 'feast').reason, /Needs the law Royal feasts/);
  s = act(s, { type: 'sign', law: 'assizes' });
  s = wait(s, 31);
  s = act(s, { type: 'sign', law: 'pardons' });
  s.settlements[town].unrest = 50;
  s = act(s, { type: 'act', kind: 'pardon', settlement: town });
  assert.equal(s.settlements[town].unrest, 35);
  assert.match(canAct(s, world, 'pardon', town).reason, /Not again for 60 days/);
});

test('the headline effects reach the realm: unrest under Assizes, Fear each month under Curfews', () => {
  let s = fresh();
  const base = lawEffects(s, world);
  s.book.signed.assizes = { day: s.day - 30 };
  s.book.signed.curfews = { day: s.day - 30 }; // both, only to read the sums
  const fx = lawEffects(s, world);
  assert.equal(fx.unrest.town - base.unrest.town, -18);
  assert.equal(fx.unrest.village - base.unrest.village, -10);
  assert.equal(fx.fear - base.fear, 1.5);
});

test('an old save maps its laws onto the Book, in force, with no cooldowns running', () => {
  const s = createState(world, 2);
  const old = JSON.parse(serialize(s));
  old.version = 26;
  delete old.state.book;
  old.state.laws = {
    ...old.state.laws,
    alms: { option: 'alms', previous: 'alms', since: 0 },
    public_order: { option: 'riders', previous: 'riders', since: 0 },
    patronage: { option: 'melitele', previous: 'melitele', since: 0 },
    nonhumans: { option: 'charter', previous: 'charter', since: 0 },
    mages: { option: 'banished', previous: 'banished', since: 0 },
    conscription: { option: 'standing', previous: 'standing', since: 0 },
  };
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  const signedIds = Object.keys(up.book.signed).sort();
  // Patronage of Melitele takes the One faith path first, so the charter's
  // Tolerance path is skipped; the banished mages carry the One faith up to
  // the inquisition.
  assert.deepEqual(signedIds, ['curfews', 'executions', 'faith_of_the_crown', 'inquisition', 'poor_relief', 'restrictions', 'riders', 'standing_companies'].sort());
  assert.equal(up.book.faith, 'melitele');
  assert.equal(up.book.signed.nonhuman_charter, undefined);
  assert.equal(up.book.ink, 0);
  assert.equal(bookEffect(up, world, 'banditRoads'), -0.5, 'in force at once');
  assert.ok(!up.laws.alms && !up.laws.public_order, 'only the settings remain among the old laws');
  assert.ok(up.laws.tax_towns && up.laws.court && up.laws.bounties);
});
