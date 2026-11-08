// Battles (v2 step 6): three lanes and a reserve, a few rounds, terrain,
// weather, morale and the retreat; auto-resolve with its odds; and sieges
// across turns (storm, starve, terms or lift). Pure: a battle is plain JSON
// kept in state.battle while the player fights it.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, controller } from './core.js';
import { companyDef, goalBonus } from './goals.js';
import { armyBonus } from './forces.js';

const B = (table) => table.data.battle;
export const LANES = ['left', 'centre', 'right'];

const kindOf = (table, type) => B(table).kinds[type] ?? 'foot';

function weatherOf(table, month) {
  for (const [id, w] of Object.entries(B(table).weather)) if (w.months.includes(month)) return id;
  return null;
}

// Set up a battle: the attackers (armies) against the defenders (armies,
// or a city's garrison behind its walls when `storm` is set).
export function setupBattle(state, table, { attackers, defenders, region, month, storm = false, landing = false }) {
  const r = table.board.regions[region];
  const walled = ['city', 'castle'].includes(r.type);
  const side = (owner, armies, garrison = null) => {
    const comps = [];
    if (garrison) garrison.forEach((type, i) => comps.push({ key: `g${i}`, army: null, type, str: 100 }));
    else for (const a of armies) a.companies.forEach((c, i) => comps.push({ key: `${a.id}-${i}`, army: a.id, idx: i, type: c.type, str: c.str }));
    return { owner, armies: armies.map((a) => a.id), comps, lanes: { left: [], centre: [], right: [], reserve: [] }, morale: 100, start: comps.reduce((n, c) => n + c.str, 0), retreat: false };
  };
  const defOwner = defenders[0]?.owner ?? controller(state, region);
  const b = {
    region, terrain: r.terrain in B(table).terrain ? r.terrain : 'open', weather: weatherOf(table, month), round: 0, over: null, storm,
    sides: [side(attackers[0].owner, attackers), storm ? side(defOwner, [], B(table).garrison[r.type] ?? ['foot']) : side(defOwner, defenders)],
    // Defending a walled place: its realm's walls, more when stormed.
    fort: walled ? (storm ? B(table).walls : 1.2) * (goalBonus(state, table, defOwner).defend ?? 1) : 1,
    log: [],
    landing,
  };
  // Commanders: a share more strength, a head start in morale, a better storm.
  b.sides.forEach((side) => {
    const bonus = {};
    for (const id of side.armies) for (const [k, v] of Object.entries(armyBonus(state, table, id))) bonus[k] = Math.max(bonus[k] ?? 0, v);
    side.bonus = bonus;
    side.morale += bonus.morale ?? 0;
  });
  // Both sides start in a sensible line; the player may rearrange before the first round.
  autoPlace(table, b, 0);
  autoPlace(table, b, 1);
  return b;
}

// Horse to the flanks, bows to the centre, foot spread; the weakest back in
// reserve when there are four or more.
export function autoPlace(table, b, s) {
  const side = b.sides[s];
  side.lanes = { left: [], centre: [], right: [], reserve: [] };
  const order = side.comps.slice().sort((x, y) => companyDef(table, y.type).power * y.str - companyDef(table, x.type).power * x.str);
  const reserve = order.length >= 4 ? order.pop() : null;
  let flank = 0;
  let spread = 0;
  for (const c of order) {
    const k = kindOf(table, c.type);
    if (k === 'horse') side.lanes[flank++ % 2 ? 'right' : 'left'].push(c.key);
    else if (k === 'bow') side.lanes.centre.push(c.key);
    else side.lanes[LANES[spread++ % 3]].push(c.key);
  }
  if (reserve) side.lanes.reserve.push(reserve.key);
}

// The player moves a company between lanes: freely before the first round,
// and only out of the reserve after it.
export function placeCompany(b, s, key, lane) {
  const side = b.sides[s];
  const from = Object.keys(side.lanes).find((l) => side.lanes[l].includes(key));
  if (!from || ![...LANES, 'reserve'].includes(lane) || b.over) return false;
  if (b.round > 0 && (from !== 'reserve' || lane === 'reserve')) return false;
  side.lanes[from] = side.lanes[from].filter((k) => k !== key);
  side.lanes[lane].push(key);
  return true;
}

function compPower(table, b, s, c) {
  const d = companyDef(table, c.type);
  const k = kindOf(table, c.type);
  let p = (c.str / 100) * d.power * (B(table).terrain[b.terrain]?.[k] ?? 1);
  if (b.weather) p *= B(table).weather[b.weather][k] ?? 1;
  if (s === 1) p *= b.fort * (b.fort > 1 ? (d.defend ?? 1) : 1);
  // Engineers and raiders storm walls at half again their strength.
  if (s === 0 && b.storm && d.siege) p *= 1.5;
  const bonus = b.sides[s].bonus ?? {};
  p *= 1 + (bonus.power ?? 0) + (s === 0 && b.storm ? bonus.siege ?? 0 : 0);
  // Fighting up out of the boats.
  if (s === 0 && b.landing) p *= 0.8;
  return p;
}

export function lanePower(table, b, s, lane) {
  const side = b.sides[s];
  return side.lanes[lane].reduce((n, key) => n + compPower(table, b, s, side.comps.find((c) => c.key === key)), 0);
}

