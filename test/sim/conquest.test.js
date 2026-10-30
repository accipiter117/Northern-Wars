// Conquest (M19): towns that change hands, what becomes of them, and what
// holding them costs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, canBuild, ownerOf, serialize, deserialize, totalPopulation } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { startWar, applyPeace } from '../../src/sim/war.js';
import { setOwner, recordCapture } from '../../src/sim/conflict.js';
import { makeRng } from '../../src/sim/rng.js';
import { syncWorld, settleOwnership, transferTown } from '../../src/sim/lands.js';
import { onCapture, monthlyConquest, fearOf, northFear, integrationParts, resolveConquestDecision } from '../../src/sim/conquest.js';
import { monthlyLedger } from '../../src/sim/economy.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  if (s.diplomacy) s.diplomacy.requests = [];
  return s;
};
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};

// Temeria at war with a realm, holding the given towns of theirs.
function conquer(seed, realm, towns) {
  const s = quiet(createState(world, seed));
  const rng = makeRng(seed);
  const war = startWar(s, world, rng, 'temeria', realm, 'claim');
  s.armies = s.armies.filter((a) => a.side === 'temeria');
  for (const id of towns) {
    setOwner(s, world, id, 'temeria');
    recordCapture(war, id, realm, 'temeria', s.day);
  }
  return { s, war, rng };
}

test('a town kept at peace becomes a governable Temerian settlement', () => {
  // Bremervoord, a town of Cidaris (a capital would go home at the peace
  // unless its whole realm were taken).
  const { s, war } = conquer(11, 'cidaris', ['bremervoord']);
  // While the war lasts it is only occupied: ours to strip, not to build in.
  assert.ok(!s.settlements.bremervoord);
  assert.equal(ownerOf(s, world, 'bremervoord'), 'temeria');
  assert.match(canBuild(s, world, 'bremervoord', 'market').reason, /occupied/i);
  const before = s.treasury;
  const after = act(s, { type: 'requisition', settlement: 'bremervoord' });
  assert.ok(after.treasury > before);
  assert.equal(applyAction(after, world, { type: 'requisition', settlement: 'bremervoord' }).error, 'It was stripped too lately.');
  // The peace leaves it with us: it is Temerian for good.
  applyPeace(s, world, war, { towns: 'keep' });
  const t = s.settlements.bremervoord;
  assert.ok(t, 'a crown settlement now');
  assert.equal(t.origin, 'cidaris');
  assert.ok(t.integration > 0 && t.integration < 100);
  assert.ok(!s.realms.cidaris.settlements.bremervoord);
  assert.ok(world.geography.settlements.some((g) => g.id === 'bremervoord'));
  assert.ok(!world.foreign.some((g) => g.id === 'bremervoord'));
  assert.equal(world.realmOf.bremervoord, undefined);
  // Its people keep their own origin, and its old buildings stand.
  assert.ok(t.population.human > 0 && totalPopulation(t) > 1000);
  // It can be built in, and pays the crown taxes like any other town.
  assert.ok(canBuild(s, world, 'bremervoord', 'granary').ok || canBuild(s, world, 'bremervoord', 'granary').reason !== 'Unknown building.');
  monthlyLedger(s, world);
  assert.ok((s.ledger.places.bremervoord?.in ?? 0) > 0, 'it pays');
  // The crown is asked who should hold it.
  const grant = s.conquest.decisions.find((d) => d.kind === 'grant' && d.town === 'bremervoord');
  assert.ok(grant);
  const house = grant.options[1];
  resolveConquestDecision(s, world, grant.id, 1);
  assert.equal(s.settlements.bremervoord.holder, house);
  // And the reign plays on, through a save, with the town as our own.
  const later = step(s, 60, world, { ambient: true });
  assert.ok(later.settlements.bremervoord);
  const back = deserialize(serialize(later), world);
  assert.ok(back.settlements.bremervoord);
  syncWorld(world, createState(world, 1));
});

