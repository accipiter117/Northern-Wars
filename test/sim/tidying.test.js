// The great tidying, Part A (M34): flooded gold seams surfaced and reopened
// with one order, and repair and levy hands on call where work is short.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction } from '../../src/sim/index.js';
import { closedSeams, activeMines } from '../../src/sim/gold.js';
import { startWar } from '../../src/sim/war.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

test('the known flooded seams are listed with their cost, time and yield', () => {
  const s = createState(world, 1);
  const seams = closedSeams(s, world);
  const known = Object.entries(world.gold.deposits).filter(([, d]) => d.known).map(([id]) => id);
  assert.deepEqual(seams.map((m) => m.id).sort(), known.sort());
  for (const m of seams) {
    assert.ok(m.coin > 0 && m.days > 0 && m.monthly > 0, m.id);
  }
  assert.equal(activeMines(s, world).length, 0, 'none works at the start');
});

test('one order reopens a seam, and once mended it is staffed and pays', () => {
  let s = createState(world, 1);
  s.treasury = 10000;
  const m = closedSeams(s, world).find((x) => x.id === 'carreras_seam');
  const r = applyAction(s, world, { type: 'repair', settlement: m.settlement, building: 'goldmine', kind: 'rebuild' });
  assert.ok(!r.error, r.error);
  s = r.state;
  assert.ok(!closedSeams(s, world).some((x) => x.id === 'carreras_seam'), 'no longer waiting');
  s = step(s, m.days + 40, world, { ambient: false });
  assert.ok(activeMines(s, world).some((x) => x.id === 'carreras_seam'), 'working');
  assert.ok(s.ledger.history.at(-1).income.gold > 0, 'gold in the ledger');
  assert.ok((s.settlements.carreras.staff?.goldmine ?? 0) > 0, 'manned from the mines share');
});

test('under the standing order the flooded seams wait on the month\'s card of dear repairs', () => {
  let s = createState(world, 1);
  s = step(s, 40, world, { ambient: false });
  const card = s.works.decisions.find((d) => d.kind === 'batch');
  assert.ok(card, 'a card of dear repairs');
  assert.ok(card.items.some((q) => q.works === 'goldmine' && q.town === 'carreras'));
});

test('repair and levy hands with nothing to do are on call where hands are short', () => {
  let s = createState(world, 1);
  s = step(s, 60, world, { ambient: false });
  const r = s.labour.report;
  assert.equal(r.repairs.onCall, r.repairs.hands, 'no masons wanted yet');
  assert.equal(r.levies.onCall, r.levies.hands, 'no war');
  const helped = ['fields', 'fishing', 'mines', 'crafts'].reduce((a, k) => a + (r[k].helped ?? 0), 0);
  assert.ok(helped > 0, 'they help somewhere');
  assert.ok(r.fields.staffed >= Math.min(r.fields.need, r.fields.hands), 'the fields no shorter than their own hands could make them');
  // At war the levies stand to; with a repair under way some masons go to it.
  startWar(s, world, makeRng(1), 'kaedwen', 'temeria', 'test');
  s.treasury = 10000;
  s = applyAction(s, world, { type: 'repair', settlement: 'carreras', building: 'goldmine', kind: 'rebuild' }).state;
  s = step(s, 2, world, { ambient: false });
  assert.equal(s.labour.report.levies.onCall ?? 0, 0);
  assert.ok((s.labour.report.repairs.onCall ?? 0) < s.labour.report.repairs.hands);
});
