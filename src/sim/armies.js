// Armies in the field. The crown raises an army, names its marshal, and gives
// it an order (hold a place, besiege a town, raid a realm) and a stance; the
// marshal does the marching. Foreign armies follow the same rules under
// their own captains. Armies march the roads a stretch a day, fight when
// they meet an enemy, starve or storm the towns they besiege, and carry off
// what they can.
import { windfall } from './economy.js';
import { creditLimit, realmEffect } from './economy.js';
import { battlesOn, startBattle, stepBattlesDay } from './battle.js';
import { siegesOn, siegeDay } from './siege.js';
import { onCapture, integrationFactor } from './conquest.js';
import { stationedStrength, freeCompanies } from './forces.js';
import { levyCompanies, retinueCompanies, mercenaryCompanies, realmCompanies, normalise, bandStrength } from './companies.js';
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';
import { roadPath, dist } from './world.js';
import { seasonOf } from './calendar.js';
import { informed } from './realms.js';
import { damagePlace, outside } from './works.js';
import {
  TEMERIA, ownerOf, originOf, placeOf, peopleAt, hasWalls, valueOf, hurtPlace, hostile, warBetween, sideIndex,
  sideName, recordCapture, setOwner, enemiesOf,
} from './conflict.js';

const W = (world) => world.war;
const say = (state, text) => addDispatch(state, text, 'military');
const round = Math.round;

// ---- Raising the crown's armies ----

// What a call to arms would bring. Since M21: the crown's levy, a share of
// each crown place's people (more from the cities), times the call; the
// great houses' retinues, by the size of their lands and their loyalty;
// mercenary companies hired for a season; the crown's standing companies.
// Levies and retinues leave their places' hands while they are away.
export function musterPreview(state, world, opts) {
  const r = W(world).raise;
  if (!r.muster) return legacyPreview(state, world, opts);
  const call = r.muster.calls[opts.levy] ?? 0;
  const levy = {};
  const retinues = {};
  const houses = [];
  const refuse = [];
  let levyMen = 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier || s.holder !== 'crown' || !call) continue;
    const n = Math.floor(totalPopulation(s) * (r.muster.share[world.byId[id].type] ?? 0) * call * integrationFactor(world, s, 'levyAt'));
    if (n > 0) {
      levy[id] = n;
      levyMen += n;
    }
  }
  let retinueMen = 0;
  if (opts.nobles) {
    for (const h of Object.keys(state.houses ?? {})) {
      const ret = houseRetinue(state, world, h);
      if (ret.refuse) {
        if (!state.houses[h].rebel) refuse.push(h);
        continue;
      }
      if (!ret.men) continue;
      for (const [id, n] of Object.entries(ret.from)) levy[id] = (levy[id] ?? 0) + n;
      retinues[h] = ret.men;
      retinueMen += ret.men;
      houses.push(h);
    }
  }
  const mercs = (opts.mercs ?? []).filter((id) => mercenaryOffer(state, world, id).ok);
  const mc = r.mercenaries?.companies ?? {};
  const mercMen = mercs.reduce((a, id) => a + mc[id].men, 0);
  const units = freeCompanies(state).filter((c) => (opts.units ?? []).includes(c.id) && !c.task && c.routed <= state.day);
  const unitMen = units.reduce((a, c) => a + c.men, 0);
  const coin = mercs.reduce((a, id) => a + mc[id].coin, 0);
  const monthly = Math.round(levyMen * r.pay.levy + retinueMen * r.pay.retinue + mercs.reduce((a, id) => a + mc[id].monthly, 0));
  return {
    levy, houses, refuse, retinues, mercs, mercMen, companies: 0, units: units.map((c) => c.id), unitMen,
    levyMen, retinueMen, hands: levyMen + retinueMen, soldiers: levyMen + retinueMen + mercMen + unitMen, coin, monthly,
    days: gatherDays(world, opts.muster, Object.keys(levy)),
  };
}

// The days for the levies to reach the muster: the farthest place's road.
export function gatherDays(world, muster, ids) {
  const m = W(world).raise.muster;
  const at = world.byId[muster];
  if (!at || !m) return 0;
  let far = 0;
  for (const id of ids) far = Math.max(far, Math.hypot(world.byId[id].x - at.x, world.byId[id].y - at.y));
  return Math.max(m.gatherMin, Math.ceil(far / m.gatherSpeed));
}

// What a great house would send if called: a share of its lands' people,
// all from a loyal house, half from a lukewarm one, none from a resentful
// or rebel one.
export function houseRetinue(state, world, h) {
  const c = W(world).raise.retinue;
  const house = state.houses?.[h];
  if (!house || house.rebel || house.loyalty < c.refuseBelow) return { men: 0, from: {}, refuse: true };
  const factor = house.loyalty >= c.fullAbove ? 1 : 0.5;
  const from = {};
  let men = 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.holder !== h || s.occupier) continue;
    const n = Math.floor(totalPopulation(s) * c.perPerson * factor);
    if (n > 0) {
      from[id] = n;
      men += n;
    }
  }
  return { men, from, refuse: false, half: factor < 1 };
}

// A mercenary company to be had now: the Novigrad men not against Redania,
// the free company only while a war is fresh, none already in our pay.
export function mercenaryOffer(state, world, id) {
  const m = W(world).raise.mercenaries?.companies?.[id];
  if (!m) return { ok: false, reason: 'No such company.' };
  if ((state.armies ?? []).some((a) => (a.mercs ?? []).some((x) => x.id === id))) return { ok: false, reason: 'Already in our pay.' };
  if (m.from !== 'free' && m.from !== 'kovir' && hostile(state, TEMERIA, m.from)) return { ok: false, reason: `Not while we are at war with ${sideName(world, m.from)}.` };
  if (m.afterWar) {
    const ended = (state.warsEnded ?? []).some((d) => state.day - d <= m.afterWar) || (state.wars ?? []).length > 0;
    if (!ended) return { ok: false, reason: 'Only to be had while a war is fresh.' };
  }
  return { ok: true };
}

