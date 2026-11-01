// The neighbouring realms as living places, under lighter rules than
// Temeria: their towns grow, their rulers raise buildings and keep
// garrisons, and fires, raids, sickness and fairs come and go. What the
// crown hears of it depends on its embassies, spies and friends.
import { creditLimit } from './economy.js';
import { sendFigure, courtOf } from './figures.js';
import { addDispatch, clamp } from './realm.js';
import { ownerOf, leviedMap, besieged } from './conflict.js';
import { sharesSight } from './diplomacy.js';
import { armyUpkeep } from './strategy.js';
import { monthlyFrontier } from './frontier.js';
import { monthlyClock } from './clock.js';
import { monthlySeas } from './seas.js';
import { monthlySpies, hasSpy, boostNet } from './spies.js';
import { integrationFactor } from './conquest.js';
import { startingWorks, worksFactor, upkeepFactor } from './works.js';
import { giveWorks } from './state.js';

const say = (state, text) => addDispatch(state, text, 'abroad');
const R = (world) => world.realms;

export function defaultRealms(world) {
  const out = {};
  for (const [rid, ids] of Object.entries(world.foreignByRealm)) {
    const settlements = {};
    for (const id of ids) {
      const base = { ...R(world).startByType[world.byId[id].type], ...(R(world).overrides[id] ?? {}) };
      settlements[id] = { population: base.population, prosperity: base.prosperity, garrison: base.garrison, buildings: [], construction: null };
      if (world.spaces) giveWorks(settlements[id], startingWorks(world, id, rid));
    }
    out[rid] = { treasury: 1000, settlements };
    // A lawless frontier (M30 B) is fair game to all: see frontier.js.
    if (R(world).realms[rid]?.lawless) out[rid].lawless = true;
    // A sea power (M30 E) makes no war for land of its own: see seas.js.
    if (R(world).realms[rid]?.seaPower) out[rid].seaPower = true;
  }
  return out;
}

function prosperityMult(s) {
  return 0.6 + 0.008 * s.prosperity;
}

function effectsOf(world, s) {
  const fx = { foodYield: 0, trade: 0, prosperity: 0, unrest: 0, taxBonus: 0, craft: 0, customs: 0, goodsYield: 0, gold: 0, garrisonBonus: 0, upkeep: 0 };
  // A works yields as it stands (M20), and costs a share of its upkeep even in ruins.
  for (const b of s.buildings) {
    const f = worksFactor(s, b);
    for (const [k, v] of Object.entries(world.buildings[b].effects)) if (k in fx && typeof v === 'number') fx[k] += v * f;
    fx.upkeep += (world.buildings[b].upkeep ?? 0) * upkeepFactor(world, s, b, false);
  }
  return fx;
}

const SIZE = { village: 0.5, town: 1, city: 1.5, castle: 0.6, temple: 0.4 };

// What a foreign town yields its realm in a month, and what its buildings
// add (M18): taxes, the ground's goods, crafts, customs and gold, less the
// buildings' upkeep. The garrison's pay is reckoned apart.
export function townIncome(world, id, s, fx = effectsOf(world, s)) {
  const e = R(world).economy;
  const pm = prosperityMult(s);
  const tax = s.population * e.taxPerPersonMonth * pm * (1 + fx.trade + fx.taxBonus);
  const ground = tax * (e.terrainIncome?.[world.terrainOf[id]] ?? 0) * (1 + fx.goodsYield * 2);
  const craft = fx.craft * pm * (SIZE[world.byId[id].type] ?? 1) * (world.strategy?.build.craftScale ?? 1);
  const customs = world.waterOf?.[id] ? fx.customs : 0;
  return tax + ground + craft + customs - fx.upkeep;
}

// Whether word of a realm reaches Vizima: an embassy, a spy in place, a
// close friend, or merchants on an open road.
export function informed(state, world, rid) {
  const n = state.neighbours[rid];
  const v = R(world).vision;
  if (state.embassies?.[rid]) return true;
  if (hasSpy(state, world, rid)) return true;
  if (sharesSight(state, rid)) return true;
  if (n && n.stance === 'friendly' && n.relation >= v.friendlyAt) return true;
  return n ? n.relation > world.neighbours.closedBelow && world.neighbours.realms[rid].trade > 0 : false;
}

