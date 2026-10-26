// Rebuilds the North beyond Temeria in data/geography.json from the traced
// atlas in data/north-geography.json: the realms' outlines, the lands beyond
// (not yet realms), forests, mountains, hills and marsh, the rivers and
// lakes, every foreign town, and a road network laid to suit them. Temeria's
// own outline, towns, roads and terrain are left exactly as they are.
//
// Old towns that are the same place keep their ids; every other old town is
// mapped to its nearest replacement in the same realm (data/north-ids.json),
// which the save upgrade and the data files use. Run: node tools/north.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pointInPolygon } from '../src/sim/geometry.js';
import { nearestOnSegment } from '../src/sim/world.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = async (f) => JSON.parse(await readFile(join(ROOT, f), 'utf8'));

// The realms the game simulates. Every other land in the atlas is drawn and
// named, ready to become a realm later.
export const MODELLED = ['redania', 'kaedwen', 'aedirn', 'mahakam', 'cidaris', 'kerack', 'brokilon', 'verden', 'brugge', 'sodden', 'cintra'];

// The foreign towns before M15, kept here so the build always maps from the
// same starting point, however many times it runs.
const OLD = [
  ['novigrad', 'Novigrad', 'redania', 40, 240], ['oxenfurt', 'Oxenfurt', 'redania', 330, 80], ['tretogor', 'Tretogor', 'redania', 360, -330],
  ['rinde', 'Rinde', 'redania', -120, -200], ['murivel', 'Murivel', 'redania', 640, -120], ['drakenborg', 'Drakenborg', 'redania', 120, -500],
  ['ban_ard', 'Ban Ard', 'kaedwen', 980, -230], ['ard_carraigh', 'Ard Carraigh', 'kaedwen', 1260, -420], ['daevon', 'Daevon', 'kaedwen', 1150, -90],
  ['kaer_morhen', 'Kaer Morhen', 'kaedwen', 1520, -560], ['vengerberg', 'Vengerberg', 'aedirn', 1380, 180], ['aldersberg', 'Aldersberg', 'aedirn', 1170, 190],
  ['gulet', 'Gulet', 'aedirn', 1500, -60], ['spalla', 'Spalla', 'aedirn', 1580, 480], ['carbon', 'Mount Carbon', 'mahakam', 1130, 470],
  ['stonegate', 'Stonegate', 'mahakam', 1040, 250], ['deepdelve', 'Deepdelve', 'mahakam', 1290, 650], ['duen_canell', 'Duen Canell', 'brokilon', 300, 725],
  ['cidaris_city', 'Cidaris', 'cidaris', -110, 560], ['saltmarsh', 'Saltmarsh', 'cidaris', -170, 480], ['kerack_city', 'Kerack', 'kerack', -150, 710],
  ['palmyra', 'Palmyra', 'kerack', -250, 760], ['verden_town', 'Verden', 'verden', -150, 950], ['nastrog', 'Nastrog', 'verden', 120, 960],
  ['bremervoord', 'Bremervoord', 'verden', -300, 1060], ['brugge_city', 'Brugge', 'brugge', 460, 960], ['lowmarsh', 'Lowmarsh', 'brugge', 360, 1030],
  ['sodden_keep', 'Sodden Keep', 'sodden', 860, 1060], ['sodden_hill', 'Sodden Hill', 'sodden', 1010, 950], ['fordham', 'Fordham', 'sodden', 1300, 1000],
  ['riverwatch', 'Riverwatch', 'sodden', 1550, 850], ['cintra_city', 'Cintra', 'cintra', 300, 1300], ['marnadal', 'Marnadal', 'cintra', 640, 1200],
  ['ardwind', 'Ardwind', 'cintra', 0, 1250], ['hollowmere', 'Hollowmere', 'cintra', 880, 1380],
];
// Capitals with no town of their name in the atlas: the seat moves to the
// realm's chief town and keeps the old id, so saves and data still find it.
const SEATS = { verden: ['verden_town', 'Hamm'], sodden: ['sodden_keep', 'Kagen'] };
// Towns whose atlas names would clash with a realm's id.
const CLASH = new Set([...MODELLED, 'hengfors', 'kovir', 'poviss', 'lyria_rivia', 'toussaint', 'angren', 'nazair', 'mag_turga', 'dol_blathanna', 'skellige', 'korath', 'metinna', 'tir_tochair']);
// Old foreign terrain the atlas replaces (and Brokilon, redrawn to its new outline).
const DROP = new Set(['Kestrel Mountains', 'Mahakam', 'Redanian woods', 'Cintran fens', 'Sodden hills']);

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function townIds(north, temerian) {
  const ids = {};
  const taken = new Set(temerian);
  for (const t of north.towns) {
    const old = OLD.find(([, name, realm]) => name === t.name && (realm === t.realm || t.name === 'Bremervoord'));
    let id = old?.[0];
    const seat = Object.entries(SEATS).find(([realm, [, name]]) => realm === t.realm && name === t.name);
    if (seat) id = seat[1][0];
    if (!id) {
      id = slug(t.name);
      if (CLASH.has(id)) id = `${id}_city`;
    }
    if (taken.has(id)) throw new Error(`Town id clash: ${id}`);
    taken.add(id);
    ids[t.name] = id;
  }
  return ids;
}

