import { STATE_VERSION, newSettlement } from './state.js';
import { defaultLaws, defaultOpinion } from './laws.js';
import { defaultNeighbours } from './neighbours.js';
import { tensionTarget } from './culture.js';
import { defaultHouses, applyHoldings, newReign } from './houses.js';
import { seasonOf } from './calendar.js';

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
};

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
