// The crown's standing companies: permanent bodies of fifty to two hundred
// men, recruited in a town from its own people, paid every month, and sent
// about on standing orders (hold a place, ride a road, guard a trade route,
// hunt a threat down, or stand ready to answer one). They follow the roads,
// slower in rough country and in winter, and fight whatever they are sent
// against when they meet it. A field army in time of war is raised from
// these companies, with levies and hired swords to fill it out.
import { addDispatch, clamp } from './realm.js';
import { roadPath } from './world.js';
import { seasonOf } from './calendar.js';
import { creditLimit } from './economy.js';
import { TEMERIA, ownerOf, hostile, hasWalls } from './conflict.js';
import { companyStrength, threatStrength, winChance, oddsWord, resolve, groundAt, foeKind, mounted } from './combat.js';
import { threatPos, threatName, foeName, destroyThreat, isCamp, nearestPlace } from './threats.js';
import { armyPosition, armyStrength, routArmy } from './armies.js';

const F = (world) => world.forces;
const say = (state, text) => addDispatch(state, text, 'military');
const round = Math.round;
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function defaultForces(world) {
  return { companies: [], nextId: 1, stores: { arms: F(world)?.stores.startArms ?? 0, horses: 0 } };
}

export const ORDERS = ['station', 'patrol', 'escort', 'hunt', 'respond'];

// Companies free to act on their own: not marching with an army.
export function freeCompanies(state) {
  return (state.forces?.companies ?? []).filter((c) => !c.army);
}

// Companies standing at their station, there to defend it.
export function companiesAt(state, id) {
  return freeCompanies(state).filter((c) => c.station === id && c.node === id && !c.way.length && !c.task);
}

export function stationedStrength(state, world, id, threat = null) {
  const foe = threat ? foeKind(threat) : 'soldiers';
  const walls = hasWalls(state, world, id);
  return companiesAt(state, id).reduce((a, c) => a + companyStrength(world, c, foe, 'open', walls), 0);
}

export function companyUpkeep(world, c) {
  return (c.men + (c.wounded ?? 0)) * F(world).companies[c.type].upkeep;
}

// ---- Recruiting ----

export function companySlots(state, world, id) {
  const p = F(world).perPlace;
  const s = state.settlements[id];
  return (p[world.byId[id].type] ?? 0) + (s.buildings.includes('barracks') ? p.barracks : 0);
}

export function recruitCost(state, world, id, type) {
  const t = F(world).companies[type];
  const st = state.forces.stores;
  let coin = t.coin;
  const short = { arms: Math.max(0, (t.arms ?? 0) - st.arms), horses: Math.max(0, (t.horses ?? 0) - st.horses) };
  // Without arms in store they are bought abroad, dear; light horse can
  // be mounted on bought horses, knights cannot be made without a stud's.
  coin += short.arms * (t.armsCoin ?? 0) + (type === 'knights' ? 0 : short.horses * (t.horsesCoin ?? 0));
  return { coin, arms: Math.min(t.arms ?? 0, st.arms), horses: Math.min(t.horses ?? 0, st.horses), short };
}

export function canRecruit(state, world, id, type) {
  const t = F(world)?.companies[type];
  const s = state.settlements[id];
  if (!t || !s) return { ok: false, reason: 'Unknown.' };
  if (s.occupier || ownerOf(state, world, id) !== TEMERIA) return { ok: false, reason: 'The enemy holds it.' };
  if (s.holder !== 'crown') return { ok: false, reason: 'A lord holds it; the crown recruits on its own lands.', hidden: true };
  if (!t.places.includes(world.byId[id].type)) return { ok: false, reason: `Not raised in a ${world.byId[id].type}.`, hidden: true };
  if (t.barracks && !s.buildings.includes('barracks')) return { ok: false, reason: 'Needs barracks here to train them.' };
  const here = state.forces.companies.filter((c) => c.station === id).length;
  if (here >= companySlots(state, world, id)) return { ok: false, reason: `Room for ${companySlots(state, world, id)} compan${companySlots(state, world, id) === 1 ? 'y' : 'ies'} here; barracks allow more.` };
  if ((s.population.human ?? 0) < t.men * 4) return { ok: false, reason: 'Too few people here to spare the men.' };
  const cost = recruitCost(state, world, id, type);
  if (type === 'knights' && cost.short.horses > 0) return { ok: false, reason: `Needs ${t.horses} horses from the crown's studs (${round(state.forces.stores.horses)} in hand).` };
  if (state.treasury - cost.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, cost };
}

