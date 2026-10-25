// How long each building takes to pay back its cost in coin, in a typical
// place for it. Runs a reign twice from the same seed, with and without the
// building standing from the first day, and compares the treasuries.
// Usage: node tools/payback.mjs [years] [seed]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, createState, step, ledgerNet } from '../src/sim/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [years = 6, seed = 1] = process.argv.slice(2).map(Number);
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));

// A typical home for each kind of place, and for buildings with needs.
const HOME = { city: 'maribor', town: 'white_bridge', village: 'white_orchard', castle: 'mayena', temple: 'temple_melitele' };
const SPECIAL = {
  harbour: 'gors_velen', bank: 'vizima', goldmine: 'carreras', lumber: 'findetann', quarry: 'zavada', mine: 'carreras', tannery: 'ellander', inn: 'pontaria',
  pasture: 'white_orchard', distillery: 'ellander', charcoal: 'razwan', weaponsmith: 'white_bridge', silvermine: 'razwan', saltpans: 'anchor', fishery: 'murky_waters',
  tollbridge: 'la_valette', shipyard: 'gors_velen', stud: 'cleves', quarter: 'maribor', hostel: 'temple_melitele', alchemist: 'white_bridge', lodge: 'razwan', weavers: 'white_bridge',
};
// Workshops that need another's goods are measured with a supplier standing
// in both reigns, so only the workshop's own worth is counted.
const SUPPLY = { weavers: [['white_orchard', 'pasture']], weaponsmith: [['findetann', 'charcoal']] };
const PRICE = world.economy.goods.prices;

function cost(b) {
  const c = world.buildings[b].cost;
  return (c.coin ?? 0) + (c.timber ?? 0) * PRICE.timber + (c.stone ?? 0) * PRICE.stone + (c.iron ?? 0) * PRICE.iron;
}

function reign(place, b) {
  let s = createState(world, seed);
  for (const k of ['envoys', 'petitions', 'demands', 'events']) s[k] = [];
  if (b) {
    const req = world.buildings[b].requires;
    if (req) s.settlements[place].buildings.push(req);
    s.settlements[place].buildings.push(b);
  }
  return s;
}

const rows = [];
const ONLY = process.env.ONLY?.split(',');
for (const [b, def] of Object.entries(world.buildings)) {
  if (ONLY && !ONLY.includes(b)) continue;
  const place = SPECIAL[b] ?? HOME[def.types.includes('town') ? 'town' : def.types[0]];
  if (!def.types.includes(world.byId[place].type)) continue;
  const req = def.requires;
  // The control has any prerequisite too, so only this building is measured.
  let a = reign(place, null);
  if (req) a.settlements[place].buildings.push(req);
  let c = reign(place, b);
  for (const [at, sup] of SUPPLY[b] ?? []) for (const x of [a, c]) x.settlements[at].buildings.push(sup);
  // Month by month, what came in less what went out, leaving out the court
  // (whose cost grows with a full treasury) and interest.
  let net = 0;
  for (let m = 0; m < years * 12; m++) {
    a = step(a, 30, world, { ambient: false });
    c = step(c, 30, world, { ambient: false });
    const n = (s) => {
      const h = s.ledger.history.at(-1);
      if (!h) return 0;
      return ledgerNet(h).net + h.expenses.court + h.expenses.interest;
    };
    net += n(c) - n(a);
  }
  const gain = net / (years * 12);
  const k = cost(b);
  rows.push({ b, place, cost: Math.round(k), perMonth: Math.round(gain), payback: gain > 0 ? (k / gain / 12).toFixed(1) : 'never' });
}
rows.sort((x, y) => (Number(x.payback) || 99) - (Number(y.payback) || 99));
for (const r of rows) console.log(`${r.b.padEnd(11)} ${r.place.padEnd(16)} cost ${String(r.cost).padStart(5)}  +${String(r.perMonth).padStart(4)} a month  pays back in ${r.payback} years`);
