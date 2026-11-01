// Four northern realms awake (M30 B): Kovir and Poviss (a rich, careful
// middle crown), the Hengfors League (a petty kingdom, a natural vassal),
// Lyria and Rivia (proud, warlike, friendly to Temeria) and Angren (a
// lawless frontier with no ruler, whose towns go to whoever takes them).
// Each has the full model; an older save gains them as at a reign's start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, applyAction, crownArmies, tierOf, suzerainOf, rulerOf, ownerOf, hostile } from '../../src/sim/index.js';
import { canOrder } from '../../src/sim/armies.js';
import { monthlyFrontier, lawless } from '../../src/sim/frontier.js';
import { transferTown } from '../../src/sim/lands.js';
import { startingWorks } from '../../src/sim/works.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const NEW = ['kovir', 'hengfors', 'lyria_rivia', 'angren'];
const run = (s, days) => step(s, days, world, { ambient: false });
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };
const never = { chance: () => false, next: () => 0.99, int: () => 0, pick: (l) => l[0] };

test('each new realm has its tier, its towns and works, its people, faith and army', () => {
  assert.equal(tierOf(world, 'kovir'), 'middle');
  assert.equal(tierOf(world, 'lyria_rivia'), 'middle');
  assert.equal(tierOf(world, 'hengfors'), 'petty');
  assert.equal(tierOf(world, 'angren'), 'none');
  assert.ok(lawless(world, 'angren') && !lawless(world, 'kovir'));
  assert.equal(world.geography.neighbours.kovir.name, 'Kovir and Poviss');
  assert.ok(world.foreignByRealm.kovir.includes('tridam'), 'Poviss is part of Kovir');
  const s = createState(world, 1);
  for (const rid of NEW) {
    const towns = world.foreignByRealm[rid];
    assert.ok(towns.length >= 4, `${rid}: ${towns.length} towns`);
    assert.ok(towns.includes(world.realms.realms[rid].capital), `${rid} capital`);
    for (const id of towns) assert.ok(startingWorks(world, id, rid).buildings.length, `${id} has works`);
    assert.ok(s.realms[rid] && s.neighbours[rid], rid);
    assert.ok(world.conquest.peoples[rid], `${rid} people`);
    assert.ok(world.war.battles.realmMix[rid], `${rid} army mix`);
    assert.ok(world.devotion.realms.lean[rid], `${rid} faith`);
  }
  assert.equal(rulerOf(world, 'kovir').name, 'Esterad Thyssen');
  assert.equal(rulerOf(world, 'hengfors').name, 'Niedamir');
  assert.equal(rulerOf(world, 'lyria_rivia').name, 'Meve');
  assert.equal(rulerOf(world, 'angren'), null, 'Angren has no ruler');
  // Kovir is the richest of the crowns below the great powers; Meve the most warlike.
  const income = (rid) => world.foreignByRealm[rid].reduce((a, id) => a + s.realms[rid].settlements[id].population * s.realms[rid].settlements[id].prosperity, 0);
  for (const rid of ['cintra', 'hengfors', 'lyria_rivia', 'sodden', 'brugge']) assert.ok(income('kovir') > income(rid), `Kovir richer than ${rid}`);
  const agg = world.war.ai.aggression;
  assert.ok(agg.kovir <= 0.1 && agg.lyria_rivia >= agg.cintra, 'Kovir rarely fights; Meve does');
  assert.ok(world.neighbours.realms.lyria_rivia.relation > world.neighbours.realms.kovir.relation, 'Meve starts friendly');
});

test('the realms live: Kovir grows rich and stays at peace, Hengfors falls into a great power\'s sphere', () => {
  let s = createState(world, 2);
  let vassal = null;
  for (let y = 0; y < 3; y++) {
    s = run(s, 365);
    vassal ??= suzerainOf(s, 'hengfors');
  }
  assert.ok(['kaedwen', 'redania'].includes(vassal), `Hengfors under ${vassal}`);
  for (const rid of ['cintra', 'hengfors', 'lyria_rivia', 'verden']) assert.ok(s.realms.kovir.treasury > s.realms[rid].treasury, `Kovir's purse over ${rid}'s`);
  assert.ok(!(s.wars ?? []).some((w) => w.sides[0][0] === 'kovir'), 'Kovir starts no war');
});