function legacyPreview(state, world, opts) {
  const r = W(world).raise;
  const share = r.levy[opts.levy] ?? 0;
  const levy = {};
  const houses = [];
  const refuse = [];
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    if (s.holder === 'crown') {
      if (share) levy[id] = Math.floor(s.garrison * share * integrationFactor(world, s, 'levyAt'));
    } else if (opts.nobles) {
      const h = state.houses[s.holder];
      if (!h || h.rebel) continue;
      if (h.loyalty < r.nobleRefuseBelow) {
        if (!refuse.includes(s.holder)) refuse.push(s.holder);
        continue;
      }
      levy[id] = Math.floor(s.garrison * r.nobleShare);
      if (!houses.includes(s.holder)) houses.push(s.holder);
    }
  }
  for (const id of Object.keys(levy)) if (!levy[id]) delete levy[id];
  const companies = clamp(Math.floor(opts.companies ?? 0), 0, r.maxCompanies);
  const fromLevy = Object.values(levy).reduce((a, b) => a + b, 0);
  const units = freeCompanies(state).filter((c) => (opts.units ?? []).includes(c.id) && !c.task && c.routed <= state.day);
  const unitMen = units.reduce((a, c) => a + c.men, 0);
  return { levy, houses, refuse, companies, units: units.map((c) => c.id), unitMen, soldiers: fromLevy + companies * r.company + unitMen, coin: companies * r.companyCoin };
}

export function crownArmies(state) {
  return (state.armies ?? []).filter((a) => a.side === TEMERIA);
}

export function canRaise(state, world, opts) {
  const w = W(world);
  if (!world.byId[opts.muster] || ownerOf(state, world, opts.muster) !== TEMERIA) return { ok: false, reason: 'Muster at a place the crown holds.' };
  if (crownArmies(state).length >= 3) return { ok: false, reason: 'The realm cannot keep more than three armies.' };
  if (opts.marshal && !w.marshals[opts.marshal]) return { ok: false, reason: 'Unknown marshal.' };
  if (opts.marshal && crownArmies(state).some((a) => a.marshal === opts.marshal)) return { ok: false, reason: 'That marshal already leads an army.' };
  const held = (state.captives ?? []).find((c) => c.marshal === opts.marshal && c.side === TEMERIA);
  if (opts.marshal && held) return { ok: false, reason: `He is a prisoner of ${sideName(world, held.by)}: ransom him at the deal table.` };
  const m = w.marshals[opts.marshal];
  if (m?.house && (state.houses[m.house]?.rebel || state.houses[m.house]?.loyalty < w.raise.nobleRefuseBelow)) return { ok: false, reason: 'His house will not lend him to the crown.' };
  const p = musterPreview(state, world, opts);
  if (p.soldiers < w.minArmy * 2) return { ok: false, reason: 'Too few soldiers for an army.' };
  if (state.treasury - p.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, preview: p };
}

export function raiseArmy(state, world, opts) {
  const w = W(world);
  const p = musterPreview(state, world, opts);
  // Since M21 the levies come from the people, not the garrisons.
  if (!w.raise.muster) for (const [id, n] of Object.entries(p.levy)) state.settlements[id].garrison -= n;
  state.treasury -= p.coin;
  for (const hid of p.houses) state.houses[hid].grievance += w.raise.nobleGrievance;
  const a = newArmy(state, world, TEMERIA, opts.muster, p.soldiers, p.levy, {
    companies: p.companies, marshal: opts.marshal ?? null, stance: opts.stance ?? 'cautious',
    name: `The army of ${world.byId[opts.muster].name}`,
  });
  // The realm's armouries arm the levy.
  a.arms = 1 + Math.min(0.3, realmEffect(state, world, 'armyArms'));
  // Standing companies leave their stations and march under the marshal.
  a.units = [];
  for (const id of p.units) {
    const c = state.forces.companies.find((x) => x.id === id);
    c.army = a.id;
    c.task = null;
    c.way = [];
    a.units.push({ id, men: c.men });
  }
  // Mercenaries, hired for a season (M21).
  if (w.raise.muster) {
    const mc = w.raise.mercenaries?.companies ?? {};
    a.folk = true;
    a.levyMen = p.levyMen;
    a.retinueMen = p.retinueMen;
    a.mercs = p.mercs.map((id) => ({ id, men: mc[id].men, until: state.day + w.raise.mercenaries.season }));
    if (p.days > 0) a.gatherUntil = state.day + p.days;
  }
  // Every man in a company (M22 C): the levies by their places, the lords'
  // retinues, the hired companies and the crown's standing companies, each
  // keeping its name and type inside the army.
  a.bands = [
    ...Object.entries(p.levy).flatMap(([id, n]) => levyCompanies(world, id, n)),
    ...Object.entries(p.retinues ?? {}).flatMap(([h, n]) => retinueCompanies(world, h, n)),
    ...(p.mercs ?? []).flatMap((id) => mercenaryCompanies(world, id)),
    ...p.units.map((id) => {
      const c = state.forces.companies.find((x) => x.id === id);
      return { type: c.type, men: c.men, xp: c.xp ?? 0, source: 'standing', company: id, name: c.name };
    }),
  ];
  if (p.companies) a.bands.push(...realmCompanies(world, TEMERIA, p.companies * (w.raise.company ?? 200), 0).map((b) => ({ ...b, source: 'hired', name: 'Free company' })));
  a.soldiers = a.bands.reduce((v, b) => v + b.men, 0) || a.soldiers;
  a.raised = a.soldiers;
  delete a.quality;
  const parts = [];
  if (Object.keys(p.levy).length) parts.push(p.houses.length ? `crown and noble levies (${p.houses.map((h) => world.houses.houses[h].name).join(', ')})` : 'the crown levy');
  if (p.companies) parts.push(`${p.companies} free compan${p.companies === 1 ? 'y' : 'ies'}`);
  if (p.mercs?.length) parts.push(p.mercs.map((id) => w.raise.mercenaries.companies[id].name).join(' and '));
  if (p.units.length) parts.push(`${p.units.length} of the crown's standing compan${p.units.length === 1 ? 'y' : 'ies'}`);
  say(state, `${a.name} gathers at ${world.byId[opts.muster].name}: ${round(a.soldiers)} men from ${parts.join(' and ')}${a.marshal ? `, under ${w.marshals[a.marshal].name}` : ''}.${a.gatherUntil ? ` The levies will be in within ${p.days} days.` : ''}`);
  for (const hid of p.refuse) say(state, `${world.houses.houses[hid].name} sends excuses instead of men.`);
  return a;
}

