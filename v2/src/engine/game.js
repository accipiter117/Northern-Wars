// The v2 game: one turn a month, the player moves, then each AI power
// moves in turn, then the month's systems run once. Pure: the state is
// plain JSON, its random stream lives in state.rng, and the same seed and
// orders always give the same game.
//   Step 1 and 2: turns, yields, the board, movement, supply, sieges.
//   Step 3 (cities.js): focus, war damage and repairs, annexing and settling.
//   Step 4 (goals.js): goals, unique units, buildings and wonders.
//   Step 5 (minors.js): the smaller crowns as city-states.
//   Step 6 (battle.js): the lanes battle, its odds, and sieges across turns.
//   Step 7 (diplomacy.js, spies.js): opinions, treaties, peace, spies; the AI's board play.
import { makeRng } from '../../../src/sim/rng.js';
import { startingWorks } from '../../../src/sim/works.js';
import { buildBoard, other, TEMERIA } from './board.js';
import { nameOf, say, atWar, makeWar, controller, clamp, authority, isPower } from './core.js';
import { worksOf, condOf, damage, settled, monthlyCities, unsettledUnrest, aiAnnex, repair, repairCost } from './cities.js';
import { chapterOf, checkGoals, companyTypes, companyDef, uniqueYields, goalBonus, aiRaise } from './goals.js';
import { newMinors, vassalsOf, envoysPlaced, suzerainBonus, passage, vassalsFollow, monthlyMinors, aiMinors, judge } from './minors.js';
import { setupBattle, runToEnd, battleOdds, applyBattle, fightRound, soundRetreat, autoPlace } from './battle.js';
import { newDiplomacy, onWar, addScore, mayCross, allied, tradeCrowns, monthlyDiplomacy, aiDiplomacy, opinionOf } from './diplomacy.js';
import { newSpies, monthlySpies, aiSpies } from './spies.js';

export { nameOf, atWar, controller, authority };

export const SAVE_FORMAT = 'northern-wars-v2';
export const VERSION = 4;

// ---- The world as the game sees it ----

// The board, each region's works and the realms' tiers, built once.
export function makeTable(world, data) {
  const board = buildBoard(world, data.board);
  const works = {};
  for (const r of Object.values(board.regions)) {
    const list = [];
    for (const m of r.members) for (const b of startingWorks(world, m, r.realm).buildings) list.push(b);
    works[r.id] = list;
  }
  const tiers = { [TEMERIA]: 'great' };
  for (const [rid, r] of Object.entries(world.realms?.realms ?? {})) tiers[rid] = r.tier ?? 'petty';
  const colours = { ...Object.fromEntries(Object.entries(world.realms?.realms ?? {}).map(([k, v]) => [k, v.colours])), ...data.game.colours };
  return { world, data, board, works, tiers, colours };
}

// ---- Dates ----