function companyName(state, world, id, type) {
  const t = F(world).companies[type];
  const same = state.forces.companies.filter((c) => c.home === id && c.type === type).length;
  const num = ['', ' (II)', ' (III)', ' (IV)', ' (V)', ' (VI)'][same] ?? ` (${same + 1})`;
  return `${world.byId[id].name} ${t.name}${num}`;
}

export function recruit(state, world, id, type) {
  const t = F(world).companies[type];
  const s = state.settlements[id];
  const cost = recruitCost(state, world, id, type);
  state.treasury -= cost.coin;
  state.ledger.decrees = (state.ledger.decrees ?? 0) + cost.coin;
  state.forces.stores.arms -= cost.arms;
  state.forces.stores.horses -= cost.horses;
  s.population.human -= t.men;
  const p = world.byId[id];
  const c = {
    id: state.forces.nextId++, type, name: companyName(state, world, id, type), home: id, station: id,
    men: t.men, max: t.men, wounded: 0, morale: F(world).morale.start, xp: s.buildings.includes('barracks') ? F(world).barracksXp : 0,
    order: { kind: 'station' }, task: null, x: p.x, y: p.y, node: id, way: [], army: null, wins: 0, fought: -1, routed: 0,
  };
  state.forces.companies.push(c);
  say(state, `${c.name} mustered at ${p.name}: ${t.men} ${t.plural}, for ${cost.coin} crowns${cost.short.arms ? ' (arms bought abroad, dear)' : ''}.`);
  return c;
}

export function disbandCompany(state, world, c) {
  const s = state.settlements[c.station];
  if (s && !s.occupier) s.population.human += round(c.men + (c.wounded ?? 0));
  state.forces.companies = state.forces.companies.filter((x) => x !== c);
  say(state, `${c.name} is stood down; ${round(c.men)} men go home.`);
}

// ---- Orders ----

export function canOrderCompany(state, world, c, order) {
  if (!c) return { ok: false, reason: 'No such company.' };
  if (c.army) return { ok: false, reason: 'It marches with an army.' };
  const k = order.kind;
  if (k === 'station') {
    if (!state.settlements[order.place] || ownerOf(state, world, order.place) !== TEMERIA) return { ok: false, reason: 'Station it in a place the crown holds.' };
  } else if (k === 'patrol') {
    if (!order.from || !order.to || order.from === order.to) return { ok: false, reason: 'Choose two places.' };
    if (!roadPath(world, order.from, order.to)) return { ok: false, reason: 'No road joins them.' };
  } else if (k === 'escort') {
    if (!state.routes?.some((r) => r.id === order.route)) return { ok: false, reason: 'No such trade route.' };
  } else if (k === 'hunt') {
    const t = order.threat ? state.threats.list.find((x) => x.id === order.threat) : null;
    const a = order.army ? state.armies.find((x) => x.id === order.army) : null;
    if (!t && !a) return { ok: false, reason: 'Nothing to hunt.' };
    if (t && !t.sighted) return { ok: false, reason: 'Only a threat that has been seen can be hunted.' };
    if (t?.abroad) return { ok: false, reason: 'It lies over the border: theirs to deal with.' };
    if (a && !hostile(state, TEMERIA, a.side)) return { ok: false, reason: 'We are not at war with them.' };
  } else if (k === 'respond') {
    if (!F(world).respond.radii.includes(order.radius)) return { ok: false, reason: 'Choose how far it rides.' };
  } else return { ok: false, reason: 'Unknown order.' };
  return { ok: true };
}