export function monthlyRealms(state, world, rng) {
  const e = R(world).economy;
  const st = world.strategy;
  const levied = leviedMap(state);
  // Towns taken from one realm pay their new masters; Temeria's conquests
  // are reckoned in the crown's own ledger.
  const purse = {};
  const gross = {};
  for (const [rid, realm] of Object.entries(state.realms)) {
    const inDebt = st && realm.treasury < 0;
    for (const [id, s] of Object.entries(realm.settlements)) {
      const owner = ownerOf(state, world, id);
      const fx = effectsOf(world, s);
      if (state.realms[owner]) {
        // Taxes, the ground, crafts, customs and any gold seam (doubled by a
        // gold mine), less the garrison's pay.
        // A conquered town pays as it has come to accept its masters (M19).
        const income = townIncome(world, id, s, fx) * integrationFactor(world, s, 'taxAt') + goldMonth(world, s) * (1 + fx.gold);
        gross[owner] = (gross[owner] ?? 0) + income;
        purse[owner] = (purse[owner] ?? 0) + income - s.garrison * e.garrisonPayMonth;
      }
      const food = s.buildings.filter((b) => world.buildings[b].effects.foodYield).reduce((a, b) => a + worksFactor(s, b), 0);
      const growth = e.growthPerMonth * prosperityMult(s) * (1 + food * e.foodBuildingGrowth);
      s.population = Math.max(0, Math.round(s.population * (1 + growth)));
      const base = { ...R(world).startByType[world.byId[id].type], ...(R(world).overrides[id] ?? {}) };
      const aim = clamp(base.prosperity + fx.prosperity * 1.5 + fx.trade * 10, 0, 100);
      s.prosperity = clamp(s.prosperity + (aim - s.prosperity) * e.prosperityDrift + (rng.next() - 0.5) * 1.2 - (inDebt ? st.debt.prosperity : 0), 0, 100);
      const walls = s.buildings.includes('walls') ? e.wallsGarrison * worksFactor(s, 'walls') : 0;
      // An occupier keeps a lighter hold; no fresh men reach a town under siege;
      // a realm in debt cannot pay them all.
      const target = Math.max(0, base.garrison * (1 + walls + fx.garrisonBonus) * (owner === rid ? 1 : 0.5) * (inDebt ? st.debt.garrison : 1) * integrationFactor(world, s, 'levyAt') - (levied[id] ?? 0));
      if (!besieged(state, id)) {
        // At least one man a month either way, so a small garrison is never
        // stuck short by rounding (Kerack's villages, M18).
        const step = (target - s.garrison) * e.garrisonDrift;
        const move = Math.abs(step) < 1 && Math.abs(target - s.garrison) >= 1 ? Math.sign(step) : Math.round(step);
        s.garrison = Math.max(0, s.garrison + move);
      }
      if (s.construction) {
        s.construction.daysLeft -= 30;
        if (s.construction.daysLeft <= 0) {
          s.buildings.push(s.construction.building);
          s.construction = null;
        }
      }
    }
  }
  for (const s of Object.values(state.settlements)) {
    if (state.realms[s.occupier]) {
      const v = Object.values(s.population).reduce((a, b) => a + b, 0) * e.taxPerPersonMonth * prosperityMult(s);
      purse[s.occupier] = (purse[s.occupier] ?? 0) + v;
      gross[s.occupier] = (gross[s.occupier] ?? 0) + v;
    }
  }
  for (const t of state.tributes ?? []) {
    if (t.until <= state.day) continue;
    // A realm in debt can pay no tribute: it lapses.
    if (st && state.realms[t.from] && state.realms[t.from].treasury < 0) {
      t.until = state.day;
      if (t.to === 'temeria' || informed(state, world, t.from)) say(state, `${world.geography.neighbours[t.from]?.name ?? t.from} is in debt and can pay its tribute no longer.`);
      continue;
    }
    if (state.realms[t.from]) purse[t.from] = (purse[t.from] ?? 0) - t.monthly;
    if (state.realms[t.to]) {
      purse[t.to] = (purse[t.to] ?? 0) + t.monthly;
      gross[t.to] = (gross[t.to] ?? 0) + t.monthly;
    }
  }
  for (const [rid, realm] of Object.entries(state.realms)) {
    realm.income = Math.round(gross[rid] ?? 0);
    let net = purse[rid] ?? 0;
    if (st) {
      // The standing army's pay, in the field or at home.
      const field = (state.armies ?? []).filter((a) => a.side === rid).reduce((x, a) => x + a.soldiers, 0);
      net -= ((realm.army ?? 0) + field) * armyUpkeep(world, realm);
      // Courtiers and hangers-on: a hoard beyond a year's income is spent.
      const free = st.court.freeMonths * Math.max(0, realm.income);
      if (realm.treasury > free) net -= (realm.treasury - free) * st.court.share;
    }
    realm.treasury = Math.max(e.debtFloor, realm.treasury + net);
    if (st) {
      if (realm.treasury < 0) {
        // Unpaid soldiers desert, at home and in the field.
        realm.debtMonths = (realm.debtMonths ?? 0) + 1;
        realm.army = Math.floor((realm.army ?? 0) * (1 - st.army.desertion));
        for (const a of state.armies ?? []) if (a.side === rid) a.soldiers *= 1 - st.army.desertion / 2;
      } else realm.debtMonths = 0;
    }
  }
  // Since M30 F rulers take stock each on a day of their own (dailyStrategy).
  // The lawless frontier (M30 B): the strong take its towns; outlaws rise.
  monthlyFrontier(state, world, rng);
  // The Nilfgaard clock (M30 D): watching, pressure, war.
  monthlyClock(state, world, rng);
  // Skellige's longships in season (M30 E).
  monthlySeas(state, world, rng);
  // Spy networks grow and fade; foreign ones reach for our spymaster (M31).
  monthlySpies(state, world, rng);
  for (const [rid, realm] of Object.entries(state.realms)) {
    if (realm.fallen) continue;
    // Since M20 no one builds: rulers mend what their land gave them (works.js).
    if (!world.spaces) {
      if (st) aiBuildM18(state, world, rid, realm);
      else aiBuild(state, world, rng, rid, realm);
    }
    incident(state, world, rng, rid, realm);
    prospect(state, world, rng, rid, realm);
  }
}

