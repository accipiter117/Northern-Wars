// The v2 game (steps 1 and 2): one turn a month, the player moves, then
// each AI power moves in turn, then the month's systems run once. Pure: the
// state is plain JSON, its random stream lives in state.rng, and the same
// seed and orders always give the same game.
import { makeRng } from '../../../src/sim/rng.js';
import { startingWorks } from '../../../src/sim/works.js';
import { buildBoard, other, TEMERIA } from './board.js';

export const SAVE_FORMAT = 'northern-wars-v2';
export const VERSION = 1;

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

export const nameOf = (table, rid) => table.data.game.names[rid] ?? rid;

// ---- Dates ----

export function dateOf(table, turn) {
  const s = table.data.game.start;
  const m = s.month - 1 + turn;
  return { year: s.year + Math.floor(m / 12), month: (m % 12) + 1 };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => MONTHS[m - 1];

// ---- A new game ----

export function createGame(table, { seed = 1, player = TEMERIA } = {}) {
  const g = table.data.game;
  const { board } = table;
  const realms = {};
  const cities = {};
  for (const r of Object.values(board.regions)) {
    realms[r.realm] ??= { treasury: 300, production: 0, devotion: 0, renown: 0, love: 55, fear: 20, unrest: 20, tax: 'fair' };
    const pop = r.members.reduce((a, m) => a + (g.people[table.world.byId[m]?.type] ?? 0), 0);
    cities[r.id] = { owner: r.realm, holder: null, pop, store: 10, siege: null };
  }
  const state = {
    version: VERSION, seed, rng: seed >>> 0, turn: 0, player,
    realms, cities, armies: [], nextArmy: 1, wars: [], dilemma: null, log: [], over: null,
  };
  // Each realm's opening armies: at its capital, then its next largest places.
  for (const rid of Object.keys(realms)) {
    const tier = table.tiers[rid] ?? 'petty';
    const plan = g.start_armies[tier] ?? [];
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

const say = (state, text) => {
  state.log.push({ turn: state.turn, text });
  if (state.log.length > 80) state.log.shift();
};

// ---- War and peace ----

const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const atWar = (state, a, b) => a !== b && state.wars.includes(pair(a, b));

export function declareWar(state, table, a, b) {
  if (a === b || atWar(state, a, b)) return false;
  state.wars.push(pair(a, b));
  say(state, `${nameOf(table, a)} declares war on ${nameOf(table, b)}.`);
  return true;
}

// Who controls a region now: its holder if occupied, else its owner.
export const controller = (state, id) => state.cities[id].holder ?? state.cities[id].owner;

// ---- Yields ----

export function cityYields(state, table, id) {
  const g = table.data.game;
  const c = state.cities[id];
  const realm = state.realms[c.owner];
  const out = { food: 0, production: 0, crowns: 0, faith: 0, renown: 0 };
  for (const b of table.works[id]) for (const [k, v] of Object.entries(g.works[b] ?? { crowns: 1 })) out[k] += v;
  for (const [k, v] of Object.entries(g.perThousand)) out[k] += (c.pop / 1000) * v;
  out.crowns *= g.tax[realm.tax]?.crowns ?? 1;
  if (riots(state, table, c.owner)) out.production *= g.mood.riotProduction;
  // A city in enemy hands yields nothing to its crown.
  if (c.holder) for (const k of Object.keys(out)) out[k] = 0;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

export const authority = (realm) => Math.max(realm.love, realm.fear);

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
  const comps = table.data.game.companies;
  for (const a of state.armies) if (a.owner === rid) for (const co of a.companies) out.upkeep += comps[co.type].upkeep;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

// ---- Movement (step 2) ----

const winter = (table, state) => table.data.board.moves.winterMonths.includes(dateOf(table, state.turn).month);

export function movePoints(table, state) {
  const p = table.data.board.moves.points;
  return winter(table, state) ? Math.floor(p / 2) : p;
}

function resetPoints(state, table) {
  const p = movePoints(table, state);
  for (const a of state.armies) a.points = p;
}

const enemyArmyAt = (state, region, rid) => state.armies.find((a) => a.region === region && atWar(state, a.owner, rid));

// May an army of `rid` set foot in a region: its own, one it holds, or a
// realm it is at war with. Peaceful neighbours' borders are closed.
function mayEnter(state, rid, region) {
  const c = state.cities[region];
  const ctl = controller(state, region);
  return ctl === rid || c.owner === rid || atWar(state, rid, ctl) || atWar(state, rid, c.owner);
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
      if (cost > army.points || !mayEnter(state, army.owner, to)) continue;
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

export function strength(table, army) {
  const comps = table.data.game.companies;
  return army.companies.reduce((a, c) => a + (c.str / 100) * comps[c.type].power, 0);
}

// Move an army; a march into an enemy army is a battle. Returns what
// happened, or an error.
export function moveArmy(state, table, armyId, dest) {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army) return { error: 'No such army.' };
  if (state.over) return { error: 'The war is over.' };
  const reach = reachable(state, table, army);
  if (!reach[dest]) return { error: 'It cannot reach there this turn.' };
  const from = army.region;
  const foe = enemyArmyAt(state, dest, army.owner);
  army.points -= reach[dest].cost;
  if (foe) {
    // The army halts at the step before and fights for the region.
    const path = pathTo(reach, from, dest);
    army.region = path.length > 1 ? path[path.length - 2] : from;
    const won = battle(state, table, army, foe, dest);
    // Victory clears the way: the army takes the field if no foe is left on it.
    if (won && state.armies.includes(army) && !enemyArmyAt(state, dest, army.owner)) army.region = dest;
    army.points = 0;
    return { battle: true, won };
  }
  army.region = dest;
  return { moved: true };
}

// The stand-in battle (until step 6): odds by strength, losses, and the
// loser falls back to a friendly region next door, or is broken.
export function battle(state, table, att, def, region) {
  const b = table.data.game.battle;
  const rng = makeRng(state.rng);
  const sa = strength(table, att);
  const sd = strength(table, def) * (['city', 'castle'].includes(table.board.regions[region].type) ? 1.2 : 1);
  const p = Math.min(0.95, Math.max(0.05, 0.5 + b.swing * ((sa - sd) / Math.max(sa, sd, 0.1))));
  const won = rng.next() < p;
  state.rng = rng.seed;
  const [w, l] = won ? [att, def] : [def, att];
  for (const c of w.companies) c.str = Math.max(1, Math.round(c.str * (1 - b.winnerLoss)));
  for (const c of l.companies) c.str = Math.round(c.str * (1 - b.loserLoss));
  l.companies = l.companies.filter((c) => c.str >= 10);
  const place = table.board.regions[region].name;
  say(state, `Battle at ${place}: ${nameOf(table, w.owner)} beats ${nameOf(table, l.owner)}.`);
  if (l === def) retreat(state, table, def);
  if (!l.companies.length) state.armies = state.armies.filter((a) => a !== l);
  return won;
}

function retreat(state, table, army) {
  const back = table.board.adj[army.region].map((l) => other(l, army.region))
    .find((id) => !table.board.adj[army.region].find((l) => other(l, army.region) === id).closed && controller(state, id) === army.owner && !enemyArmyAt(state, id, army.owner));
  if (back) army.region = back;
  else army.companies = [];
}

// ---- Recruiting ----

export function recruit(state, table, rid, region, type) {
  const g = table.data.game;
  const c = state.cities[region];
  const def = g.companies[type];
  const realm = state.realms[rid];
  if (!def || !c || c.owner !== rid || c.holder) return { error: 'Not one of our cities.' };
  if (realm.production < def.cost) return { error: `Needs ${def.cost} production (${Math.floor(realm.production)} in hand).` };
  let army = state.armies.find((a) => a.owner === rid && a.region === region && a.companies.length < g.maxCompanies);
  realm.production -= def.cost;
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
  for (const a of state.armies.filter((x) => x.owner === rid)) {
    const ctl = controller(state, a.region);
    const supplied = ctl === rid || (state.cities[a.region].owner === rid && !atWar(state, rid, ctl));
    for (const c of a.companies) c.str = Math.max(0, Math.min(100, c.str + (supplied ? s.heal : -s.attrition)));
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
    const walled = ['city', 'castle'].includes(table.board.regions[a.region].type);
    c.siege = c.siege?.by === rid ? { by: rid, turns: c.siege.turns + 1 } : { by: rid, turns: 1 };
    if (!walled || c.siege.turns >= table.data.board.siege.walledTurns) {
      c.holder = c.owner === rid ? null : rid;
      c.siege = null;
      say(state, `${nameOf(table, rid)} takes ${table.board.regions[a.region].name}.`);
    }
  }
}

// ---- The AI's moves (a placeholder until step 7) ----

function aiTurn(state, table, rid) {
  const g = table.data.game;
  const realm = state.realms[rid];
  // Recruit at the capital while production allows.
  const cap = Object.values(table.board.regions).find((r) => r.realm === rid && r.capital && !state.cities[r.id].holder);
  if (cap && realm.production >= g.companies.foot.cost && state.armies.filter((a) => a.owner === rid).reduce((n, a) => n + a.companies.length, 0) < g.maxCompanies * 2) {
    recruit(state, table, rid, cap.id, realm.production >= g.companies.horse.cost * 2 ? 'horse' : 'foot');
  }
  const foes = Object.keys(state.realms).filter((o) => atWar(state, rid, o));
  if (!foes.length) return;
  for (const a of state.armies.filter((x) => x.owner === rid)) {
    const reach = reachable(state, table, a);
    // The nearest region in enemy hands that this army would not be
    // foolish to march on.
    const targets = Object.entries(reach).filter(([id]) => foes.includes(controller(state, id)))
      .filter(([id]) => {
        const foe = enemyArmyAt(state, id, rid);
        return !foe || strength(table, foe) < strength(table, a) * 1.3;
      })
      .sort((x, y) => x[1].cost - y[1].cost);
    if (targets.length) moveArmy(state, table, a.id, targets[0][0]);
    else {
      // Else close on the enemy along the board, one step at a time.
      const toward = nearestFoe(state, table, a, foes);
      if (toward && reach[toward]) moveArmy(state, table, a.id, toward);
    }
  }
}

function nearestFoe(state, table, army, foes) {
  const { adj } = table.board;
  const seen = { [army.region]: null };
  const queue = [army.region];
  while (queue.length) {
    const at = queue.shift();
    if (at !== army.region && foes.includes(controller(state, at))) {
      let step = at;
      while (seen[step] && seen[step] !== army.region) step = seen[step];
      return step;
    }
    for (const l of adj[at]) {
      const to = other(l, at);
      if (l.closed || to in seen || !mayEnter(state, army.owner, to)) continue;
      seen[to] = at;
      queue.push(to);
    }
  }
  return null;
}

// ---- The month (step 1) ----

function month(state, table) {
  const g = table.data.game;
  const m = g.mood;
  for (const [rid, realm] of Object.entries(state.realms)) {
    const y = realmYields(state, table, rid);
    realm.treasury += y.crowns - y.upkeep;
    realm.production += y.production;
    realm.devotion += y.faith;
    realm.renown += y.renown;
    let hungry = 0;
    for (const [id, c] of Object.entries(state.cities)) {
      if (c.owner !== rid || c.holder) continue;
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
    realm.love += (m.loveRest - realm.love) * m.pull + tax.love - (hungry ? m.hungerLove : 0);
    realm.fear -= realm.fear * m.fearDecay;
    realm.unrest += (m.unrestRest - realm.unrest) * m.unrestPull + tax.unrest + (hungry ? m.hungerUnrest : 0) + (realm.treasury < 0 ? 1 : 0);
    for (const k of ['love', 'fear', 'unrest']) realm[k] = Math.max(0, Math.min(100, Math.round(realm[k] * 10) / 10));
  }
}

// The month's dilemma for the player, from the real-time game's own book of
// them (those that ask nothing of the realm first).
function maybeDilemma(state, table) {
  const book = table.world.dilemmas?.dilemmas ?? {};
  const rng = makeRng(state.rng);
  const roll = rng.next();
  state.rng = rng.seed;
  if (state.dilemma || roll >= table.data.game.dilemmaChance) return;
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
  r.love = Math.max(0, Math.min(100, r.love + (fx.love ?? 0)));
  r.fear = Math.max(0, Math.min(100, r.fear + (fx.fear ?? 0)));
  r.unrest = Math.max(0, Math.min(100, r.unrest + (fx.unrest ?? 0) + (fx.townUnrest ?? 0) / 2));
  r.treasury += fx.coin ?? fx.treasury ?? 0;
  state.dilemma = null;
  return { ok: true };
}

// ---- End of turn ----

export function endTurn(state, table) {
  if (state.over) return state;
  // An unanswered dilemma takes its default answer.
  if (state.dilemma) answerDilemma(state, table, table.world.dilemmas.dilemmas[state.dilemma.id]?.default ?? 0);
  finishSide(state, table, state.player);
  // The other great powers, in order, then the lesser crowns hold.
  for (const rid of table.data.game.powers) {
    if (rid === state.player || !state.realms[rid]) continue;
    for (const a of state.armies) if (a.owner === rid) a.points = movePoints(table, state);
    aiTurn(state, table, rid);
    finishSide(state, table, rid);
  }
  for (const rid of Object.keys(state.realms)) if (!table.data.game.powers.includes(rid)) finishSide(state, table, rid);
  month(state, table);
  state.turn += 1;
  const d = dateOf(table, state.turn);
  if (d.year >= table.data.game.start.endYear && d.month >= 12) state.over = { reason: 'time' };
  maybeDilemma(state, table);
  resetPoints(state, table);
  return state;
}

// ---- Saves ----

export function serialize(state) {
  return JSON.stringify({ format: SAVE_FORMAT, version: VERSION, state });
}

export function deserialize(text) {
  const data = JSON.parse(text);
  if (data?.format !== SAVE_FORMAT || !data.state) throw new Error('That is not a Northern Wars v2 save.');
  if (data.version > VERSION) throw new Error('That save comes from a newer version of the game.');
  return data.state;
}
