// Loads everything the v2 game needs: the real-time game's world (map,
// realms, works, dilemmas) and v2's own data, through one JSON reader, so
// Node tests and the browser share the same path. Paths are from the
// repository root.
import { loadWorld } from '../../../src/sim/index.js';
import { makeTable } from './game.js';

export async function loadTable(readJson) {
  const world = await loadWorld(readJson);
  const [board, game] = await Promise.all([readJson('v2/data/board.json'), readJson('v2/data/game.json')]);
  return makeTable(world, { board, game });
}