// A working seam pays its realm each month until it is worked out.
function goldMonth(world, s) {
  if (!s.gold || s.gold.months <= 0) return 0;
  s.gold.months -= 1;
  return R(world).gold.monthly;
}

// The neighbours' hills hide gold as Temeria's do; now and then a town in
// hill or mountain country strikes its seam.
function prospect(state, world, rng, rid, realm) {
  const g = R(world).gold;
  if (!g) return;
  for (const [id, s] of Object.entries(realm.settlements)) {
    if (s.gold || !g.ground.includes(world.terrainOf[id]) || ownerOf(state, world, id) !== rid) continue;
    if (!rng.chance(g.chance)) continue;
    s.gold = { found: state.day, months: g.months };
    if (informed(state, world, rid)) say(state, `Word from ${world.geography.neighbours[rid].name}: gold has been struck in the hills by ${world.byId[id].name}. Their treasury will be the fuller for it.`);
  }
}

// Each realm raises one building at a time, in the order its rulers prefer,
// wherever it fits best (the largest place that can take it).
function aiBuild(state, world, rng, rid, realm) {
  if (Object.values(realm.settlements).some((s) => s.construction)) return;
  const prefs = R(world).realms[rid]?.builds ?? [];
  for (const b of prefs) {
    const def = world.buildings[b];
    const cost = def.cost.coin ?? 0;
    if (realm.treasury < cost * R(world).economy.buildMargin) return;
    const fits = Object.entries(realm.settlements)
      .filter(([id, s]) => ownerOf(state, world, id) === rid && def.types.includes(world.byId[id].type) && !s.buildings.includes(b) && !def.needs && !def.needsBorder)
      .sort((a, c) => c[1].population - a[1].population);
    if (!fits.length) continue;
    const [, s] = fits[0];
    realm.treasury -= cost;
    s.construction = { building: b, daysLeft: def.days, days: def.days };
    return;
  }
}

