// The Crown's hand (M34 B): every act with a cost or a rest in one list,
// ready ones first, resting ones with their days left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction } from '../../src/sim/index.js';
import { handRows, readyCount, HAND_KINDS } from '../../src/ui/hand.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const app = (state) => ({ state, world });
const keys = (s) => handRows(app(s)).map((r) => r.key);

test('every act of the crown with a rest belongs to the hand', () => {
  const acts = Object.keys(world.meters.acts).filter((k) => k !== 'note');
  for (const k of acts) assert.ok([...HAND_KINDS.people, ...HAND_KINDS.book].includes(k), `${k} is on the hand`);
});

test('the hand gathers the people\'s acts, the realm\'s calls and the seams to reopen', () => {
  const s = step(createState(world, 1), 30, world, { ambient: false });
  const k = keys(s);
  assert.ok(k.includes('act:progress') && k.includes('act:gibbets'));
  assert.ok(!k.includes('act:feast'), 'the feast needs its law');
  assert.ok(k.some((x) => x.startsWith('seam:')));
  assert.ok(k.some((x) => x.startsWith('faith:endow:')), 'the strongest faith can be developed');
  signLaws(s, world, 'royal_feasts');
  assert.ok(keys(s).includes('act:feast'));
  assert.equal(readyCount(app(s)), handRows(app(s)).filter((r) => r.ready).length);
});

test('a resting act stays on the hand with its days left', () => {
  let s = step(createState(world, 1), 30, world, { ambient: false });
  s.treasury = 10000;
  s = applyAction(s, world, { type: 'act', kind: 'progress' }).state;
  const r = handRows(app(s)).find((x) => x.key === 'act:progress');
  assert.ok(r && !r.ready && r.left > 0 && r.total > 0);
});

test('faith powers once open, and spy work where the network reaches', () => {
  const s = step(createState(world, 1), 30, world, { ambient: false });
  s.treasury = 10000;
  for (const f of Object.keys(world.devotion.faiths)) s.faiths.devotion[f] = 100;
  s.armies.push({ id: 901, side: 'temeria', at: 'vizima', soldiers: 500, morale: 50 });
  const k = keys(s);
  for (const [f, fa] of Object.entries(world.devotion.faiths)) {
    for (const p of Object.keys(fa.powers ?? {})) {
      // Powers aimed at trouble (a purge, a lair, plague) appear when there
      // is some, and seasonal ones (Belleteyn) in their season.
      if (['purge', 'circle', 'healers'].includes(p) || fa.powers[p].months) continue;
      assert.ok(k.includes(`faith:${p}:${f}`), `${p} of ${f}`);
    }
  }
  s.spycraft.nets.temeria.kaedwen = 72;
  assert.ok(keys(s).includes('spy:kaedwen'));
});
