import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../../src/sim/index.js';
import { YEAR_DAYS } from '../../src/sim/calendar.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const SEEDS = [1, 2, 3, 1262, 987654321];

function assertFinite(value, path) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} is ${value}`);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertFinite(v, `${path}.${k}`);
  }
}

function checkInvariants(s, label) {
  assertFinite(s, label);
  assert.ok(s.treasury >= -world.economy.debt.creditLimit * 2, `${label} treasury ${s.treasury}`);
  for (const [id, h] of Object.entries(s.houses)) assert.ok(h.loyalty >= 0 && h.loyalty <= 100, `${label} ${id} loyalty`);
  for (const m of ['love', 'fear', 'unrest', 'sympathy']) assert.ok(s[m] >= 0 && s[m] <= 100, `${label} ${m} ${s[m]}`);
  for (const [id, st] of Object.entries(s.settlements)) {
    for (const m of ['prosperity', 'unrest']) assert.ok(st[m] >= 0 && st[m] <= 100, `${label} ${id}.${m}`);
    for (const [p, n] of Object.entries(st.population)) assert.ok(n >= 0, `${label} ${id} ${p} ${n}`);
    assert.ok(st.garrison >= 0);
    for (const [g, n] of Object.entries(st.stock)) assert.ok(n >= -1e-9, `${label} ${id} ${g} stock ${n}`);
    assert.ok(st.hunger >= 0 && st.hunger <= 1, `${label} ${id} hunger ${st.hunger}`);
    assert.ok(st.tension >= 0 && st.tension <= 100, `${label} ${id} tension ${st.tension}`);
    const faith = Object.values(st.faith).reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(faith - 100) < 1e-6, `${label} ${id} faith sums to ${faith}`);
  }
}

for (const seed of SEEDS) {
  test(`ten years headless with seed ${seed}: values stay sane and repeatable`, () => {
    let a = createState(world, seed);
    let b = createState(world, seed);
    // Step in uneven chunks on one side to prove chunking does not matter.
    for (let y = 0; y < 10; y++) {
      for (let d = 0; d < YEAR_DAYS; d += 73) a = step(a, 73, world);
      b = step(b, YEAR_DAYS, world);
      checkInvariants(a, `seed ${seed} year ${y + 1}`);
    }
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    // An untended realm should not boom over ten years, and since M20 it
    // declines as its works wear out, but it does not collapse. Towns lost to
    // a neighbour at a peace leave the realm for good (M19), so the measure
    // is taken over the towns it still has. Since M24 C an idle crown also
    // drifts into debt, and the debt's unrest thins it a little more.
    const start = createState(world, seed);
    const kept = Object.keys(a.settlements).filter((id) => start.settlements[id]);
    const pop = (x) => kept.reduce((n, id) => n + Object.values(x.settlements[id].population).reduce((p, q) => p + q, 0), 0);
    const ratio = pop(a) / pop(start);
    assert.ok(ratio > 0.7 && ratio < 1.15, `population ratio ${ratio}`);
    assert.equal(a.day - createState(world, seed).day, 10 * YEAR_DAYS);
  });
}

test('different seeds give different reigns', () => {
  const a = step(createState(world, 1), 200, world);
  const b = step(createState(world, 2), 200, world);
  assert.notEqual(JSON.stringify(a.settlements), JSON.stringify(b.settlements));
});

test('thirty untended years: the hoard levels off, Love is not left at the cap, the realm decays but lives', () => {
  let s = createState(world, 5);
  const pop0 = Object.values(s.settlements).reduce((n, st) => n + Object.values(st.population).reduce((p, q) => p + q, 0), 0);
  // Decisions are left to take their defaults, as an absent crown would.
  s = step(s, 30 * YEAR_DAYS, world, { ambient: false });
  checkInvariants(s, 'thirty years');
  assert.ok(s.treasury < 70000, `treasury ${s.treasury}`);
  assert.ok(s.love < 90, `love ${s.love}`);
  const pop = Object.values(s.settlements).reduce((n, st) => n + Object.values(st.population).reduce((p, q) => p + q, 0), 0);
  // Since M20 an untended realm's works fall to ruin, its woodpiles run
  // dry once its lumber camps are gone, and its people dwindle.
  assert.ok(pop / pop0 > 0.35 && pop / pop0 < 0.95, `population ratio ${pop / pop0}`);
  const conds = Object.values(s.settlements).flatMap((x) => x.buildings.map((b) => x.cond?.[b] ?? 100));
  assert.ok(conds.reduce((a, b) => a + b, 0) / conds.length < 25, 'its works lie in ruins');
});