export function newArmy(state, world, side, at, soldiers, levy, extra = {}) {
  const a = {
    id: state.nextArmyId++, side, name: extra.name ?? `The army of ${sideName(world, side)}`,
    soldiers, raised: soldiers, morale: 80, levy, companies: extra.companies ?? 0, marshal: extra.marshal ?? null,
    stance: extra.stance ?? 'cautious', order: extra.order ?? 'defend', target: extra.target ?? at, home: at,
    at, to: null, along: 0, path: [], dest: at, speed: 0, siege: null, raiding: null, raidTarget: null, raids: 0,
    retreating: false, fought: -1, bands: extra.bands ?? realmCompanies(world, side, 0, soldiers),
  };
  state.armies.push(a);
  return a;
}

// Survivors of the levies go home to their garrisons; hired men and fresh
// conscripts simply go.
export function disbandArmy(state, world, a, quiet = false) {
  const f = clamp(a.soldiers / Math.max(1, a.raised), 0, 1);
  // Levies from the people (M21) simply go home to their work.
  if (!a.folk) for (const [id, n] of Object.entries(a.levy)) {
    if (ownerOf(state, world, id) === a.side) placeOf(state, world, id).garrison += round(n * f);
  }
  // A realm's standing men go back to its standing army (M18).
  if (a.standing && state.realms?.[a.side]) state.realms[a.side].army = (state.realms[a.side].army ?? 0) + round(a.standing * f);
  // The standing companies march home to their stations, with what they
  // learned on the way.
  const pos = armyPosition(world, a);
  for (const u of a.units ?? []) {
    const c = state.forces?.companies.find((x) => x.id === u.id);
    if (!c) continue;
    c.army = null;
    c.men = Math.min(c.max, round(u.men * f));
    c.xp = Math.min(world.forces.xp.max, (c.xp ?? 0) + (a.wins ?? 0) * world.forces.xp.win);
    c.x = pos.x;
    c.y = pos.y;
    c.node = a.at;
    c.way = [];
    c.order = c.order.kind === 'hunt' ? { kind: 'station' } : c.order;
    if (c.men < 8) state.forces.companies = state.forces.companies.filter((x) => x !== c);
  }
  state.armies = state.armies.filter((x) => x.id !== a.id);
  if (!quiet && a.side === TEMERIA) say(state, `${a.name} is stood down. ${round(a.soldiers)} men go home.`);
}

// ---- Orders ----

export function canOrder(state, world, a, order, target) {
  if (!a || a.side !== TEMERIA) return { ok: false, reason: 'No such army.' };
  if ((a.gatherUntil ?? 0) > state.day && order !== 'defend') return { ok: false, reason: `Still gathering: the levies are in within ${a.gatherUntil - state.day} days.` };
  if (order === 'defend') {
    if (!world.byId[target] || ownerOf(state, world, target) !== TEMERIA) return { ok: false, reason: 'Hold a place the crown holds.' };
  } else if (order === 'siege') {
    if (!world.byId[target]) return { ok: false, reason: 'Unknown place.' };
    if (!hostile(state, TEMERIA, ownerOf(state, world, target))) return { ok: false, reason: 'We are not at war with its holder.' };
    if (!roadPath(world, a.to ?? a.at, target, true)) return { ok: false, reason: 'No road leads there.' };
  } else if (order === 'raid') {
    if (!hostile(state, TEMERIA, target)) return { ok: false, reason: 'We are not at war with them.' };
  } else return { ok: false, reason: 'Unknown order.' };
  return { ok: true };
}

export function orderArmy(state, world, a, order, target, stance) {
  a.order = order;
  a.target = target;
  if (stance && W(world).stances[stance]) a.stance = stance;
  a.siege = null;
  a.raiding = null;
  a.raidTarget = null;
  a.raids = 0;
  const words = {
    defend: () => `${a.name} is to hold ${world.byId[target].name}.`,
    siege: () => `${a.name} marches to besiege ${world.byId[target].name}.`,
    raid: () => `${a.name} rides into ${sideName(world, target)} to burn and plunder.`,
  };
  say(state, words[order]());
}

// ---- Where an army is ----

export function armyPosition(world, a, extra = 0) {
  const p = world.byId[a.at];
  if (!a.to) return { x: p.x, y: p.y, angle: 0 };
  const q = world.byId[a.to];
  const len = dist(p, q) || 1;
  const t = Math.min(1, (a.along + extra) / len);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, angle: Math.atan2(q.y - p.y, q.x - p.x) };
}