// ---- Building like a real realm (M18) ----

const WORK = { forest: 'timber', hills: 'stone', mountains: 'iron' };
export function workOf(world, id) {
  return WORK[world.terrainOf[id]] ?? 'food';
}

// Whether a foreign town could raise a building, by the same limits of
// place and land as Temeria's: kind of place, room, prerequisites, what the
// land gives, borders, water, roads, dwarves and gold.
export function canRaiseAbroad(state, world, rid, id, b) {
  const def = world.buildings[b];
  const s = state.realms[rid]?.settlements[id];
  if (!def || !s || ownerOf(state, world, id) !== rid) return false;
  const type = world.byId[id].type;
  if (!def.types.includes(type) || s.buildings.includes(b) || def.sites) return false;
  if (def.requires && !s.buildings.includes(def.requires)) return false;
  if (s.buildings.length >= (world.buildingSlots?.[type] ?? 99)) return false;
  const work = workOf(world, id);
  if (def.needs && work !== def.needs) return false;
  if (def.produces && !def.produces.includes(work) && !def.orProduces?.includes(work)) return false;
  if (def.needsWater && !world.waterOf?.[id]) return false;
  if (def.needsRoad && (world.fullAdjacency[id] ?? []).length < def.needsRoad) return false;
  if (def.needsDwarves && rid !== 'mahakam') return false;
  if (def.needsDeposit && !(s.gold?.months > 0)) return false;
  if (def.terrain && !def.terrain.includes(world.terrainOf[id])) return false;
  if (def.wild && !def.wild.some((k) => world.wildOf[id]?.[k]) && !def.orProduces?.includes(work)) return false;
  if (def.needsBorder && !(world.fullAdjacency[id] ?? []).some((e) => ownerOf(state, world, e.to) !== rid)) return false;
  return true;
}

// What a building is worth to a foreign realm: its monthly return on the
// coin it costs, and its worth in war, weighted by the ruler's posture,
// agenda and old preferences.
export function buildScore(state, world, rid, id, b) {
  const c = world.strategy.build;
  const def = world.buildings[b];
  const realm = state.realms[rid];
  const s = realm.settlements[id];
  const kind = realm.posture?.kind ?? 'grow';
  const pw = c.postureWeight[kind];
  const before = townIncome(world, id, s);
  const after = townIncome(world, id, { ...s, buildings: [...s.buildings, b] });
  let gain = after - before;
  const fx = def.effects;
  gain += (fx.prosperity ?? 0) * c.prosperityValue * s.population * 0.012 + (fx.foodYield ?? 0) * c.foodValue + -(fx.unrest ?? 0) * c.unrestValue;
  if (fx.gold && s.gold?.months > 0) gain += R(world).gold.monthly;
  const cost = Math.max(1, def.cost.coin ?? 0);
  const earn = Math.max(0, gain) / cost * 1000;
  const military = c.military[b] ?? 0;
  let score = earn * pw.earn + military * pw.military;
  if (agendaOfRealm(world, rid) === 'trade') score *= c.tradeAgenda[b] ?? 1;
  if ((R(world).realms[rid]?.builds ?? []).includes(b)) score *= c.preference;
  return score;
}

function agendaOfRealm(world, rid) {
  return world.diplomacy?.rulers[rid]?.agenda?.kind ?? null;
}

function aiBuildM18(state, world, rid, realm) {
  const c = world.strategy.build;
  const people = Object.values(realm.settlements).reduce((a, s) => a + s.population, 0);
  const slots = people >= c.bigRealm ? 2 : 1;
  const building = Object.values(realm.settlements).filter((s) => s.construction).length;
  if (building >= slots) return;
  let best = null;
  for (const id of Object.keys(realm.settlements)) {
    if (realm.settlements[id].construction) continue;
    for (const b of Object.keys(world.buildings)) {
      if (!canRaiseAbroad(state, world, rid, id, b)) continue;
      const score = buildScore(state, world, rid, id, b);
      if (score > 2 && (!best || score > best.score)) best = { id, b, score };
    }
  }
  if (!best) return;
  const def = world.buildings[best.b];
  const cost = def.cost.coin ?? 0;
  if (realm.treasury < cost * R(world).economy.buildMargin) return;
  realm.treasury -= cost;
  realm.settlements[best.id].construction = { building: best.b, daysLeft: def.days, days: def.days };
}

