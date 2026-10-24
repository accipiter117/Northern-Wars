// The world is the static, read-only part of a game: geography, starting data
// and the derived road and river networks. It is built once from JSON and
// never saved; the state only refers to it by ids.

export function buildWorld({ kingdom, geography, settlements, ambient }) {
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

  return {
    kingdom,
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
