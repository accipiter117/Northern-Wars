import { dayNumber, seasonOf } from './calendar.js';
import { streamSeed } from './rng.js';
import { computeStability, addDispatch } from './realm.js';
import { defaultLaws, defaultOpinion } from './laws.js';
import { defaultNeighbours } from './neighbours.js';
import { tensionTarget } from './culture.js';
import { defaultHouses, applyHoldings, newReign } from './houses.js';
import { defaultRealms } from './realms.js';
import { newIntel, updateIntel, visionOf } from './vision.js';
import { defaultIndustry } from './industry.js';
import { defaultForces } from './forces.js';
import { defaultThreats } from './threats.js';
import { defaultGold } from './gold.js';

// Wars, armies and what they leave behind; empty in a realm at peace.
export function defaultWar() {
  return {
    wars: [], nextWarId: 1, armies: [], nextArmyId: 1, musters: [], battles: [], truces: {}, tributes: [],
    warDecisions: [], nextWarDecisionId: 1, warHistory: [],
  };
}

export const STATE_VERSION = 12;

export function createState(world, seed = 1) {
  const k = world.kingdom;
  const day = dayNumber(k.start);
  const settlements = {};
  for (const s of world.geography.settlements) {
    const d = world.settlementData[s.id];
    if (!d) throw new Error(`No starting data for settlement ${s.id}`);
    settlements[s.id] = newSettlement(world, d, seasonOf(day));
  }
  const state = {
    version: STATE_VERSION,
    kingdom: k.id,
    seed: seed >>> 0,
    day,
    rng: { game: streamSeed(seed, 1), ambient: streamSeed(seed, 2) },
    treasury: k.treasury,
    authority: k.authority,
    stability: 0,
    unpaid: false,
    settlements,
    ledger: { construction: 0, decrees: 0, history: [], places: {} },
    laws: defaultLaws(world),
    opinion: defaultOpinion(world),
    neighbours: defaultNeighbours(world),
    envoys: [],
    nextEnvoyId: 1,
    sympathy: 20,
    petitions: [],
    nextPetitionId: 1,
    houses: defaultHouses(world),
    demands: [],
    nextDemandId: 1,
    crisisMonths: 0,
    depositions: [],
    garrisonLevel: {},
    events: [],
    nextEventId: 1,
    realms: defaultRealms(world),
    embassies: {},
    spies: {},
    ...defaultWar(),
    routes: [],
    nextRouteId: 1,
    gold: defaultGold(world),
    industry: defaultIndustry(),
    forces: defaultForces(world),
    threats: defaultThreats(),
    flows: { out: {}, in: {} },
    ambient: { nextId: 1, units: [] },
    chronicle: [],
  };
  applyHoldings(state, world);
  if (world.grid) {
    state.ambient.intel = newIntel(world);
    updateIntel(state, world, visionOf(state, world));
  }
  state.reign = newReign(state, day);
  for (const id of Object.keys(settlements)) settlements[id].tension = tensionTarget(state, world, id);
  state.stability = computeStability(state);
  if (k.opening) addDispatch(state, k.opening);
  return state;
}

export function newSettlement(world, d, season) {
  const s = {
    population: { ...d.population },
    faith: { ...d.faith },
    prosperity: d.prosperity,
    unrest: d.unrest,
    production: d.production,
    garrison: d.garrison,
    holder: d.holder,
    stock: { food: 0, timber: 0, stone: 0, iron: 0 },
    hunger: 0,
    buildings: [],
    construction: null,
    tension: 0,
    troubled: 0,
    plague: 0,
    quarantine: 0,
    priestesses: false,
    cleared: {},
    raided: 0,
    raidKind: null,
  };
  const f = world.economy.food;
  const need = totalPopulation(s) * f.perPersonDay * (season === 'winter' ? f.winterFactor : 1);
  s.stock.food = Math.max(f.storageMin * 0.5, need * f.startDays);
  if (s.stock[d.production] !== undefined && d.production !== 'food') s.stock[d.production] = world.economy.goods.startStock;
  return s;
}

export function totalPopulation(s) {
  let n = 0;
  for (const v of Object.values(s.population)) n += v;
  return n;
}
