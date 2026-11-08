// Northern Wars v2, steps 1 and 2: the board built from the traced map, the
// turn engine (yields, the month, AI turns, saves) and movement (rivers and
// their crossings, winter, zones of control, supply, sieges).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../helpers.js';
import { loadTable } from '../../v2/src/engine/load.js';
import {
  createGame, endTurn, moveArmy, reachable, declareWar, atWar, controller, cityYields, realmYields, recruit,
  dateOf, movePoints, serialize, deserialize, answerDilemma,
} from '../../v2/src/engine/game.js';

const table = await loadTable(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
const { board } = table;
const fresh = (seed = 1) => createGame(table, { seed });
const armyOf = (s, rid, region) => s.armies.find((a) => a.owner === rid && (!region || a.region === region));

test('the board: provinces around every city, town and castle, linked by road and open country', () => {
  const regions = Object.values(board.regions);
  assert.ok(regions.length >= 70, `${regions.length} regions`);
  for (const p of ['temeria', 'redania', 'kaedwen', 'aedirn', 'nilfgaard']) {
    assert.ok(regions.some((r) => r.realm === p && r.capital), `${p} has a capital`);
  }
  // Every village belongs to a province of its own realm.
  for (const [id, r] of Object.entries(board.regionOf)) {
    const place = table.world.byId[id];
    assert.equal(board.regions[r].realm, place.realm ?? 'temeria', id);
  }
  // Every mainland province can be reached from Vizima.
  const seen = new Set(['vizima']);
  const queue = ['vizima'];
  while (queue.length) {
    const at = queue.pop();
    for (const l of board.adj[at]) {
      const to = l.a === at ? l.b : l.a;
      if (!l.closed && !seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }
  const lost = regions.filter((r) => !seen.has(r.id) && r.realm !== 'skellige');
  assert.deepEqual(lost.map((r) => r.id), []);
});

test('the Pontar and the Yaruga are crossed only at bridges, fords and ferries', () => {
  const great = Object.values(board.links).filter((l) => l.rivers.length);
  assert.ok(great.length >= 6);
  for (const l of great) assert.ok(l.crossing || l.closed, `${l.id} is either a crossing or closed`);
  const crossings = great.filter((l) => l.crossing);
  assert.ok(crossings.some((l) => l.rivers.includes('Pontar')) && crossings.some((l) => l.rivers.includes('Yaruga')));
  assert.ok(great.some((l) => l.closed), 'some ways across are closed');
});

test('a city yields food, production, crowns, faith and renown from its works and people', () => {
  const s = fresh();
  const y = cityYields(s, table, 'vizima');
  for (const k of ['food', 'production', 'crowns', 'renown']) assert.ok(y[k] > 0, k);
  const realm = realmYields(s, table, 'temeria');
  assert.ok(realm.food > realm.eat, 'the realm feeds itself');
  // Heavy taxes fill the treasury faster.
  const heavy = fresh();
  heavy.realms.temeria.tax = 'heavy';
  assert.ok(cityYields(heavy, table, 'vizima').crowns > y.crowns);
});

test('a turn is a month: the treasury fills, the date moves on, and winter halves the march', () => {
  const s = fresh();
  const before = s.realms.temeria.treasury;
  endTurn(s, table);
  assert.equal(s.turn, 1);
  assert.deepEqual(dateOf(table, s.turn), { year: 1262, month: 4 });
  assert.ok(s.realms.temeria.treasury > before);
  assert.equal(movePoints(table, s), table.data.board.moves.points);
  while (dateOf(table, s.turn).month !== 12) endTurn(s, table);
  assert.equal(movePoints(table, s), Math.floor(table.data.board.moves.points / 2));
});

test('the same seed and orders give the same game, and a save resumes it', () => {
  const play = () => {
    const s = fresh(7);
    declareWar(s, table, 'temeria', 'redania');
    declareWar(s, table, 'nilfgaard', 'cintra');
    for (let i = 0; i < 12; i++) endTurn(s, table);
    return s;
  };
  const a = play();
  assert.equal(JSON.stringify(a), JSON.stringify(play()));
  const back = deserialize(serialize(a));
  endTurn(a, table);
  endTurn(back, table);
  assert.equal(JSON.stringify(a), JSON.stringify(back));
  assert.throws(() => deserialize('{"format":"something-else"}'));
});

test('borders are closed in peace; war opens them, and an enemy army stops the march', () => {
  const s = fresh();
  const a = armyOf(s, 'temeria', 'vizima');
  a.region = 'white_bridge';
  a.points = 3;
  const peace = reachable(s, table, a);
  assert.ok(Object.keys(peace).every((id) => s.cities[id].owner === 'temeria'), 'only our own land in peace');
  declareWar(s, table, 'temeria', 'redania');
  const war = reachable(s, table, a);
  assert.ok(Object.keys(war).some((id) => s.cities[id].owner === 'redania'), 'war opens Redania');
  // An enemy army in a region: the march may end there, but not pass through.
  const r = Object.keys(war).find((id) => s.cities[id].owner === 'redania' && war[id].cost === 1);
  armyOf(s, 'redania').region = r;
  const blocked = reachable(s, table, a);
  for (const [id, v] of Object.entries(blocked)) assert.notEqual(v.from, r, `${id} is not reached through ${r}`);
});

test('a closed river link cannot be marched across', () => {
  const closed = Object.values(board.links).find((l) => l.closed);
  const s = fresh();
  for (const rid of Object.keys(s.realms)) if (rid !== 'temeria') declareWar(s, table, 'temeria', rid);
  const a = armyOf(s, 'temeria');
  a.region = closed.a;
  a.points = 99;
  const reach = reachable(s, table, a);
  // If the far bank is reached at all, it is by another way.
  if (reach[closed.b]) assert.notEqual(reach[closed.b].from, closed.a);
});

test('an army deep in enemy land wastes; at home it mends; an unwalled town falls at once, a walled one in time', () => {
  const s = fresh();
  declareWar(s, table, 'temeria', 'redania');
  const a = armyOf(s, 'temeria', 'vizima');
  const town = Object.values(board.regions).find((r) => r.realm === 'redania' && r.type === 'town');
  const city = Object.values(board.regions).find((r) => r.realm === 'redania' && r.type === 'city');
  // Redania's armies are elsewhere (off the board), so nothing contests the march.
  s.armies = s.armies.filter((y) => y.owner !== 'redania');
  a.region = town.id;
  endTurn(s, table);
  assert.equal(controller(s, town.id), 'temeria');
  assert.ok(s.armies.includes(a) && a.companies.every((c) => c.str <= 100));
  // A second army, out of supply in an enemy city, loses men while it besieges.
  const b = armyOf(s, 'temeria', 'maribor');
  b.region = city.id;
  const str = b.companies[0].str;
  endTurn(s, table);
  if (s.armies.includes(b) && b.region === city.id) {
    assert.ok(b.companies[0].str < str, 'attrition');
    assert.ok(s.cities[city.id].siege || controller(s, city.id) === 'temeria');
  }
});

test('production raises companies at our cities; a march into an enemy army is a battle', () => {
  const s = fresh();
  s.realms.temeria.production = 100;
  const n = armyOf(s, 'temeria', 'vizima').companies.length;
  assert.ok(!recruit(s, table, 'temeria', 'vizima', 'foot').error);
  assert.equal(armyOf(s, 'temeria', 'vizima').companies.length, n + 1);
  assert.ok(recruit(s, table, 'temeria', 'tretogor', 'foot').error, 'not in a foreign city');
  declareWar(s, table, 'temeria', 'redania');
  const a = armyOf(s, 'temeria', 'vizima');
  const reach = reachable(s, table, a);
  const target = Object.keys(reach).find((id) => s.cities[id].owner === 'redania');
  const foe = armyOf(s, 'redania');
  foe.region = target;
  const out = moveArmy(s, table, a.id, target);
  assert.ok(out.battle);
  assert.ok(s.log.some((l) => /^Battle at /.test(l.text)));
});

test('at war, the AI marches on its enemy', () => {
  const s = fresh(3);
  declareWar(s, table, 'nilfgaard', 'cintra');
  for (let i = 0; i < 8; i++) endTurn(s, table);
  // It takes Cintran land, and keeps what it has held a while (step 3).
  const taken = Object.values(table.board.regions).filter((r) => r.realm === 'cintra' && (s.cities[r.id].holder === 'nilfgaard' || s.cities[r.id].owner === 'nilfgaard'));
  assert.ok(taken.length > 0, 'the Empire takes Cintran land');
  assert.ok(atWar(s, 'cintra', 'nilfgaard'));
});

test('a month\'s dilemma is answered, or takes its default', () => {
  const s = fresh(2);
  let turns = 0;
  while (!s.dilemma && turns++ < 40) endTurn(s, table);
  assert.ok(s.dilemma, 'a dilemma comes within forty months');
  const love = s.realms.temeria.love;
  assert.ok(!answerDilemma(s, table, 0).error);
  assert.equal(s.dilemma, null);
  assert.ok(Number.isFinite(s.realms.temeria.love) && love >= 0);
});

test('ten years run without NaN, with every meter in range', () => {
  const s = fresh(5);
  declareWar(s, table, 'nilfgaard', 'cintra');
  declareWar(s, table, 'kaedwen', 'aedirn');
  while (!s.over) endTurn(s, table);
  assert.equal(dateOf(table, s.turn).year, 1272);
  for (const [rid, r] of Object.entries(s.realms)) {
    for (const k of ['treasury', 'production', 'devotion', 'renown', 'love', 'fear', 'unrest']) assert.ok(Number.isFinite(r[k]), `${rid}.${k}`);
    for (const k of ['love', 'fear', 'unrest']) assert.ok(r[k] >= 0 && r[k] <= 100, `${rid}.${k} ${r[k]}`);
  }
  for (const c of Object.values(s.cities)) assert.ok(c.pop > 0 && Number.isFinite(c.store));
});

// ---- Steps 3 to 5 ----

import { setFocus, repair, repairCost, damage, annex, condOf } from '../../v2/src/engine/cities.js';
import { goalsOf, goalStatus, buildable, raise, companyTypes, chapterOf } from '../../v2/src/engine/goals.js';
import { sendEnvoy, sealRoutes, seal, leader, vassalsOf, doFavour, judge, monthlyMinors, passage } from '../../v2/src/engine/minors.js';
import { goalContext, realmBonus, companyCost } from '../../v2/src/engine/game.js';

test('a city\'s focus moves its yields; war wears its works and production mends them', () => {
  const s = fresh();
  const plain = cityYields(s, table, 'maribor');
  setFocus(s, table, 'temeria', 'maribor', 'production');
  const forged = cityYields(s, table, 'maribor');
  assert.ok(forged.production > plain.production && forged.crowns < plain.crowns);
  setFocus(s, table, 'temeria', 'maribor', 'balanced');
  damage(s, table, 'maribor', 50);
  assert.ok(cityYields(s, table, 'maribor').food < plain.food, 'worn works yield less');
  const cost = repairCost(s, table, 'maribor');
  assert.ok(cost > 0);
  assert.ok(repair(s, table, 'temeria', 'maribor').error, 'not without the production');
  s.realms.temeria.production = cost;
  assert.ok(repair(s, table, 'temeria', 'maribor').ok);
  assert.equal(condOf(s, 'maribor', 'fields'), 100);
});

test('a city taken and kept settles: it yields a little at first and more each month', () => {
  const s = fresh();
  declareWar(s, table, 'temeria', 'redania');
  s.cities.rinde.holder = 'temeria';
  assert.ok(!annex(s, table, 'temeria', 'rinde').error);
  assert.equal(s.cities.rinde.owner, 'temeria');
  const first = cityYields(s, table, 'rinde').crowns;
  const start = s.cities.rinde.integration;
  for (let i = 0; i < 6; i++) endTurn(s, table);
  if (s.cities.rinde.owner === 'temeria' && !s.cities.rinde.holder) {
    assert.ok(s.cities.rinde.integration === undefined || s.cities.rinde.integration > start);
    assert.ok(cityYields(s, table, 'rinde').crowns > first * 0.9);
  }
});

test('goals: met at the end of a month, they unlock units, buildings and wonders', () => {
  const s = fresh();
  assert.equal(chapterOf(table, dateOf(table, 0)).id, 'dawn');
  assert.ok(!companyTypes(s, table, 'temeria').includes('temerian_crossbows'));
  // Ten companies: the host is mustered.
  const a = armyOf(s, 'temeria', 'vizima');
  while (s.armies.filter((x) => x.owner === 'temeria').reduce((n, x) => n + x.companies.length, 0) < 10) a.companies.push({ type: 'foot', str: 100 });
  const host = goalsOf(table, 'temeria').find((g) => g.id === 't_host');
  assert.ok(goalStatus(s, table, 'temeria', host, goalContext(s)).ok);
  endTurn(s, table);
  assert.ok(s.realms.temeria.goals.includes('t_host'));
  assert.ok(companyTypes(s, table, 'temeria').includes('temerian_crossbows'));
  assert.ok(s.log.some((l) => /Goal met: Muster the crown's host/.test(l.text)));
  // Devotion of 60: the Temple of Melitele, raised at Ellander with production.
  s.realms.temeria.devotion = 60;
  endTurn(s, table);
  const temple = buildable(s, table, 'temeria').find((b) => b.id === 'temple_of_melitele');
  assert.ok(temple);
  s.realms.temeria.production = 1000;
  const before = cityYields(s, table, 'ellander').faith;
  assert.ok(raise(s, table, 'temeria', 'temple_of_melitele').ok);
  assert.ok(cityYields(s, table, 'ellander').faith > before);
  assert.ok(raise(s, table, 'temeria', 'temple_of_melitele').error, 'a wonder is raised once');
});

test('every power has two trees in every chapter, and every unlock exists', () => {
  const u = table.data.uniques;
  for (const p of table.data.game.powers) {
    const goals = goalsOf(table, p);
    for (const ch of table.data.goals.chapters) for (const tree of ['arms', 'faith']) {
      assert.ok(goals.some((g) => g.chapter === ch.id && g.tree === tree), `${p} ${ch.id} ${tree}`);
    }
    for (const g of goals) {
      const k = g.unlock;
      assert.ok(k.bonus || u.units[k.unit] || u.buildings[k.building] || u.wonders[k.wonder], `${p} ${g.id}`);
      for (const id of [...(g.need.control ?? []), ...(g.need.garrison ?? []), g.need.pop?.region].filter(Boolean)) assert.ok(board.regions[id], `${g.id}: ${id}`);
    }
    for (const b of [...Object.values(u.buildings), ...Object.values(u.wonders)]) assert.ok(board.regions[b.at], b.name);
  }
});

test('Kaedwen\'s drill yards make companies cheaper; unique units carry their abilities', () => {
  const s = fresh();
  const plain = companyCost(s, table, 'kaedwen', 'foot');
  s.realms.kaedwen.goals.push('k_host');
  s.realms.kaedwen.production = 1000;
  assert.ok(raise(s, table, 'kaedwen', 'drill_yards').ok);
  assert.ok(companyCost(s, table, 'kaedwen', 'foot') < plain);
  // Riders alone go a march further.
  s.realms.temeria.goals.push('t_sodden');
  s.realms.temeria.production = 500;
  const r = recruit(s, table, 'temeria', 'mayena', 'royal_knights');
  const knights = s.armies.find((a) => a.id === r.army);
  assert.ok(knights.companies.every((c) => c.type === 'royal_knights'));
  endTurn(s, table);
  const k2 = s.armies.find((a) => a.id === r.army);
  assert.equal(k2.points, table.data.board.moves.points + 1);
});

test('envoys, the lead at a court, and sealing a vassal by pressure', () => {
  const s = fresh();
  s.realms.temeria.renown = 200;
  for (let i = 0; i < 3; i++) assert.ok(sendEnvoy(s, table, 'temeria', 'brugge').ok);
  assert.equal(leader(s, 'brugge'), 'temeria');
  assert.ok(passage(s, 'temeria', 'brugge'), 'an envoy opens its roads');
  // Our companies outnumber Brugge's three to one: pressure, with a gift.
  assert.ok(sealRoutes(s, table, 'temeria', 'brugge').includes('pressure'));
  s.realms.temeria.treasury = 200;
  assert.ok(seal(s, table, 'temeria', 'brugge', 'pressure').ok);
  assert.deepEqual(vassalsOf(s, 'temeria'), ['brugge']);
  assert.ok(realmBonus(s, table, 'temeria').production >= 3, 'a frontier vassal gives production');
  // A vassal follows its suzerain to war.
  declareWar(s, table, 'temeria', 'nilfgaard');
  assert.ok(atWar(s, 'brugge', 'nilfgaard'));
});

test('peace terms: hold a crown\'s capital and seal it, and the war ends', () => {
  const s = fresh();
  s.realms.temeria.renown = 200;
  for (let i = 0; i < 3; i++) sendEnvoy(s, table, 'temeria', 'sodden');
  declareWar(s, table, 'temeria', 'sodden');
  s.cities.sodden_keep.holder = 'temeria';
  assert.ok(sealRoutes(s, table, 'temeria', 'sodden').includes('terms'));
  assert.ok(seal(s, table, 'temeria', 'sodden', 'terms').ok);
  assert.ok(!atWar(s, 'temeria', 'sodden'));
  assert.equal(s.cities.sodden_keep.holder, null);
});

test('a favour paid brings envoys; a rival with more courts a vassal away', () => {
  const s = fresh();
  s.minors.kerack.quest = { kind: 'gift', n: 120, place: 'kerack_city', turn: 0 };
  s.realms.temeria.treasury = 500;
  assert.ok(doFavour(s, table, 'temeria', 'kerack').ok);
  assert.equal(s.minors.kerack.envoys.temeria, table.data.minors.questEnvoys);
  s.minors.kerack.suzerain = 'temeria';
  s.minors.kerack.envoys.redania = 6;
  monthlyMinors(s, table);
  assert.equal(s.minors.kerack.suzerain, null);
});

test('a rebel vassal, its capital taken, is judged', () => {
  const s = fresh();
  s.minors.verden.rebel = 'temeria';
  declareWar(s, table, 'verden', 'temeria');
  s.cities.verden_town.holder = 'temeria';
  monthlyMinors(s, table);
  assert.deepEqual(s.judgement, { minor: 'verden', by: 'temeria' });
  const fear = s.realms.temeria.fear;
  assert.ok(judge(s, table, 'temeria', 'verden', 'execute').ok);
  assert.ok(s.realms.temeria.fear > fear);
  assert.equal(s.minors.verden.suzerain, 'temeria');
  assert.ok(!atWar(s, 'temeria', 'verden'));
  assert.equal(s.judgement, null);
  // Annexing a rebel makes its lands ours.
  s.minors.verden.rebel = 'temeria';
  assert.ok(judge(s, table, 'temeria', 'verden', 'annex').ok);
  assert.ok(Object.values(board.regions).filter((r) => r.realm === 'verden').every((r) => s.cities[r.id].owner === 'temeria'));
  assert.ok(!s.minors.verden);
});

test('a version 1 save gains the new parts', () => {
  const s = fresh();
  delete s.minors;
  delete s.built;
  for (const c of Object.values(s.cities)) delete c.focus;
  const old = JSON.stringify({ format: 'northern-wars-v2', version: 1, state: s });
  const up = deserialize(old, table);
  assert.ok(up.minors.sodden && up.built && up.cities.vizima.focus === 'balanced');
  endTurn(up, table);
});

// ---- Step 6: battles and sieges ----

import { setupBattle, autoPlace, placeCompany, fightRound, soundRetreat, lanePower, oddsNow } from '../../v2/src/engine/battle.js';
import { finishBattle, battleAuto, marchOdds, storm, termsOpen, offerTerms, stormOdds } from '../../v2/src/engine/game.js';
import { makeRng } from '../../src/sim/rng.js';

const armyAt = (s, owner, region, types) => {
  const a = { id: s.nextArmy++, owner, region, companies: types.map((type) => ({ type, str: 100 })), points: 3 };
  s.armies.push(a);
  return a;
};

test('the lanes: horse is strong in the open and poor in the woods; an empty flank is turned', () => {
  const s = fresh();
  const att = armyAt(s, 'temeria', 'vizima', ['horse', 'horse']);
  const def = armyAt(s, 'redania', 'vizima', ['foot', 'foot']);
  const open = setupBattle(s, table, { attackers: [att], defenders: [def], region: 'vizima', month: 6 });
  const woods = { ...open, terrain: 'forest' };
  autoPlace(table, open, 0);
  assert.ok(lanePower(table, open, 0, 'left') > lanePower(table, woods, 0, 'left'));
  // All of our horse in the centre: both enemy flanks... and ours left empty.
  const b = setupBattle(s, table, { attackers: [att], defenders: [def], region: 'vizima', month: 6 });
  for (const c of b.sides[0].comps) placeCompany(b, 0, c.key, 'centre');
  const before = b.sides[0].lanes.centre.length;
  fightRound(table, b, makeRng(1));
  assert.equal(b.round, 1);
  assert.ok(b.sides[0].lanes.centre.length <= before);
  assert.ok(b.log[0].startsWith('Round 1'));
  // After the first round only the reserve may move.
  assert.equal(placeCompany(b, 0, b.sides[0].lanes.centre[0], 'left'), false);
});

test('a battle ends in a rout, at the last round, or a retreat; odds are a share', () => {
  const s = fresh();
  const att = armyAt(s, 'temeria', 'vizima', ['foot', 'foot', 'bow', 'horse']);
  const def = armyAt(s, 'redania', 'vizima', ['foot']);
  const b = setupBattle(s, table, { attackers: [att], defenders: [def], region: 'vizima', month: 6 });
  autoPlace(table, b, 0);
  const odds = oddsNow(table, b, 5);
  assert.ok(odds > 0.5 && odds <= 1, `strong side odds ${odds}`);
  const rng = makeRng(3);
  while (!b.over) fightRound(table, b, rng);
  assert.ok(['rout', 'field'].includes(b.over.reason));
  const r = setupBattle(s, table, { attackers: [att], defenders: [def], region: 'vizima', month: 6 });
  soundRetreat(table, r, 0);
  assert.deepEqual(r.over, { winner: 1, reason: 'retreat' });
});

test('the player\'s march into an enemy army waits on the battle screen, then is written back', () => {
  const s = fresh();
  declareWar(s, table, 'temeria', 'redania');
  const a = armyOf(s, 'temeria', 'vizima');
  const reach = reachable(s, table, a);
  const target = Object.keys(reach).find((id) => s.cities[id].owner === 'redania');
  const foe = armyAt(s, 'redania', target, ['foot']);
  const odds = marchOdds(s, table, a.id, target);
  assert.ok(odds >= 0 && odds <= 1);
  const out = moveArmy(s, table, a.id, target, { interactive: true });
  assert.equal(out.battle, 'pending');
  assert.ok(s.battle && s.battle.region === target);
  assert.ok(moveArmy(s, table, a.id, target).error, 'one battle at a time');
  battleAuto(s, table);
  const won = finishBattle(s, table, s.battle);
  assert.equal(s.battle, null);
  if (won) assert.ok(!s.armies.includes(foe) || foe.region !== target);
  // A battle left unfought is fought out at the end of the turn.
  const s2 = fresh();
  declareWar(s2, table, 'temeria', 'redania');
  const a2 = armyOf(s2, 'temeria', 'vizima');
  armyAt(s2, 'redania', target, ['foot']);
  moveArmy(s2, table, a2.id, target, { interactive: true });
  endTurn(s2, table);
  assert.equal(s2.battle, null);
});

test('sieges: a walled city eats its stores and is starved out, or stormed, or yields on terms', () => {
  const s = fresh();
  declareWar(s, table, 'temeria', 'redania');
  s.armies = s.armies.filter((a) => a.owner !== 'redania');
  const city = 'tretogor';
  const a = armyAt(s, 'temeria', city, ['foot']);
  s.cities[city].store = 12;
  endTurn(s, table);
  assert.equal(s.cities[city].siege?.by, 'temeria');
  assert.ok(s.cities[city].store < 12, 'it eats its stores');
  assert.equal(controller(s, city), 'redania');
  let n = 0;
  while (controller(s, city) !== 'temeria' && n++ < 6) endTurn(s, table);
  assert.equal(controller(s, city), 'temeria', 'starved out');
  // Storming: odds, then the garrison fights behind its walls.
  const s2 = fresh();
  declareWar(s2, table, 'temeria', 'redania');
  s2.armies = s2.armies.filter((x) => x.owner !== 'redania');
  armyAt(s2, 'temeria', 'novigrad', ['foot', 'foot', 'foot', 'bow', 'horse', 'horse']);
  endTurn(s2, table);
  const odds = stormOdds(s2, table, 'temeria', 'novigrad');
  assert.ok(odds > 0);
  const out = storm(s2, table, 'temeria', 'novigrad');
  assert.ok(out.battle);
  if (out.won) assert.equal(controller(s2, 'novigrad'), 'temeria');
  // Terms: when the besiegers outnumber the garrison three to one.
  const s3 = fresh();
  declareWar(s3, table, 'temeria', 'redania');
  s3.armies = s3.armies.filter((x) => x.owner !== 'redania');
  armyAt(s3, 'temeria', 'drakenborg', ['foot', 'foot', 'foot', 'foot', 'horse', 'horse', 'horse', 'horse']);
  armyAt(s3, 'temeria', 'drakenborg', ['horse', 'horse', 'horse', 'horse', 'horse', 'horse']);
  endTurn(s3, table);
  if (controller(s3, 'drakenborg') !== 'temeria') {
    assert.ok(termsOpen(s3, table, 'temeria', 'drakenborg'));
    assert.ok(offerTerms(s3, table, 'temeria', 'drakenborg').ok);
    assert.equal(controller(s3, 'drakenborg'), 'temeria');
  }
});
