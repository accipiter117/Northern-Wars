// M28: repairs leave the inbox; dilemmas follow from the crown's laws; the
// realm demands change, and remembers promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction } from '../../src/sim/index.js';
import { damageWorks, repairOptions } from '../../src/sim/works.js';
import { monthlyDilemmas, dilemmasOf, resolveDilemma, settlePromises, dilemmaText } from '../../src/sim/dilemmas.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();

const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};

function cheapAndDear(s) {
  // The cheapest and the dearest works in the realm, to break.
  const all = [];
  for (const [id, t] of Object.entries(s.settlements)) for (const b of t.buildings) all.push({ id, b, coin: world.buildings[b]?.cost?.coin ?? 0 });
  all.sort((a, b) => a.coin - b.coin);
  return { cheap: all.find((x) => x.coin > 0), dear: all[all.length - 1] };
}

test('under the default order a cheap repair starts without a notice', () => {
  let s = createState(world, 3);
  s.treasury = 20000;
  const { cheap } = cheapAndDear(s);
  damageWorks(s, world, cheap.id, cheap.b, 60, 'Test');
  assert.ok(repairOptions(s, world, cheap.id, cheap.b).rebuild.coin <= 400);
  assert.equal(s.works.decisions.length, 0, 'no question in the inbox');
  s = step(s, 31, world, { ambient: false });
  assert.ok(s.settlements[cheap.id].repair?.[cheap.b] || (s.settlements[cheap.id].cond?.[cheap.b] ?? 100) >= 70, 'it is being mended');
  assert.ok(!s.works.decisions.some((d) => d.kind === 'repair'));
});

test('dear repairs gather into one card a month; asking each time restores the old way', () => {
  let s = createState(world, 4);
  s.treasury = 50000;
  const breaks = [];
  for (const [id, t] of Object.entries(s.settlements)) for (const b of t.buildings) if ((world.buildings[b]?.cost?.coin ?? 0) >= 1500 && breaks.length < 3) breaks.push({ id, b });
  for (const x of breaks) damageWorks(s, world, x.id, x.b, 90, 'Test');
  s = step(s, 31, world, { ambient: false });
  const batches = s.works.decisions.filter((d) => d.kind === 'batch');
  assert.ok(batches.length <= 1, 'at most one card');
  assert.ok(!s.works.decisions.some((d) => d.kind === 'repair'), 'no one-by-one questions');
  const t = act(s, { type: 'repairOrder', mode: 'ask' });
  const { cheap } = cheapAndDear(t);
  damageWorks(t, world, cheap.id, cheap.b, 60, 'Test');
  assert.ok(t.works.decisions.some((d) => d.kind === 'repair' && d.town === cheap.id), 'asked about one by one');
});

test('every path of the Book of Laws has at least two dilemmas of its own', () => {
  for (const ch of Object.values(world.book.chapters)) {
    for (const [pid, p] of Object.entries(ch.paths)) {
      const ids = new Set(p.laws.map((l) => l.id));
      const n = Object.values(world.dilemmas.dilemmas).filter((x) => (x.when?.laws ?? []).some((id) => ids.has(id))).length;
      assert.ok(n >= 2, `${pid}: ${n}`);
    }
  }
  assert.ok(Object.keys(world.dilemmas.dilemmas).length >= 40);
});

test('a dilemma follows from a law signed, and its answer does what it says', () => {
  const s = createState(world, 5);
  signLaws(s, world, 'curfews', 'executions');
  const d = dilemmasOf(s);
  let found = null;
  for (let i = 0; i < 40 && !found; i++) {
    s.day += 31;
    monthlyDilemmas(s, world, makeRng(100 + i));
    found = d.open.find((o) => o.dilemma && (world.dilemmas.dilemmas[o.dilemma].when?.laws ?? []).includes('executions'));
    for (const o of [...d.open]) if (o !== found) resolveDilemma(s, world, o.id, 0, true);
  }
  assert.ok(found, 'an Iron Hand dilemma came');
  const def = world.dilemmas.dilemmas[found.dilemma];
  const i = def.choices.findIndex((c) => c.fx?.fear);
  const before = s.fear;
  assert.ok(resolveDilemma(s, world, found.id, i));
  assert.notEqual(s.fear, before);
  assert.ok(!d.open.includes(found));
  // Each choice says what it does.
  const t = dilemmaText(s, world, { ...found, id: 999 });
  assert.ok(t.choices.every((c) => c.hint && c.hint.length > 0));
});

