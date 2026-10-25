// The neighbouring realms as living places, under lighter rules than
// Temeria: their towns grow, their rulers raise buildings and keep
// garrisons, and fires, raids, sickness and fairs come and go. What the
// crown hears of it depends on its embassies, spies and friends.
import { addDispatch, clamp } from './realm.js';
import { ownerOf, leviedMap, besieged } from './conflict.js';

const say = (state, text) => addDispatch(state, text, 'abroad');
const R = (world) => world.realms;

export function defaultRealms(world) {
  const out = {};
  for (const [rid, ids] of Object.entries(world.foreignByRealm)) {
    const settlements = {};
    for (const id of ids) {
      const base = { ...R(world).startByType[world.byId[id].type], ...(R(world).overrides[id] ?? {}) };
      settlements[id] = { population: base.population, prosperity: base.prosperity, garrison: base.garrison, buildings: [], construction: null };
    }
    out[rid] = { treasury: 1000, settlements };
  }
  return out;
}

function prosperityMult(s) {
  return 0.6 + 0.008 * s.prosperity;
}

function effectsOf(world, s) {
  const fx = { foodYield: 0, trade: 0, prosperity: 0, unrest: 0 };
  for (const b of s.buildings) for (const [k, v] of Object.entries(world.buildings[b].effects)) if (k in fx) fx[k] += v;
  return fx;
}

// Whether word of a realm reaches Vizima: an embassy, a spy in place, a
// close friend, or merchants on an open road.
export function informed(state, world, rid) {
  const n = state.neighbours[rid];
  const v = R(world).vision;
  if (state.embassies?.[rid]) return true;
  if ((state.spies?.[rid] ?? 0) > state.day) return true;
  if (n && n.stance === 'friendly' && n.relation >= v.friendlyAt) return true;
  return n ? n.relation > world.neighbours.closedBelow && world.neighbours.realms[rid].trade > 0 : false;
}

export function monthlyRealms(state, world, rng) {
  const e = R(world).economy;
  const levied = leviedMap(state);
  // Towns taken from one realm pay their new masters; Temeria's conquests
  // are reckoned in the crown's own ledger.
  const purse = {};
  for (const [rid, realm] of Object.entries(state.realms)) {
    for (const [id, s] of Object.entries(realm.settlements)) {
      const owner = ownerOf(state, world, id);
      const fx = effectsOf(world, s);
      if (state.realms[owner]) {
        purse[owner] = (purse[owner] ?? 0) + s.population * e.taxPerPersonMonth * prosperityMult(s) * (1 + fx.trade) - s.garrison * e.garrisonPayMonth;
      }
      const food = s.buildings.filter((b) => world.buildings[b].effects.foodYield).length;
      const growth = e.growthPerMonth * prosperityMult(s) * (1 + food * e.foodBuildingGrowth);
      s.population = Math.max(0, Math.round(s.population * (1 + growth)));
      const base = { ...R(world).startByType[world.byId[id].type], ...(R(world).overrides[id] ?? {}) };
      const aim = clamp(base.prosperity + fx.prosperity * 1.5 + fx.trade * 10, 0, 100);
      s.prosperity = clamp(s.prosperity + (aim - s.prosperity) * e.prosperityDrift + (rng.next() - 0.5) * 1.2, 0, 100);
      const walls = s.buildings.includes('walls') ? e.wallsGarrison : 0;
      // An occupier keeps a lighter hold; no fresh men reach a town under siege.
      const target = Math.max(0, base.garrison * (1 + walls) * (owner === rid ? 1 : 0.5) - (levied[id] ?? 0));
      if (!besieged(state, id)) s.garrison = Math.max(0, Math.round(s.garrison + (target - s.garrison) * e.garrisonDrift));
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
    if (state.realms[s.occupier]) purse[s.occupier] = (purse[s.occupier] ?? 0) + Object.values(s.population).reduce((a, b) => a + b, 0) * e.taxPerPersonMonth * prosperityMult(s);
  }
  for (const t of state.tributes ?? []) {
    if (t.until <= state.day) continue;
    if (state.realms[t.from]) purse[t.from] = (purse[t.from] ?? 0) - t.monthly;
    if (state.realms[t.to]) purse[t.to] = (purse[t.to] ?? 0) + t.monthly;
  }
  for (const [rid, realm] of Object.entries(state.realms)) {
    realm.treasury = Math.max(e.debtFloor, realm.treasury + (purse[rid] ?? 0));
    aiBuild(state, world, rng, rid, realm);
    incident(state, world, rng, rid, realm);
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
  if (state.treasury - c.embassy.coin < -world.economy.debt.creditLimit) return { ok: false, reason: 'The bankers will not lend that much.' };
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
  if (state.treasury - c.coin < -world.economy.debt.creditLimit) return { ok: false, reason: 'The bankers will not lend that much.' };
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
  say(state, `An agent is in place in ${name}. For a season we shall know what happens there.`);
}
