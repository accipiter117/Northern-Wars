import { STATE_VERSION } from './state.js';

export const SAVE_FORMAT = 'northern-wars-save';

export function serialize(state) {
  return JSON.stringify({ format: SAVE_FORMAT, version: STATE_VERSION, state });
}

// Older save versions get upgraded here, one step at a time, as the schema grows.
const MIGRATIONS = {};

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
  while (version < STATE_VERSION) {
    state = MIGRATIONS[version](state);
    version += 1;
  }
  if (state.kingdom !== world.kingdom.id) throw new Error(`That save is for another kingdom (${state.kingdom}).`);
  for (const s of world.geography.settlements) {
    if (!state.settlements?.[s.id]) throw new Error(`That save is missing ${s.name}.`);
  }
  if (!Number.isFinite(state.day) || !state.rng || !state.ambient) throw new Error('That save is damaged.');
  return state;
}
