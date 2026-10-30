// Armies and figures on the move (M23 C): days to arrive; two armies made
// one under the marshal the crown chooses; an army that marches to join
// another and becomes one with it; an army divided with nothing lost; and
// figures on the road set going by real acts (a spy, an envoy, a summoned
// lord, a marshal riding to his army, a petition's courier) and gone when
// they arrive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, serialize, deserialize, daysToArrive, figurePosition, describeFigure } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};
const raise = (over = {}) => ({ type: 'raise', muster: 'vizima', levy: 'third', nobles: false, mercs: [], units: [], marshal: 'vestibor', stance: 'cautious', ...over });
const marshals = Object.keys(world.war.marshals);

test('an army on the march knows how many days it has left', () => {
  let s = quiet(run(createState(world, 1), 30));
  s.treasury = 9000;
  s = act(s, raise());
  const a = s.armies.find((x) => x.side === 'temeria');
  a.gatherUntil = 0;
  s = act(s, { type: 'army', army: a.id, order: 'defend', target: 'maribor' });
  s = run(s, 1);
  const b = s.armies.find((x) => x.id === a.id);
  const left = daysToArrive(s, world, b);
  assert.ok(left > 0, `${left} days`);
  // A day later it has a day less to go (give or take the road's turns).
  s = run(s, 1);
  const c = s.armies.find((x) => x.id === a.id);
  if (c.to || c.path.length) assert.ok(daysToArrive(s, world, c) <= left);
  let n = 0;
  while ((s.armies.find((x) => x.id === a.id).at !== 'maribor' || s.armies.find((x) => x.id === a.id).to) && n < 60) { s = run(s, 1); n++; }
  assert.ok(n <= left + 3, `arrived in ${n + 1} days, promised ${left}`);
  assert.equal(daysToArrive(s, world, s.armies.find((x) => x.id === a.id)), 0);
});

test('two armies become one under the marshal the crown chooses', () => {
  let s = quiet(run(createState(world, 2), 30));
  s.treasury = 12000;
  s = act(s, raise({ marshal: marshals[0] }));
  s = act(s, raise({ marshal: marshals[1], levy: 'third' }));
  const [a, b] = s.armies.filter((x) => x.side === 'temeria');
  const men = a.soldiers + b.soldiers;
  assert.match(applyAction(s, world, { type: 'merge', army: b.id, into: a.id, marshal: marshals[2] }).error, /one of the two/);
  s = act(s, { type: 'merge', army: b.id, into: a.id, marshal: marshals[1] });
  const m = s.armies.find((x) => x.id === a.id);
  assert.equal(m.marshal, marshals[1], 'the chosen marshal leads');
  assert.ok(Math.abs(m.soldiers - men) < 1);
  assert.equal(s.armies.filter((x) => x.side === 'temeria').length, 1);
});

test('an army marches to join another, and becomes one with it', () => {
  let s = quiet(run(createState(world, 3), 30));
  s.treasury = 12000;
  s = act(s, raise({ marshal: marshals[0] }));
  s = act(s, raise({ muster: 'maribor', marshal: marshals[1] }));
  const a = s.armies.find((x) => x.side === 'temeria' && x.at === 'vizima');
  const b = s.armies.find((x) => x.side === 'temeria' && x.at === 'maribor');
  a.gatherUntil = 0;
  b.gatherUntil = 0;
  const men = a.soldiers + b.soldiers;
  s = act(s, { type: 'army', army: a.id, order: 'join', target: b.id });
  assert.match(s.chronicle.at(-1).text, /marches to join/);
  let n = 0;
  while (s.armies.some((x) => x.id === a.id) && n < 80) { s = run(s, 1); n++; }
  assert.ok(!s.armies.some((x) => x.id === a.id), 'it joined');
  const j = s.armies.find((x) => x.id === b.id);
  assert.equal(j.at, 'maribor');
  assert.equal(j.marshal, marshals[1], 'under the marshal of the army it joined');
  assert.ok(j.soldiers > men * 0.85 && j.soldiers <= men + 1, `${j.soldiers} of ${men}`);
  assert.ok(s.chronicle.some((c) => /joins/.test(c.text)));
});

