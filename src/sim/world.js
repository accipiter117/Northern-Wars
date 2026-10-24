// The world is the static, read-only part of a game: geography, starting data
// and the derived road and river networks. It is built once from JSON and
// never saved; the state only refers to it by ids.
import { distanceToPolygon } from './geometry.js';

// How far a settlement's fields and woodlots reach, in map units.
const WORKED_RADIUS = 40;

export function buildWorld({ kingdom, geography, settlements, ambient, economy, buildings, laws, groups, neighbours, envoys, culture, petitions }) {
  const byId = {};
  for (const s of geography.settlements) byId[s.id] = s;

  const adjacency = {};
  for (const s of geography.settlements) adjacency[s.id] = [];
  for (const [a, b] of geography.roads) {
    const d = dist(byId[a], byId[b]);
    adjacency[a].push({ to: b, d });
    adjacency[b].push({ to: a, d });
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
        const d = distanceToPolygon(s.x, s.y, z.shape);
        if (d < best.d || (d === 0 && best.d === 0)) best = { kind, d };
      }
    }
    terrainOf[s.id] = best.kind;
  }

  // Settlements within reach of a forest, or of Brokilon itself, are where
  // Scoia'tael commandos strike.
  const forestNear = {};
  const woods = [...(geography.terrain.forest ?? []).map((z) => z.shape), ...(geography.neighbours.brokilon?.shapes ?? [])];
  for (const s of geography.settlements) forestNear[s.id] = woods.some((sh) => distanceToPolygon(s.x, s.y, sh) < 60);

  return {
    kingdom,
    forestNear,
    culture,
    petitions,
    economy,
    buildings: buildings.buildings,
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
  };
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
export function roadPath(world, from, to) {
  const key = `${from}>${to}`;
  if (world.pathCache.has(key)) return world.pathCache.get(key);
  const best = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  while (open.size) {
    let cur = null;
    for (const id of open) if (cur === null || best[id] < best[cur]) cur = id;
    open.delete(cur);
    if (cur === to) break;
    for (const { to: n, d } of world.adjacency[cur]) {
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