test('Angren is lawless: hostile to all with no war declared, its towns taken by the strong and lost to outlaws', () => {
  const s = createState(world, 1);
  assert.ok(hostile(s, 'temeria', 'angren') && hostile(s, 'lyria_rivia', 'angren'));
  assert.ok(!(s.wars ?? []).length);
  // The crown may march an army on a free Angren town.
  s.treasury = 50000;
  const raised = applyAction(s, world, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false });
  assert.equal(raised.error, undefined);
  const ready = run(raised.state, 20);
  const a = crownArmies(ready)[0];
  const order = canOrder(ready, world, a, 'siege', 'glevitzingen');
  assert.ok(order.ok || /road/i.test(order.reason ?? ''), order.reason);
  // A strong neighbour sends a column and takes a free town.
  const t = createState(world, 2);
  monthlyFrontier(t, world, always);
  const taken = world.foreignByRealm.angren ? ['glevitzingen', 'carrow', 'burnt_holt', 'mirefall'].filter((id) => ownerOf(t, world, id) !== 'angren') : [];
  assert.ok(taken.length >= 1, 'a free town taken');
  // A thinly held town falls back to the outlaws.
  const u = createState(world, 2);
  transferTown(u, world, 'mirefall', 'lyria_rivia', { quiet: true });
  u.realms.lyria_rivia.settlements.mirefall.garrison = 10;
  monthlyFrontier(u, world, { ...never, chance: (p) => p > 0.04 });
  assert.equal(ownerOf(u, world, 'mirefall'), 'angren');
  // Emptied, Angren does not fall: no ruler goes into exile.
  const v = createState(world, 2);
  for (const id of [...world.foreignByRealm.angren]) transferTown(v, world, id, 'lyria_rivia', { quiet: true });
  const w2 = run(v, 31);
  assert.ok(!w2.realms.angren.fallen, 'not fallen');
  assert.ok(!(w2.claimants ?? []).some((c) => c.realm === 'angren'), 'no claimant');
});

test('Angren has no court: no audience, no trade, no war of its own', () => {
  let s = createState(world, 4);
  s = run(s, 365 * 2);
  assert.ok(!(s.wars ?? []).some((w) => w.sides.some((side) => side.includes('angren'))), 'no war with Angren');
  assert.ok(!(s.diplomacy.treaties ?? []).some((t) => t.a === 'angren' || t.b === 'angren'), 'no treaty');
  assert.ok(!(s.diplomacy.requests ?? []).some((q) => q.realm === 'angren'));
  assert.ok(!(s.musters ?? []).some((m) => m.realm === 'angren' || m.against === 'angren'));
});

test('an older save gains the four realms as at the start of a reign', () => {
  const s = run(createState(world, 5), 90);
  const old = JSON.parse(serialize(s));
  old.version = 30;
  old.state.version = 30;
  for (const rid of NEW) {
    delete old.state.realms[rid];
    delete old.state.neighbours[rid];
    delete old.state.faiths?.realms?.[rid];
    delete old.state.diplomacy.trust[rid];
    for (const row of Object.values(old.state.diplomacy.trust)) delete row[rid];
    delete old.state.conquest?.fear?.[rid];
  }
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  for (const rid of NEW) {
    assert.ok(up.realms[rid], rid);
    assert.ok(up.neighbours[rid], `${rid} relation`);
  }
  assert.ok(up.realms.angren.lawless);
  assert.equal(up.realms.kovir.settlements.lan_exeter.population, 16000);
  const later = run(up, 60);
  assert.ok(later.realms.kovir.treasury > 0);
});
