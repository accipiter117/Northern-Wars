// The great powers' spies at work on each other (M31 D): spending by
// temperament, operations against rivals and enemies (knives only in war),
// the Empire against the whole North once its clock presses, exposure, and
// what Temeria hears.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/sim/index.js';
import { monthlySpyAI, aiTargets } from '../../src/sim/spyai.js';
import { aiSpend, netGrowth } from '../../src/sim/spies.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const AI = world.spies.operations.ai;
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };
// Only the month's roll to act comes up: never found out.
const only = (v) => ({ chance: (p) => Math.abs(p - v) < 1e-9, next: () => 0, int: () => 0, pick: (l) => l[0] });
const quiet = only(AI.chance * world.spies.owners.redania.spend);
const trustIs = (s, a, b, v) => { ((s.diplomacy.trust[a] ??= {}))[b] = v; };

test('the great powers spend by temperament, the Emperor more once his clock presses', () => {
  const s = createState(world, 1);
  assert.ok(aiSpend(s, world, 'nilfgaard') > aiSpend(s, world, 'redania'));
  assert.ok(aiSpend(s, world, 'redania') > aiSpend(s, world, 'aedirn'));
  assert.ok(aiSpend(s, world, 'aedirn') > aiSpend(s, world, 'kaedwen'));
  const calm = netGrowth(s, world, 'nilfgaard', 'aedirn');
  s.nilfgaard.stage = 'pressure';
  assert.ok(aiSpend(s, world, 'nilfgaard') > world.spies.owners.nilfgaard.spend);
  assert.ok(netGrowth(s, world, 'nilfgaard', 'aedirn') > calm);
});

test('a power works only where its network reaches and it has a quarrel', () => {
  const s = createState(world, 1);
  for (const r of Object.keys(s.diplomacy.trust.redania ?? {})) s.diplomacy.trust.redania[r] = 60;
  s.spycraft.nets.redania.kaedwen = 60;
  trustIs(s, 'redania', 'kaedwen', 60);
  assert.ok(!aiTargets(s, world, 'redania').some((x) => x.realm === 'kaedwen'), 'no quarrel');
  trustIs(s, 'redania', 'kaedwen', 20);
  assert.ok(aiTargets(s, world, 'redania').some((x) => x.realm === 'kaedwen'), 'a rival');
  s.spycraft.nets.redania.kaedwen = 30;
  assert.ok(!aiTargets(s, world, 'redania').some((x) => x.realm === 'kaedwen'), 'too shallow');
});

test('the Empire works against the whole North once its clock presses', () => {
  const s = createState(world, 1);
  for (const r of Object.keys(s.realms)) trustIs(s, 'nilfgaard', r, 60);
  s.spycraft.nets.nilfgaard.kovir = 60;
  s.nilfgaard.stage = 'watching';
  assert.ok(!aiTargets(s, world, 'nilfgaard').some((x) => x.realm === 'kovir'));
  s.nilfgaard.stage = 'pressure';
  assert.ok(aiTargets(s, world, 'nilfgaard').some((x) => x.realm === 'kovir'));
});

test('a rival\'s court is stirred, never knifed in peace; at war, its commanders die', () => {
  const s = createState(world, 1);
  for (const o of ['nilfgaard', 'aedirn', 'kaedwen']) s.spycraft.nets[o] = Object.fromEntries(Object.keys(s.spycraft.nets[o]).map((r) => [r, 0]));
  for (const r of Object.keys(s.realms)) trustIs(s, 'redania', r, 60);
  s.spycraft.nets.redania = Object.fromEntries(Object.keys(s.spycraft.nets.redania).map((r) => [r, 0]));
  s.spycraft.nets.redania.kaedwen = 95;
  trustIs(s, 'redania', 'kaedwen', 20);
  s.realms.kaedwen.army = 8000;
  const towns = Object.values(s.realms.kaedwen.settlements).map((x) => x.prosperity);
  monthlySpyAI(s, world, quiet);
  const log = s.spycraft.aiLog.redania;
  assert.equal(log.done, 1);
  assert.equal(log.assassinate ?? 0, 0, 'no knife in peace');
  assert.ok(Object.values(s.realms.kaedwen.settlements).some((x, i) => x.prosperity < towns[i]));
  // Rested there for a while.
  monthlySpyAI(s, world, quiet);
  assert.equal(s.spycraft.aiLog.redania.done, 1);
  // At war: a commander.
  const t = createState(world, 1);
  t.spycraft.nets = { temeria: t.spycraft.nets.temeria, redania: { kaedwen: 95 } };
  t.realms.kaedwen.army = 8000;
  t.wars = [{ id: 99, sides: [['redania'], ['kaedwen']], start: t.day, reason: 'claim' }];
  monthlySpyAI(t, world, only(AI.chance * world.spies.owners.redania.spend * AI.atWar));
  assert.equal(t.spycraft.aiLog.redania.assassinate, 1);
  assert.ok(t.realms.kaedwen.army < 8000 || (t.armies ?? []).some((a) => a.side === 'kaedwen'));
});

test('found out, the work fails and the target remembers', () => {
  const s = createState(world, 1);
  s.spycraft.nets = { temeria: s.spycraft.nets.temeria, nilfgaard: { cintra: 70 } };
  s.nilfgaard.stage = 'pressure';
  const t0 = s.diplomacy.trust.cintra?.nilfgaard ?? world.diplomacy.trust.start;
  monthlySpyAI(s, world, always);
  assert.equal(s.spycraft.aiLog.nilfgaard.exposed, 1);
  assert.equal(s.spycraft.nets.nilfgaard.cintra, 70 - world.spies.operations.depthLoss);
  assert.ok((s.diplomacy.trust.cintra?.nilfgaard ?? 50) < t0);
});
