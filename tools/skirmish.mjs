// Skirmish table (M22 C): each kind and size of threat in data/forces.json
// against typical local forces (a city, a town and a village of ours, each
// its garrison plus its own muster behind its walls), with the chance the
// defenders win by the same formulas the game uses.
// Usage: node tools/skirmish.mjs [seed]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, createState, localStrength, threatStrength, winChance, foeKind, totalPopulation, companyStrength } from '../src/sim/index.js';

// The threats, from ordinary to the ones that need an army. `need` marks the
// large bands, famous monsters and war parties that local forces are not
// expected to beat.
export function threatCases(world) {
  const th = world.forces.threats;
  const out = [
    { label: 'Bandits, a small band', kind: 'bandits', men: 30, size: 'small' },
    { label: 'Bandit camp, ordinary', kind: 'bandits', men: Math.round(th.bandits.capMax * 0.65), size: 'ordinary' },
    { label: 'Bandit camp, at its largest', kind: 'bandits', men: th.bandits.capMax, size: 'large', need: true },
    { label: "Scoia'tael commando, ordinary", kind: 'scoiatael', men: Math.round((th.scoiatael.men[0] + th.scoiatael.men[1]) / 2), size: 'ordinary', ground: 'forest' },
    { label: "Scoia'tael commando, at its largest", kind: 'scoiatael', men: th.scoiatael.capMax, size: 'large', ground: 'forest', need: true },
    { label: 'Raiders over the border', kind: 'raiders', men: Math.round((th.raiders.men[0] + th.raiders.men[1]) / 2), size: 'ordinary' },
    { label: 'A war party, in war', kind: 'raiders', men: th.raiders.warCap, size: 'large', need: true },
  ];
  for (const [terrain, list] of Object.entries(world.forces.species)) {
    for (const sp of list) {
      // Packs and flocks are ordinary; the lone dreadful beasts are famous.
      const famous = sp.count[1] <= 2;
      out.push({ label: `${sp.name} (${famous ? 'famous' : 'a lair'}, ${terrain})`, kind: 'monsters', terrain, species: sp.id, count: famous ? sp.count[1] : Math.round((sp.count[0] + sp.count[1]) / 2), size: famous ? 'famous' : 'ordinary', need: famous });
    }
  }
  return out;
}

// Typical places of ours: the median city, town and village by people.
export function typicalPlaces(state, world) {
  const pick = (type) => {
    const ids = world.geography.settlements.filter((st) => st.type === type && state.settlements[st.id]).map((st) => st.id);
    ids.sort((a, b) => totalPopulation(state.settlements[a]) - totalPopulation(state.settlements[b]));
    return ids[Math.floor(ids.length / 2)];
  };
  return { city: pick('city'), town: pick('town'), village: pick('village') };
}

// The table: for each threat, the defenders' chance at each typical place.
export function skirmishTable(state, world) {
  const places = typicalPlaces(state, world);
  return threatCases(world).map((c) => {
    const t = { kind: c.kind, men: c.men, count: c.count, terrain: c.terrain, species: c.species, morale: 70 };
    const attack = threatStrength(world, t, c.ground ?? 'open');
    const odds = {};
    for (const [type, id] of Object.entries(places)) odds[type] = winChance(world, localStrength(state, world, id, foeKind(t)), attack);
    // One standing company of men-at-arms at full strength, sent out to it.
    const mt = world.forces.companies.menatarms;
    odds.company = winChance(world, companyStrength(world, { type: 'menatarms', men: mt.men, morale: world.forces.morale.start, xp: 0 }, foeKind(t), c.ground ?? 'open'), attack);
    return { ...c, attack, odds, places };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
  const state = createState(world, Number(process.argv[2] ?? 1));
  const rows = skirmishTable(state, world);
  const p = rows[0].places;
  const pct = (v) => `${Math.round(v * 100)}%`.padStart(5);
  console.log(`Defenders: city ${world.byId[p.city].name}, town ${world.byId[p.town].name}, village ${world.byId[p.village].name} (garrison and own muster, walls where they stand)`);
  console.log(`${'Threat'.padEnd(40)} ${'men'.padStart(5)}  city  town  village  company  needs an army`);
  for (const r of rows) console.log(`${r.label.padEnd(40)} ${String(r.men ?? r.count).padStart(5)} ${pct(r.odds.city)} ${pct(r.odds.town)}   ${pct(r.odds.village)}    ${pct(r.odds.company)}  ${r.need ? 'yes' : ''}`);
}