// ---- Roads ----

// How much of a straight road from a to b runs through any of the shapes.
function fractionIn(a, b, shapes, n = 24) {
  let inside = 0;
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    if (shapes.some((sh) => pointInPolygon(x, y, sh))) inside++;
  }
  return inside / (n - 1);
}

function crossesRiverAwayFromTowns(a, b, rivers) {
  for (const pts of rivers) {
    for (let i = 1; i < pts.length; i++) {
      const p = intersect(a, b, { x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] });
      if (p && Math.min(dist(p, a), dist(p, b)) > 35) return true;
    }
  }
  return false;
}

function intersect(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (!den) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : null;
}

// What a road between two places would cost to keep: its length, much more
// through mountains (only passes are cheap), a little more for crossing a
// river far from a town's bridge, and prohibitively more over open sea.
function roadCost(a, b, ctx) {
  const d = dist(a, b);
  const peaks = fractionIn(a, b, ctx.mountains);
  const sea = 1 - fractionIn(a, b, ctx.land);
  return d * (1 + peaks * 6 + sea * 40 + (crossesRiverAwayFromTowns(a, b, ctx.rivers) ? 0.35 : 0));
}

// Join a set of towns: a minimum spanning tree so all are reachable, then
// each town to its two or three nearest neighbours where the road is good.
function layRoads(towns, ctx, extra = 2) {
  const edges = [];
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) edges.push({ a: towns[i], b: towns[j], c: roadCost(towns[i], towns[j], ctx) });
  }
  edges.sort((p, q) => p.c - q.c);
  const parent = new Map(towns.map((t) => [t.id, t.id]));
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
  const out = new Map();
  const key = (a, b) => [a.id, b.id].sort().join('|');
  for (const e of edges) {
    const ra = find(e.a.id);
    const rb = find(e.b.id);
    if (ra !== rb) {
      parent.set(ra, rb);
      out.set(key(e.a, e.b), e);
    }
  }
  const degree = (id) => [...out.values()].filter((e) => e.a.id === id || e.b.id === id).length;
  for (const t of towns) {
    const mine = edges.filter((e) => e.a === t || e.b === t);
    const best = mine[0]?.c ?? 0;
    for (const e of mine.slice(0, 3)) {
      if (degree(t.id) >= extra + 1) break;
      if (e.c <= best * 1.7 && e.c < dist(e.a, e.b) * 1.6 && !out.has(key(e.a, e.b))) out.set(key(e.a, e.b), e);
    }
  }
  return [...out.values()];
}