export function orderCompany(state, world, c, order) {
  if (order.kind === 'hunt') {
    // A hunt is done and over; afterwards the company goes back to what it
    // was doing.
    c.task = order.threat ? { threat: order.threat } : { army: order.army };
    c.after = c.order.kind === 'hunt' ? c.after : c.order;
    c.order = order;
    c.way = [];
    c.replan = 0;
    const target = order.threat ? state.threats.list.find((x) => x.id === order.threat) : state.armies.find((x) => x.id === order.army);
    say(state, `Orders for ${c.name}: hunt down ${order.threat ? threatName(world, target).toLowerCase() : target.name}.`);
    return;
  }
  if (order.kind === 'station') c.station = order.place;
  c.order = order;
  c.task = null;
  c.way = [];
  c.leg = 0;
  const words = {
    station: () => `${c.name} is to hold ${world.byId[order.place].name}.`,
    patrol: () => `${c.name} is to ride the road from ${world.byId[order.from].name} to ${world.byId[order.to].name}.`,
    escort: () => {
      const r = state.routes.find((x) => x.id === order.route);
      return `${c.name} is to guard the crown's caravans between ${world.byId[r.from].name} and ${world.byId[r.to].name}.`;
    },
    respond: () => `${c.name} stands ready at ${world.byId[c.station].name} to answer any threat within a ${order.radius}-mile ride.`,
  };
  say(state, words[order.kind]());
}

// ---- Odds ----

export function targetOf(state, c) {
  if (!c.task) return null;
  if (c.task.threat) return state.threats.list.find((t) => t.id === c.task.threat) ?? null;
  return state.armies?.find((a) => a.id === c.task.army) ?? null;
}

export function targetPos(world, target) {
  return target.kind ? threatPos(target) : armyPosition(world, target);
}

// What stands nearest against a threat (M21): the nearest free company, or
// failing one closer, the levy of the nearest town or city of ours at a full
// call. Gives the threat's size beside that force's and the odds, for the
// line on the threat's card ("Bandit camp: about 120 men. Maribor's levy:
// 450.").
export function forceAgainst(state, world, t) {
  const p = targetPos(world, t);
  const ground = groundAt(world, p.x, p.y);
  const foe = foeKind(t);
  const theirs = threatStrength(world, t, ground);
  const options = [];
  for (const c of freeCompanies(state)) {
    if (c.routed > state.day) continue;
    options.push({ name: c.name, men: round(c.men), strength: companyStrength(world, c, foe, ground), d: near(c, p), company: c.id });
  }
  const share = world.war?.raise?.muster?.share;
  const militia = F(world).companies.militia;
  if (share && militia) {
    const n = nearestPlace(world, p, (id) => (share[world.byId[id].type] ?? 0) > 0.05 && !state.settlements[id].occupier);
    if (n) {
      const st = world.byId[n.id];
      const men = Math.floor(peopleOf(state.settlements[n.id]) * share[st.type]);
      const strength = men * militia.perMan * (0.5 + F(world).morale.start / 100) * (F(world).suits[foe]?.militia ?? 1);
      options.push({ name: `${st.name}'s levy`, men, strength, d: n.d, levy: n.id });
    }
  }
  if (!options.length) return null;
  options.sort((a, b) => a.d - b.d);
  const best = options[0];
  const chance = winChance(world, best.strength, theirs);
  return { ...best, chance, word: oddsWord(world, chance), theirs };
}

const peopleOf = (s) => Object.values(s.population).reduce((a, b) => a + b, 0);

// The odds of a group of companies against a threat or an army, from both
// sides' strength, the ground, morale and how well the troops suit the foe.
export function huntOdds(state, world, companies, target) {
  const p = targetPos(world, target);
  const ground = groundAt(world, p.x, p.y);
  const foe = target.kind ? foeKind(target) : 'soldiers';
  const mine = companies.reduce((a, c) => a + companyStrength(world, c, foe, ground), 0);
  const theirs = target.kind ? threatStrength(world, target, ground) : armyStrength(state, world, target, true);
  const chance = winChance(world, mine, theirs);
  return { chance, word: oddsWord(world, chance), mine, theirs };
}

// The free company best placed to deal with a threat: likely to win, and near.
export function bestCompanyFor(state, world, target) {
  if (target.abroad) return null;
  const p = targetPos(world, target);
  let best = null;
  for (const c of freeCompanies(state)) {
    if (c.task || c.routed > state.day) continue;
    const o = huntOdds(state, world, [c], target);
    const score = o.chance / (1 + near(c, p) / 300);
    if (!best || score > best.score) best = { c, score, odds: o };
  }
  return best;
}

// ---- Moving ----

function nearestNode(world, p) {
  let best = null;
  for (const id of Object.keys(world.adjacency)) {
    const d = near(world.byId[id], p);
    if (!best || d < best.d) best = { id, d };
  }
  return best.id;
}

