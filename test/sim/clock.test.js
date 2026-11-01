// The Nilfgaard clock (M30 D): Watching, then Pressure, then War, the war
// held behind a gate (one to three years for now; M33 replaces it); the
// Empire takes its aims in order; the North's fear grows into a league and
// petty kings seek protection; a "From the south" line in the Steward's
// report; older saves gain the clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, stewardReport } from '../../src/sim/index.js';
import { newClock, monthlyClock, gateOpen, clockThreat, nextAim, clockLine } from '../../src/sim/clock.js';
import { mayStartWar } from '../../src/sim/blocs.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const never = { chance: () => false, next: () => 0, int: () => 0, pick: (l) => l[0] };
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };

test('the gate opens one to three years in, and Pressure comes on the way', () => {
  const days = [];
  for (let seed = 1; seed <= 40; seed++) {
    const k = newClock(world, seed, 1000);
    assert.equal(k.stage, 'watching');
    assert.ok(k.warDay - 1000 >= 365 && k.warDay - 1000 <= 1095, `${k.warDay - 1000} days`);
    assert.ok(k.pressureDay > 1000 && k.pressureDay < k.warDay);
    days.push(k.warDay - 1000);
  }
  assert.ok(Math.max(...days) - Math.min(...days) > 300, 'the gate varies from reign to reign');
  const s = createState(world, 7);
  assert.equal(s.nilfgaard.stage, 'watching');
});

test('the clock moves through its stages, and its gate holds the war back', () => {
  const s = createState(world, 2);
  const k = s.nilfgaard;
  assert.ok(!mayStartWar(s, 'nilfgaard'), 'the Empire makes no war while it watches');
  s.day = k.pressureDay;
  monthlyClock(s, world, never);
  assert.equal(s.nilfgaard.stage, 'pressure');
  assert.ok(!mayStartWar(s, 'nilfgaard'), 'nor while it presses');
  // Held by its gate (as M33 will), the war does not come.
  s.nilfgaard.warDay = Infinity;
  s.day += 2000;
  monthlyClock(s, world, never);
  assert.equal(s.nilfgaard.stage, 'pressure');
  assert.ok(!gateOpen(s, world));
  // The gate opens: war, and the Empire musters against Cintra first.
  s.nilfgaard.warDay = s.day;
  monthlyClock(s, world, never);
  assert.equal(s.nilfgaard.stage, 'war');
  assert.ok(mayStartWar(s, 'nilfgaard'));
  assert.equal(nextAim(s, world), 'cintra_city');
  const muster = (s.musters ?? []).find((m) => m.realm === 'nilfgaard');
  assert.ok(muster, 'an army gathers');
  assert.equal(muster.against, 'cintra');
  assert.equal(muster.aim, 'cintra_city');
});

test('the aims come in order: Cintra, then Sodden and Brugge, then the road to the Pontar', () => {
  const s = createState(world, 3);
  assert.deepEqual(world.war.clock.aims.slice(0, 3), ['cintra_city', 'sodden_keep', 'brugge_city']);
  s.realms.cintra.settlements.cintra_city.owner = 'nilfgaard';
  assert.equal(nextAim(s, world), 'sodden_keep');
});

test('Pressure: raids, refugees, demands, petty kings courted, and the North afraid', () => {
  const s = createState(world, 4);
  s.day = s.nilfgaard.pressureDay;
  const before = s.chronicle.length;
  const sum = () => ['cintra', 'sodden', 'brugge'].reduce((t, r) => t + Object.values(s.realms[r].settlements).reduce((a, x) => a + x.prosperity, 0), 0);
  const prosperity = sum();
  for (let m = 0; m < 6; m++) {
    monthlyClock(s, world, always);
    s.day += 30;
  }
  const lines = s.chronicle.slice(before).map((c) => c.text).join('\n');
  assert.match(lines, /From the south: /);
  assert.match(lines, /riders cross the Yaruga/);
  assert.match(lines, /Refugees/);
  assert.match(lines, /demands that Cintra/);
  assert.ok(sum() < prosperity, 'raids hurt');
  assert.ok(['brugge', 'sodden'].some((r) => s.realms[r].suzerain === 'nilfgaard'), 'Brugge or Sodden courted');
  assert.ok((s.conquest.fear.redania?.nilfgaard ?? 0) > 0, 'the North fears the Empire');
  assert.ok(clockThreat(s, world, 'verden'), 'petty kings near feel its shadow');
  assert.ok(!clockThreat(s, world, 'hengfors'), 'far ones do not');
});

test('fear binds the North into a league that answers the Empire\'s wars', () => {
  const s = createState(world, 5);
  s.day = s.nilfgaard.warDay;
  s.nilfgaard.stage = 'war';
  for (const rid of ['redania', 'kaedwen', 'aedirn', 'cintra', 'lyria_rivia']) (s.conquest.fear[rid] ??= {}).nilfgaard = 60;
  s.wars = [{ id: 501, sides: [['nilfgaard'], ['cintra']], start: s.day, aims: {}, taken: [] }];
  monthlyClock(s, world, always);
  assert.ok(s.nilfgaard.league?.members.includes('redania'));
  assert.ok(s.wars[0].sides[1].length > 1, 'a member answers the call');
});

test('a line from the south in the Steward\'s report, and an older save gains the clock', () => {
  let s = step(createState(world, 6), 40, world, { ambient: false });
  assert.match(clockLine(s, world), /Imperial envoys/);
  assert.match(stewardReport(s, world).south, /Imperial envoys/);
  const old = JSON.parse(serialize(s));
  old.version = 32;
  old.state.version = 32;
  delete old.state.nilfgaard;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.nilfgaard.stage, 'watching');
  assert.ok(up.nilfgaard.warDay >= up.day + 365);
});