export function dateOf(table, turn) {
  const s = table.data.game.start;
  const m = s.month - 1 + turn;
  return { year: s.year + Math.floor(m / 12), month: (m % 12) + 1 };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => MONTHS[m - 1];

export const chapterNow = (state, table) => chapterOf(table, dateOf(table, state.turn));

// ---- A new game ----

export function createGame(table, { seed = 1, player = TEMERIA } = {}) {
  const g = table.data.game;
  const { board } = table;
  const realms = {};
  const cities = {};
  for (const r of Object.values(board.regions)) {
    realms[r.realm] ??= { treasury: 300, production: 0, devotion: 0, renown: 0, love: 55, fear: 20, unrest: 20, tax: 'fair', goals: [] };
    const pop = r.members.reduce((a, m) => a + (g.people[table.world.byId[m]?.type] ?? 0), 0);
    cities[r.id] = { owner: r.realm, holder: null, pop, store: 10, siege: null, focus: 'balanced' };
  }
  const state = {
    version: VERSION, seed, rng: seed >>> 0, turn: 0, player,
    realms, cities, armies: [], nextArmy: 1, wars: [], dilemma: null, log: [], over: null,
    minors: newMinors(table, realms), built: {}, judgement: null, battle: null,
  };
  state.diplomacy = newDiplomacy(state, table);
  state.spies = newSpies(table);
  // Each realm's opening armies: at its capital, then its next largest places.
  for (const rid of Object.keys(realms)) {
    const plan = g.start_armies[table.tiers[rid] ?? 'petty'] ?? [];
    const homes = Object.values(board.regions).filter((r) => r.realm === rid)
      .sort((a, b) => (b.capital - a.capital) || (cities[b.id].pop - cities[a.id].pop));
    plan.forEach((types, i) => {
      const at = homes[Math.min(i, homes.length - 1)];
      if (at) addArmy(state, rid, at.id, types);
    });
  }
  resetPoints(state, table);
  return state;
}

function addArmy(state, owner, region, types) {
  const a = { id: state.nextArmy++, owner, region, companies: types.map((type) => ({ type, str: 100 })), points: 0 };
  state.armies.push(a);
  return a;
}

// ---- War and peace ----

export function declareWar(state, table, a, b) {
  if (!makeWar(state, a, b)) return false;
  say(state, `${nameOf(table, a)} declares war on ${nameOf(table, b)}.`);
  onWar(state, table, a, b);
  // Each side's vassals take up its quarrel.
  vassalsFollow(state, a, b);
  vassalsFollow(state, b, a);
  return true;
}

// ---- Yields ----

// Everything that changes a realm's month: goals, uniques and vassals.
export function realmBonus(state, table, rid) {
  const b = goalBonus(state, table, rid);
  for (const [k, v] of Object.entries(suzerainBonus(state, table, rid))) b[k] = (b[k] ?? 0) + v;
  b.crowns += tradeCrowns(state, table, rid);
  return b;
}

export function cityYields(state, table, id) {
  const g = table.data.game;
  const c = state.cities[id];
  const realm = state.realms[c.owner];
  const out = { food: 0, production: 0, crowns: 0, faith: 0, renown: 0 };
  // Each works by its condition (war wears them), counted once.
  for (const b of worksOf(table, id)) {
    const n = table.works[id].filter((x) => x === b).length;
    for (const [k, v] of Object.entries(g.works[b] ?? { crowns: 1 })) out[k] += v * n * (condOf(state, id, b) / 100);
  }
  for (const [k, v] of Object.entries(g.perThousand)) out[k] += (c.pop / 1000) * v;
  for (const [k, v] of Object.entries(uniqueYields(state, table, id))) out[k] += v;
  // Where the city's hands go this month.
  const f = g.cities.focus;
  if (c.focus && c.focus !== 'balanced') for (const k of Object.keys(out)) out[k] *= k === c.focus ? f.up : f.down;
  out.crowns *= g.tax[realm.tax]?.crowns ?? 1;
  if (riots(state, table, c.owner)) out.production *= g.mood.riotProduction;
  // A conquered city gives more as it settles; one in enemy hands, nothing.
  const share = c.holder ? 0 : settled(table, c);
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * share * 10) / 10;
  return out;
}

export function riots(state, table, rid) {
  const m = table.data.game.mood;
  const r = state.realms[rid];
  return authority(r) < m.riotAuthority && r.unrest > m.riotUnrest;
}