// path[0] is always the next place on the way; an army finishes the stretch
// of road it is on before it turns.
export function routeTo(world, a, dest) {
  if (!dest) return false;
  if (a.dest === dest && (a.path.length || (!a.to && a.at === dest))) return true;
  const from = a.to ?? a.at;
  const path = roadPath(world, from, dest, true);
  if (!path) return false;
  a.dest = dest;
  // Routes are shared from the path cache, so take a copy to walk.
  a.path = a.to ? [...path] : path.slice(1);
  return true;
}

export function halt(a) {
  a.path = a.to ? [a.to] : [];
  a.dest = a.to ?? a.at;
}

function move(world, a, speed) {
  a.speed = 0;
  if (!a.to) {
    if (!a.path.length) return false;
    a.to = a.path[0];
    a.along = 0;
  }
  const len = dist(world.byId[a.at], world.byId[a.to]);
  a.along += speed;
  a.speed = speed;
  if (a.along < len) return false;
  a.at = a.to;
  a.path.shift();
  a.to = null;
  a.along = 0;
  return true;
}

const stationary = (a) => !a.to && !a.path.length;

// ---- Strength ----

function marshalSkill(world, a) {
  return a.marshal ? W(world).marshals[a.marshal]?.skill ?? 1 : 1;
}

// An army's strength (M22 C): the sum of its companies' by the one formula,
// then its marshal, its stance and the realm's armouries.
export function armyStrength(state, world, a, defending = false) {
  const st = W(world).stances[a.stance] ?? W(world).stances.cautious;
  if (!a.bands?.length) a.bands = realmCompanies(world, a.side, 0, a.soldiers);
  normalise(a);
  let v = bandStrength(world, a.bands, a.morale, 'soldiers') * marshalSkill(world, a) * (defending ? st.defence : st.attack) * (a.arms ?? 1);
  if (!a.to && ownerOf(state, world, a.at) === a.side && hasWalls(state, world, a.at)) v *= W(world).battle.wallsDefence;
  return v;
}

// Townsfolk man the walls beside the garrison, so a city is never taken
// by a handful.
export function placeDefence(state, world, id, withWalls = true) {
  const b = W(world).battle;
  const p = placeOf(state, world, id);
  const militia = peopleAt(state, world, id) * W(world).siege.militiaPerPerson;
  const type = world.byId[id].type;
  const armed = 1 + p.buildings.reduce((v, b) => v + (world.buildings[b].effects.soldierStrength ?? 0), 0);
  // The crown's companies stationed there stand on the walls too.
  const companies = ownerOf(state, world, id) === TEMERIA ? stationedStrength(state, world, id) : 0;
  return (p.garrison * armed + militia + companies) * (withWalls && hasWalls(state, world, id) ? b.wallsDefence : 1) * (type === 'castle' ? b.castleDefence : type === 'city' ? b.cityDefence : 1);
}

// ---- The day ----

export function stepArmiesDay(state, world, rng) {
  if (!state.armies?.length) return;
  const w = W(world);
  const speed = w.speed * (w.seasonSpeed[seasonOf(state.day)] ?? 1);
  // Armies locked in battle (M19) neither think nor march until it ends.
  for (const a of state.armies) if (!a.battle) think(state, world, a);
  for (const a of state.armies) {
    if (a.siege || a.raiding || a.battle || (a.gatherUntil ?? 0) > state.day) { a.speed = 0; continue; }
    move(world, a, speed);
  }
  battles(state, world, rng);
  if (battlesOn(world)) stepBattlesDay(state, world, rng);
  for (const a of [...state.armies]) if (state.armies.includes(a) && !a.battle) siegeOrRaid(state, world, rng, a);
  wear(state, world, rng);
}

function nearestEnemy(state, world, a, x, y, range) {
  let best = null;
  for (const b of state.armies) {
    if (b === a || !hostile(state, a.side, b.side) || (b.routed ?? 0) > state.day) continue;
    const p = armyPosition(world, b);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= range && (!best || d < best.d)) best = { army: b, d };
  }
  return best;
}

function chase(world, a, b) {
  a.siege = null;
  a.raiding = null;
  return routeTo(world, a, b.to ?? b.at);
}

// The nearest place an army can fall back on: its own side's, walled if
// possible.
export function refuge(state, world, a) {
  const pos = armyPosition(world, a);
  let best = null;
  for (const id of Object.keys(world.byId)) {
    if (ownerOf(state, world, id) !== a.side) continue;
    const p = world.byId[id];
    const d = Math.hypot(p.x - pos.x, p.y - pos.y) * (hasWalls(state, world, id) ? 0.7 : 1);
    if ((!best || d < best.d) && roadPath(world, a.to ?? a.at, id, true)) best = { id, d };
  }
  return best?.id ?? a.home;
}

function think(state, world, a) {
  const w = W(world);
  if (a.retreating) {
    if (a.morale >= 55 || (stationary(a) && a.at === a.dest)) a.retreating = false;
    else return;
  }
  if (a.order === 'muster') return halt(a);
  if (a.side === TEMERIA) thinkCrown(state, world, a);
  else thinkForeign(state, world, a);
}

function ratio(state, world, a, b) {
  return armyStrength(state, world, a) / Math.max(1, armyStrength(state, world, b, true));
}

