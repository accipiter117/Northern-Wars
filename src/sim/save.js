import { defaultIndustry } from './industry.js';
import { defaultForces } from './forces.js';
import { defaultThreats, threatCap } from './threats.js';
import { defaultMeters, realmUnrest } from './meters.js';
import { retinueCompanies, mercenaryCompanies, realmCompanies, normalise, districtLevy } from './companies.js';
import { districtOf } from './labour.js';
import { STATE_VERSION, newSettlement, defaultWar } from './state.js';
import { defaultLaws, defaultOpinion } from './laws.js';
import { defaultNeighbours, resolveEnvoy } from './neighbours.js';
import { defaultDiplomacy, makeTreaty } from './diplomacy.js';
import { upgradeStrategy } from './strategy.js';
import { hostile, atWar } from './conflict.js';
import { tensionTarget } from './culture.js';
import { defaultHouses, applyHoldings, newReign } from './houses.js';
import { defaultRealms } from './realms.js';
import { seasonOf } from './calendar.js';
import { defaultGold } from './gold.js';
import { syncWorld, settleOwnership } from './lands.js';
import { upgradeConquest } from './conquest.js';
import { upgradeWorks } from './works.js';
import { upgradeLabour } from './labour.js';
import { upgradeMarket } from './market.js';
import { upgradeLaws } from './book.js';

export const SAVE_FORMAT = 'northern-wars-save';

export function serialize(state) {
  return JSON.stringify({ format: SAVE_FORMAT, version: STATE_VERSION, state });
}