// Plan a march by road to a place, and on across country to a point if given.
function plan(world, c, dest, point = null) {
  const from = c.way[0]?.node ?? c.node ?? nearestNode(world, c);
  const path = roadPath(world, from, dest, true) ?? [from];
  c.way = path.map((id) => ({ x: world.byId[id].x, y: world.byId[id].y, node: id }));
  if (point) c.way.push({ x: point.x, y: point.y });
  c.dest = point ?? { x: world.byId[dest].x, y: world.byId[dest].y };
}

function speedOf(state, world, c) {
  const f = F(world);
  const ground = groundAt(world, c.x, c.y);
  return f.baseSpeed * f.companies[c.type].speed * (f.ground.speed[ground] ?? 1) * (f.seasonSpeed[seasonOf(state.day)] ?? 1);
}

function walk(world, c, speed) {
  let left = speed;
  while (left > 0 && c.way.length) {
    const w = c.way[0];
    const d = Math.hypot(w.x - c.x, w.y - c.y);
    if (d <= left) {
      c.x = w.x;
      c.y = w.y;
      if (w.node) c.node = w.node;
      else c.node = null;
      c.way.shift();
      left -= d;
    } else {
      c.x += ((w.x - c.x) / d) * left;
      c.y += ((w.y - c.y) / d) * left;
      left = 0;
    }
  }
}

function endsOf(state, c) {
  if (c.order.kind === 'patrol') return [c.order.from, c.order.to];
  if (c.order.kind === 'escort') {
    const r = state.routes?.find((x) => x.id === c.order.route);
    return r ? [r.from, r.to] : null;
  }
  return null;
}

// What a company does with its day, before it moves.
function think(state, world, c) {
  const f = F(world);
  // Beaten companies go home to lick their wounds.
  if (c.routed > state.day) {
    if (!c.way.length && c.node !== c.station) plan(world, c, c.station);
    return;
  }
  if (c.task) {
    const target = targetOf(state, c);
    if (!target || (target.kind && !state.threats.list.includes(target))) {
      endTask(state, world, c);
      return;
    }
    const p = targetPos(world, target);
    // Follow a moving quarry, looking again every few days.
    if (!c.way.length || state.day >= (c.replan ?? 0)) {
      plan(world, c, nearestNode(world, p), p);
      c.replan = state.day + 3;
    }
    return;
  }
  const o = c.order;
  if (o.kind === 'respond' && c.node === c.station && !c.way.length) {
    const home = world.byId[c.station];
    let best = null;
    for (const t of state.threats.list) {
      if (!t.sighted || t.abroad) continue;
      const d = near(threatPos(t), home);
      if (d > o.radius) continue;
      if (huntOdds(state, world, [c], t).chance < f.respond.minOdds) continue;
      if (freeCompanies(state).some((x) => x !== c && x.task?.threat === t.id)) continue;
      if (!best || d < best.d) best = { t, d };
    }
    if (best) {
      c.task = { threat: best.t.id };
      c.replan = 0;
      say(state, `From ${home.name}, ${c.name} ride out to answer ${threatName(world, best.t).toLowerCase()}.`);
      return;
    }
  }
  if (c.way.length) return;
  const ends = endsOf(state, c);
  if (ends) {
    // Up and down the road, end to end.
    c.leg = c.leg ? 0 : 1;
    plan(world, c, ends[c.leg]);
  } else {
    if (o.kind === 'escort') c.order = { kind: 'station' };
    if (c.node !== c.station) plan(world, c, c.station);
  }
}

function endTask(state, world, c) {
  c.task = null;
  if (c.order.kind === 'hunt') c.order = c.after ?? { kind: 'station' };
  c.after = null;
  c.way = [];
  if (c.order.kind === 'station' || c.order.kind === 'respond') plan(world, c, c.station);
}

// ---- The day ----

export function stepCompaniesDay(state, world, rng) {
  if (!state.forces?.companies.length || !F(world)) return;
  for (const c of freeCompanies(state)) think(state, world, c);
  for (const c of freeCompanies(state)) walk(world, c, speedOf(state, world, c));
  engage(state, world, rng);
}