function thinkCrown(state, world, a) {
  const w = W(world);
  const st = w.stances[a.stance];
  const pos = armyPosition(world, a);
  if (a.order === 'defend') {
    // A place handed back at a peace is no longer ours to hold.
    if (ownerOf(state, world, a.target) !== TEMERIA) a.target = refuge(state, world, a);
    const home = world.byId[a.target];
    const threat = nearestEnemy(state, world, a, home.x, home.y, w.watchRange);
    if (threat && ratio(state, world, a, threat.army) >= st.engageAt) return chase(world, a, threat.army);
    if (a.at !== a.target || a.to) return routeTo(world, a, a.target);
    return halt(a);
  }
  if (a.order === 'siege') {
    const owner = ownerOf(state, world, a.target);
    if (!hostile(state, TEMERIA, owner)) {
      const held = owner === TEMERIA;
      a.order = 'defend';
      if (!held) a.target = refuge(state, world, a);
      say(state, held
        ? `${a.name} holds ${world.byId[a.target].name} and awaits the crown's orders.`
        : `${a.name} turns back: we are no longer at war with ${sideName(world, owner)}.`);
      return routeTo(world, a, a.target);
    }
    const near = nearestEnemy(state, world, a, pos.x, pos.y, 60);
    if (near && ratio(state, world, a, near.army) >= st.engageAt) return chase(world, a, near.army);
    return routeTo(world, a, a.target);
  }
  if (a.order === 'raid') {
    if (!hostile(state, TEMERIA, a.target) || a.raids >= w.raid.count) {
      a.order = 'defend';
      a.target = ownerOf(state, world, a.home) === TEMERIA ? a.home : refuge(state, world, a);
      say(state, `${a.name} comes home from its raiding, laden with spoil.`);
      return routeTo(world, a, a.target);
    }
    if (a.raiding) return;
    if (!a.raidTarget || !raidable(state, world, a, a.raidTarget)) a.raidTarget = pickRaid(state, world, a, pos);
    if (!a.raidTarget) {
      a.raids = w.raid.count;
      return;
    }
    return routeTo(world, a, a.raidTarget);
  }
}

function raidable(state, world, a, id) {
  const owner = ownerOf(state, world, id);
  const p = placeOf(state, world, id);
  const type = world.byId[id].type;
  return hostile(state, a.side, owner) && (owner === a.target || originOf(world, id) === a.target)
    && !hasWalls(state, world, id) && (type === 'village' || type === 'town') && (p.sacked ?? 0) <= state.day;
}

function pickRaid(state, world, a, pos) {
  let best = null;
  for (const id of Object.keys(world.byId)) {
    if (!raidable(state, world, a, id)) continue;
    const p = world.byId[id];
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if ((!best || d < best.d) && roadPath(world, a.to ?? a.at, id, true)) best = { id, d };
  }
  return best?.id ?? null;
}

function thinkForeign(state, world, a) {
  const w = W(world);
  const st = w.stances[a.stance];
  if (!enemiesOf(state, a.side).length) return;
  const pos = armyPosition(world, a);
  const near = nearestEnemy(state, world, a, pos.x, pos.y, 120);
  if (near) {
    const r = ratio(state, world, a, near.army);
    if (r >= st.engageAt) return chase(world, a, near.army);
    if (r < 0.7) {
      a.siege = null;
      return routeTo(world, a, refuge(state, world, a));
    }
  }
  // Relieve our own towns under siege.
  for (const b of state.armies) {
    if (!b.siege || !hostile(state, a.side, b.side) || ownerOf(state, world, b.at) !== a.side) continue;
    const p = world.byId[b.at];
    if (Math.hypot(p.x - pos.x, p.y - pos.y) < 300 && ratio(state, world, a, b) >= st.engageAt * 0.9) return chase(world, a, b);
  }
  if (!a.target || !hostile(state, a.side, ownerOf(state, world, a.target))) {
    a.siege = null;
    a.target = pickTarget(state, world, a, pos);
  }
  if (a.target) routeTo(world, a, a.target);
  else halt(a);
}

// Where a foreign captain strikes: the richest prize near at hand that his
// army can hope to take, and his own lost towns above all.
// Captains fight border wars: they strike places near their own lands, and
// the towns they have lost, rather than marching to the far side of a realm.
function pickTarget(state, world, a, pos) {
  let best = null;
  const mine = a.soldiers * marshalSkill(world, a);
  const own = Object.keys(world.byId).filter((id) => ownerOf(state, world, id) === a.side).map((id) => world.byId[id]);
  const reach = W(world).ai.reach;
  for (const id of Object.keys(world.byId)) {
    const owner = ownerOf(state, world, id);
    if (!hostile(state, a.side, owner)) continue;
    const p = world.byId[id];
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d > 900) continue;
    if (originOf(world, id) !== a.side && !own.some((o) => Math.hypot(o.x - p.x, o.y - p.y) <= reach)) continue;
    const feasible = mine >= placeDefence(state, world, id) ? 1 : 0.2;
    // The war aim (M18) draws the army above all else.
    const aim = (state.wars ?? []).some((w) => w.aims?.[a.side] === id) ? (world.strategy?.war.aimWeight ?? 1) : 1;
    const score = valueOf(state, world, id) * (originOf(world, id) === a.side ? 2 : 1) * feasible * aim / (d + 100) ** 1.5;
    if ((!best || score > best.score) && roadPath(world, a.to ?? a.at, id, true)) best = { id, score };
  }
  return best?.id ?? null;
}

// ---- Battles ----

function battles(state, world, rng) {
  const r = W(world).engageRange;
  const list = state.armies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.fought === state.day || b.fought === state.day || !hostile(state, a.side, b.side)) continue;
      if (a.battle || b.battle) continue;
      // A beaten army is let go for a few days before it can be brought to battle again.
      if ((a.routed ?? 0) > state.day || (b.routed ?? 0) > state.day) continue;
      const pa = armyPosition(world, a);
      const pb = armyPosition(world, b);
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > r) continue;
      // Since M19 a battle is fought over days, to be watched; the old
      // single roll remains for worlds without battle data.
      if (battlesOn(world)) startBattle(state, world, rng, a, b, pa);
      else fight(state, world, rng, a, b, pa);
    }
  }
}

