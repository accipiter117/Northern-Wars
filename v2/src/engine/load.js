// Loads everything the v2 game needs: the real-time game's world (map,
// realms, works, dilemmas) and v2's own data, through one JSON reader, so
// Node tests and the browser share the same path. Paths are from the
// repository root.
import { loadWorld } from '../../../src/sim/index.js';
import { makeTable } from './game.js';

export async function loadTable(readJson) {
  const world = await loadWorld(readJson);
  const names = ['board', 'game', 'uniques', 'goals', 'minors'];
  const files = await Promise.all(names.map((n) => readJson(`v2/data/${n}.json`)));
  return makeTable(world, Object.fromEntries(names.map((n, i) => [n, files[i]])));
}
