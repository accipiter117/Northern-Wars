import { buildWorld } from './world.js';

// Loads a kingdom's data through a reader (fetch in the browser, fs in Node),
// so the same code builds the world in both places.
export async function loadWorld(readJson, kingdomId = 'temeria') {
  const kingdom = await readJson(`data/kingdoms/${kingdomId}.json`);
  const [geography, settlements, ambient] = await Promise.all([
    readJson(kingdom.geography),
    readJson(kingdom.settlements),
    readJson('data/ambient.json'),
  ]);
  return buildWorld({ kingdom, geography, settlements, ambient });
}