// One round: each lane fights; an empty flank lets the enemy turn it.
export function fightRound(table, b, rng) {
  if (b.over) return b;
  const cfg = B(table);
  const power = [0, 1].map((s) => Object.fromEntries(LANES.map((l) => [l, lanePower(table, b, s, l)])));
  for (const s of [0, 1]) {
    for (const fl of ['left', 'right']) {
      if (power[s][fl] > 0 && power[1 - s][fl] === 0) power[s].centre += power[s][fl] * cfg.flank;
    }
  }
  const lost = [0, 0];
  for (const s of [0, 1]) {
    const side = b.sides[s];
    for (const lane of LANES) {
      const enemy = power[1 - s][lane];
      if (!enemy) continue;
      const own = Math.max(power[s][lane], 0.3);
      for (const key of side.lanes[lane]) {
        const c = side.comps.find((x) => x.key === key);
        const roll = 0.8 + rng.next() * 0.4;
        const loss = Math.min(cfg.maxLoss, cfg.loss * (enemy / own) * roll);
        const before = c.str;
        c.str = Math.max(0, Math.round(c.str - loss));
        lost[s] += before - c.str;
      }
    }
  }
  b.round += 1;
  for (const s of [0, 1]) {
    const side = b.sides[s];
    side.morale = Math.max(0, Math.round(side.morale - (lost[s] / Math.max(side.start, 1)) * 100 * cfg.morale));
    // Broken companies leave the field.
    for (const lane of [...LANES, 'reserve']) side.lanes[lane] = side.lanes[lane].filter((k) => side.comps.find((c) => c.key === k).str >= 10);
  }
  b.log.push(`Round ${b.round}: ${LANES.map((l) => `${l} ${power[0][l].toFixed(1)} against ${power[1][l].toFixed(1)}`).join(', ')}. Morale ${b.sides[0].morale} and ${b.sides[1].morale}.`);
  settle(table, b);
  return b;
}

const fielded = (b, s) => LANES.reduce((n, l) => n + b.sides[s].lanes[l].length, 0) + b.sides[s].lanes.reserve.length;

function settle(table, b) {
  const cfg = B(table);
  const broken = [0, 1].filter((s) => b.sides[s].morale < cfg.rout || fielded(b, s) === 0);
  if (broken.length === 1) b.over = { winner: 1 - broken[0], reason: 'rout' };
  else if (broken.length === 2 || b.round >= cfg.rounds) {
    const score = [0, 1].map((s) => LANES.reduce((n, l) => n + lanePower(table, b, s, l), 0) * (b.sides[s].morale / 100));
    b.over = { winner: score[0] > score[1] ? 0 : 1, reason: 'field' };
  }
}

export function soundRetreat(table, b, s) {
  if (b.over) return b;
  const side = b.sides[s];
  for (const c of side.comps) c.str = Math.max(0, c.str - B(table).retreatLoss);
  side.retreat = true;
  b.over = { winner: 1 - s, reason: 'retreat' };
  b.log.push(`${s === 0 ? 'The attackers' : 'The defenders'} sound the retreat.`);
  return b;
}

// Fight it out with both sides placed by the book.
export function runToEnd(table, b, rng) {
  autoPlace(table, b, 0);
  while (!b.over) fightRound(table, b, rng);
  return b;
}

// The odds of the attackers winning, from a few quiet trial runs.
export function battleOdds(state, table, opts) {
  const n = B(table).oddsSamples;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const b = setupBattle(state, table, opts);
    runToEnd(table, b, makeRng((state.rng ^ (i * 2654435761)) >>> 0));
    if (b.over.winner === 0) wins += 1;
  }
  return wins / n;
}

// The odds of the attackers winning from where the battle stands now, as
// placed, fought out a few quiet times.
export function oddsNow(table, b, seed) {
  const n = B(table).oddsSamples;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const c = JSON.parse(JSON.stringify(b));
    const rng = makeRng((seed ^ (i * 2654435761)) >>> 0);
    while (!c.over) fightRound(table, c, rng);
    if (c.over.winner === 0) wins += 1;
  }
  return wins / n;
}

// Write a finished battle back into the armies. Returns whether the
// attackers won.
export function applyBattle(state, table, b) {
  for (const side of b.sides) {
    for (const id of side.armies) {
      const a = state.armies.find((x) => x.id === id);
      if (!a) continue;
      a.companies = a.companies.map((c, i) => ({ ...c, str: side.comps.find((x) => x.army === id && x.idx === i)?.str ?? c.str }))
        .filter((c) => c.str >= 10);
    }
  }
  state.armies = state.armies.filter((a) => a.companies.length);
  const won = b.over?.winner === 0;
  const w = b.sides[won ? 0 : 1].owner;
  const l = b.sides[won ? 1 : 0].owner;
  const place = table.board.regions[b.region].name;
  const how = b.over?.reason === 'retreat' ? ' (a retreat)' : b.over?.reason === 'rout' ? ' (a rout)' : '';
  // A storm that succeeds is told when the place falls.
  if (b.storm && !won) say(state, `${nameOf(table, b.sides[0].owner)} fails to storm ${place}.`);
  else if (!b.storm) say(state, `Battle at ${place}: ${nameOf(table, w)} beats ${nameOf(table, l)}${how}.`);
  return won;
}