test('an army divides, its companies and men carried with them, nothing lost', () => {
  let s = quiet(run(createState(world, 4), 30));
  s.treasury = 12000;
  s = act(s, { type: 'recruit', settlement: 'vizima', kind: 'menatarms' });
  s = act(s, raise({ marshal: marshals[0], levy: 'half', mercs: ['kovir'], units: [s.forces.companies[0].id] }));
  const a = s.armies.find((x) => x.side === 'temeria');
  const total = a.soldiers;
  const names = a.bands.map((b) => b.name).sort();
  // The standing company and the hired men march apart, under a second marshal.
  const pick = a.bands.map((b, i) => (b.source === 'standing' || b.source === 'mercenary' ? i : -1)).filter((i) => i >= 0);
  assert.match(applyAction(s, world, { type: 'split', army: a.id, bands: a.bands.map((_, i) => i) }).error, /not all/);
  assert.match(applyAction(s, world, { type: 'split', army: a.id, bands: pick, marshal: marshals[0] }).error, /already leads/);
  s = act(s, { type: 'split', army: a.id, bands: pick, marshal: marshals[1] });
  const [x, y] = [s.armies.find((v) => v.id === a.id), s.armies.find((v) => v.side === 'temeria' && v.id !== a.id)];
  assert.ok(y, 'a new army');
  assert.equal(y.at, x.at);
  assert.equal(y.marshal, marshals[1]);
  assert.ok(Math.abs(x.soldiers + y.soldiers - total) < 1, 'no man lost');
  assert.deepEqual([...x.bands, ...y.bands].map((b) => b.name).sort(), names, 'every company keeps its name');
  assert.ok(y.bands.every((b) => ['standing', 'mercenary'].includes(b.source)));
  assert.ok(y.mercs.some((m) => m.id === 'kovir') && !x.mercs.some((m) => m.id === 'kovir'), 'the hired men go with their companies');
  const c = s.forces.companies[0];
  assert.equal(c.army, y.id, 'the standing company marches with the new army');
  // Both still march and fight: a day passes cleanly, and the save holds.
  s = run(s, 2);
  assert.equal(deserialize(serialize(s), world).armies.length, s.armies.length);
});

test('figures on the road go by real acts, move along their way, and are gone when they arrive', () => {
  let s = quiet(run(createState(world, 5), 20));
  s.treasury = 12000;
  // A spy into Redania.
  s = act(s, { type: 'spy', realm: 'redania' });
  // A lord summoned to court.
  const hid = Object.keys(world.houses.houses)[0];
  s = act(s, { type: 'house', house: hid, kind: 'summon' });
  // A marshal riding to an army mustered away from the court.
  s = act(s, raise({ muster: 'maribor', marshal: marshals[2] }));
  const kinds = s.figures.map((f) => f.kind).sort();
  assert.ok(kinds.includes('lord') && kinds.includes('commander'), kinds.join(', '));
  // The spy rides only if he was not caught at once.
  if (s.spies?.redania > s.day) assert.ok(kinds.includes('spy'));
  for (const f of s.figures) {
    assert.ok(f.end > f.start);
    const p0 = figurePosition(world, f, f.start);
    const p1 = figurePosition(world, f, f.end);
    assert.ok(Math.hypot(p0.x - world.byId[f.from].x, p0.y - world.byId[f.from].y) < 1e-6);
    assert.ok(Math.hypot(p1.x - world.byId[f.to].x, p1.y - world.byId[f.to].y) < 1e-6);
    assert.match(describeFigure(s, world, f), /days to go|Arrives tomorrow/);
  }
  assert.match(describeFigure(s, world, s.figures.find((f) => f.kind === 'lord')), new RegExp(`${world.houses.houses[hid].lord}, riding from .* to Vizima: summoned to court`));
  // An envoy ordered to a court reaches it as the month turns.
  if (world.board) {
    const out = applyAction(s, world, { type: 'order', order: { kind: 'envoy', realm: 'kaedwen' } });
    if (!out.error) {
      s = out.state;
      const e = s.figures.find((f) => f.kind === 'envoy');
      assert.ok(e && e.to === world.realms.realms.kaedwen.capital);
    }
  }
  // All are gone once the longest has arrived; nothing in the rules changed.
  const last = Math.max(...s.figures.map((f) => f.end));
  s = run(s, last - s.day + 1);
  assert.ok(!s.figures.some((f) => f.start < last - 40 && f.end <= s.day), 'arrived figures are cleared');
});

test('figures do not change the realm: the same seed with and without them plays the same', () => {
  const a = run(createState(world, 6), 120);
  const b = createState(world, 6);
  b.figures = undefined;
  const c = run(b, 120);
  const strip = (x) => JSON.stringify({ ...x, figures: null, nextFigureId: null });
  assert.equal(strip(a), strip(c));
});

test('a version 24 save gains its figures, none on the road', () => {
  const s = run(createState(world, 7), 20);
  delete s.figures;
  delete s.nextFigureId;
  s.version = 24;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 24, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.deepEqual(up.figures, []);
  assert.equal(up.nextFigureId, 1);
});