function fight(state, world, rng, a, b, where) {
  const w = W(world);
  const bt = w.battle;
  const sa = armyStrength(state, world, a, stationary(a));
  const sb = armyStrength(state, world, b, stationary(b));
  // The stronger side usually wins, though never surely; each side's dead
  // follow the strength of the other.
  const pa = sa ** 3 / (sa ** 3 + sb ** 3);
  const [win, lose] = rng.next() < pa ? [a, b] : [b, a];
  const sWin = win === a ? sa : sb;
  const sLose = win === a ? sb : sa;
  const lerp = ([lo, hi], t) => lo + (hi - lo) * t;
  const lossL = lerp(bt.loserLoss, rng.next()) * clamp(sWin / Math.max(1, sLose), 0.5, 1.5) * (win.stance === 'bold' ? 1.1 : 1);
  const lossW = lerp(bt.winnerLoss, rng.next()) * clamp(sLose / Math.max(1, sWin), 0.5, 2) * (win.stance === 'bold' ? 1.1 : 1);
  const deadL = lose.soldiers * lossL;
  // A small force overwhelmed cannot take a great one down with it.
  const deadW = Math.min(win.soldiers * lossW, lose.soldiers * 0.6);
  lose.soldiers -= deadL;
  win.soldiers -= deadW;
  win.morale = clamp(win.morale + bt.moraleWin, 0, 100);
  win.wins = (win.wins ?? 0) + 1;
  lose.morale = clamp(lose.morale - bt.moraleLoss, 0, 100);
  a.fought = state.day;
  b.fought = state.day;
  lose.siege = null;
  lose.raiding = null;
  lose.retreating = true;
  lose.routed = state.day + bt.routedDays;
  const back = refuge(state, world, lose);
  if (!routeTo(world, lose, back)) halt(lose);
  const war = warBetween(state, win.side, lose.side);
  if (war) {
    war.points[sideIndex(war, win.side)] += clamp(round((deadL + deadW) / 80), 2, 15);
    war.lost[sideIndex(war, win.side)] += deadW;
    war.lost[sideIndex(war, lose.side)] += deadL;
  }
  state.battles.push({ day: state.day, x: round(where.x), y: round(where.y), winner: win.side, loser: lose.side, dead: [round(deadW), round(deadL)] });
  if (state.battles.length > 30) state.battles.shift();
  const place = nearestPlaceName(world, where);
  const text = `Battle near ${place}: ${win.name} (${sideName(world, win.side)}) routed ${lose.name} (${sideName(world, lose.side)}). ${round(deadL)} of the beaten fell or fled, ${round(deadW)} of the victors.`;
  if (win.side === TEMERIA || lose.side === TEMERIA) {
    glory(state, world, win.side === TEMERIA ? 'battleWon' : 'battleLost', win.side === TEMERIA ? win : lose);
    say(state, text);
  } else if (informed(state, world, win.side) || informed(state, world, lose.side)) addDispatch(state, text, 'abroad');
}

export function nearestPlaceName(world, p) {
  let best = null;
  for (const st of Object.values(world.byId)) {
    const d = Math.hypot(st.x - p.x, st.y - p.y);
    if (!best || d < best.d) best = { d, name: st.name };
  }
  return best.name;
}

// Victories lift the crown and the lords; defeats and lost towns cost it.
export function glory(state, world, kind, a) {
  const g = W(world).glory;
  const v = g[kind] ?? 0;
  state.authority = clamp(state.authority + v, 0, 100);
  if (kind === 'battleWon' || kind === 'battleLost') {
    if (state.opinion?.nobles !== undefined) state.opinion.nobles = clamp(state.opinion.nobles + Math.sign(v) * g.nobles, 0, 100);
    const house = W(world).marshals[a?.marshal]?.house;
    if (house && state.houses?.[house] && v > 0) state.houses[house].favour += g.houseFavour;
  }
}

// An army beaten by the crown's companies falls back as from a lost battle.
export function routArmy(state, world, a) {
  a.morale = clamp(a.morale - W(world).battle.moraleLoss, 0, 100);
  a.siege = null;
  a.raiding = null;
  a.retreating = true;
  a.routed = state.day + W(world).battle.routedDays;
  if (!routeTo(world, a, refuge(state, world, a))) halt(a);
  if (a.soldiers < W(world).minArmy) disbandArmy(state, world, a, true);
}

// ---- Sieges and raids ----

function siegeOrRaid(state, world, rng, a) {
  if (!stationary(a)) {
    a.siege = null;
    return;
  }
  const owner = ownerOf(state, world, a.at);
  // No siege while the enemy's own army stands in the field before the walls.
  const relieved = state.armies.some((b) => b.at === a.at && !b.to && hostile(state, a.side, b.side));
  if (!hostile(state, a.side, owner) || relieved) {
    a.siege = null;
    a.raiding = null;
    return;
  }
  if (a.order === 'raid') {
    if (a.raidTarget === a.at) raidTick(state, world, rng, a);
  } else if (a.order === 'siege' && a.target === a.at) {
    // Since M19 a siege is a camp to watch: walls, food, sickness, terms.
    if (siegesOn(world)) siegeDay(state, world, rng, a, owner);
    else siegeTick(state, world, rng, a, owner);
  }
}

