// Proposes every settlement's spaces from the traced geography (M20) and
// writes them to data/spaces.json, keeping that file's hand-written parts
// (the rules for each kind of space, the default works and the per-place
// overrides) so it can be re-run after the map changes.
//
//   node tools/spaces.mjs          rewrite data/spaces.json
//   node tools/spaces.mjs --check  print the result without writing
//
// A river within RIVER map units gives a river space, named for the river;
// a lake within its outline plus LAKE_MARGIN a lake space; a terrain zone
// within TERRAIN units a space of that terrain, named for the zone; the sea
// within COAST a coast space; open ground a plain space. Towns and cities
// add a town square, walled places and castles their defences, and known
// gold deposits a seam.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointInPolygon, distanceToPolygon } from '../src/sim/geometry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RIVER = 35;
const LAKE_MARGIN = 25;
const TERRAIN = 45;
const COAST = 35;
// At most this many spaces from the land (not counting square, defences or seam).
const MAX_LAND = { city: 4, town: 3, village: 3, castle: 3, temple: 2 };
// Terrain zone kinds, as the geography names them, to space kinds.
const TERRAIN_KIND = { forest: 'forest', hills: 'hills', mountains: 'mountain', marsh: 'marsh' };

const read = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));

function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy);
}

export function proposeSpaces(geo, gold, borderland = () => false) {
  const lands = [geo.temeria, ...Object.values(geo.neighbours).flatMap((n) => n.shapes), ...Object.values(geo.lands ?? {}).flatMap((n) => n.shapes)];
  const onLand = (x, y) => lands.some((sh) => pointInPolygon(x, y, sh));
  const zones = Object.entries(geo.terrain).flatMap(([kind, list]) => list.map((z) => ({ kind: TERRAIN_KIND[kind], name: z.name, shape: z.shape }))).filter((z) => z.kind);
  const out = {};
  const all = [...geo.settlements.map((s) => ({ ...s, realm: 'temeria' })), ...(geo.foreignSettlements ?? [])];
  for (const s of all) {
    const found = [];
    // Rivers: the nearest within reach.
    let river = null;
    for (const [name, pts] of Object.entries(geo.rivers)) {
      for (let i = 1; i < pts.length; i++) {
        const d = nearestOnSegment(s, pts[i - 1], pts[i]);
        if (d < RIVER && (!river || d < river.d)) river = { kind: 'river', name: `the ${name}`, d };
      }
    }
    if (river) found.push(river);
    for (const l of geo.lakes ?? []) {
      const n = ((s.x - l.x) / (l.rx + LAKE_MARGIN)) ** 2 + ((s.y - l.y) / (l.ry + LAKE_MARGIN)) ** 2;
      if (n <= 1) found.push({ kind: 'lake', name: l.name, d: Math.sqrt(n) * 10 });
    }
    // The sea: a ring of samples round the place.
    let coast = Infinity;
    for (let i = 0; i < 36 && coast === Infinity; i++) {
      const a = (i / 36) * Math.PI * 2;
      for (let r = 6; r <= COAST; r += 4) if (!onLand(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r)) { coast = Math.min(coast, r); break; }
    }
    // Temeria has no sea coast in the traced map: by design, a reason to want Cidaris.
    if (coast < Infinity && s.realm !== 'temeria') found.push({ kind: 'coast', name: 'the coast', d: coast });
    // Terrain, nearest first, one space per kind of ground.
    const near = zones.map((z) => ({ ...z, d: distanceToPolygon(s.x, s.y, z.shape) })).filter((z) => z.d < TERRAIN).sort((a, b) => a.d - b.d);
    const kinds = new Set();
    for (const z of near) {
      if (kinds.has(z.kind)) continue;
      kinds.add(z.kind);
      found.push({ kind: z.kind, name: z.name, d: z.d });
    }
    // Open ground, unless the place stands inside wild country.
    if (!near.some((z) => z.d === 0 && z.kind !== 'hills')) found.push({ kind: 'plain', name: 'the open fields', d: 50 });
    // Water first, then the nearest ground; open ground always keeps its place if there is room.
    const max = MAX_LAND[s.type] ?? 3;
    const land = found.sort((a, b) => a.d - b.d).slice(0, max);
    if (!land.some((x) => x.kind === 'plain') && found.some((x) => x.kind === 'plain') && land.length === max && !land.some((x) => x.kind === 'marsh' || x.kind === 'forest' || x.kind === 'mountain')) {
      land[land.length - 1] = found.find((x) => x.kind === 'plain');
    }
    const spaces = land.map(({ kind, name }) => ({ kind, name }));
    for (const [, d] of Object.entries(gold?.deposits ?? {})) if (d.settlement === s.id) spaces.push({ kind: 'seam', name: d.name });
    if (s.type === 'town' || s.type === 'city') spaces.push({ kind: 'square', name: s.type === 'city' ? 'the city square' : 'the town square' });
    if (s.type === 'temple') spaces.push({ kind: 'square', name: 'the temple precinct' });
    if (s.type === 'city' || s.type === 'town' || s.type === 'castle' || (s.type === 'village' && borderland(s))) {
      if (s.type !== 'village') spaces.push({ kind: 'defences', name: s.type === 'castle' ? 'the curtain walls' : 'the walls' });
    }
    out[s.id] = spaces;
  }
  return out;
}

async function main() {
  const geo = await read('data/geography.json');
  const gold = await read('data/gold.json');
  const file = await read('data/spaces.json').catch(() => ({}));
  const proposed = proposeSpaces(geo, gold);
  // Hand-added spaces survive a re-run: an override may add or drop spaces.
  for (const [id, o] of Object.entries(file.overrides ?? {})) {
    if (!proposed[id]) continue;
    for (const add of o.addSpaces ?? []) if (!proposed[id].some((x) => x.kind === add.kind)) proposed[id].splice(proposed[id].findIndex((x) => ['seam', 'square', 'defences'].includes(x.kind)) >>> 0, 0, add);
    for (const kind of o.dropSpaces ?? []) proposed[id] = proposed[id].filter((x) => x.kind !== kind);
    for (const [kind, name] of Object.entries(o.rename ?? {})) for (const x of proposed[id]) if (x.kind === kind) x.name = name;
  }
  const result = { ...file, settlements: proposed };
  if (process.argv.includes('--check')) {
    for (const [id, sp] of Object.entries(proposed)) console.log(id.padEnd(18), sp.map((x) => `${x.kind}:${x.name}`).join(' | '));
    return;
  }
  await writeFile(join(ROOT, 'data/spaces.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Spaces for ${Object.keys(proposed).length} settlements written to data/spaces.json.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