test('the capture choice: sparing, sacking and driving a people out', () => {
  // Sack: plunder at once, ruins and smoke, hatred and fear.
  {
    const { s, rng } = conquer(12, 'cidaris', ['cidaris_city']);
    const a = { side: 'temeria', soldiers: 3000 };
    onCapture(s, world, rng, a, 'cidaris_city', 'cidaris', 'storm');
    const d = s.conquest.decisions.find((x) => x.kind === 'capture');
    assert.deepEqual(d.options.slice(0, 2), ['spare', 'sack']);
    const rec = s.realms.cidaris.settlements.cidaris_city;
    const pop = rec.population;
    const prosperity = rec.prosperity;
    rec.buildings = ['market', 'walls', 'harbour', 'granary'];
    const before = s.treasury;
    resolveConquestDecision(s, world, d.id, d.options.indexOf('sack'));
    assert.ok(s.treasury - before > 1000, `loot ${s.treasury - before}`);
    assert.ok(rec.population < pop && rec.prosperity < prosperity);
    // Since M20 the works stand in ruins rather than vanish.
    assert.ok(rec.buildings.filter((b) => (rec.cond?.[b] ?? 100) < 30).length >= 2 && rec.buildings.includes('walls'));
    assert.ok(rec.buildings.length === 4);
    assert.ok(rec.smoulder > s.day);
    assert.equal(rec.treated, 'sacked');
    assert.ok(fearOf(s, 'kerack') > 0);
  }
  // Spared and sacked towns start their life under the crown far apart.
  const start = (choice) => {
    const { s, rng, war } = conquer(13, 'cidaris', ['bremervoord']);
    onCapture(s, world, rng, { side: 'temeria', soldiers: 3000 }, 'bremervoord', 'cidaris', 'storm');
    const d = s.conquest.decisions.find((x) => x.kind === 'capture');
    resolveConquestDecision(s, world, d.id, d.options.indexOf(choice));
    applyPeace(s, world, war, { towns: 'keep' });
    const out = s.settlements.bremervoord.integration;
    syncWorld(world, createState(world, 1));
    return out;
  };
  assert.ok(start('spare') - start('sack') >= 30);
  // Expel: a people leave in columns for their kin; elves feed the Scoia'tael.
  {
    const { s, rng } = conquer(14, 'cidaris', ['cidaris_city']);
    onCapture(s, world, rng, { side: 'temeria', soldiers: 3000 }, 'cidaris_city', 'cidaris', 'storm');
    const d = s.conquest.decisions.find((x) => x.kind === 'capture');
    const rec = s.realms.cidaris.settlements.cidaris_city;
    const pop = rec.population;
    const sym = s.sympathy;
    const opt = d.options.indexOf('expel:elf');
    assert.ok(opt > 1, 'elves can be driven out');
    resolveConquestDecision(s, world, d.id, opt);
    assert.ok(rec.population < pop);
    assert.equal(rec.peoples.elf, 0);
    assert.ok(s.sympathy > sym);
    const ex = s.conquest.exodus.at(-1);
    assert.equal(ex.from, 'cidaris_city');
    assert.equal(ex.kind, 'elf');
    assert.ok(ex.people > 0 && ex.to);
  }
  syncWorld(world, createState(world, 1));
});

test('integration rises under a garrison and good laws, and falls under harsh ones', () => {
  const { s, war } = conquer(15, 'cidaris', ['bremervoord']);
  applyPeace(s, world, war, { towns: 'keep' });
  s.conquest.decisions = [];
  const t = s.settlements.bremervoord;
  t.integration = 40;
  t.garrison = 600;
  t.prosperity = 65;
  s.laws.patronage.option = 'tolerance';
  const rng = makeRng(1);
  for (let m = 0; m < 12; m++) monthlyConquest(s, world, rng);
  assert.ok(t.integration > 46, `rose to ${t.integration}`);
  // Heavy taxes and martial law push it back down.
  s.laws.tax_peasants.option = 'heavy';
  s.laws.public_order.option = 'martial';
  s.laws.patronage.option = 'eternal_fire';
  t.prosperity = 35;
  t.garrison = 0;
  const high = t.integration;
  for (let m = 0; m < 12; m++) monthlyConquest(s, world, rng);
  assert.ok(t.integration < high - 5, `fell to ${t.integration}`);
  const parts = integrationParts(s, world, 'bremervoord').map((p) => p.text);
  assert.ok(parts.includes('Heavy taxes') && parts.includes('Martial law'));
  syncWorld(world, createState(world, 1));
});

