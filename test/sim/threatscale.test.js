// Threats scaled to the realm (M21 E): camps and bands grow with the realm's
// people but never past their caps, so the nearest company or town levy
// beats an ordinary one; walls count in full; old saves are cut down to size.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, serialize, deserialize, threatScale, threatCap, forceAgainst, localStrength, threatStrength, winChance,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};

test('threats grow with the realm, within bounds, and never past their caps', () => {
  const sc = world.forces.threats.scale;
  const s = createState(world, 1);
  const k = threatScale(s, world);
  assert.ok(k >= sc.min && k <= sc.max);
  // A realm half emptied breeds smaller bands, down to the floor.
  for (const st of Object.values(s.settlements)) for (const p of Object.keys(st.population)) st.population[p] = Math.floor(st.population[p] / 3);
  assert.equal(threatScale(s, world), sc.min);
  for (const seed of [2, 3, 4]) {
    let t = quiet(createState(world, seed));
    // Poor, restless country: the worst case for camps.
    for (const st of Object.values(t.settlements)) {
      st.prosperity = 20;
      st.unrest = 60;
    }
    for (let m = 0; m < 24; m++) {
      t = run(t, 30);
      for (const x of t.threats.list) {
        if (x.kind === 'monsters' || x.abroad) continue;
        const cap = threatCap(t, world, x.kind, x.kind === 'raiders');
        assert.ok((x.men ?? 0) <= cap + 1e-6 && (x.band?.men ?? 0) <= cap * 1.1, `${x.kind} ${x.men}/${x.band?.men} over ${cap}`);
      }
    }
  }
});

test('each threat shows its size against the nearest force, and an ordinary band loses to it', () => {
  let s = quiet(createState(world, 5));
  for (const st of Object.values(s.settlements)) st.prosperity = 20;
  let seen = 0;
  for (let m = 0; m < 18; m++) {
    s = run(s, 30);
    for (const t of s.threats.list) {
      if (t.abroad) continue;
      const f = forceAgainst(s, world, t);
      assert.ok(f && f.men > 0 && /levy|company|Company|[A-Z]/.test(f.name), JSON.stringify(f));
      if (t.kind === 'bandits' || t.kind === 'scoiatael') {
        assert.ok(f.chance > 0.5, `${t.kind} of ${t.men}/${t.band?.men} against ${f.name} ${f.men}: ${f.chance}`);
        seen += 1;
      }
    }
  }
  assert.ok(seen > 0, 'some bands to measure');
});

test('walls count in full while they stand, and a walled garrison beats off a capped band', () => {
  const s = createState(world, 6);
  const id = 'maribor';
  const st = s.settlements[id];
  if (!st.buildings.includes('walls')) st.buildings.push('walls');
  st.cond = { ...(st.cond ?? {}), walls: 100 };
  const full = localStrength(s, world, id);
  st.buildings = st.buildings.filter((b) => b !== 'walls');
  // Every company behind the walls fights at the full bonus (crossbowmen
  // in the muster at more), so the whole is at least the walls' multiplier.
  assert.ok(full >= localStrength(s, world, id) * world.military.walls - 1e-6, 'the full multiplier');
  st.buildings.push('walls');
  st.cond.walls = 60;
  assert.equal(localStrength(s, world, id), full, 'battered walls still count in full');
  st.cond.walls = 30;
  assert.ok(localStrength(s, world, id) < full, 'breached walls do not');
  st.cond.walls = 100;
  const band = { kind: 'bandits', men: threatCap(s, world, 'bandits'), morale: 70 };
  assert.ok(winChance(world, full, threatStrength(world, band)) > 0.9);
});

test('a version 21 save has its threats cut to the new caps', () => {
  const s = quiet(createState(world, 7));
  s.threats.list.push({ id: 999, kind: 'bandits', men: 400, x: 100, y: 100, near: 'maribor', terrain: 'forest', band: { men: 300, x: 100, y: 100, way: [], phase: 'out' } });
  s.version = 21;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 21, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  const t = up.threats.list.find((x) => x.id === 999);
  assert.equal(t.men, threatCap(up, world, 'bandits'));
  assert.equal(t.band.men, threatCap(up, world, 'bandits'));
  // The made-up camp has no road to walk; take it away before running on.
  up.threats.list = up.threats.list.filter((x) => x !== t);
  assert.equal(deserialize(serialize(run(up, 30)), world).version, STATE_VERSION);
});
