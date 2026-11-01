// The world is the static, read-only part of a game: geography, starting data
// and the derived road and river networks. It is built once from JSON and
// never saved; the state only refers to it by ids.
import { distanceToPolygon, pointInPolygon } from './geometry.js';
import { buildGrid } from './vision.js';
import { buildSpaces } from './works.js';

// How far a settlement's fields and woodlots reach, in map units.
const WORKED_RADIUS = 40;
const TEMERIA_ID = 'temeria';

export function buildWorld({ kingdom, geography, settlements, ambient, economy, buildings, laws, groups, neighbours, envoys, culture, petitions, houses, demands, military, events, realms, war, trade, gold, industry, forces, northIds = null, diplomacy = null, strategy = null, conquest = null, spaces = null, labour = null, market = null, meters = null, book = null, devotion = null, dilemmas = null, spies = null }) {
  // byId knows every place on the map, at home and abroad; adjacency is
  // Temeria's own road network, which every domestic system walks.
  // fullAdjacency adds the foreign roads, for traffic that crosses borders.
  const foreign = geography.foreignSettlements ?? [];
  const byId = {};
  for (const s of geography.settlements) byId[s.id] = s;
  for (const s of foreign) byId[s.id] = s;
  const realmOf = {};
  const foreignByRealm = {};
  for (const s of foreign) {
    realmOf[s.id] = s.realm;
    (foreignByRealm[s.realm] ??= []).push(s.id);
  }

  const adjacency = {};
  for (const s of geography.settlements) adjacency[s.id] = [];
  for (const [a, b] of geography.roads) {
    const d = dist(byId[a], byId[b]);
    adjacency[a].push({ to: b, d });
    adjacency[b].push({ to: a, d });
  }

  const fullAdjacency = {};
  for (const s of [...geography.settlements, ...foreign]) fullAdjacency[s.id] = [...(adjacency[s.id] ?? [])];
  for (const [a, b] of geography.foreignRoads ?? []) {
    const d = dist(byId[a], byId[b]);
    fullAdjacency[a].push({ to: b, d });
    fullAdjacency[b].push({ to: a, d });
  }

  // Temerian settlements near enough a border to keep watch over it.
  const borderland = {};
  for (const s of geography.settlements) {
    borderland[s.id] = Object.values(geography.neighbours).some((n) => n.shapes.some((sh) => distanceToPolygon(s.x, s.y, sh) < 90));
  }
  // Foreign towns too, should one ever become Temerian (M19): near another
  // realm's border, or Temeria's own.
  for (const s of foreign) {
    borderland[s.id] = distanceToPolygon(s.x, s.y, geography.temeria) < 90
      || Object.entries(geography.neighbours).some(([rid, n]) => rid !== s.realm && n.shapes.some((sh) => distanceToPolygon(s.x, s.y, sh) < 90));
  }

  const rivers = {};
  for (const name of kingdom.rivers?.navigable ?? []) {
    const pts = geography.rivers[name].map(([x, y]) => ({ x, y }));
    rivers[name] = { name, points: pts, length: polylineLength(pts) };
  }

  // Each settlement works the ground around it; the nearest terrain zone in
  // reach decides its farming and goods yields.
  const terrainOf = {};
  for (const s of geography.settlements) {
    let best = { kind: 'open', d: WORKED_RADIUS };
    for (const [kind, zones] of Object.entries(geography.terrain)) {
      for (const z of zones) {
        if (z.realm) continue;
        const d = distanceToPolygon(s.x, s.y, z.shape);
        if (d < best.d || (d === 0 && best.d === 0)) best = { kind, d };
      }
    }
    terrainOf[s.id] = best.kind;
  }

  // Settlements within reach of a forest, or of Brokilon itself, are where
  // Scoia'tael commandos strike.
  const forestNear = {};
  const woods = [...(geography.terrain.forest ?? []).filter((z) => !z.realm).map((z) => z.shape), ...(geography.neighbours.brokilon?.shapes ?? [])];
  for (const s of [...geography.settlements, ...foreign]) forestNear[s.id] = woods.some((sh) => distanceToPolygon(s.x, s.y, sh) < 60);

  // Which kinds of wild country lie within reach of each settlement: where
  // bandits hide and monsters breed.
  const wildOf = {};
  const reach = military?.wildReach ?? 60;
  for (const s of geography.settlements) {
    wildOf[s.id] = {};
    for (const [kind, zones] of Object.entries(geography.terrain)) {
      if (zones.some((z) => !z.realm && distanceToPolygon(s.x, s.y, z.shape) < reach)) wildOf[s.id][kind] = true;
    }
  }

  // Water each Temerian settlement stands on: a river (and whether barges
  // use it), Lake Vizima, or the sea; with the nearest water's edge, where
  // a harbour or a mill would go.
  const waterOf = {};
  const navigable = new Set(kingdom.rivers?.navigable ?? []);
  const onLand = (x, y) => pointInPolygon(x, y, geography.temeria)
    || Object.values(geography.neighbours).some((n) => n.shapes.some((sh) => pointInPolygon(x, y, sh)))
    || Object.values(geography.lands ?? {}).some((n) => n.shapes.some((sh) => pointInPolygon(x, y, sh)));
  // Foreign towns too, so their rulers know where a harbour can stand (M18).
  for (const s of [...geography.settlements, ...(geography.foreignSettlements ?? [])]) {
    let best = null;
    for (const [name, pts] of Object.entries(geography.rivers)) {
      for (let i = 1; i < pts.length; i++) {
        const q = nearestOnSegment(s, { x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] });
        const d = dist(s, q);
        if (d < WATER_REACH && (!best || d < best.d)) best = { d, kind: 'river', river: name, navigable: navigable.has(name), x: q.x, y: q.y };
      }
    }
    for (const l of geography.lakes ?? []) {
      const a = Math.atan2((s.y - l.y) / l.ry, (s.x - l.x) / l.rx);
      const q = { x: l.x + Math.cos(a) * l.rx, y: l.y + Math.sin(a) * l.ry };
      const d = dist(s, q);
      if (d < WATER_REACH && (!best || d < best.d)) best = { d, kind: 'lake', navigable: true, x: q.x, y: q.y };
    }
    // Ports named in the data look further for the sea: their harbours lie
    // down an estuary or across the dunes.
    const seaReach = trade?.ports?.includes(s.id) ? 130 : WATER_REACH;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      for (let r = 8; r <= seaReach; r += 6) {
        const x = s.x + Math.cos(a) * r;
        const y = s.y + Math.sin(a) * r;
        if (!onLand(x, y)) {
          if (!best || best.kind !== 'sea' || r < best.d) best = { d: r, kind: 'sea', navigable: true, x, y };
          break;
        }
      }
    }
    waterOf[s.id] = best;
  }

  // Foreign towns work the ground round them as Temeria's do: the nearest
  // wild country in reach (their own realm's zones) decides what they make.
  for (const s of foreign) {
    let best = { kind: 'open', d: WORKED_RADIUS };
    for (const [kind, zones] of Object.entries(geography.terrain)) {
      for (const z of zones) {
        if (!z.realm || z.realm === TEMERIA_ID) continue;
        const d = distanceToPolygon(s.x, s.y, z.shape);
        if (d < best.d) best = { kind, d };
      }
    }
    terrainOf[s.id] = best.kind;
    // And the wild country in reach of them, where their bandits and beasts breed.
    wildOf[s.id] = {};
    for (const [kind, zones] of Object.entries(geography.terrain)) {
      if (zones.some((z) => z.realm && z.realm !== TEMERIA_ID && distanceToPolygon(s.x, s.y, z.shape) < reach)) wildOf[s.id][kind] = true;
    }
  }

  const world = {
    northIds,
    lands: geography.lands ?? {},
    distantTowns: geography.distantTowns ?? [],
    waterOf,
    kingdom,
    foreign,
    realmOf,
    // Where each foreign town belonged when the reign began; realmOf follows
    // conquests and cessions (M19, see lands.js), homeOf never changes.
    homeOf: { ...realmOf },
    foreignByRealm,
    fullAdjacency,
    borderland,
    forestNear,
    wildOf,
    military,
    events,
    realms,
    war,
    trade,
    gold,
    industry,
    forces,
    diplomacy,
    strategy,
    culture,
    petitions,
    dilemmas,
    houses,
    demands,
    economy,
    buildings: buildings.buildings,
    buildingSlots: buildings.slots ?? {},
    laws,
    groups,
    neighbours,
    envoys,
    terrainOf,
    geography,
    settlementData: settlements.settlements,
    ambient,
    byId,
    adjacency,
    rivers,
    pathCache: new Map(),
    conquest,
    spacesData: spaces,
    labour,
    market,
    meters,
    book,
    devotion,
    spies,
    works: spaces?.condition ?? null,
    spaces: spaces ? buildSpaces(spaces, geography.settlements, foreign, borderland) : null,
    landsKey: '',
    landsVersion: 0,
  };
  if (realms) world.grid = buildGrid(world);
  return world;
}

