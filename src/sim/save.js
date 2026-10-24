import { STATE_VERSION, newSettlement } from './state.js';
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