export function realmYields(state, table, rid) {
  const out = { food: 0, production: 0, crowns: 0, faith: 0, renown: 0, upkeep: 0, eat: 0 };
  for (const [id, c] of Object.entries(state.cities)) {
    if (c.owner !== rid) continue;
    const y = cityYields(state, table, id);
    for (const k of Object.keys(y)) out[k] += y[k];
    if (!c.holder) out.eat += (c.pop / 1000) * table.data.game.eat;
  }
  const bonus = realmBonus(state, table, rid);
  for (const k of ['production', 'crowns', 'faith', 'renown']) out[k] += bonus[k] ?? 0;
  for (const a of state.armies) if (a.owner === rid) for (const co of a.companies) out.upkeep += companyDef(table, co.type).upkeep;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

// ---- Movement ----

const winter = (table, state) => table.data.board.moves.winterMonths.includes(dateOf(table, state.turn).month);

// The month's march points for the realm's common armies.
export function movePoints(table, state) {
  const p = table.data.board.moves.points;
  return winter(table, state) ? Math.floor(p / 2) : p;
}

// One army's points: the month's, the realm's roads, and riders alone go further.
export function armyPoints(state, table, a) {
  const base = table.data.board.moves.points + (realmBonus(state, table, a.owner).movePoints ?? 0)
    + (a.companies.length && a.companies.every((c) => companyDef(table, c.type).move) ? 1 : 0);
  return winter(table, state) ? Math.floor(base / 2) : base;
}

function resetPoints(state, table) {
  for (const a of state.armies) a.points = armyPoints(state, table, a);
}

const enemyArmyAt = (state, region, rid) => state.armies.find((a) => a.region === region && atWar(state, a.owner, rid));

const allSpies = (table, army) => army.companies.length > 0 && army.companies.every((c) => companyDef(table, c.type).spy);

// May an army set foot in a region: its realm's own, one it holds, a realm
// it is at war with, a smaller crown that welcomes its envoys or is its
// vassal; spies go anywhere. Other peaceful borders are closed.
function mayEnter(state, table, army, region) {
  const rid = army.owner;
  const c = state.cities[region];
  const ctl = controller(state, region);
  return ctl === rid || c.owner === rid || atWar(state, rid, ctl) || atWar(state, rid, c.owner)
    || (ctl === c.owner && passage(state, rid, c.owner)) || (ctl === c.owner && mayCross(state, rid, ctl)) || allSpies(table, army);
}

export function linkCost(table, link) {
  const m = table.data.board.moves;
  if (link.closed) return Infinity;
  return (link.road ? m.road : m.open) + (!link.road && link.streams.length ? m.stream : 0);
}

// Every region the army can reach this turn, with the cost and the step
// before it. Entering a region with an enemy army ends the march there
// (zone of control): it is a battle, not a road.
export function reachable(state, table, army) {
  const { adj } = table.board;
  const best = { [army.region]: { cost: 0, from: null } };
  const queue = [army.region];
  while (queue.length) {
    queue.sort((x, y) => best[x].cost - best[y].cost);
    const at = queue.shift();
    if (at !== army.region && enemyArmyAt(state, at, army.owner)) continue;
    for (const link of adj[at]) {
      const to = other(link, at);
      const cost = best[at].cost + linkCost(table, link);
      if (cost > army.points || !mayEnter(state, table, army, to)) continue;
      if (best[to] && best[to].cost <= cost) continue;
      best[to] = { cost, from: at };
      queue.push(to);
    }
  }
  delete best[army.region];
  return best;
}

export function pathTo(reach, start, dest) {
  const path = [];
  for (let at = dest; at && at !== start; at = reach[at]?.from) path.unshift(at);
  return path;
}

const walled = (table, region) => ['city', 'castle'].includes(table.board.regions[region].type);

// An army's strength; defending a walled place, its realm's walls and its
// steadiest companies count for more.
export function strength(table, army, state = null, defending = null) {
  let s = 0;
  for (const c of army.companies) {
    const d = companyDef(table, c.type);
    s += (c.str / 100) * d.power * (defending && walled(table, defending) ? (d.defend ?? 1) : 1);
  }
  if (state && defending && walled(table, defending)) s *= 1.2 * (realmBonus(state, table, army.owner).defend ?? 1);
  return s;
}

// Move an army; a march into an enemy army is a battle. The player's
// battles wait in state.battle to be fought on the battle screen
// (`interactive`); everyone else's are fought out at once.
export function moveArmy(state, table, armyId, dest, { interactive = false } = {}) {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army) return { error: 'No such army.' };
  if (state.over) return { error: 'The war is over.' };
  if (state.battle) return { error: 'A battle is still to be fought.' };
  const reach = reachable(state, table, army);
  if (!reach[dest]) return { error: 'It cannot reach there this turn.' };
  const from = army.region;
  army.points -= reach[dest].cost;
  if (enemyArmyAt(state, dest, army.owner)) {
    // The army halts at the step before and fights for the region.
    const path = pathTo(reach, from, dest);
    army.region = path.length > 1 ? path[path.length - 2] : from;
    army.points = 0;
    const b = setupBattle(state, table, battleSides(state, table, army, dest));
    if (interactive) {
      state.battle = b;
      return { battle: 'pending' };
    }
    const rng = makeRng(state.rng);
    runToEnd(table, b, rng);
    state.rng = rng.seed;
    return { battle: true, won: finishBattle(state, table, b) };
  }
  army.region = dest;
  return { moved: true };
}