// How far from its centre a place may have its quays or its mill-race.
const WATER_REACH = 40;

export function nearestOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

// Shortest road route between two settlements (Dijkstra; the graph is tiny).
// Domestic routes stay on Temeria's roads; `full` lets them cross borders.
export function roadPath(world, from, to, full = false) {
  const graph = full ? world.fullAdjacency : world.adjacency;
  if (!graph[from] || !graph[to]) return null;
  const key = `${full ? '*' : ''}${from}>${to}`;
  if (world.pathCache.has(key)) return world.pathCache.get(key);
  const best = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  while (open.size) {
    let cur = null;
    for (const id of open) if (cur === null || best[id] < best[cur]) cur = id;
    open.delete(cur);
    if (cur === to) break;
    for (const { to: n, d } of graph[cur]) {
      const nd = best[cur] + d;
      if (best[n] === undefined || nd < best[n]) {
        best[n] = nd;
        prev[n] = cur;
        open.add(n);
      }
    }
  }
  let path = null;
  if (best[to] !== undefined) {
    path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
  }
  world.pathCache.set(key, path);
  return path;
}

// Settlements within `hops` road links, used for short patrol beats.
export function nearby(world, from, hops) {
  const seen = new Set([from]);
  let frontier = [from];
  for (let h = 0; h < hops; h++) {
    const next = [];
    for (const id of frontier) {
      for (const { to } of world.adjacency[id]) {
        if (!seen.has(to)) { seen.add(to); next.push(to); }
      }
    }
    frontier = next;
  }
  seen.delete(from);
  return [...seen];
}
