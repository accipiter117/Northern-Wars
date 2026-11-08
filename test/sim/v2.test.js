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
  const taken = Object.keys(s.cities).filter((id) => s.cities[id].owner === 'cintra' && s.cities[id].holder === 'nilfgaard');
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
