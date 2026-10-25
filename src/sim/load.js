import { buildWorld } from './world.js';

// Loads a kingdom's data through a reader (fetch in the browser, fs in Node),
// so the same code builds the world in both places.
export async function loadWorld(readJson, kingdomId = 'temeria') {
  const kingdom = await readJson(`data/kingdoms/${kingdomId}.json`);
  const [geography, settlements, ambient, economy, buildings, laws, groups, neighbours, envoys, culture, petitions, houses, demands, military, events, realms, war, trade, gold] = await Promise.all([
    readJson(kingdom.geography),
    readJson(kingdom.settlements),
    readJson('data/ambient.json'),
    readJson('data/economy.json'),
    readJson('data/buildings.json'),
    readJson('data/laws.json'),
    readJson('data/groups.json'),
    readJson(kingdom.neighbours),
    readJson('data/envoys.json'),
    readJson('data/culture.json'),
    readJson('data/petitions.json'),
    readJson(kingdom.houses),
    readJson('data/demands.json'),
    readJson(kingdom.military),
    readJson('data/events.json'),
    readJson(kingdom.realms),
    readJson(kingdom.war ?? 'data/war.json'),
    readJson(kingdom.trade ?? 'data/trade.json'),
    readJson(kingdom.gold ?? 'data/gold.json'),
  ]);
  return buildWorld({ kingdom, geography, settlements, ambient, economy, buildings, laws, groups, neighbours, envoys, culture, petitions, houses, demands, military, events, realms, war, trade, gold });
}