// Who meets whom: a company reaching what it hunts; a patrol or guard
// running into a band on its road; Scoia'tael falling on any company that
// comes near their ambush.
function engage(state, world, rng) {
  const f = F(world);
  const r = f.engageRange;
  for (const c of freeCompanies(state)) {
    if (c.fought === state.day || c.routed > state.day) continue;
    const target = targetOf(state, c);
    let foe = null;
    if (target && near(c, targetPos(world, target)) <= r) foe = target;
    if (!foe) {
      for (const t of state.threats.list) {
        if (!t.band) continue;
        const d = near(c, threatPos(t));
        if (d > r) continue;
        if (t.kind === 'scoiatael' || ['patrol', 'escort', 'respond', 'hunt'].includes(c.order.kind)) { foe = t; break; }
      }
    }
    if (!foe) continue;
    const p = targetPos(world, foe);
    const group = freeCompanies(state).filter((x) => x.fought !== state.day && x.routed <= state.day && near(x, p) <= r * 1.5);
    fight(state, world, rng, group, foe);
  }
}

function fight(state, world, rng, group, foe) {
  const f = F(world);
  const p = targetPos(world, foe);
  const ground = groundAt(world, p.x, p.y);
  const kind = foe.kind ? foeKind(foe) : 'soldiers';
  const strengths = group.map((c) => companyStrength(world, c, kind, ground));
  const mine = strengths.reduce((a, b) => a + b, 0);
  const their = foe.kind ? threatStrength(world, foe, ground) : armyStrength(state, world, foe, !foe.to);
  const out = resolve(world, rng, mine, their);
  const ourMen = group.reduce((a, c) => a + c.men, 0);
  let ourDead = 0;
  for (const c of group) {
    const lost = c.men * out.lossA;
    c.men -= lost;
    c.wounded = (c.wounded ?? 0) + lost * f.wounds.share;
    ourDead += lost;
    c.fought = state.day;
    if (out.aWins) {
      c.morale = clamp(c.morale + f.morale.win, 0, 100);
      c.xp = Math.min(f.xp.max, (c.xp ?? 0) + f.xp.win);
      c.wins = (c.wins ?? 0) + 1;
    } else {
      c.morale = clamp(c.morale - f.morale.loss, 0, 100);
      c.routed = state.day + 12;
      c.task = null;
      if (c.order.kind === 'hunt') c.order = c.after ?? { kind: 'station' };
      c.way = [];
    }
  }
  // Their side.
  const theirName = foe.kind ? foeName(world, foe) : foe.name;
  const body = foe.kind ? (foe.band ?? foe) : null;
  const theirMen = foe.kind ? (foe.kind === 'monsters' ? body.count : body.men) : foe.soldiers;
  let theirDead;
  let after = null;
  if (foe.kind) {
    if (foe.kind === 'monsters') {
      theirDead = Math.max(out.aWins ? body.count : 0, Math.round(body.count * out.lossB));
      body.count -= theirDead;
    } else {
      theirDead = body.men * out.lossB;
      body.men -= theirDead;
    }
    if (out.aWins) {
      // Beaten in the field: a band scatters (its camp weakened), a camp or
      // lair attacked at home is broken, a commando or war party is gone.
      const atCamp = isCamp(foe) && !foe.band;
      if (foe.band && isCamp(foe)) destroyThreat(state, world, foe, true);
      else destroyThreat(state, world, foe);
      if (atCamp) after = `${foe.kind === 'bandits' ? 'The bandit camp' : `The lair of ${theirName.toLowerCase()}`} near ${world.byId[foe.near]?.name ?? 'the border'} is broken.`;
    }
  } else {
    theirDead = foe.soldiers * out.lossB;
    foe.soldiers -= theirDead;
    if (out.aWins) routArmy(state, world, foe);
  }
  for (const c of [...group]) {
    if (c.men < 8) {
      state.forces.companies = state.forces.companies.filter((x) => x !== c);
      say(state, `${c.name} is no more: too few came back to carry its banner.`);
    } else if (!out.aWins) c.way = [];
  }
  for (const c of group) if (out.aWins && c.task && !targetOf(state, c)) endTask(state, world, c);
  const winner = out.aWins ? TEMERIA : foe.kind ?? foe.side;
  const loser = out.aWins ? foe.kind ?? foe.side : TEMERIA;
  state.battles.push({ day: state.day, x: round(p.x), y: round(p.y), winner, loser, dead: out.aWins ? [round(ourDead), round(theirDead)] : [round(theirDead), round(ourDead)], skirmish: true });
  if (state.battles.length > 30) state.battles.shift();
  const place = nearestPlace(world, p);
  const ours = group.length === 1 ? group[0].name : `${group[0].name} and ${group.length - 1} other compan${group.length === 2 ? 'y' : 'ies'}`;
  const theirs = foe.kind ? `${theirName.toLowerCase()} (${round(theirMen)})` : `${theirName} (${round(theirMen)})`;
  say(state, out.aWins
    ? `Fight near ${world.byId[place.id].name}: ${ours} (${round(ourMen)}) beat ${theirs}. Lost: ${round(ourDead)} of ours, ${round(theirDead)} of theirs.`
    : `Fight near ${world.byId[place.id].name}: ${ours} (${round(ourMen)}) were beaten by ${theirs} and fall back. Lost: ${round(ourDead)} of ours, ${round(theirDead)} of theirs.`);
  if (after) say(state, after);
}

