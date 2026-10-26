// Battles and sieges you can watch (M19): fought over days in phases, with
// reserves and retreats, whose outcomes over many trials match the old
// single roll's odds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/sim/index.js';
import { startWar } from '../../src/sim/war.js';
import { newArmy } from '../../src/sim/armies.js';
import { startBattle, stepBattlesDay, meetingOdds, battleOrder, canBattleOrder, battleOdds } from '../../src/sim/battle.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

// Two armies of realms at war, face to face at a place, with standard
// troops on both sides (so only strength decides the odds).
function meeting(seed, menA, menB, { sideA = 'redania', sideB = 'kaedwen', standard = true } = {}) {
  const s = createState(world, seed);
  s.armies = [];
  s.wars = [];
  const rng = makeRng(seed);
  startWar(s, world, rng, sideA, sideB, 'claim');
  s.armies = [];
  const at = world.foreignByRealm[sideB][0];
  const a = newArmy(s, world, sideA, at, menA, {});
  const b = newArmy(s, world, sideB, at, menB, {});
  if (standard) for (const x of [a, b]) x.quality = 1;
  return { s, a, b, rng };
}

function fightOut(s, rng, f, cap = 30) {
  for (let d = 0; d < cap && !f.over; d++) {
    s.day += 1;
    stepBattlesDay(s, world, rng);
  }
  return f;
}

test('battles over many trials match the old odds', () => {
  const saved = world.war.battles.realmMix;
  world.war.battles.realmMix = {};
  try {
    for (const [ma, mb] of [[1000, 1000], [1200, 1000], [1500, 1000], [2000, 1000]]) {
      let wins = 0;
      let expected = 0;
      let rounds = 0;
      const n = 400;
      for (let i = 0; i < n; i++) {
        const { s, a, b, rng } = meeting(1000 + i, ma, mb);
        const p = meetingOdds(s, world, a, b);
        expected += p;
        const f = fightOut(s, rng, startBattle(s, world, rng, a, b, world.byId[a.at]));
        if (f.over.winner === 0) wins++;
        rounds += f.round;
      }
      const got = wins / n;
      assert.ok(Math.abs(got - expected / n) < 0.06, `${ma} v ${mb}: won ${got.toFixed(3)}, odds ${(expected / n).toFixed(3)}`);
      assert.ok(rounds / n >= 4 && rounds / n <= 12, `a battle lasts days, not an instant: ${rounds / n}`);
    }
  } finally {
    world.war.battles.realmMix = saved;
  }
});

test('a battle runs through skirmish, melee and rout, and leaves a report', () => {
  const { s, a, b, rng } = meeting(5, 1600, 1200);
  const f = startBattle(s, world, rng, a, b, world.byId[a.at]);
  assert.equal(f.phase, 'skirmish');
  const phases = new Set();
  for (let d = 0; d < 30 && !f.over; d++) {
    s.day += 1;
    stepBattlesDay(s, world, rng);
    phases.add(f.phase);
  }
  // Ended by a rout, or by a captain sounding the retreat before it came to that.
  assert.ok(phases.has('melee') && (phases.has('rout') || f.withdrew !== undefined), [...phases].join());
  assert.ok(f.lost[0] > 0 && f.lost[1] > 0);
  const loser = 1 - f.over.winner;
  assert.ok(f.lost[loser] > f.lost[f.over.winner], 'the beaten lose more');
  assert.ok(s.battles.at(-1).events.length >= 1);
  assert.ok(f.events.some((e) => /breaks|retreat/.test(e.text)));
});

test('committing the reserve wins more often and costs more; retreating saves men', () => {
  const trials = (opts) => {
    let wins = 0;
    let lost = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const { s, a, b, rng } = meeting(3000 + i, 1000, 1000, { sideA: 'temeria', sideB: 'kaedwen' });
      const f = startBattle(s, world, rng, a, b, world.byId[a.at]);
      // Held back: the reserve never joins (marked as if it had, so the
      // marshal does not send it in).
      if (opts.hold) f.committed[0] = true;
      for (let d = 0; d < 30 && !f.over; d++) {
        s.day += 1;
        if (opts.commit && f.phase === 'melee' && canBattleOrder(s, world, f.id, 'commit').ok) battleOrder(s, world, f.id, 'commit');
        if (opts.retreat && f.phase === 'melee' && !f.over) battleOrder(s, world, f.id, 'retreat');
        stepBattlesDay(s, world, rng);
      }
      if (f.over.winner === 0) wins++;
      lost += f.lost[0];
    }
    return { wins: wins / n, lost: lost / n };
  };
  const hold = trials({ hold: true });
  const commit = trials({ commit: true });
  const retreat = trials({ retreat: true });
  assert.ok(commit.wins > hold.wins + 0.05, `commit ${commit.wins} v hold ${hold.wins}`);
  assert.ok(retreat.lost < hold.lost, `retreat loses ${retreat.lost} v ${hold.lost}`);
  // Sounded at the first clash of the lines: the enemy rarely breaks first.
  assert.ok(retreat.wins < 0.05, `retreat wins ${retreat.wins}`);
});