function battleSides(state, table, army, region) {
  const defenders = state.armies.filter((a) => a.region === region && atWar(state, a.owner, army.owner));
  return { attackers: [army], defenders, region, month: dateOf(table, state.turn).month };
}

// The odds of a march into an enemy army, for the player to weigh.
export function marchOdds(state, table, armyId, dest) {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || !enemyArmyAt(state, dest, army.owner)) return null;
  return battleOdds(state, table, battleSides(state, table, army, dest));
}

// A finished battle: losses written back, the beaten defenders fall back,
// victorious attackers take the field, and a stormed city falls.
export function finishBattle(state, table, b) {
  const won = applyBattle(state, table, b);
  damage(state, table, b.region, table.data.game.cities.damage.battle, 1);
  addScore(state, table, b.sides[won ? 0 : 1].owner, b.sides[won ? 1 : 0].owner, 'battle');
  const att = b.sides[0];
  if (b.storm) {
    if (won) take(state, table, att.owner, b.region, 'storm');
  } else if (won) {
    for (const id of b.sides[1].armies) {
      const d = state.armies.find((a) => a.id === id);
      if (d) retreat(state, table, d);
    }
    state.armies = state.armies.filter((a) => a.companies.length);
    if (!enemyArmyAt(state, b.region, att.owner)) for (const id of att.armies) { const a = state.armies.find((x) => x.id === id); if (a) a.region = b.region; }
  }
  if (state.battle === b) state.battle = null;
  return won;
}

// The player's battle, round by round.
export function battleRound(state, table) {
  if (!state.battle) return null;
  const rng = makeRng(state.rng);
  fightRound(table, state.battle, rng);
  state.rng = rng.seed;
  return state.battle;
}
export function battleAuto(state, table) {
  if (!state.battle) return null;
  const rng = makeRng(state.rng);
  while (!state.battle.over) fightRound(table, state.battle, rng);
  state.rng = rng.seed;
  return state.battle;
}
export function battleRetreat(state, table) {
  if (state.battle) soundRetreat(table, state.battle, state.battle.sides[0].owner === state.player ? 0 : 1);
  return state.battle;
}

// The stand-in battle of steps 1 and 2, kept for anything that still asks
// for one: now the lanes battle, fought out.
export function battle(state, table, att, def, region) {
  const b = setupBattle(state, table, { attackers: [att], defenders: [def], region, month: dateOf(table, state.turn).month });
  const rng = makeRng(state.rng);
  runToEnd(table, b, rng);
  state.rng = rng.seed;
  return finishBattle(state, table, b);
}

// ---- Sieges ----

const garrisonOf = (table, region) => table.data.battle.garrison[table.board.regions[region].type] ?? ['foot'];

function take(state, table, rid, region, how) {
  const c = state.cities[region];
  addScore(state, table, rid, controller(state, region), 'city');
  const dmg = table.data.game.cities.damage;
  c.holder = c.owner === rid ? null : rid;
  c.siege = null;
  c.heldFor = 0;
  damage(state, table, region, how === 'terms' ? dmg.capture / 2 : dmg.capture);
  const place = table.board.regions[region].name;
  const text = { storm: `storms and takes ${place}`, starve: `starves out ${place}`, terms: `takes ${place} on terms` }[how] ?? `takes ${place}`;
  say(state, `${nameOf(table, rid)} ${text}.`);
}

const besiegers = (state, rid, region) => state.armies.filter((a) => a.owner === rid && a.region === region);

// May a besieger offer terms: it outnumbers the garrison, or the stores are
// nearly gone.
export function termsOpen(state, table, rid, region) {
  const c = state.cities[region];
  if (c.siege?.by !== rid) return false;
  const ours = besiegers(state, rid, region).reduce((n, a) => n + strength(table, a), 0);
  const theirs = garrisonOf(table, region).length * table.data.battle.walls;
  return ours >= theirs * table.data.battle.termsRatio || c.store <= table.data.battle.termsStores;
}

export function offerTerms(state, table, rid, region) {
  if (!termsOpen(state, table, rid, region)) return { error: 'They will not yield yet.' };
  take(state, table, rid, region, 'terms');
  return { ok: true };
}

