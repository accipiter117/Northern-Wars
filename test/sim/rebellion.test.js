// Rebellion as a war and the king's judgement (M27 C and D): a rising turns
// the house's lands and puts its host in the field; it is fought with the
// ordinary armies and ends when the seat falls, the lord is taken or sues
// for terms (or a weak crown is forced to terms), never by the old tally;
// each judgement does what it says, and punishing a traitor carries none of
// the tyranny penalties that punishing a loyal lord does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, houseDues, lawEffects, hostile, holdingsOf, rebelArmies, judgementEffects, fineOf, serialize, deserialize,
} from '../../src/sim/index.js';
import { rise, stepRebellionDay, monthlyRebellion } from '../../src/sim/rebellion.js';
import { monthlyHouses } from '../../src/sim/houses.js';
import { setOwner } from '../../src/sim/conflict.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  if (s.diplomacy) s.diplomacy.requests = [];
  return s;
};
const fresh = (seed = 1) => {
  const s = quiet(createState(world, seed));
  s.treasury = 30000;
  return s;
};
const seat = (hid) => world.houses.houses[hid].seat;

test('a rising turns the house\'s lands, puts its host in the field and stops its dues', () => {
  const s = fresh();
  const lands = holdingsOf(s, 'dravnik');
  rise(s, world, 'dravnik');
  const side = 'rebel:dravnik';
  for (const id of lands) assert.equal(s.settlements[id].occupier, side, `${id} flies the rebel banner`);
  const host = rebelArmies(s, 'dravnik');
  assert.equal(host.length, 1);
  assert.ok(host[0].soldiers >= world.houses.rebellion.armyMin);
  assert.ok(host[0].bands.every((b) => b.source === 'retinue' && b.xp > 0));
  assert.equal(houseDues(s, world, lawEffects(s, world)).dravnik, undefined);
  assert.equal(hostile(s, side, 'temeria'), true);
  assert.equal(hostile(s, side, 'redania'), false);
  assert.ok(s.chronicle.some((c) => /House Dravnik has risen in rebellion/.test(c.text)));
});

test('a joining house brings its own host under its own banners', () => {
  const s = fresh();
  rise(s, world, 'dravnik');
  rise(s, world, 'gelbrand', 'dravnik');
  assert.equal(rebelArmies(s, 'gelbrand').length, 1);
  assert.equal(s.settlements[seat('gelbrand')].occupier, 'rebel:gelbrand');
  assert.ok(s.chronicle.some((c) => /House Gelbrand joins the rising of House Dravnik/.test(c.text)));
});

test('the rising ends when the seat falls: lands back, host gone, the lord before the king', () => {
  const s = fresh();
  const lands = holdingsOf(s, 'dravnik');
  rise(s, world, 'dravnik');
  setOwner(s, world, seat('dravnik'), 'temeria');
  stepRebellionDay(s, world, makeRng(1));
  assert.equal(s.houses.dravnik.rebel, null);
  assert.equal(s.houses.dravnik.captive.how, 'seat');
  for (const id of lands) assert.equal(s.settlements[id].occupier, undefined);
  assert.equal(rebelArmies(s, 'dravnik').length, 0);
  assert.equal(s.judgements.length, 1);
  assert.equal(s.judgements[0].how, 'seat');
});

test('a broken host gives up its lord; heavy defeats bring him to sue', () => {
  const s = fresh();
  rise(s, world, 'ostrowicz');
  const host = rebelArmies(s, 'ostrowicz')[0];
  host.soldiers = 20;
  host.routed = s.day + 5;
  stepRebellionDay(s, world, makeRng(1));
  assert.equal(s.judgements.at(-1).how, 'captured');

  const t = fresh();
  rise(t, world, 'gelbrand');
  t.houses.gelbrand.rebel.defeats = world.houses.rebellion.sueAfterDefeats;
  for (const a of rebelArmies(t, 'gelbrand')) a.soldiers = 30;
  monthlyRebellion(t, world, makeRng(1));
  assert.equal(t.judgements.at(-1).how, 'terms');
});

test('a crown too weak to crush it is forced to terms; the old tally is gone', () => {
  assert.equal(world.houses.rebellion.decideAfter, undefined);
  const s = fresh();
  rise(s, world, 'brodowin');
  s.houses.brodowin.rebel.months = world.houses.rebellion.forceTermsAfter - 1;
  monthlyRebellion(s, world, makeRng(1));
  const h = s.houses.brodowin;
  assert.equal(h.rebel, null);
  assert.ok(h.exemptUntil > s.day && h.office);
  assert.equal((s.judgements ?? []).length, 0);
  assert.equal(s.settlements[seat('brodowin')].occupier, undefined);
});

test('fought with the ordinary armies: a crown army besieges the seat and the rising ends', () => {
  let s = run(fresh(2), 30);
  quiet(s);
  s.treasury = 30000;
  rise(s, world, 'dravnik');
  s = applyAction(s, world, { type: 'raise', muster: 'maribor', levy: 'all', nobles: true }).state;
  for (let d = 0; d < 300 && !(s.judgements?.length); d += 5) {
    s = quiet(run(s, 5));
    const a = s.armies.find((x) => x.side === 'temeria');
    if (a && (a.gatherUntil ?? 0) <= s.day && a.order !== 'siege') {
      const o = applyAction(s, world, { type: 'army', army: a.id, order: 'siege', target: seat('dravnik') });
      if (!o.error) s = o.state;
    }
  }
  assert.equal(s.judgements?.length, 1, 'the lord is taken or his seat falls');
  assert.equal(s.houses.dravnik.rebel, null);
});