// ---- The month ----

// Pay, wounds, morale and stores, once the ledger has said whether the
// crown could pay.
export function monthlyCompanies(state, world) {
  const f = F(world);
  if (!state.forces || !f) return;
  const st = state.forces.stores;
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    if (s.buildings.includes('smithy')) st.arms += f.stores.smithy;
    if (s.buildings.includes('armoury')) st.arms += f.stores.armoury;
  }
  st.arms = Math.min(f.stores.arms, st.arms);
  st.horses = Math.min(f.stores.horses, st.horses);
  for (const c of [...state.forces.companies]) {
    const home = c.node === c.station && !c.army;
    const s = state.settlements[c.station];
    const fast = home && s && (s.buildings.includes('hospice') || s.buildings.includes('barracks'));
    if (state.unpaid) {
      c.morale = clamp(c.morale - f.morale.unpaidLoss, 0, 100);
      if (c.morale < f.morale.desertBelow) {
        const gone = round(c.men * f.morale.desertShare);
        c.men -= gone;
        if (gone) say(state, `${gone} men have deserted ${c.name}: no pay since the bankers closed their books.`);
      }
    } else if (home) c.morale = clamp(c.morale + (fast ? f.morale.recoverFast : f.morale.recoverPerMonth), 0, 100);
    if (home && c.wounded > 0) {
      const back = c.wounded * (fast ? f.wounds.healFast : f.wounds.healPerMonth);
      c.wounded -= back;
      c.men = Math.min(c.max, c.men + back);
    }
    if (c.men < 8) {
      state.forces.companies = state.forces.companies.filter((x) => x !== c);
      say(state, `${c.name} has melted away.`);
    }
  }
}

// Where the crown's companies see from, for the rules of the game.
export function companySightCircles(state, world) {
  const s = F(world)?.sight;
  if (!s) return [];
  return freeCompanies(state).map((c) => ({ x: c.x, y: c.y, r: mounted(world, c.type) ? s.mounted : s.company }));
}

// Settlements on the roads companies patrol or guard: the bandits keep off.
export function patrolNodes(state, world) {
  const set = new Set();
  for (const c of freeCompanies(state)) {
    const ends = endsOf(state, c);
    if (!ends) continue;
    for (const id of roadPath(world, ends[0], ends[1]) ?? []) set.add(id);
  }
  return set;
}

// What a company is doing, in words.
export function describeCompany(state, world, c) {
  const where = c.way.length ? 'on the march' : c.node ? `at ${world.byId[c.node].name}` : 'in the field';
  const o = c.order;
  let doing;
  if (c.army) doing = `marching with ${state.armies.find((a) => a.id === c.army)?.name ?? 'an army'}`;
  else if (c.routed > state.day) doing = 'falling back to lick its wounds';
  else if (c.task) {
    const t = targetOf(state, c);
    doing = t ? `hunting ${t.kind ? threatName(world, t).toLowerCase() : t.name}` : 'returning';
  } else if (o.kind === 'station') doing = `holding ${world.byId[c.station].name}`;
  else if (o.kind === 'patrol') doing = `patrolling ${world.byId[o.from].name} to ${world.byId[o.to].name}`;
  else if (o.kind === 'escort') {
    const r = state.routes?.find((x) => x.id === o.route);
    doing = r ? `guarding the route ${world.byId[r.from].name} to ${world.byId[r.to].name}` : 'guarding a route';
  } else if (o.kind === 'respond') doing = `standing ready at ${world.byId[c.station].name} (${o.radius} miles)`;
  else doing = 'awaiting orders';
  return `${c.name}, ${round(c.men)} men, ${doing}, ${where}`;
}