test('the odds shown follow the battle', () => {
  const { s, a, b, rng } = meeting(9, 1500, 1000);
  const f = startBattle(s, world, rng, a, b, world.byId[a.at]);
  const start = battleOdds(s, world, f, 0);
  assert.ok(start > 0.6);
  f.spirit[0] = 10;
  assert.ok(battleOdds(s, world, f, 0) < start);
});

// ---- Sieges ----

import { siegeDay, stormOdds, wallsOf, storm } from '../../src/sim/siege.js';
import { setOwner } from '../../src/sim/conflict.js';
import { resolveWarDecision } from '../../src/sim/war.js';
import { attritionOf } from '../../src/sim/armies.js';
import { step as stepState } from '../../src/sim/index.js';

function camp(seed, town, men, side = 'temeria', realm = world.realmOf[town]) {
  const s = createState(world, seed);
  s.armies = [];
  s.wars = [];
  s.warDecisions = [];
  const rng = makeRng(seed);
  startWar(s, world, rng, side, realm, 'claim');
  s.armies = [];
  const a = newArmy(s, world, side, town, men, {}, { order: 'siege', target: town });
  return { s, a, rng };
}

test('a siege wears the walls down, starves the garrison, and they offer terms', () => {
  const town = world.foreignByRealm.redania.find((id) => world.byId[id].type === 'town');
  const { s, a, rng } = camp(21, town, 1500);
  a.stance = 'cautious';
  // Told to starve them out, not to storm.
  a.starve = true;
  assert.ok(wallsOf(s, world, town) > 0, 'a town has timber walls');
  let terms = null;
  for (let d = 0; d < 200 && !terms && (d === 0 || a.siege); d++) {
    s.day += 1;
    siegeDay(s, world, rng, a, 'redania');
    if (a.siege) a.siege.hold = true;
    terms = s.warDecisions.find((x) => x.kind === 'terms');
  }
  assert.ok(terms, 'the starving garrison offers terms');
  assert.ok(a.siege.walls < a.siege.wallsMax, 'the walls are worn');
  assert.ok(a.siege.sick > 0, 'sickness thins the camp');
  const pop = s.realms.redania.settlements[town].population;
  resolveWarDecision(s, world, terms.id, 0);
  assert.equal(s.realms.redania.settlements[town].owner, 'temeria', 'taken on terms');
  assert.ok(s.realms.redania.settlements[town].population >= pop - 1, 'intact');
});

test('a village falls in a day; a storm is taken or thrown back at the odds shown', () => {
  const village = world.foreignByRealm.redania.find((id) => world.byId[id].type === 'village');
  {
    const { s, a, rng } = camp(22, village, 600);
    for (let d = 0; d < 3 && (d === 0 || a.siege); d++) {
      s.day += 1;
      siegeDay(s, world, rng, a, 'redania');
    }
    assert.equal(s.realms.redania.settlements[village].owner, 'temeria');
  }
  const city = world.foreignByRealm.redania.find((id) => world.byId[id].type === 'city');
  let taken = 0;
  let expected = 0;
  for (let i = 0; i < 120; i++) {
    const { s, a, rng } = camp(500 + i, city, 9000);
    s.day += 1;
    a.siege = null;
    siegeDay(s, world, rng, a, 'redania');
    if (!a.siege) continue;
    a.siege.hold = true;
    const o = stormOdds(s, world, a);
    expected += o.odds;
    const before = a.soldiers;
    storm(s, world, rng, a, 'redania');
    if (s.realms.redania.settlements[city].owner === 'temeria') taken++;
    assert.ok(a.soldiers < before, 'a storm costs men either way');
  }
  assert.ok(Math.abs(taken - expected) / 120 < 0.12, `taken ${taken} of 120, odds said ${expected.toFixed(1)}`);
});

test('an army far from friendly towns in winter, unpaid, wastes away, and its card knows why', () => {
  const s = createState(world, 23);
  s.armies = [];
  s.wars = [];
  const rng = makeRng(23);
  startWar(s, world, rng, 'temeria', 'redania', 'claim');
  s.armies = [];
  const far = world.foreignByRealm.redania.reduce((best, id) => (!best || world.byId[id].y < world.byId[best].y ? id : best), null);
  const a = newArmy(s, world, 'temeria', far, 4000, {}, { order: 'defend', target: far });
  s.unpaid = true;
  s.day += 300 - (s.day % 365) + 300;
  let next = s;
  for (let d = 0; d < 30; d++) next = stepState(next, 1, world, { ambient: false });
  const b = next.armies.find((x) => x.id === a.id) ?? null;
  assert.ok(b, 'still in the field');
  const why = attritionOf(b);
  assert.ok(why.supply > 0 && why.desertion > 0, JSON.stringify(why));
  assert.ok(b.soldiers < 4000);
});
