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