// Storm the walls: a battle against the garrison behind them.
export function storm(state, table, rid, region, { interactive = false } = {}) {
  const c = state.cities[region];
  const ours = besiegers(state, rid, region);
  if (c.siege?.by !== rid || !ours.length) return { error: 'We are not besieging it.' };
  if (state.battle) return { error: 'A battle is still to be fought.' };
  const b = setupBattle(state, table, { attackers: ours, defenders: [], region, month: dateOf(table, state.turn).month, storm: true });
  b.sides[0].armies = ours.map((a) => a.id);
  b.sides[0].comps = ours.flatMap((a) => a.companies.map((k, i) => ({ key: `${a.id}-${i}`, army: a.id, idx: i, type: k.type, str: k.str })));
  b.sides[0].start = b.sides[0].comps.reduce((n, k) => n + k.str, 0);
  autoPlace(table, b, 0);
  for (const a of ours) a.points = 0;
  if (interactive) {
    state.battle = b;
    return { battle: 'pending' };
  }
  const rng = makeRng(state.rng);
  runToEnd(table, b, rng);
  state.rng = rng.seed;
  return { battle: true, won: finishBattle(state, table, b) };
}

export function stormOdds(state, table, rid, region) {
  const ours = besiegers(state, rid, region);
  if (!ours.length) return null;
  return battleOdds(state, table, { attackers: ours, defenders: [], region, month: dateOf(table, state.turn).month, storm: true });
}

function retreat(state, table, army) {
  const ways = table.board.adj[army.region].filter((l) => !l.closed).map((l) => other(l, army.region));
  const back = ways.find((id) => controller(state, id) === army.owner && !enemyArmyAt(state, id, army.owner));
  if (back) army.region = back;
  else army.companies = [];
}

// ---- Recruiting ----

export function companyCost(state, table, rid, type) {
  return Math.round(companyDef(table, type).cost * (realmBonus(state, table, rid).companyCost ?? 1));
}

export function recruit(state, table, rid, region, type) {
  const g = table.data.game;
  const c = state.cities[region];
  const realm = state.realms[rid];
  if (!c || c.owner !== rid || c.holder) return { error: 'Not one of our cities.' };
  if (!companyTypes(state, table, rid).includes(type)) return { error: 'Not ours to raise.' };
  const cost = companyCost(state, table, rid, type);
  if (realm.production < cost) return { error: `Needs ${cost} production (${Math.floor(realm.production)} in hand).` };
  let army = state.armies.find((a) => a.owner === rid && a.region === region && a.companies.length < g.maxCompanies);
  realm.production -= cost;
  if (army) army.companies.push({ type, str: 100 });
  else {
    army = addArmy(state, rid, region, [type]);
    army.points = 0;
  }
  return { army: army.id };
}

// ---- The end of a side's moves: supply and taking places ----

function finishSide(state, table, rid) {
  const s = table.data.board.supply;
  const dmg = table.data.game.cities.damage;
  for (const a of state.armies.filter((x) => x.owner === rid)) {
    const ctl = controller(state, a.region);
    const owner = state.cities[a.region].owner;
    const supplied = ctl === rid || (owner === rid && !atWar(state, rid, ctl)) || state.minors[owner]?.suzerain === rid || allied(state, rid, ctl);
    for (const c of a.companies) c.str = clamp(c.str + (supplied ? s.heal : -s.attrition), 0, 100);
    a.companies = a.companies.filter((c) => c.str >= 10);
    if (!supplied && a.companies.length) a.hungry = true; else delete a.hungry;
  }
  state.armies = state.armies.filter((a) => a.companies.length);
  for (const a of state.armies.filter((x) => x.owner === rid)) {
    const c = state.cities[a.region];
    if (enemyArmyAt(state, a.region, rid)) continue;
    if (c.owner === rid && c.holder) {
      c.holder = null;
      c.siege = null;
      say(state, `${nameOf(table, rid)} retakes ${table.board.regions[a.region].name}.`);
      continue;
    }
    if (!atWar(state, rid, controller(state, a.region)) || c.holder === rid) continue;
    if (c.siege?.by === rid && c.siege.turn === state.turn) continue; // one army's siege a month is enough
    // An open town falls at once.
    if (!walled(table, a.region)) {
      take(state, table, rid, a.region, 'march');
      continue;
    }
    // A walled place is besieged: it eats its stores and its works are worn.
    c.siege = c.siege?.by === rid ? { by: rid, turns: c.siege.turns + 1, turn: state.turn } : { by: rid, turns: 1, turn: state.turn };
    c.store -= (c.pop / 1000) * table.data.game.eat;
    damage(state, table, a.region, dmg.siege, 2);
    if (c.store <= 0) {
      c.store = 0;
      take(state, table, rid, a.region, 'starve');
    } else if (rid !== state.player) aiSiege(state, table, rid, a.region);
  }
  // A siege with no besieger left is lifted.
  for (const c of Object.values(state.cities)) if (c.siege?.by === rid && !state.armies.some((x) => x.owner === rid && state.cities[x.region] === c)) c.siege = null;
}

