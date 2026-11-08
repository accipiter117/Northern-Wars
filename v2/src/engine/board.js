// The war table's board (v2 step 2): regions and the links between them,
// built once from the traced map the real-time game already has. Pure: no
// DOM, so the engine and its tests run in Node.
//
// A region is a province: each city, town and castle is the heart of one;
// villages and temples join the nearest heart of their own realm. Links
// follow the traced roads, plus open country between near neighbours on
// the same land. The great rivers (Pontar, Yaruga) close any link across
// them except where a road crosses (a bridge) or the data names a ford or
// ferry, which makes those crossings the keys to the map.

const HEART = new Set(['city', 'town', 'castle']);

export const TEMERIA = 'temeria';

function d2(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// Whether segments p1-p2 and p3-p4 cross.
function crosses(p1, p2, p3, p4) {
  const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2);
}

function riversCrossed(rivers, a, b) {
  const out = [];
  for (const [name, pts] of Object.entries(rivers)) {
    for (let i = 1; i < pts.length; i++) {
      if (crosses(a, b, { x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] })) {
        out.push(name);
        break;
      }
    }
  }
  return out;
}

function inPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The realm shapes, for telling land from sea.
export function realmShapes(geography) {
  const out = [{ realm: TEMERIA, shape: geography.temeria }];
  for (const [rid, n] of Object.entries(geography.neighbours ?? {})) for (const shape of n.shapes ?? []) out.push({ realm: rid, shape });
  return out;
}

export function onLand(shapes, p) {
  return shapes.some((s) => inPolygon(p, s.shape));
}

// Open country between two places: every point along the way on land.
function overLand(shapes, a, b) {
  for (let t = 0.1; t < 1; t += 0.1) {
    if (!onLand(shapes, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildBoard(world, data) {
  const g = world.geography;
  const places = [
    ...g.settlements.map((s) => ({ ...s, realm: TEMERIA })),
    ...(g.foreignSettlements ?? []),
  ];
  const regions = {};
  for (const p of places) {
    if (!HEART.has(p.type)) continue;
    regions[p.id] = {
      id: p.id, name: p.name, realm: p.realm, type: p.type, x: p.x, y: p.y,
      terrain: world.terrainOf?.[p.id] ?? 'open', members: [p.id],
      capital: (p.realm === TEMERIA ? world.kingdom.capital : world.realms?.realms?.[p.realm]?.capital) === p.id,
    };
  }
  // Villages and temples join the nearest heart of their realm.
  const regionOf = {};
  for (const id of Object.keys(regions)) regionOf[id] = id;
  for (const p of places) {
    if (regions[p.id]) continue;
    const own = Object.values(regions).filter((r) => r.realm === p.realm);
    const pool = own.length ? own : Object.values(regions);
    const best = pool.reduce((m, r) => (d2(r, p) < d2(m, p) ? r : m));
    best.members.push(p.id);
    regionOf[p.id] = best.id;
  }

  const rivers = g.rivers ?? {};
  const barriers = new Set(data.barriers ?? []);
  const named = {};
  for (const [kind, list] of [['ford', data.crossings?.fords ?? []], ['ferry', data.crossings?.ferries ?? []]]) {
    for (const [a, b] of list) named[key(a, b)] = kind;
  }
  const links = {};
  const add = (a, b, road, over) => {
    if (a === b) return;
    const k = key(a, b);
    const ra = regions[a];
    const rb = regions[b];
    const crossed = riversCrossed(rivers, over?.[0] ?? ra, over?.[1] ?? rb);
    const great = crossed.filter((r) => barriers.has(r));
    const lesser = crossed.filter((r) => !barriers.has(r));
    const prev = links[k];
    let crossing = null;
    if (great.length) crossing = named[k] ?? (road ? 'bridge' : null);
    const link = {
      id: k, a: a < b ? a : b, b: a < b ? b : a, road, rivers: great, streams: lesser,
      crossing, closed: great.length > 0 && !crossing,
    };
    // A road beats open country between the same pair.
    if (!prev || (road && !prev.road) || (prev.closed && !link.closed)) links[k] = link;
  };
  for (const [x, y] of [...(g.roads ?? []), ...(g.foreignRoads ?? [])]) {
    const a = regionOf[x];
    const b = regionOf[y];
    if (!a || !b || a === b) continue;
    // The road's own course decides which river it crosses, and so the bridge.
    add(a, b, true, [world.byId[x], world.byId[y]]);
  }
  // Open country between near neighbours on the same land.
  const shapes = realmShapes(g);
  const list = Object.values(regions);
  const near = data.openLinks?.near ?? 4;
  const maxD2 = (data.openLinks?.maxDist ?? 190) ** 2;
  for (const r of list) {
    const close = list.filter((o) => o !== r && d2(o, r) <= maxD2).sort((p, q) => d2(p, r) - d2(q, r)).slice(0, near);
    for (const o of close) if (!links[key(r.id, o.id)] && overLand(shapes, r, o)) add(r.id, o.id, false);
  }
  const adj = {};
  for (const id of Object.keys(regions)) adj[id] = [];
  for (const l of Object.values(links)) {
    adj[l.a].push(l);
    adj[l.b].push(l);
  }
  return { regions, regionOf, links, adj };
}

export const other = (link, id) => (link.a === id ? link.b : link.a);
