// Counter-espionage (M31 C): foreign agents caught at home by the
// spymaster and the laws, the caught agent as a decision (hang, turn, trade
// back, follow), foreign operations against Temeria with their clues, and a
// traitor spymaster unmasked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, dilemmaText } from '../../src/sim/index.js';
import { monthlyCounter, catchChance, resolveCaught, caughtText } from '../../src/sim/counter.js';
import { dilemmasOf } from '../../src/sim/dilemmas.js';
import { signLaws, nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const C = world.spies.counter;
const never = { chance: () => false, next: () => 0, int: () => 0, pick: (l) => l[0] };
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };
const trust = (s, a, b) => s.diplomacy.trust[a]?.[b] ?? world.diplomacy.trust.start;
const spymaster = (s, trait = 'loyal', skill = 60) => { s.spycraft.spymaster = { id: 1, name: 'Test Master', from: 'a test', trait, skill, since: s.day }; };
const caught = (s) => s.dilemmas.open.filter((o) => o.agent);

test('the watch catches more where networks run deep, with a spymaster and the laws', () => {
  const s = createState(world, 1);
  const bare = catchChance(s, world, 'redania');
  assert.ok(catchChance(s, world, 'redania') > catchChance(s, world, 'kaedwen'), 'a deeper network loses more agents');
  spymaster(s);
  const watched = catchChance(s, world, 'redania');
  assert.ok(watched > bare);
  signLaws(s, world, 'curfews');
  assert.ok(catchChance(s, world, 'redania') > watched, 'curfews catch agents too');
});

test('a caught agent comes before the crown, one at a time', () => {
  const s = createState(world, 1);
  s.day += 100;
  monthlyCounter(s, world, { ...always, chance: (p) => p < 0.5 });
  assert.equal(caught(s).length, 1);
  const o = caught(s)[0];
  const t = dilemmaText(s, world, o);
  assert.match(t.title, /An agent of .* is taken/);
  assert.equal(t.choices.length, 4);
  monthlyCounter(s, world, always);
  assert.equal(caught(s).length, 1, 'one waits at a time');
});

function withAgent(owner = 'redania') {
  const s = createState(world, 1);
  const d = dilemmasOf(s);
  const o = { id: d.nextId++, agent: owner, realm: owner, op: null, day: s.day };
  d.open.push(o);
  return { s, o };
}

test('hang: Fear, their network hurt, their ruler angry', () => {
  const { s, o } = withAgent();
  const n0 = s.spycraft.nets.redania.temeria;
  const r0 = s.neighbours.redania.relation;
  const t0 = trust(s, 'redania', 'temeria');
  const f0 = s.meters?.fear ?? s.fear;
  const r = applyAction(s, world, { type: 'dilemma', id: o.id, choice: 0 });
  assert.ok(!r.error);
  const n = r.state;
  assert.equal(n.spycraft.nets.redania.temeria, n0 - C.hang.network);
  assert.equal(n.neighbours.redania.relation, r0 + C.hang.relation);
  assert.equal(trust(n, 'redania', 'temeria'), t0 + C.hang.trust);
  assert.ok((n.meters?.fear ?? n.fear) >= f0);
  assert.equal(caught(n).length, 0);
});

test('turn: our network deepens, or we are played', () => {
  let won = null;
  let lost = null;
  for (let seed = 1; seed < 40 && !(won && lost); seed++) {
    const { s, o } = withAgent();
    s.rng.game = seed;
    const n = applyAction(s, world, { type: 'dilemma', id: o.id, choice: 1 }).state;
    if (n.spycraft.played) lost ??= { s, n };
    else won ??= { s, n };
  }
  assert.ok(won && lost);
  assert.equal(won.n.spycraft.nets.temeria.redania, won.s.spycraft.nets.temeria.redania + C.turn.gain);
  assert.equal(lost.n.spycraft.nets.redania.temeria, lost.s.spycraft.nets.redania.temeria + C.turn.failGain);
});

test('trade back: trust and goodwill; follow: their depth known, a traitor unmasked', () => {
  const a = withAgent('aedirn');
  const t0 = trust(a.s, 'aedirn', 'temeria');
  resolveCaught(a.s, world, a.o, 2);
  assert.equal(trust(a.s, 'aedirn', 'temeria'), t0 + C.trade.trust);
  const b = withAgent('nilfgaard');
  spymaster(b.s, 'greedy');
  b.s.spycraft.spymaster.turned = 'nilfgaard';
  const n = applyAction(b.s, world, { type: 'dilemma', id: b.o.id, choice: 3 }).state;
  assert.equal(n.spycraft.spymaster, null, 'the traitor is taken');
  assert.equal(n.spycraft.lost.how, 'unmasked');
  assert.ok(n.spycraft.known.nilfgaard > n.day);
  assert.ok(n.chronicle.some((c) => /traitor/.test(c.text)));
});

test('left unanswered, the watch hangs the spy', () => {
  const { s, o } = withAgent();
  const n0 = s.spycraft.nets.redania.temeria;
  const t = step(s, world.dilemmas.defaultDays + 1, world, { ambient: false });
  assert.ok(!t.dilemmas.open.some((x) => x.id === o.id));
  assert.ok(t.spycraft.nets.redania.temeria < n0);
});

test('foreign networks work against Temeria, leave clues, and a spymaster names them', () => {
  const s = createState(world, 1);
  s.spycraft.nets.nilfgaard.temeria = 65;
  s.day += 100;
  // Not caught at it: the work is done and a clue left.
  const quiet = { chance: (p) => p === C.foreignOps.chance * world.spies.owners.nilfgaard.spend * (s.nilfgaard?.stage !== 'watching' ? C.foreignOps.pressure : 1) || p >= 0.999, next: () => 0, int: () => 0, pick: (l) => l[0] };
  const loyalty = Object.fromEntries(Object.entries(s.houses).map(([h, x]) => [h, x.loyalty]));
  const unrest = Object.fromEntries(Object.entries(s.settlements).map(([id, x]) => [id, x.unrest]));
  monthlyCounter(s, world, quiet);
  assert.equal(s.spycraft.clues?.length, 1);
  const k = s.spycraft.clues[0];
  assert.equal(k.owner, 'nilfgaard');
  assert.equal(k.kind, 'stir', 'the deepest work its network allows');
  assert.ok(Object.entries(s.settlements).some(([id, x]) => x.unrest > unrest[id]));
  assert.ok(Object.values(s.houses).every((x, i) => x.loyalty <= Object.values(loyalty)[i]));
  // Named in time by a spymaster.
  spymaster(s, 'cautious', 75);
  s.spycraft.nets.nilfgaard.temeria = 0;
  monthlyCounter(s, world, { ...never, chance: (p) => p === C.nameChance * 1.5 });
  assert.equal(s.spycraft.clues[0].named, true);
  assert.ok(s.chronicle.at(-1).text.includes('Nilfgaard') || s.chronicle.at(-1).text.includes('Empire'));
});

test('caught at their work, the agent comes before the crown', () => {
  const s = createState(world, 1);
  s.spycraft.nets.redania.temeria = 55;
  s.day += 100;
  monthlyCounter(s, world, always);
  const o = caught(s)[0];
  assert.ok(o);
  assert.equal(caughtText(s, world, o).choices.length, 4);
});