// Older save versions are upgraded here, one step at a time, as the schema grows.
const MIGRATIONS = {
  // v1 had one realm granary; v2 keeps stockpiles in every settlement, so the
  // old granary is shared out by population.
  1(state, world) {
    const people = (s) => Object.values(s.population).reduce((a, b) => a + b, 0);
    const total = Object.values(state.settlements).reduce((a, s) => a + people(s), 0);
    for (const [id, s] of Object.entries(state.settlements)) {
      const fresh = newSettlement(world, world.settlementData[id], seasonOf(state.day));
      fresh.stock.food = ((state.granary ?? 0) * people(s)) / total + fresh.stock.food * 0.5;
      state.settlements[id] = { ...fresh, ...s, stock: fresh.stock, hunger: 0, buildings: [], construction: null };
    }
    delete state.granary;
    state.unpaid = false;
    state.ledger = { construction: 0, history: [] };
    state.flows = { out: {}, in: {} };
    state.version = 2;
    return state;
  },
  // v3 adds laws (all at their customary settings) and group opinion.
  2(state, world) {
    state.laws = defaultLaws(world);
    state.opinion = defaultOpinion(world);
    state.ledger.decrees = 0;
    state.version = 3;
    return state;
  },
  // v4 adds the neighbouring realms and their envoys.
  3(state, world) {
    state.neighbours = defaultNeighbours(world);
    state.envoys = [];
    state.nextEnvoyId = 1;
    state.version = 4;
    return state;
  },
  // v5 adds tension between peoples, Scoia'tael sympathy and petitions.
  4(state, world) {
    for (const [id, s] of Object.entries(state.settlements)) {
      s.troubled = 0;
      s.tension = 0;
      s.tension = tensionTarget(state, world, id);
    }
    state.sympathy = 20;
    state.petitions = [];
    state.nextPetitionId = 1;
    state.version = 5;
    return state;
  },
  // v6 adds the great houses, their lands and demands, and the reign record.
  5(state, world) {
    state.houses = defaultHouses(world);
    applyHoldings(state, world);
    state.demands = [];
    state.nextDemandId = 1;
    state.crisisMonths = 0;
    state.depositions = [];
    state.reign = newReign(state, state.day);
    state.version = 6;
    return state;
  },
  // v7 adds garrison levels, patrols, threats, plague and events.
  6(state) {
    state.garrisonLevel = {};
    state.patrols = [];
    state.nextPatrolId = 1;
    state.events = [];
    state.nextEventId = 1;
    for (const s of Object.values(state.settlements)) {
      Object.assign(s, { plague: 0, quarantine: 0, priestesses: false, cleared: {}, raided: 0, raidKind: null });
    }
    state.version = 7;
    return state;
  },
  // v8 brings the neighbouring realms to life, with embassies, spies and
  // the fog of war (kept with the cosmetic traffic, so it starts afresh).
  7(state, world) {
    state.realms = defaultRealms(world);
    state.embassies = {};
    state.spies = {};
    state.version = 8;
    return state;
  },
  // v9 adds war: armies, wars, truces and tribute, and towns that change hands.
  8(state) {
    Object.assign(state, defaultWar());
    state.version = 9;
    return state;
  },
  // v10 adds crown trade routes and gold. Existing buildings stay where
  // they are, even past the new limits on how many a place can hold.
  9(state, world) {
    state.routes = [];
    state.nextRouteId = 1;
    state.gold = defaultGold(world);
    state.version = 10;
    return state;
  },
  // v11 splits the ledger into a line per craft and per good, and keeps
  // what each place earned and cost last month. Old months' craft dues,
  // a single sum, are kept under one line.
  10(state) {
    for (const m of state.ledger.history) {
      if (typeof m.income.crafts === 'number') m.income.crafts = m.income.crafts ? { crafts: m.income.crafts } : {};
      m.income.goods ??= {};
    }
    state.ledger.places = {};
    state.industry = defaultIndustry();
    state.version = 11;
    return state;
  },
  // v12 makes every force and threat a thing on the map. Patrols become
  // companies of light horse riding the same roads; armies in the field
  // carry no standing companies yet; garrisons stay as they were.
  11(state, world) {
    state.forces = defaultForces(world);
    state.threats = defaultThreats();
    const t = world.forces.companies.lightcav;
    for (const p of state.patrols ?? []) {
      const home = state.settlements[p.from] && state.settlements[p.from].holder === 'crown' && !state.settlements[p.from].occupier ? p.from : world.kingdom.capital;
      const at = world.byId[home];
      state.forces.companies.push({
        id: state.forces.nextId++, type: 'lightcav', name: `${at.name} Light cavalry${state.forces.companies.some((c) => c.home === home) ? ` (${state.forces.companies.filter((c) => c.home === home).length + 1})` : ''}`,
        home, station: home, men: t.men, max: t.men, wounded: 0, morale: 70, xp: 0.1,
        order: { kind: 'patrol', from: p.from, to: p.to }, task: null, x: at.x, y: at.y, node: home, way: [], army: null, wins: 0, fought: -1, routed: 0,
      });
    }
    delete state.patrols;
    delete state.nextPatrolId;
    for (const a of state.armies ?? []) {
      a.units ??= [];
      a.quality ??= 1;
    }
    state.version = 12;
    return state;
  },
  // v13 redraws the North from the atlas: new foreign towns, some old ones
  // gone. The same places keep what they had; every vanished town hands its
  // holder, works, sieges, routes and armies to the town that stands for it
  // now (data/north-ids.json).
  12(state, world) {
    upgradeNorth(state, world);
    state.version = 13;
    return state;
  },
  // v14 brings audiences with rulers: trust, treaties, deals and requests.
  // Old friendships become pacts: a friendly stance with a true ally
  // (relation 75 or more) becomes a defensive pact for five years, as the
  // old rule called such friends to each other's wars. Envoys still waiting
  // take their default answer, as if their time had run out.
  13(state, world) {
    state.diplomacy = defaultDiplomacy();
    if (world.diplomacy) {
      for (const [rid, n] of Object.entries(state.neighbours ?? {})) {
        if (!world.diplomacy.rulers[rid]) continue;
        state.diplomacy.trust[rid] = { temeria: Math.max(20, Math.min(80, world.diplomacy.trust.start + n.relation / 5)) };
        if (n.stance === 'friendly' && n.relation >= (world.realms?.vision.allyAt ?? 75) && !hostile(state, 'temeria', rid)) {
          makeTreaty(state, world, 'defensive', 'temeria', rid, { years: 5 });
        }
      }
    }
    for (const e of [...(state.envoys ?? [])]) {
      const choices = world.envoys.envoys[e.envoy]?.choices ?? [];
      resolveEnvoy(state, world, e.id, Math.max(0, choices.findIndex((c) => c.default)), true);
    }
    state.envoys = [];
    state.version = 14;
    return state;
  },
  // v15 brings rulers who govern: each realm takes stock and chooses a
  // posture, raises a standing army from part of its hoard, and holds no war
  // aim yet. Wars under way keep going, each aiming at the best town its
  // attacker has taken.
  14(state, world) {
    if (world.strategy) upgradeStrategy(state, world);
    state.version = 15;
    return state;
  },
  // v16 (M19): towns change realm for good. Any foreign town the crown (or a
  // neighbour) still holds after its war has ended is annexed under the new
  // rules, so a reign keeps what it won; a realm left with nothing falls.
  15(state, world) {
    state.lands ??= {};
    state.claimants ??= [];
    upgradeConquest(state);
    syncWorld(world, state);
    if (world.conquest) settleOwnership(state, world, { quiet: true });
    state.version = 16;
    return state;
  },
  // v17 (M20): the crown no longer builds. Every place gets the spaces its
  // land gives it and the works that stand in them; what it had built fills
  // the space of its kind, and ruins stand to be mended (works.js).
  16(state, world) {
    upgradeWorks(state, world);
    state.version = 17;
    return state;
  },
  // v18 (M20 C): the kingdom's hands. The crown starts from the default
  // split, the winter turn not yet called, and a month and a half of fuel.
  17(state, world) {
    upgradeLabour(state, world);
    state.version = 18;
    return state;
  },
  // v19 (M20 E): orders on the board, none yet set.
  18(state) {
    state.orders = { list: [], last: [], theirs: [], envoys: [] };
    state.version = 19;
    return state;
  },
  // v20 (M21 A and B): taxes by estate in place of the old tax laws (all
  // Fair), the market of five goods with routes abroad folded into deals,
  // and no loans yet.
  19(state, world) {
    delete state.laws.taxation;
    delete state.laws.noble_privilege;
    for (const id of ['tax_towns', 'tax_peasants', 'tax_nobles']) {
      if (world.laws.laws[id]) state.laws[id] = { option: 'fair', previous: 'fair', since: 0 };
    }
    upgradeMarket(state, world);
    state.loans = [];
    state.version = 20;
    return state;
  },
  // v21 (M21 C and D): no town focus yet; the crown's armies already in the
  // field become levies of the people (their men go back to the garrisons
  // they were drawn from, and the army keeps its strength as levy).
  20(state, world) {
    if (state.labour) state.labour.focus ??= {};
    for (const a of state.armies ?? []) {
      if (a.side !== 'temeria' || a.folk) continue;
      const f = Math.min(1, a.soldiers / Math.max(1, a.raised));
      for (const [id, n] of Object.entries(a.levy ?? {})) if (state.settlements[id]) state.settlements[id].garrison += Math.round(n * f);
      const hired = Math.min(a.soldiers, (a.companies ?? 0) * (world.war.raise.company ?? 0));
      const units = (a.units ?? []).reduce((v, u) => v + u.men, 0);
      a.folk = true;
      a.levyMen = Math.max(0, Math.round(a.raised - hired - units));
      a.retinueMen = 0;
      a.mercs = [];
    }
    state.version = 21;
    return state;
  },
  // v22 (M21 E and F): threats already on the map are cut to the new caps,
  // so an old save does not keep a camp larger than any could now grow.
  21(state, world) {
    for (const t of state.threats?.list ?? []) {
      if (t.kind === 'monsters') continue;
      const war = t.kind === 'raiders' && atWar(state, t.realm);
      const cap = threatCap(state, world, t.kind, war);
      t.men = Math.min(t.men ?? 0, cap);
      if (t.band?.men) t.band.men = Math.min(t.band.men, cap);
    }
    state.version = 22;
    return state;
  },
  // v23 (M22 C): every army becomes a list of companies. The crown's levies
  // become levy companies of the places they came from, the lords' men
  // retinue companies, hired men their companies, standing companies keep
  // their identity; foreign armies their standing men and levies. Nothing
  // is lost: the companies add up to the army's men as it stands.
  22(state, world) {
    const mc = world.war?.raise?.mercenaries?.companies ?? {};
    for (const a of state.armies ?? []) {
      if (a.bands?.length) continue;
      const bands = [];
      if (a.side === 'temeria') {
        const levy = Object.entries(a.levy ?? {}).filter(([, n]) => n > 0);
        const levied = levy.reduce((v, [, n]) => v + n, 0);
        const levyMen = a.folk ? (a.levyMen ?? levied) : levied;
        bands.push(...districtLevy(world, Object.fromEntries(levy.filter(([id]) => world.byId[id]).map(([id, n]) => [id, levied ? (n * levyMen) / levied : n])), districtOf(world)));
        if (a.retinueMen) bands.push(...retinueCompanies(world, 'crown', a.retinueMen).map((b) => ({ ...b, name: 'The lords\' men' })));
        for (const m of a.mercs ?? []) if (mc[m.id]) bands.push(...mercenaryCompanies(world, m.id));
        for (const u of a.units ?? []) {
          const c = state.forces?.companies.find((x) => x.id === u.id);
          if (c) bands.push({ type: c.type, men: u.men, xp: c.xp ?? 0, source: 'standing', company: c.id, name: c.name });
        }
        const rest = a.raised - bands.reduce((v, b) => v + b.men, 0);
        if (rest > 1) bands.push(...realmCompanies(world, 'temeria', rest, 0).map((b) => ({ ...b, source: 'hired', name: 'Free company' })));
      } else {
        bands.push(...realmCompanies(world, a.side, a.standing ?? 0, Math.max(0, a.raised - (a.standing ?? 0))));
      }
      a.bands = bands.length ? bands : realmCompanies(world, a.side, 0, a.soldiers);
      delete a.quality;
      normalise(a);
    }
    state.version = 23;
    return state;
  },
  // v24 (M22 D): Trust, Unrest and Dread in place of Authority and
  // Stability. Trust from the old Authority and the realm's mood; Unrest
  // from the towns (as Stability was, inverted); Dread from the threats in
  // sight and any plague.
  23(state, world) {
    const mood = Object.values(state.opinion ?? {});
    const avg = mood.length ? mood.reduce((a, v) => a + v, 0) / mood.length : 50;
    state.trust = Math.max(0, Math.min(100, Math.round(((state.authority ?? 50) + avg) / 2)));
    const d = world.meters?.dread;
    const seen = (state.threats?.list ?? []).filter((t) => !t.abroad && (t.sighted || t.campSeen)).length;
    const plague = Object.values(state.settlements).filter((x) => (x.plague ?? 0) > state.day).length;
    state.dread = Math.max(0, Math.min(100, (d?.start ?? 15) + seen * (d?.camp ?? 2.5) + plague * (d?.plague ?? 8)));
    state.meters = defaultMeters();
    state.meters.last = { cleared: state.threats?.tally?.cleared ?? 0, raids: state.threats?.tally?.raids ?? 0 };
    state.unrest = realmUnrest(state, world);
    delete state.authority;
    delete state.stability;
    state.version = 24;
    return state;
  },
  // v25 (M23 C): figures on the road, none yet on the way.
  24(state) {
    state.figures ??= [];
    state.nextFigureId ??= 1;
    state.version = 25;
    return state;
  },
  // v26 (M24 B): Love and Fear in place of Trust and Dread. Love from the
  // old Trust; Fear from the old Dread inverted (a crown that kept its
  // people unafraid of the wilds was not feared itself) and the harsh laws
  // in force; Unrest as it was.
  25(state, world) {
    state.love = Math.max(0, Math.min(100, Math.round(state.trust ?? 50)));
    const harsh = [['public_order', ['martial', 'curfew']], ['nonhumans', ['restricted', 'expulsion']], ['mages', ['banished']], ['old_ways', ['suppressed']]]
      .filter(([l, opts]) => opts.includes(state.laws?.[l]?.option)).length;
    state.fear = Math.max(0, Math.min(100, Math.round((100 - (state.dread ?? 15)) * 0.25 + harsh * 8)));
    const old = state.meters ?? {};
    state.meters = { ...defaultMeters(), last: old.last ?? { cleared: 0, raids: 0 }, trade: old.trade ?? 1 };
    state.unrest = realmUnrest(state, world);
    delete state.trust;
    delete state.dread;
    state.version = 26;
    return state;
  },
  // v27 (M26 A): the Book of Laws. The old laws map to the nearest laws of
  // the Book; taxes, the court and bounties stay as settings.
  26(state, world) {
    upgradeLaws(state, world);
    state.version = 27;
    return state;
  },
};

