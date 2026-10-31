// The faiths and the Book on the map (M26 E): which marks stand, and where.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, dateOf } from '../../src/sim/index.js';
import { faithMarks } from '../../src/sim/marks.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const kinds = (s) => faithMarks(s, world).map((m) => m.kind);

test('a quiet realm shows no faith or law marks beyond its hospices', () => {
  const s = createState(world, 1);
  for (const f of Object.keys(s.faiths.devotion)) s.faiths.devotion[f] = 0;
  assert.ok(kinds(s).every((k) => k === 'hospice'));
  for (const m of faithMarks(s, world)) assert.ok(s.settlements[m.place].buildings.includes('hospice'));
});

test('a purge leaves a pyre for its days, then it is gone', () => {
  const s = createState(world, 1);
  s.faiths.pyre = { town: 'vizima', until: s.day + 10 };
  assert.ok(faithMarks(s, world).some((m) => m.kind === 'pyre' && m.place === 'vizima'));
  s.day += 10;
  assert.ok(!kinds(s).includes('pyre'));
});

test('groves where the Old Ways hold the people, with stones at level 3; Melitele\'s banners at level 2', () => {
  const s = createState(world, 1);
  s.faiths.devotion.old_ways = 25;
  const groves = faithMarks(s, world).filter((m) => m.kind === 'grove');
  assert.ok(groves.length > 0);
  assert.ok(groves.every((m) => s.settlements[m.place].faith.old_ways >= 35 && !m.stones));
  s.faiths.devotion.old_ways = 65;
  assert.ok(faithMarks(s, world).filter((m) => m.kind === 'grove').every((m) => m.stones));
  s.faiths.devotion.melitele = 10;
  const before = kinds(s).filter((k) => k === 'hospice').length;
  s.faiths.devotion.melitele = 45;
  assert.ok(kinds(s).filter((k) => k === 'hospice').length >= before);
});

test('a festival walks in procession in its season; the king\'s pilgrimage goes out and comes home', () => {
  const s = createState(world, 1);
  const fest = world.devotion.faiths.melitele.festival.months;
  while (!fest.includes(dateOf(s.day).month)) s.day += 10;
  s.faiths.festivals.melitele = dateOf(s.day).year;
  const pro = faithMarks(s, world).filter((m) => m.kind === 'procession');
  assert.deepEqual(pro.map((m) => m.place).sort(), ['temple_melitele', world.kingdom.capital].sort());
  s.faiths.pilgrimage = { faith: 'melitele', place: 'temple_melitele', until: s.day + 25 };
  const out = faithMarks(s, world).find((m) => m.kind === 'pilgrims');
  assert.equal(out.toward, 'temple_melitele');
  s.day += 20;
  const back = faithMarks(s, world).find((m) => m.kind === 'pilgrims');
  assert.equal(back.toward, world.kingdom.capital);
  s.day += 5;
  assert.ok(!kinds(s).includes('pilgrims'));
});

test('the king\'s riders on the town roads and gibbets at the capital under their laws', () => {
  const s = createState(world, 1);
  assert.ok(!kinds(s).includes('riders'));
  signLaws(s, world, 'curfews', 'executions', 'riders');
  const riders = faithMarks(s, world).filter((m) => m.kind === 'riders');
  assert.ok(riders.length >= 6);
  assert.ok(riders.every((m) => m.t > 0 && m.t < 1));
  assert.ok(faithMarks(s, world).some((m) => m.kind === 'gibbets' && m.place === world.kingdom.capital));
});