// The AI storms when it is strong enough, offers terms when it may, and
// otherwise starves the place out.
function aiSiege(state, table, rid, region) {
  const ours = besiegers(state, rid, region).reduce((n, a) => n + strength(table, a), 0);
  const theirs = garrisonOf(table, region).length * table.data.battle.walls;
  if (termsOpen(state, table, rid, region)) offerTerms(state, table, rid, region);
  else if (ours >= theirs * table.data.battle.aiStorm) storm(state, table, rid, region);
}

// ---- The AI's moves (a placeholder until step 7) ----

function aiTurn(state, table, rid) {
  const g = table.data.game;
  const realm = state.realms[rid];
  aiAnnex(state, table, rid);
  aiRaise(state, table, rid);
  aiMinors(state, table, rid);
  // Mend what war has worn, then recruit at the capital.
  for (const id of Object.keys(state.cities)) {
    const cost = state.cities[id].owner === rid ? repairCost(state, table, id) : 0;
    if (cost && realm.production > cost + 60) repair(state, table, rid, id);
  }
  const cap = Object.values(table.board.regions).find((r) => r.realm === rid && r.capital && !state.cities[r.id].holder && state.cities[r.id].owner === rid);
  const types = companyTypes(state, table, rid);
  const best = types.filter((t) => !companyDef(table, t).spy).sort((a, b) => companyDef(table, b).power - companyDef(table, a).power)
    .find((t) => realm.production >= companyCost(state, table, rid, t) * 1.5) ?? 'foot';
  if (cap && realm.production >= companyCost(state, table, rid, best) && state.armies.filter((a) => a.owner === rid).reduce((n, a) => n + a.companies.length, 0) < g.maxCompanies * 3) {
    recruit(state, table, rid, cap.id, best);
  }
  aiSpies(state, table, rid);
  const plan = aiDiplomacy(state, table, rid);
  if (plan.war) declareWar(state, table, rid, plan.war);
  mergeArmies(state, table, rid);
  const foes = Object.keys(state.realms).filter((o) => atWar(state, rid, o));
  if (!foes.length) return;
  const own = (id) => controller(state, id) === rid;
  const threatened = (id) => own(id) && (enemyArmyAt(state, id, rid) || table.board.adj[id].some((l) => enemyArmyAt(state, other(l, id), rid)));
  for (const a of state.armies.filter((x) => x.owner === rid)) {
    if (!state.armies.includes(a) || a.points <= 0) continue;
    const reach = reachable(state, table, a);
    const avg = a.companies.reduce((n, c) => n + c.str, 0) / a.companies.length;
    // Badly hurt and far from home: fall back to heal.
    if (avg < 45 && !own(a.region)) {
      const back = nearestWhere(state, table, a, own);
      if (back && reach[back]) { moveArmy(state, table, a.id, back); continue; }
    }
    // A threatened region of ours with no army of ours in it.
    const guard = Object.entries(reach).filter(([id]) => threatened(id) && !state.armies.some((x) => x.owner === rid && x.region === id))
      .filter(([id]) => { const f = enemyArmyAt(state, id, rid); return !f || strength(table, f) < strength(table, a) * 1.2; })
      .sort((x, y) => x[1].cost - y[1].cost)[0];
    if (guard && !threatened(a.region)) { moveArmy(state, table, a.id, guard[0]); continue; }
    // The nearest region in enemy hands it would not be foolish to march on.
    const targets = Object.entries(reach).filter(([id]) => foes.includes(controller(state, id)))
      .filter(([id]) => {
        const foe = enemyArmyAt(state, id, rid);
        return !foe || strength(table, foe, state, id) < strength(table, a) * 1.3;
      })
      .sort((x, y) => x[1].cost - y[1].cost);
    if (targets.length) moveArmy(state, table, a.id, targets[0][0]);
    else {
      const toward = nearestWhere(state, table, a, (id) => foes.includes(controller(state, id)));
      if (toward && reach[toward]) moveArmy(state, table, a.id, toward);
    }
  }
}