// Swap every reference to a vanished foreign town for its replacement: as a
// value anywhere in the state, and as a key (what the crown last saw of it).
function remapIds(value, map) {
  if (typeof value === 'string') return map[value] ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, map));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = map[k] ?? k;
      // Two old towns may stand for one new one: the first kept wins.
      if (key in out && key !== k) continue;
      out[key] = remapIds(v, map);
    }
    return out;
  }
  return value;
}

export function upgradeNorth(state, world) {
  const map = world.northIds?.renamed ?? {};
  // Each realm's towns are laid out afresh, then what each old town had is
  // carried to its own place, or to the place that now stands for it.
  const old = {};
  for (const realm of Object.values(state.realms ?? {})) Object.assign(old, realm.settlements);
  const fresh = defaultRealms(world);
  for (const [rid, realm] of Object.entries(fresh)) {
    realm.treasury = state.realms?.[rid]?.treasury ?? realm.treasury;
  }
  const placeOf = (id) => fresh[world.realmOf[id]]?.settlements[id];
  for (const [id, s] of Object.entries(old)) {
    const target = placeOf(id);
    if (target) Object.assign(target, s);
  }
  for (const [id, s] of Object.entries(old)) {
    const nid = map[id];
    if (!nid || placeOf(id)) continue;
    const target = placeOf(nid);
    if (!target) continue;
    if (s.owner && !target.owner) target.owner = s.owner;
    for (const b of s.buildings ?? []) if (!target.buildings.includes(b)) target.buildings.push(b);
    if (s.construction && !target.construction) target.construction = s.construction;
  }
  // A town held by its own realm needs no owner mark.
  for (const [rid, realm] of Object.entries(fresh)) for (const s of Object.values(realm.settlements)) if (s.owner === rid) delete s.owner;
  const { realms: _old, ...rest } = state;
  const next = remapIds(rest, map);
  Object.assign(state, next, { realms: fresh });
  // Armies march on from where they stand, along the new roads.
  for (const a of state.armies ?? []) {
    a.to = null;
    a.along = 0;
    a.path = [];
  }
  // The crown's ledger names its routes by their ends.
  for (const h of state.ledger?.history ?? []) {
    if (!h.income?.routes) continue;
    h.income.routes = Object.fromEntries(Object.entries(h.income.routes).map(([k, v]) => [k.split('>').map((x) => map[x] ?? x).join('>'), v]));
  }
  // Travellers on foreign roads are replaced by new ones on the new roads.
  if (state.ambient?.units) {
    state.ambient.units = state.ambient.units.filter((u) => !(u.route ?? []).some((id) => !state.settlements[id]));
  }
  return state;
}

export function deserialize(text, world) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a readable save.');
  }
  if (!data || data.format !== SAVE_FORMAT || !data.state) throw new Error('That file is not a Northern Wars save.');
  let { version, state } = data;
  if (typeof version !== 'number' || version > STATE_VERSION) throw new Error('That save comes from a newer version of the game.');
  if (state.kingdom !== world.kingdom.id) throw new Error(`That save is for another kingdom (${state.kingdom}).`);
  // The map as this reign has redrawn it (M19), before anything is checked.
  syncWorld(world, state);
  for (const s of world.geography.settlements) {
    if (!state.settlements?.[s.id]) throw new Error(`That save is missing ${s.name}.`);
  }
  if (!Number.isFinite(state.day) || !state.rng || !state.ambient) throw new Error('That save is damaged.');
  while (version < STATE_VERSION) {
    state = MIGRATIONS[version](state, world);
    version += 1;
  }
  return state;
}