test('a conquered town rises: the revolt spreads, and can be crushed or treated with', () => {
  const { s, war } = conquer(16, 'cidaris', ['cidaris_city']);
  // Two more of Cidaris's towns, for the rising to spread between.
  const towns = Object.keys(s.realms.cidaris.settlements).filter((id) => id !== 'cidaris_city').slice(0, 2);
  for (const id of towns) {
    setOwner(s, world, id, 'temeria');
    recordCapture(war, id, 'cidaris', 'temeria', s.day);
  }
  applyPeace(s, world, war, { towns: 'keep' });
  s.conquest.decisions = [];
  const ours = Object.keys(s.settlements).filter((id) => s.settlements[id].origin === 'cidaris');
  assert.ok(ours.length >= 2);
  for (const id of ours) {
    s.settlements[id].integration = 5;
    s.settlements[id].unrest = 95;
    s.settlements[id].garrison = 5;
  }
  const rng = makeRng(3);
  for (let m = 0; m < 24 && !s.conquest.revolts.length; m++) monthlyConquest(s, world, rng);
  assert.ok(s.conquest.revolts.length >= 1, 'a revolt broke out');
  const r = s.conquest.revolts[0];
  const d = s.conquest.decisions.find((x) => x.kind === 'revolt' && x.revolt === r.id);
  assert.ok(d);
  // Treating with them ends it, at a cost in Trust, and wins the town over.
  const auth = s.trust;
  const before = s.settlements[r.town].integration;
  resolveConquestDecision(s, world, d.id, 1);
  assert.ok(!s.conquest.revolts.some((x) => x.id === r.id));
  assert.ok(s.trust < auth);
  assert.ok(s.settlements[r.town].integration > before);
  assert.ok(s.settlements[r.town].charter > s.day);
  // A rising met with a strong garrison is crushed.
  const id = ours.find((x) => !s.conquest.revolts.some((q) => q.town === x) && x !== r.town) ?? r.town;
  s.conquest.revolts = [];
  s.conquest.decisions = [];
  s.settlements[id].integration = 5;
  s.settlements[id].unrest = 95;
  s.settlements[id].garrison = 5;
  const rng2 = makeRng(9);
  for (let m = 0; m < 48 && !s.conquest.revolts.some((q) => q.town === id); m++) monthlyConquest(s, world, rng2);
  const r2 = s.conquest.revolts.find((q) => q.town === id);
  assert.ok(r2, 'it rose');
  s.settlements[id].garrison = 5000;
  const d2 = s.conquest.decisions.find((x) => x.revolt === r2.id);
  resolveConquestDecision(s, world, d2.id, 0);
  assert.ok(!s.conquest.revolts.some((x) => x.id === r2.id), 'crushed');
  syncWorld(world, createState(world, 1));
});

test('a revolt that holds its town for a season frees it', () => {
  const { s, war } = conquer(17, 'cidaris', ['bremervoord']);
  applyPeace(s, world, war, { towns: 'keep' });
  s.conquest.decisions = [];
  const t = s.settlements.bremervoord;
  t.integration = 2;
  t.unrest = 99;
  t.garrison = 0;
  const rng = makeRng(5);
  for (let m = 0; m < 30 && s.settlements.bremervoord; m++) {
    s.day += 30;
    s.conquest.decisions = [];
    if (s.settlements.bremervoord) s.settlements.bremervoord.garrison = 0;
    monthlyConquest(s, world, rng);
  }
  assert.ok(!s.settlements.bremervoord, 'free');
  assert.equal(world.realmOf.bremervoord, 'cidaris');
  syncWorld(world, createState(world, 1));
});

test('taking every town of a realm makes its ruler a claimant whose claim fades', () => {
  const towns = world.foreignByRealm.sodden;
  const { s, war } = conquer(18, 'sodden', towns);
  applyPeace(s, world, war, { towns: 'keep' });
  for (const id of towns) assert.ok(s.settlements[id], `${id} is ours`);
  assert.ok(s.realms.sodden.fallen);
  const c = s.claimants.find((x) => x.realm === 'sodden');
  assert.ok(c, 'a claimant');
  assert.equal(c.against, 'temeria');
  assert.ok(!s.wars.length);
  // Sodden no longer has a court to visit.
  assert.ok(!world.foreignByRealm.sodden.length);
  const rng = makeRng(2);
  const start = c.legitimacy;
  for (const id of towns) s.settlements[id].integration = 90;
  for (let m = 0; m < 24; m++) monthlyConquest(s, world, rng);
  const later = s.claimants.find((x) => x.realm === 'sodden');
  assert.ok(!later || later.legitimacy < start - 15, 'the claim fades fastest where the land takes to us');
  // A pension ends a claim at once.
  if (later) {
    s.treasury = 50000;
    const out = act(s, { type: 'pension', realm: 'sodden' });
    assert.ok(!out.claimants.some((x) => x.realm === 'sodden'));
  }
  syncWorld(world, createState(world, 1));
});