function incident(state, world, rng, rid, realm) {
  const inc = R(world).incidents;
  if (!rng.chance(inc.chance)) return;
  const kinds = Object.entries(inc.kinds);
  let roll = rng.next() * kinds.reduce((a, [, k]) => a + k.weight, 0);
  const [, kind] = kinds.find(([, k]) => (roll -= k.weight) < 0) ?? kinds[0];
  const places = Object.keys(realm.settlements).filter((id) => ownerOf(state, world, id) === rid && kind.types.includes(world.byId[id].type));
  if (!places.length) return;
  const id = rng.pick(places);
  const s = realm.settlements[id];
  s.prosperity = clamp(s.prosperity + kind.prosperity, 0, 100);
  s.population = Math.max(0, Math.round(s.population * (1 - kind.people)));
  if (informed(state, world, rid)) {
    say(state, kind.text.replace('{place}', world.byId[id].name).replace('{realm}', world.geography.neighbours[rid].name));
  }
}

// A realm's average prosperity, which lifts or depresses its trade with Temeria.
export function realmProsperity(state, rid) {
  const list = Object.values(state.realms?.[rid]?.settlements ?? {});
  if (!list.length) return 50;
  return list.reduce((a, s) => a + s.prosperity, 0) / list.length;
}

// ---- Embassies and spies ----

export function canOpenEmbassy(state, world, rid) {
  const c = R(world).intelligence;
  if (!state.neighbours[rid]) return { ok: false, reason: 'Unknown realm.' };
  if (c.noEmbassy.includes(rid)) return { ok: false, reason: 'They receive no envoys.' };
  if (state.embassies[rid]) return { ok: false, reason: 'We already keep an embassy there.' };
  if (state.neighbours[rid].relation < c.embassy.minRelation) return { ok: false, reason: 'They would not receive our ambassador.' };
  if (state.treasury - c.embassy.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true };
}

export function openEmbassy(state, world, rid) {
  state.treasury -= R(world).intelligence.embassy.coin;
  state.embassies[rid] = true;
  say(state, `A Temerian embassy opens in ${world.byId[R(world).realms[rid].capital].name}. Our ambassador will see what the court there would rather we did not.`);
}

export function closeEmbassy(state, world, rid) {
  delete state.embassies[rid];
  say(state, `The Temerian embassy in ${world.geography.neighbours[rid].name} is closed.`);
}

export function canSendSpy(state, world, rid) {
  const c = R(world).intelligence.spy;
  if (!state.neighbours[rid]) return { ok: false, reason: 'Unknown realm.' };
  if ((state.spies[rid] ?? 0) > state.day) return { ok: false, reason: `Our agent is already there (${state.spies[rid] - state.day} days left).` };
  if (state.treasury - c.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true };
}

export function sendSpy(state, world, rng, rid) {
  const c = R(world).intelligence.spy;
  state.treasury -= c.coin;
  const name = world.geography.neighbours[rid].name;
  if (rng.chance(c.discovery)) {
    state.neighbours[rid].relation = clamp(state.neighbours[rid].relation + c.relation, -100, 100);
    say(state, `Our agent in ${name} was taken before he could send a single letter. ${name} is not amused.`);
    return;
  }
  state.spies[rid] = state.day + c.days;
  // An agent in place also deepens the crown's network there (M31).
  boostNet(state, world, rid);
  // His road there, on the map (M23 C).
  sendFigure(state, world, { kind: 'spy', from: world.kingdom.capital, to: courtOf(world, rid), about: `a season's watch on ${name}` });
  say(state, `An agent is in place in ${name}. For a season we shall know what happens there.`);
}