function siegeTick(state, world, rng, a, owner) {
  const w = W(world);
  const sg = w.siege;
  const p = placeOf(state, world, a.at);
  const name = world.byId[a.at].name;
  if (!a.siege) {
    // A siege broken off and taken up again carries on where it was.
    a.siege = a.lastSiege?.at === a.at ? { ...a.lastSiege } : { at: a.at, days: 0, progress: 0 };
    if (p.garrison >= 5 && a.siege.days === 0) {
      const text = `${a.name} (${sideName(world, a.side)}) lays siege to ${name}.`;
      if (a.side === TEMERIA || owner === TEMERIA) say(state, text);
      else if (informed(state, world, a.side) || informed(state, world, owner)) addDispatch(state, text, 'abroad');
    }
  }
  if (placeDefence(state, world, a.at) < 5) return capture(state, world, rng, a, a.at, owner, 'open');
  const st = w.stances[a.stance];
  const defence = placeDefence(state, world, a.at);
  const mine = armyStrength(state, world, a);
  if (mine >= st.assaultAt * defence) {
    // Storming costs the attacker dear, behind walls most of all.
    const walls = hasWalls(state, world, a.at) ? w.battle.wallsDefence : 1;
    const dead = Math.min(a.soldiers * 0.4, defence * (0.4 + rng.next() * 0.4) * walls);
    a.soldiers -= dead;
    const war = warBetween(state, a.side, owner);
    if (war) {
      war.lost[sideIndex(war, a.side)] += dead;
      war.lost[sideIndex(war, owner)] += p.garrison;
    }
    return capture(state, world, rng, a, a.at, owner, 'storm');
  }
  a.siege.days += 1;
  const type = world.byId[a.at].type;
  // A village or any unwalled place falls to an army that holds it a day
  // unopposed (M19); walls, cities and castles need a siege.
  if (world.conquest && !hasWalls(state, world, a.at) && type !== 'city' && type !== 'castle' && a.siege.days > 1 && mine >= defence) {
    a.soldiers -= Math.min(a.soldiers * 0.15, p.garrison * 0.5);
    return capture(state, world, rng, a, a.at, owner, 'open');
  }
  const slower = (hasWalls(state, world, a.at) ? sg.wallsSlower : 1) * (type === 'castle' ? sg.castleSlower : type === 'city' ? sg.citySlower : 1);
  a.siege.progress += (100 / (sg.starveDays * slower)) * clamp(mine / Math.max(1, defence * 1.5), 0.3, 1.5);
  p.garrison = Math.max(0, p.garrison - Math.max(1, p.garrison * sg.garrisonAttrition));
  a.soldiers -= a.soldiers * sg.besiegerAttrition;
  a.lastSiege = { ...a.siege };
  if (a.siege.progress >= 100) capture(state, world, rng, a, a.at, owner, 'starved');
}

export function capture(state, world, rng, a, id, prev, how) {
  const w = W(world);
  const c = w.capture;
  const p = placeOf(state, world, id);
  const occupy = Math.min(a.soldiers * 0.5, Math.max(w.siege.occupyMin, a.soldiers * w.siege.occupyShare));
  const lostGarrison = p.garrison;
  a.soldiers -= occupy;
  p.garrison = round(occupy);
  setOwner(state, world, id, a.side);
  const war = warBetween(state, a.side, prev);
  if (war) recordCapture(war, id, prev, a.side, state.day);
  // Since M19 a town taken is spared unless its taker chooses to sack it.
  const loot = world.conquest ? 0 : round(peopleAt(state, world, id) * c.lootPerPerson * (p.prosperity / 50));
  // Surrendered on terms (M19), the town is taken intact.
  if (how !== 'terms') {
    hurtPlace(state, world, id, { prosperity: c.prosperity, people: c.people, unrest: c.unrest });
    const k = world.works?.capture;
    if (k) damagePlace(state, world, rng, id, { count: k.works, amount: k.amount, why: how === 'storm' ? 'Wrecked when the town was stormed' : 'Damaged in the taking of the town' });
  }
  p.sacked = state.day + c.sackedDays;
  if (a.side === TEMERIA) windfall(state, 'loot', loot);
  else if (state.realms[a.side]) state.realms[a.side].treasury += loot;
  a.siege = null;
  const name = world.byId[id].name;
  const how2 = { storm: 'stormed', starved: 'starved into surrender', open: 'taken without a fight', terms: 'surrendered on terms, its garrison marching out with the honours of war' }[how];
  const siege = a.siege ?? a.lastSiege;
  const report = siege && siege.at === id && siege.days ? ` The siege lasted ${siege.days} days${siege.sallies ? `, with ${siege.sallies} sall${siege.sallies === 1 ? 'y' : 'ies'}` : ''}; sickness took ${round(siege.sick)} of the besiegers.` : '';
  const text = `${name} has fallen to ${sideName(world, a.side)}: ${how2}${lostGarrison >= 5 && how !== 'starved' && how !== 'terms' ? `, its ${round(lostGarrison)} defenders put to the sword` : ''}.${report} ${loot ? `${loot} crowns carried off.` : ''}`.trim();
  onCapture(state, world, rng, a, id, prev, how);
  if (a.side === TEMERIA) {
    glory(state, world, 'townTaken', a);
    say(state, text);
    a.order = 'defend';
    a.target = id;
    say(state, `${a.name} holds ${name} and awaits the crown's orders.`);
  } else if (prev === TEMERIA) {
    glory(state, world, id === world.kingdom.capital ? 'capitalLost' : 'townLost', a);
    const holder = state.settlements[id]?.holder;
    if (holder && state.houses?.[holder]) state.houses[holder].grievance += w.glory.holdingLostGrievance;
    say(state, text);
    a.target = null;
  } else {
    if (informed(state, world, a.side) || informed(state, world, prev) || originOf(world, id) === TEMERIA) addDispatch(state, text, 'abroad');
    a.target = null;
  }
}