test('fear of Temeria rises with each town taken, and binds a league against it', () => {
  const s = quiet(createState(world, 19));
  const rng = makeRng(4);
  assert.equal(northFear(s, world), 0);
  const targets = [...world.foreignByRealm.kaedwen.slice(0, 5), ...world.foreignByRealm.redania.slice(0, 5)];
  for (const id of targets) {
    setOwner(s, world, id, 'temeria');
    onCapture(s, world, rng, { side: 'temeria', soldiers: 4000 }, id, world.realmOf[id], 'storm');
    const d = s.conquest.decisions.at(-1);
    resolveConquestDecision(s, world, d.id, 1);
  }
  assert.ok(fearOf(s, 'aedirn') > 10, `aedirn fears us ${fearOf(s, 'aedirn')}`);
  for (let m = 0; m < 2; m++) monthlyConquest(s, world, rng);
  assert.ok(s.conquest.league, 'a league is sworn');
  assert.ok(s.conquest.league.members.length >= 2);
  // Peace lets the fear ebb.
  const f = northFear(s, world);
  for (let m = 0; m < 12; m++) monthlyConquest(s, world, rng);
  assert.ok(northFear(s, world) < f);
});

test('foreign realms annex each other, and a realm with nothing left falls', () => {
  const s = quiet(createState(world, 20));
  const rng = makeRng(8);
  const war = startWar(s, world, rng, 'cintra', 'sodden', 'claim');
  for (const id of world.foreignByRealm.sodden) {
    setOwner(s, world, id, 'cintra');
    recordCapture(war, id, 'sodden', 'cintra', s.day);
  }
  applyPeace(s, world, war, { towns: 'keep' });
  for (const id of ['sodden_keep']) {
    assert.ok(s.realms.cintra.settlements[id], `${id} is Cintra's`);
    assert.equal(world.realmOf[id], 'cintra');
  }
  assert.ok(s.realms.sodden.fallen);
  const c = s.claimants.find((x) => x.realm === 'sodden');
  assert.equal(c.against, 'cintra');
  assert.ok(c.host && c.host !== 'cintra');
  syncWorld(world, createState(world, 1));
});

test('a version 15 save annexes the towns held after their wars ended', () => {
  const s = createState(world, 21);
  setOwner(s, world, 'kerack_city', 'temeria');
  s.version = 15;
  delete s.lands;
  delete s.claimants;
  delete s.conquest;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 15, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.settlements.kerack_city);
  assert.equal(up.lands.kerack_city.realm, 'temeria');
  assert.equal(ownerOf(up, world, 'kerack_city'), 'temeria');
  const later = step(up, 40, world);
  assert.ok(later.settlements.kerack_city);
  syncWorld(world, createState(world, 1));
});

test('a town ceded back returns to its realm with what it had', () => {
  const { s, war } = conquer(22, 'cidaris', ['bremervoord']);
  applyPeace(s, world, war, { towns: 'keep' });
  s.settlements.bremervoord.buildings.push('granary');
  setOwner(s, world, 'bremervoord', 'cidaris');
  settleOwnership(s, world);
  assert.ok(!s.settlements.bremervoord);
  assert.ok(s.realms.cidaris.settlements.bremervoord.buildings.includes('granary'));
  assert.equal(world.realmOf.bremervoord, 'cidaris');
  // And one of Temeria's own, lost at a peace, leaves the crown's lists.
  transferTown(s, world, 'ellander', 'redania');
  assert.ok(!s.settlements.ellander && s.realms.redania.settlements.ellander);
  assert.ok(!world.geography.settlements.some((g) => g.id === 'ellander'));
  syncWorld(world, createState(world, 1));
});
