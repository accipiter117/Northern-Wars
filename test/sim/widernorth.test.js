// The wider North over the years (M30 F): rulers think on days of their
// own so the month's work is spread; a sim-month stays cheap with fifteen
// realms; and over six years Kovir keeps out of every war, Skellige raids
// every season, Angren's towns change hands, the Empire goes to war on its
// clock, and no northern power swallows the petty kingdoms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, suzerainOf } from '../../src/sim/index.js';
import { thinkingDay } from '../../src/sim/strategy.js';
import { ownerOf } from '../../src/sim/conflict.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const ANGREN = (world.base?.foreign ?? world.foreign).filter((t) => t.realm === 'angren').map((t) => t.id);

test('rulers take stock on days of their own, spread over the month', () => {
  const ids = Object.keys(world.diplomacy.rulers).filter((r) => world.foreignByRealm[r]);
  const days = ids.map((r) => thinkingDay(world, r));
  for (const d of days) assert.ok(d >= 1 && d <= 28);
  assert.ok(new Set(days).size >= ids.length - 2, `${new Set(days).size} days for ${ids.length} rulers`);
  // Every ruler still takes a posture within a month.
  const s = step(createState(world, 1), 31, world, { ambient: false });
  for (const r of ids) if (!s.realms[r].fallen) assert.ok(s.realms[r].posture, `${r} has a posture`);
});

test('a month of the North stays cheap with fifteen realms', () => {
  let s = step(createState(world, 3), 60, world, { ambient: true });
  const t0 = performance.now();
  s = step(s, 30, world, { ambient: true });
  const perDay = (performance.now() - t0) / 30;
  // Generous for a slow test machine; a phone runs a day per frame or so.
  assert.ok(perDay < 60, `${perDay.toFixed(1)} ms a day`);
});

test('six years: Kovir keeps out, Skellige raids each season, Angren is a sore, the Empire marches, no one swallows the rest', () => {
  let s = createState(world, 2);
  const fought = new Set();
  let raidsByYear = [];
  let angren = new Set();
  let imperialWar = false;
  let most = 0;
  for (let y = 0; y < 6; y++) {
    const before = s.seas?.nextId ?? 1;
    for (let m = 0; m < 12; m++) {
      s = step(s, 30, world, { ambient: false });
      for (const w of s.wars ?? []) for (const side of w.sides) for (const r of side) fought.add(r);
      if ((s.wars ?? []).some((w) => w.sides.flat().includes('nilfgaard'))) imperialWar = true;
      for (const id of ANGREN) angren.add(`${id}:${ownerOf(s, world, id)}`);
      const counts = {};
      for (const r of Object.keys(s.realms)) { const l = suzerainOf(s, r); if (l && l !== 'nilfgaard') counts[l] = (counts[l] ?? 0) + 1; }
      most = Math.max(most, ...Object.values(counts), 0);
    }
    raidsByYear.push((s.seas?.nextId ?? 1) - before);
  }
  assert.ok(!fought.has('kovir'), 'Kovir keeps out of every war');
  assert.ok(raidsByYear.every((n) => n >= 1), `raids by year ${raidsByYear.join(' ')}`);
  assert.ok(angren.size > 4, 'Angren\'s towns change hands');
  assert.ok(imperialWar, 'the Empire goes to war on its clock');
  assert.ok(most <= 4, `no northern power holds more than four vassals (${most})`);
});