// The nearest point on a set of outlines to (x, y), stepped `inset` units
// inside: for atlas points that fall a hair outside their land.
function ontoLand(x, y, shapes, inset) {
  let best = null;
  for (const sh of shapes) {
    for (let i = 0; i < sh.length; i++) {
      const a = { x: sh[i][0], y: sh[i][1] };
      const b = { x: sh[(i + 1) % sh.length][0], y: sh[(i + 1) % sh.length][1] };
      const q = nearestOnSegment({ x, y }, a, b);
      const d = Math.hypot(q.x - x, q.y - y);
      if (!best || d < best.d) best = { ...q, d, sh };
    }
  }
  // Step from the edge towards the middle of that shape until well inside.
  const cx = best.sh.reduce((a, p) => a + p[0], 0) / best.sh.length;
  const cy = best.sh.reduce((a, p) => a + p[1], 0) / best.sh.length;
  const len = Math.hypot(cx - best.x, cy - best.y) || 1;
  for (let k = inset; k < inset * 6; k += 1) {
    const p = { x: Math.round(best.x + ((cx - best.x) / len) * k), y: Math.round(best.y + ((cy - best.y) / len) * k) };
    if (pointInPolygon(p.x, p.y, best.sh)) return p;
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}

// ---- The build ----

export async function buildNorth() {
  const north = await read('data/north-geography.json');
  const geo = await read('data/geography.json');
  const temerian = geo.settlements.map((s) => s.id);
  const ids = townIds(north, temerian);
  const modelled = new Set(MODELLED);

  const neighbours = {};
  for (const rid of MODELLED) neighbours[rid] = { name: geo.neighbours[rid]?.name ?? north.realms[rid].name, shapes: north.realms[rid].shapes };
  const lands = {};
  for (const [rid, r] of Object.entries(north.realms)) if (!modelled.has(rid)) lands[rid] = { name: r.name, shapes: r.shapes };

  // Terrain: Temeria's own zones as they were; the atlas everywhere else.
  // Zones beyond Temeria always carry a realm, so Temeria's rules never
  // mistake them for its own country.
  const terrain = {};
  for (const [kind, zones] of Object.entries(geo.terrain)) {
    terrain[kind] = zones.filter((z) => !z.realm && !DROP.has(z.name));
  }
  terrain.forest.push({ name: 'Brokilon', realm: 'brokilon', shape: north.realms.brokilon.shapes[0] });
  // Corners of ranges that run past the edge of the land are pulled onto it.
  const allLand = [geo.temeria, ...Object.values(north.realms).flatMap((r) => r.shapes)];
  const onLand = (x, y) => allLand.some((sh) => pointInPolygon(x, y, sh));
  for (const [kind, zones] of Object.entries(north.terrain)) {
    for (const z of zones) {
      if (z.realm === 'temeria') continue;
      const shape = z.shape.map(([x, y]) => (onLand(x, y) ? [x, y] : (({ x: a, y: b }) => [a, b])(ontoLand(x, y, allLand, 1))));
      (terrain[kind] ??= []).push({ name: z.name, realm: z.realm ?? 'wilds', shape });
    }
  }

  // Rivers: Temeria's own as they were, the Pontar and Yaruga retraced, and
  // every other river of the atlas beyond Temeria.
  const rivers = {};
  for (const [name, pts] of Object.entries(geo.rivers)) {
    if (north.replace.rivers.includes(name)) continue;
    if (north.rivers[name] && north.rivers[name].realm !== 'temeria') continue;
    rivers[name] = pts;
  }
  for (const [name, r] of Object.entries(north.rivers)) if (r.realm !== 'temeria') rivers[name] = r.points;
  const riverRealms = Object.fromEntries(Object.entries(north.rivers).filter(([, r]) => r.realm !== 'temeria').map(([name, r]) => [name, r.realm ?? 'wilds']));
  const lakes = [...geo.lakes.filter((l) => !north.lakes.some((n) => n.name === l.name)), ...north.lakes];

  // Every town stands inside its own realm: the few the atlas puts a hair
  // over the line (or the shore) are stepped back in.
  const towns = north.towns.map((t) => {
    const shapes = north.realms[t.realm].shapes;
    const p = shapes.some((sh) => pointInPolygon(t.x, t.y, sh)) ? { x: t.x, y: t.y } : ontoLand(t.x, t.y, shapes, 6);
    return { id: ids[t.name], name: t.name, type: t.type, x: p.x, y: p.y, realm: t.realm };
  });
  const foreign = towns.filter((t) => modelled.has(t.realm));
  const distant = towns.filter((t) => !modelled.has(t.realm)).map(({ realm, ...t }) => ({ ...t, land: realm }));

  // Map each old foreign town to the town that now stands for it.
  const renamed = {};
  for (const [id, , realm, x, y] of OLD) {
    if (foreign.some((t) => t.id === id)) continue;
    const pool = foreign.filter((t) => t.realm === realm);
    let best = null;
    for (const t of pool) if (!best || dist(t, { x, y }) < dist(best, { x, y })) best = t;
    renamed[id] = best.id;
  }

  // Roads: within each land, then across borders, then to Temeria's own
  // border towns where its roads always left the kingdom.
  const ctx = {
    mountains: terrain.mountains.map((z) => z.shape),
    land: [geo.temeria, ...Object.values(neighbours).flatMap((n) => n.shapes), ...Object.values(lands).flatMap((n) => n.shapes)],
    rivers: Object.values(rivers),
  };
  const byRealm = {};
  for (const t of towns) (byRealm[t.realm] ??= []).push(t);
  const roads = [];
  const distantRoads = [];
  for (const [realm, list] of Object.entries(byRealm)) {
    for (const e of layRoads(list, ctx)) (modelled.has(realm) ? roads : distantRoads).push([e.a.id, e.b.id]);
  }
  // Neighbouring lands: realms whose outlines touch are joined by their best road.
  const shapesOf = (rid) => neighbours[rid]?.shapes ?? lands[rid]?.shapes ?? [];
  const touching = (r1, r2) => shapesOf(r1).some((a) => shapesOf(r2).some((b) => a.some(([x, y]) => b.some(([u, v]) => Math.hypot(x - u, y - v) < 60))));
  const realmIds = Object.keys(byRealm);
  for (let i = 0; i < realmIds.length; i++) {
    for (let j = i + 1; j < realmIds.length; j++) {
      const [r1, r2] = [realmIds[i], realmIds[j]];
      if (!touching(r1, r2)) continue;
      let best = null;
      for (const a of byRealm[r1]) for (const b of byRealm[r2]) {
        const c = roadCost(a, b, ctx);
        if (!best || c < best.c) best = { a, b, c };
      }
      if (!best || best.c > 900) continue;
      (modelled.has(r1) && modelled.has(r2) ? roads : distantRoads).push([best.a.id, best.b.id]);
    }
  }
  const temerianById = Object.fromEntries(geo.settlements.map((s) => [s.id, s]));
  const borderLinks = new Set();
  for (const [a, b] of geo.foreignRoads) {
    const [t, f] = temerianById[a] ? [a, b] : [b, a];
    if (!temerianById[t]) continue;
    const realm = OLD.find(([id]) => id === f)?.[2] ?? geo.foreignSettlements.find((s) => s.id === f)?.realm;
    if (!realm) continue;
    let best = null;
    for (const c of byRealm[realm]) {
      const cost = roadCost(temerianById[t], c, ctx);
      if (!best || cost < best.c) best = { id: c.id, c: cost };
    }
    const k = `${t}|${best.id}`;
    if (!borderLinks.has(k)) {
      borderLinks.add(k);
      roads.push([best.id, t]);
    }
  }

  const out = {
    ...geo,
    neighbours,
    lands,
    terrain,
    rivers,
    riverRealms,
    lakes,
    foreignSettlements: foreign.map(({ id, name, type, x, y, realm }) => ({ id, name, type, x, y, realm })),
    foreignRoads: roads,
    distantTowns: distant,
    distantRoads,
  };
  out.note = `${geo.note.replace(/ The North beyond.*$/, '')} The North beyond Temeria is built from data/north-geography.json by tools/north.mjs.`;
  const map = { note: 'Old foreign town ids (before M15) and the towns that now stand for them, for the save upgrade. Written by tools/north.mjs.', renamed, seats: Object.fromEntries(Object.values(SEATS)) };
  return { geography: out, ids: map };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { geography, ids } = await buildNorth();
  await writeFile(join(ROOT, 'data/geography.json'), `${JSON.stringify(geography)}\n`);
  await writeFile(join(ROOT, 'data/north-ids.json'), `${JSON.stringify(ids, null, 2)}\n`);
  console.log(`${geography.foreignSettlements.length} towns in the realms, ${geography.distantTowns.length} in the lands beyond, ${geography.foreignRoads.length} roads (and ${geography.distantRoads.length} beyond)`);
  console.log('renamed', ids.renamed);
}