// Armies of one realm sharing a region march as one, up to the most an
// army can hold.
function mergeArmies(state, table, rid) {
  const max = table.data.game.maxCompanies;
  const by = {};
  for (const a of state.armies.filter((x) => x.owner === rid)) (by[a.region] ??= []).push(a);
  for (const list of Object.values(by)) {
    // Fill each army in turn from the ones behind it.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[i].companies.length < max; j++) {
        if (!list[j].companies.length) continue;
        while (list[j].companies.length && list[i].companies.length < max) list[i].companies.push(list[j].companies.shift());
        list[i].points = Math.min(list[i].points, list[j].points);
      }
    }
  }
  state.armies = state.armies.filter((a) => a.companies.length);
}

// The first step towards the nearest region that satisfies `want`.
function nearestWhere(state, table, army, want) {
  const { adj } = table.board;
  const seen = { [army.region]: null };
  const queue = [army.region];
  while (queue.length) {
    const at = queue.shift();
    if (at !== army.region && want(at)) {
      let step = at;
      while (seen[step] && seen[step] !== army.region) step = seen[step];
      return step;
    }
    for (const l of adj[at]) {
      const to = other(l, at);
      if (l.closed || to in seen || !mayEnter(state, table, army, to)) continue;
      seen[to] = at;
      queue.push(to);
    }
  }
  return null;
}

// ---- The month ----

function month(state, table) {
  const g = table.data.game;
  const m = g.mood;
  monthlyCities(state, table, (rid) => realmBonus(state, table, rid));
  for (const [rid, realm] of Object.entries(state.realms)) {
    const y = realmYields(state, table, rid);
    realm.treasury += y.crowns - y.upkeep;
    realm.production += y.production;
    realm.devotion += y.faith;
    realm.renown += y.renown;
    let hungry = 0;
    for (const [id, c] of Object.entries(state.cities)) {
      if (c.owner !== rid || c.holder || c.siege) continue; // a besieged city eats from its stores (see finishSide)
      c.store += cityYields(state, table, id).food - (c.pop / 1000) * g.eat;
      if (c.store < 0) {
        hungry += 1;
        c.pop = Math.max(50, Math.round(c.pop * 0.98));
        c.store = 0;
      } else if (c.store > g.growth.storeCap) {
        c.pop += Math.round((c.store - g.growth.storeCap) * g.growth.per);
        c.store = g.growth.storeCap;
      }
    }
    const tax = g.tax[realm.tax] ?? g.tax.fair;
    const bonus = realmBonus(state, table, rid);
    realm.love += (m.loveRest - realm.love) * m.pull + tax.love - (hungry ? m.hungerLove : 0) + (bonus.love ?? 0);
    realm.fear -= realm.fear * m.fearDecay;
    realm.unrest += (m.unrestRest - realm.unrest) * m.unrestPull + tax.unrest + (hungry ? m.hungerUnrest : 0) + (realm.treasury < 0 ? 1 : 0) + unsettledUnrest(state, table, rid);
    for (const k of ['love', 'fear', 'unrest']) realm[k] = clamp(Math.round(realm[k] * 10) / 10, 0, 100);
  }
}

// The month's dilemma for the player, from the real-time game's own book of
// them (those that ask nothing of the realm first).
function maybeDilemma(state, table) {
  const book = table.world.dilemmas?.dilemmas ?? {};
  const rng = makeRng(state.rng);
  const roll = rng.next();
  state.rng = rng.seed;
  if (state.dilemma || state.judgement || roll >= table.data.game.dilemmaChance) return;
  const ids = Object.keys(book).filter((id) => !book[id].when && !book[id].hidden && book[id].choices?.length);
  if (!ids.length) return;
  const r2 = makeRng(state.rng);
  const id = r2.pick(ids);
  const places = Object.keys(state.cities).filter((c) => state.cities[c].owner === state.player && !state.cities[c].holder);
  const place = places.length ? table.board.regions[r2.pick(places)].name : '';
  state.rng = r2.seed;
  state.dilemma = { id, place };
}

