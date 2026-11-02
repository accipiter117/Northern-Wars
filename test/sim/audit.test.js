// The audit kept as a test (M34 E): a ten-year reign with the steward crown
// must leave no works or resource dead, show no ledger line at 0, and every
// act with a rest must sit on the crown's hand; every sub-screen a link
// names must exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createState, step, applyAction } from '../../src/sim/index.js';
import { audit, worksLines } from '../../tools/audit.mjs';
import { groupedLines, INCOME_GROUPS, EXPENSE_GROUPS } from '../../src/ui/menu.js';
import { handRows, HAND_KINDS } from '../../src/ui/hand.js';
import { SUBS, MOVED, canonicalTab } from '../../src/ui/router.js';
import { OPERATIONS } from '../../src/sim/index.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const reign = audit(world, 10, 1);

test('every kind of works that stands for ten years produces something', () => {
  const producers = Object.keys(reign.standing).filter((b) => worksLines(world, b).length);
  assert.ok(producers.length >= 20, `${producers.length} producing kinds`);
  for (const b of producers) {
    const lines = worksLines(world, b);
    assert.ok(lines.some((k) => (reign.lines[k]?.total ?? 0) > 0), `${b} filled none of ${lines.join(', ')}`);
  }
});

test('every resource is made and moves', () => {
  for (const k of ['grain', 'materials', 'iron', 'cloth', 'luxuries', 'crowns']) assert.ok(reign.lines[`output.${k}`].total > 0, k);
  for (const g of ['food', 'timber', 'stone', 'iron']) {
    const x = reign.lines[`stock.${g}`];
    assert.ok(x.max > x.min, `${g} stock never changed`);
  }
  for (const k of ['fields', 'woods', 'mines', 'pastures', 'fishing', 'crafts']) assert.ok(reign.labour[k].staffed > 0, `${k} unmanned`);
});

test('no ledger line or group is shown at 0, in any month of the reign', () => {
  const history = reign.s.ledger.history;
  assert.ok(history.length >= 12);
  for (const l of history) {
    for (const [from, groups] of [[l.income, INCOME_GROUPS], [l.expenses, EXPENSE_GROUPS]]) {
      for (const g of groupedLines(from, groups, {}, l)) {
        assert.ok(Math.round(g.v) !== 0 || g.id === 'taxes', `group ${g.id} at 0`);
        for (const [k, , v] of g.lines) assert.notEqual(Math.round(v), 0, `${g.id}.${k} at 0`);
      }
    }
  }
});

test('every act with a rest belongs to the crown\'s hand', () => {
  const R = HAND_KINDS.rulers;
  const has = (kinds, list, what) => {
    for (const k of list) assert.ok(kinds.includes(k), `${what}: ${k} is not on the hand`);
  };
  has([...HAND_KINDS.people, ...HAND_KINDS.book], Object.keys(world.meters.acts).filter((k) => k !== 'note'), 'the people and the Book');
  has(HAND_KINDS.calls, Object.entries(world.labour.calls).filter(([, c]) => c.days).map(([k]) => k), 'royal calls');
  has(Object.keys(R.audience), Object.entries(world.diplomacy.actions).filter(([, a]) => a.cooldown).map(([k]) => k), 'audiences');
  has(Object.keys(R.vassal), Object.keys(world.diplomacy.vassals.actions), 'vassal orders');
  has(Object.keys(R.suzerain), ['offer', 'press'], 'protection and pressure');
  assert.deepEqual([...OPERATIONS].sort(), Object.keys(world.spies.operations.kinds).sort(), 'every spy operation is gathered');
  // Faith powers and development acts are read from the data, so a new one
  // joins the hand by itself. A gift to a ruler rests on the hand.
  let s = step(createState(world, 1), 30, world, { ambient: false });
  s.treasury = 20000;
  const r = applyAction(s, world, { type: 'gift', realm: 'redania', size: 100 });
  assert.ok(!r.error, r.error);
  s = r.state;
  const gift = handRows({ state: s, world }).find((r) => r.group === 'rulers');
  assert.ok(gift && !gift.ready && gift.left > 0 && /Redania/.test(gift.name), 'a gift rests on the hand');
});

test('every sub-screen a link or a saved place names exists', () => {
  const known = new Set(Object.entries(SUBS).flatMap(([tab, list]) => list.map(([id]) => `${tab}:${id}`)));
  assert.equal(known.size, 14);
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(dir, f.name));
      else if (/\.(js|json)$/.test(f.name)) files.push(join(dir, f.name));
    }
  };
  for (const d of ['src', 'data']) walk(d);
  const named = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"`](realm|court|treasury|military|diplomacy):([a-z]+)['"`]/g)) named.add(`${m[1]}:${m[2]}`);
  }
  for (const where of named) {
    assert.ok(known.has(where) || MOVED[where], `${where} leads nowhere`);
    assert.ok(known.has(canonicalTab(where)), `${where} has no home`);
  }
  assert.ok(named.size > 20, `${named.size} places named`);
});