function judged(choice, hid = 'gelbrand') {
  const s = fresh();
  for (const h of Object.values(s.houses)) h.loyalty = 50;
  rise(s, world, hid);
  setOwner(s, world, seat(hid), 'temeria');
  stepRebellionDay(s, world, makeRng(1));
  const before = { love: s.love, fear: s.fear, unrest: s.unrest, treasury: s.treasury, others: Object.fromEntries(Object.entries(s.houses).filter(([id]) => id !== hid).map(([id, h]) => [id, { ...h }])) };
  const lands = Object.keys(s.settlements).filter((id) => s.settlements[id].holder === hid);
  const out = applyAction(s, world, { type: 'judgement', id: s.judgements[0].id, choice });
  assert.equal(out.error, undefined);
  return { s: out.state, before, lands, hid };
}

test('pardon: very loyal and grateful, a little Love, bolder lords', () => {
  const { s, before, hid } = judged(0);
  assert.equal(s.houses[hid].loyalty, world.houses.judgement.pardon.loyalty);
  assert.ok(s.love > before.love);
  for (const [id, o] of Object.entries(before.others)) assert.ok(s.houses[id].ambition >= o.ambition);
});

test('fine and hostage: coin at once, lands kept, and no rising while the heir is held', () => {
  const t = fresh();
  const fine = fineOf(t, world, 'gelbrand');
  const { s, before, hid, lands } = judged(1);
  assert.ok(s.treasury - before.treasury >= fine - 100);
  assert.ok(lands.every((id) => s.settlements[id].holder === hid));
  assert.ok(s.houses[hid].hostageUntil > s.day);
  s.houses[hid].loyalty = 0;
  s.fear = 0;
  const rng = makeRng(4);
  for (let m = 0; m < 24; m++) { s.houses[hid].loyalty = 0; monthlyHouses(s, world, rng); }
  assert.ok(!s.houses[hid].rebel);
});

for (const [choice, kind] of [[2, 'strip'], [3, 'exile'], [4, 'execute']]) {
  test(`${kind}: the house falls, its lands go to the crown, the lords fall into line, no Love lost`, () => {
    const { s, before, hid, lands } = judged(choice);
    assert.equal(s.houses[hid], undefined);
    assert.ok(lands.every((id) => s.settlements[id].holder === 'crown'));
    assert.equal(s.fallenHouses.at(-1).how, kind);
    assert.ok(s.fear > before.fear, 'Fear rises');
    assert.ok(s.love >= before.love, 'no Love penalty for punishing a traitor');
    for (const [id, o] of Object.entries(before.others)) {
      assert.ok(s.houses[id].ambition <= o.ambition && s.houses[id].favour > o.favour, `${id} falls into line`);
      assert.ok(s.houses[id].grievance <= o.grievance, `${id} nurses no grievance`);
    }
    if (kind === 'exile') assert.equal(s.exiles.at(-1).house, hid);
    if (kind === 'execute') assert.equal(s.scaffold.place, seat(hid));
  });
}

test('beheading or stripping a lord who never rose keeps its heavy penalties', () => {
  const s = fresh();
  const love = s.love;
  const grievances = Object.fromEntries(Object.entries(s.houses).map(([id, h]) => [id, h.grievance]));
  const out = applyAction(s, world, { type: 'house', house: 'brodowin', kind: 'execute' });
  assert.equal(out.error, undefined);
  const t = out.state;
  assert.ok(t.love < love - 5, 'the realm calls it murder');
  for (const id of Object.keys(t.houses)) assert.ok(t.houses[id].grievance > grievances[id], `${id} is aggrieved`);
  const u = fresh();
  const sid = holdingsOf(u, 'dravnik').find((id) => id !== seat('dravnik'));
  const unrest = u.unrest;
  const v = applyAction(u, world, { type: 'house', house: 'dravnik', kind: 'strip', settlement: sid }).state;
  assert.ok(v.houses.dravnik.grievance >= world.houses.actions.strip.grievance);
  assert.ok(v.unrest > unrest);
});

test('the Judgement card shows each choice\'s effects; unanswered, the fine is taken', () => {
  let s = fresh();
  rise(s, world, 'wolbrecht');
  setOwner(s, world, seat('wolbrecht'), 'temeria');
  stepRebellionDay(s, world, makeRng(1));
  const fx = judgementEffects(s, world, s.judgements[0]);
  assert.match(fx.execute, /Fear \+\d+.*No Love lost/);
  assert.match(fx.pardon, /she returns very loyal/);
  s = quiet(run(s, world.houses.judgement.days + 2));
  assert.equal(s.judgements.length, 0);
  assert.ok(s.houses.wolbrecht.hostageUntil > s.day);
});

test('a save from before M27 turns its old rising into a war', () => {
  const s = fresh();
  const old = JSON.parse(serialize(s));
  old.state.houses.gelbrand.rebel = { since: s.day - 30, months: 1 };
  const up = deserialize(JSON.stringify(old), world);
  monthlyRebellion(up, world, makeRng(1));
  assert.equal(up.houses.gelbrand.rebel.side, 'rebel:gelbrand');
  assert.equal(rebelArmies(up, 'gelbrand').length, 1);
});