export function dilemmaView(state, table) {
  const d = state.dilemma && table.world.dilemmas.dilemmas[state.dilemma.id];
  if (!d) return null;
  const fill = (t) => (t ?? '').replaceAll('{place}', state.dilemma.place);
  return { title: fill(d.title), text: fill(d.text), choices: d.choices.map((c) => fill(c.label)) };
}

export function answerDilemma(state, table, i) {
  const d = state.dilemma && table.world.dilemmas.dilemmas[state.dilemma.id];
  if (!d || !d.choices[i]) return { error: 'No such answer.' };
  const fx = d.choices[i].fx ?? {};
  const r = state.realms[state.player];
  r.love = clamp(r.love + (fx.love ?? 0), 0, 100);
  r.fear = clamp(r.fear + (fx.fear ?? 0), 0, 100);
  r.unrest = clamp(r.unrest + (fx.unrest ?? 0) + (fx.townUnrest ?? 0) / 2, 0, 100);
  r.treasury += fx.coin ?? fx.treasury ?? 0;
  state.dilemma = null;
  return { ok: true };
}

// What the goals need to know about the smaller crowns.
const goalCtx = (state) => ({ vassals: (rid) => vassalsOf(state, rid), envoys: (rid) => envoysPlaced(state, rid) });

// ---- End of turn ----

export function endTurn(state, table) {
  if (state.over) return state;
  // An unanswered dilemma takes its default; an unjudged rebel is deposed.
  if (state.dilemma) answerDilemma(state, table, table.world.dilemmas.dilemmas[state.dilemma.id]?.default ?? 0);
  if (state.judgement) judge(state, table, state.judgement.by, state.judgement.minor, 'depose');
  if (state.battle) { battleAuto(state, table); finishBattle(state, table, state.battle); }
  finishSide(state, table, state.player);
  // The other great powers, in order, then the lesser crowns hold.
  for (const rid of table.data.game.powers) {
    if (rid === state.player || !state.realms[rid]) continue;
    for (const a of state.armies) if (a.owner === rid) a.points = armyPoints(state, table, a);
    aiTurn(state, table, rid);
    finishSide(state, table, rid);
  }
  for (const rid of Object.keys(state.realms)) if (!isPower(table, rid)) finishSide(state, table, rid);
  month(state, table);
  checkGoals(state, table, chapterNow(state, table), goalCtx(state));
  monthlyMinors(state, table);
  monthlyDiplomacy(state, table);
  monthlySpies(state, table, (a, b) => opinionOf(state, a, b));
  state.turn += 1;
  const d = dateOf(table, state.turn);
  if (d.year >= table.data.game.start.endYear && d.month >= 12) state.over = { reason: 'time' };
  maybeDilemma(state, table);
  resetPoints(state, table);
  return state;
}

export const goalContext = goalCtx;

// ---- Saves ----

export function serialize(state) {
  return JSON.stringify({ format: SAVE_FORMAT, version: VERSION, state });
}

export function deserialize(text, table = null) {
  const data = JSON.parse(text);
  if (data?.format !== SAVE_FORMAT || !data.state) throw new Error('That is not a Northern Wars v2 save.');
  if (data.version > VERSION) throw new Error('That save comes from a newer version of the game.');
  const s = data.state;
  // Version 1 (steps 1 and 2) gains cities' focus, goals, uniques and the smaller courts.
  if ((data.version ?? 1) < 2) {
    for (const c of Object.values(s.cities)) c.focus ??= 'balanced';
    for (const r of Object.values(s.realms)) r.goals ??= [];
    s.built ??= {};
    s.judgement ??= null;
    if (table) s.minors ??= newMinors(table, s.realms);
    s.version = 2;
  }
  // Version 2 gains the battle in hand (none) and siege stores as they are.
  if ((data.version ?? 1) < 3) {
    s.battle ??= null;
    s.version = 3;
  }
  // Version 3 gains diplomacy and spies.
  if ((data.version ?? 1) < 4 && table) {
    s.diplomacy ??= newDiplomacy(s, table);
    s.spies ??= newSpies(table);
    s.version = 4;
  }
  return s;
}