test('a dilemma is not drawn twice within two years', () => {
  const s = createState(world, 6);
  signLaws(s, world, 'curfews', 'executions', 'riders');
  const seen = {};
  for (let i = 0; i < 24; i++) {
    s.day += 31;
    monthlyDilemmas(s, world, makeRng(200 + i));
    for (const o of [...dilemmasOf(s).open]) {
      if (o.dilemma) {
        assert.ok(!seen[o.dilemma], `${o.dilemma} twice`);
        seen[o.dilemma] = true;
      }
      resolveDilemma(s, world, o.id, 0, true);
    }
  }
});

test('a demand promised and kept pleases; one broken angers; crushing silences', () => {
  const base = createState(world, 7);
  const d = dilemmasOf(base);
  d.open.push({ id: d.nextId++, demand: 'burghers_markets', day: base.day });
  // Kept.
  let s = structuredClone(base);
  assert.ok(resolveDilemma(s, world, dilemmasOf(s).open[0].id, 0));
  assert.equal(dilemmasOf(s).promises.length, 1);
  const love = s.love;
  signLaws(s, world, 'open_markets');
  settlePromises(s, world);
  assert.equal(dilemmasOf(s).promises.length, 0);
  assert.ok(s.love > love, 'a promise kept');
  // Broken.
  s = structuredClone(base);
  resolveDilemma(s, world, dilemmasOf(s).open[0].id, 0);
  const love2 = s.love;
  s.day += world.dilemmas.demands.deadline + 1;
  settlePromises(s, world);
  assert.ok(s.love < love2, 'a promise broken');
  // Crushed.
  s = structuredClone(base);
  const fear = s.fear;
  resolveDilemma(s, world, dilemmasOf(s).open[0].id, 2);
  assert.ok(s.fear > fear);
  assert.ok(dilemmasOf(s).silenced.burghers > s.day);
});

test('a reign at peace sees a few real decisions a month and at most one repair card', () => {
  let s = createState(world, 11);
  // A crown with a few laws in its Book, as any reign a year in has.
  signLaws(s, world, 'assizes', 'open_markets', 'seasonal_conscription', 'poor_relief', 'freedom_of_worship');
  const counts = { dilemmas: 0, repairs: 0, months: 0 };
  const seen = new Set();
  for (let m = 0; m < 36; m++) {
    s = step(s, 30, world, { ambient: false });
    counts.months += 1;
    for (const o of s.dilemmas?.open ?? []) if (!seen.has(`d${o.id}`)) { seen.add(`d${o.id}`); counts.dilemmas += 1; }
    const cards = (s.works?.decisions ?? []);
    assert.ok(cards.filter((d) => d.kind === 'repair').length === 0, 'no one-by-one repair questions');
    assert.ok(cards.filter((d) => d.kind === 'batch').length <= 1, 'at most one repair card');
    for (const d of cards) if (!seen.has(`w${d.id}`)) { seen.add(`w${d.id}`); counts.repairs += 1; }
    // The crown answers everything at once, taking the first choice.
    for (const o of [...(s.dilemmas?.open ?? [])]) s = applyAction(s, world, { type: 'dilemma', id: o.id, choice: 1 }).state;
  }
  const perMonth = counts.dilemmas / counts.months;
  assert.ok(perMonth >= 0.5 && perMonth <= 2, `${perMonth.toFixed(2)} dilemmas a month`);
  assert.ok(counts.repairs / counts.months <= 1, `${counts.repairs} repair cards in ${counts.months} months`);
});