function raidTick(state, world, rng, a) {
  const r = W(world).raid;
  a.raiding ??= { days: 0 };
  a.raiding.days += 1;
  if (a.raiding.days < r.days) return;
  const id = a.at;
  const p = placeOf(state, world, id);
  const loot = round(peopleAt(state, world, id) * r.lootPerPerson * (p.prosperity / 50));
  hurtPlace(state, world, id, { prosperity: r.prosperity, food: r.food, unrest: r.unrest });
  damagePlace(state, world, rng, id, { count: 2, amount: world.works?.capture?.amount ?? [10, 25], why: 'Plundered by an enemy army', pick: outside });
  p.sacked = state.day + W(world).capture.sackedDays;
  if (a.side === TEMERIA) windfall(state, 'loot', loot);
  else if (state.realms[a.side]) state.realms[a.side].treasury += loot;
  a.raiding = null;
  a.raidTarget = null;
  a.raids += 1;
  const text = `${a.name} (${sideName(world, a.side)}) plundered ${world.byId[id].name}${loot ? ` and carried off ${loot} crowns` : ''}.`;
  if (a.side === TEMERIA || ownerOf(state, world, id) === TEMERIA) say(state, text);
}

// Marching wears an army down, in enemy country and in winter most of all;
// an army living off the land strips it bare.
function wear(state, world, rng) {
  const w = W(world);
  const season = seasonOf(state.day);
  const winter = season === 'winter';
  for (const a of [...state.armies]) {
    const own = ownerOf(state, world, a.at) === a.side;
    if (w.attrition.supplyRange) attrition(state, world, a, own, season);
    else a.soldiers -= a.soldiers * ((own ? w.attrition.home : w.attrition.enemy) + (winter ? w.attrition.winter : 0));
    a.morale = clamp(a.morale + w.battle.moraleRecoverPerDay, 0, 100);
    if (!own && hostile(state, a.side, ownerOf(state, world, a.at))) {
      hurtPlace(state, world, a.at, { food: w.forage.food, prosperity: w.forage.prosperity });
      const f = world.works?.forage;
      if (f && rng.chance(f.chance)) damagePlace(state, world, rng, a.at, { count: 1, amount: f.amount, why: 'Stripped by foraging soldiers', pick: outside });
    }
    if (a.soldiers < w.minArmy) {
      const text = `${a.name} (${sideName(world, a.side)}) has melted away: too few left to call it an army.`;
      if (a.side === TEMERIA) say(state, text);
      disbandArmy(state, world, a, true);
    }
  }
}

// Field attrition (M19), by its causes: supply far from friendly towns,
// winter, disease in a large army in the warm months, and desertion when
// the men go unpaid. Each cause is tallied over the last thirty days for
// the army's card.
function attrition(state, world, a, own, season) {
  const at = W(world).attrition;
  const p = armyPosition(world, a);
  let near = Infinity;
  for (const id of Object.keys(world.byId)) {
    if (ownerOf(state, world, id) !== a.side) continue;
    const d = Math.hypot(world.byId[id].x - p.x, world.byId[id].y - p.y);
    if (d < near) near = d;
    if (near <= at.supplyRange) break;
  }
  const rates = {
    supply: own ? at.home : near > at.supplyRange ? at.enemy + at.supply : at.enemy,
    winter: season === 'winter' ? at.winter : 0,
    disease: a.soldiers > at.diseaseAbove && at.diseaseSeasons.includes(season) ? at.disease : 0,
    desertion: (a.side === TEMERIA ? state.unpaid : (state.realms[a.side]?.treasury ?? 0) < 0) ? at.desertion : 0,
  };
  const t = (a.attrition ??= { days: [], causes: {} });
  const today = {};
  for (const [k, r] of Object.entries(rates)) {
    const lost = a.soldiers * r;
    today[k] = lost;
  }
  const total = Object.values(today).reduce((x, y) => x + y, 0);
  a.soldiers -= total;
  t.days.push(today);
  if (t.days.length > 30) t.days.shift();
}

// What field attrition has cost an army over the last thirty days, by cause.
export function attritionOf(a) {
  const out = { supply: 0, winter: 0, disease: 0, desertion: 0 };
  for (const d of a.attrition?.days ?? []) for (const k of Object.keys(out)) out[k] += d[k] ?? 0;
  return out;
}

// What an army is doing, in words, for its card and the map label.
export function describeArmy(state, world, a) {
  const where = a.to ? `on the road to ${world.byId[a.to].name}` : `at ${world.byId[a.at].name}`;
  let doing;
  const fight = a.battle && (state.fights ?? []).find((f) => f.id === a.battle);
  if (fight) doing = `in battle near ${fight.place}`;
  else if (a.order === 'muster') doing = 'mustering';
  else if (a.retreating) doing = 'falling back';
  else if (a.siege) doing = `besieging ${world.byId[a.at].name}`;
  else if (a.raiding) doing = `plundering ${world.byId[a.at].name}`;
  else if (a.order === 'siege' && a.target) doing = `marching on ${world.byId[a.target].name}`;
  else if (a.order === 'raid') doing = `raiding ${sideName(world, a.target)}`;
  else if (a.order === 'defend' && a.target) doing = a.at === a.target && !a.to ? `holding ${world.byId[a.target].name}` : `making for ${world.byId[a.target].name}`;
  else doing = 'awaiting orders';
  return `${a.name}, ${round(a.soldiers)} men, ${doing}, ${where}`;
}
