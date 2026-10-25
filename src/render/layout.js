// Settlement layouts: where each house, building, field and wall of a place
// stands on the map. Pure and deterministic: the same place, seed and
// buildings always give the same plan, and nothing in it lands on a road, a
// river, the lake, the sea or a neighbouring settlement's ground. Positions
// are in map units relative to the settlement's centre.
import { makeRng, streamSeed } from '../sim/rng.js';
import { pointInPolygon } from '../sim/geometry.js';

const geoCache = new WeakMap();

// Roads, rivers, the lake, land and terrain gathered once per world.
function geoOf(world) {
  let g = geoCache.get(world);
  if (g) return g;
  const geo = world.geography;
  const seg = (a, b) => ({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  const roads = [...geo.roads, ...(geo.foreignRoads ?? [])].map(([a, b]) => seg(world.byId[a], world.byId[b]));
  const rivers = [];
  for (const pts of Object.values(geo.rivers)) {
    for (let i = 1; i < pts.length; i++) rivers.push(seg({ x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] }));
  }
  const land = [geo.temeria, ...Object.values(geo.neighbours).flatMap((n) => n.shapes)];
  const zones = { hills: [], forest: [] };
  for (const [kind, list] of Object.entries(geo.terrain)) {
    const key = kind === 'mountains' ? 'hills' : kind;
    if (zones[key]) for (const z of list) zones[key].push(z.shape);
  }
  // Each place's road directions, for lanes and for inns.
  const links = {};
  for (const [a, b] of [...geo.roads, ...(geo.foreignRoads ?? [])]) {
    (links[a] ??= []).push(b);
    (links[b] ??= []).push(a);
  }
  const places = [...geo.settlements, ...(world.foreign ?? [])];
  g = { roads, rivers, land, lakes: geo.lakes ?? [], zones, links, places };
  geoCache.set(world, g);
  return g;
}

function segDist(px, py, s) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - s.ax - t * dx, py - s.ay - t * dy);
}

function segNearest(px, py, s) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy || 1)));
  return { x: s.ax + t * dx, y: s.ay + t * dy };
}

function nearestOnPolygons(px, py, polys) {
  let best = null;
  for (const poly of polys) {
    if (pointInPolygon(px, py, poly)) return { x: px, y: py, d: 0 };
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const s = { ax: poly[j][0], ay: poly[j][1], bx: poly[i][0], by: poly[i][1] };
      const q = segNearest(px, py, s);
      const d = Math.hypot(q.x - px, q.y - py);
      if (!best || d < best.d) best = { ...q, d };
    }
  }
  return best;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function coreRadius(cfg, type, people) {
  const c = cfg.core[type];
  return Math.min(c.maxRadius, Math.max(c.radius * 0.75, c.radius * Math.sqrt(Math.max(1, people) / c.perPeople)));
}

export function houseCount(cfg, type, people) {
  const [base, per, max] = cfg.core[type].houses;
  return Math.round(Math.min(max, base + people / per));
}

// The plan. `place` gives id, x, y, type, people, production, buildings,
// construction (a building id or null) and seed.
export function planSettlement(world, cfg, place) {
  const g = geoOf(world);
  const { id, x: cx, y: cy, type } = place;
  const R = coreRadius(cfg, type, place.people);
  const clear = cfg.clearance;
  const reachAll = R * 3.2;
  // Only the roads, rivers and neighbours near this place are worth testing.
  const near = (s) => segDist(cx, cy, s) < reachAll + 6;
  const roads = g.roads.filter(near);
  const rivers = g.rivers.filter(near);
  const others = g.places.filter((p) => p.id !== id && Math.hypot(p.x - cx, p.y - cy) < reachAll * 2.5 + 20);
  const lakes = g.lakes.filter((l) => Math.hypot(l.x - cx, l.y - cy) < reachAll + l.rx + 6);
  const items = [];
  const fields = [];
  const sites = [];

  function onLand(x, y) {
    return g.land.some((poly) => pointInPolygon(x, y, poly));
  }
  function inLake(x, y, r) {
    return lakes.some((l) => ((x - l.x) / (l.rx + r)) ** 2 + ((y - l.y) / (l.ry + r)) ** 2 < 1);
  }
  // Whether a disc of radius r at (dx, dy) from the centre is free.
  function free(dx, dy, r, opts = {}) {
    const x = cx + dx;
    const y = cy + dy;
    if (!opts.water && (!onLand(x, y) || inLake(x, y, r))) return false;
    for (const s of roads) if (segDist(x, y, s) < r + clear.road) return false;
    if (!opts.water) for (const s of rivers) if (segDist(x, y, s) < r + clear.river) return false;
    const own = Math.hypot(dx, dy) + r;
    for (const p of others) if (own > clear.neighbourShare * Math.hypot(p.x - x, p.y - y)) return false;
    for (const it of items) if (Math.hypot(it.x - dx, it.y - dy) < r + it.r + clear.between) return false;
    for (const f of fields) if (Math.hypot(f.x - dx, f.y - dy) < r + f.r + clear.between) return false;
    return true;
  }
  // Try spots around a wanted angle and distance band; the first free one wins.
  function find(rng, r, { angle = null, spread = Math.PI, min = 0, max = R, tries = 70, opts = {} }) {
    for (let i = 0; i < tries; i++) {
      const grow = i / tries;
      const a = angle === null ? rng.next() * Math.PI * 2 : angle + (rng.next() - 0.5) * spread * (0.3 + grow);
      const d = min + (max - min) * Math.min(1, rng.next() * (0.4 + grow));
      const dx = Math.cos(a) * d;
      const dy = Math.sin(a) * d;
      if (free(dx, dy, r, opts)) return { x: dx, y: dy };
    }
    return null;
  }
  const rngFor = (salt) => makeRng(streamSeed(place.seed ^ hash(id), hash(salt)));
  const angleTo = (p) => Math.atan2(p.y - cy, p.x - cx);
  const distTo = (p) => Math.hypot(p.x - cx, p.y - cy);

  // The landmark: keep, hall, chapel or temple at the heart.
  const lm = cfg.landmark[type];
  items.push({ kind: 'landmark', sprite: type, x: 0, y: 0, r: lm * 0.45, w: lm });

  const want = [...place.buildings];
  if (place.construction && !want.includes(place.construction)) want.push(place.construction);
  const walls = want.includes('walls');
  const paved = want.includes('paving');
  const roadAngles = (g.links[id] ?? []).map((o) => angleTo(world.byId[o]));

  for (const b of Object.keys(cfg.buildings)) {
    if (!want.includes(b)) continue;
    const spec = cfg.buildings[b];
    if (['fields', 'ring', 'streets'].includes(spec.place)) continue;
    const r = spec.size * 0.45;
    const rng = rngFor(b);
    let pos = null;
    const reach = (spec.reach ?? 1.6) * R;
    if (spec.place === 'core') pos = find(rng, r, { min: lm * 0.6, max: R * 0.9 });
    else if (spec.place === 'edge') pos = find(rng, r, { min: R * 0.9, max: R * 1.5 });
    else if (spec.place === 'road' && roadAngles.length) {
      const a = roadAngles[rng.int(roadAngles.length)];
      pos = find(rng, r, { angle: a, spread: 0.9, min: R * 0.7, max: R * 1.6 });
    } else if (spec.place === 'river' || spec.place === 'water') {
      const water = waterPoint(world, g, rivers, lakes, place, spec.place === 'water');
      if (water && distTo(water) <= reach + r) {
        const a = angleTo(water);
        const d = Math.max(R * 0.6, distTo(water) - r * 0.6);
        pos = find(rng, r, { angle: a, spread: 0.5, min: d * 0.85, max: Math.min(reach, d * 1.1), opts: { water: true } });
      }
    } else if (spec.place === 'hills' || spec.place === 'forest') {
      const q = nearestOnPolygons(cx, cy, g.zones[spec.place]);
      const a = q && q.d > 0 ? angleTo(q) : null;
      const d = q ? Math.min(reach, Math.max(R * 1.2, q.d + r)) : R * 1.4;
      pos = find(rng, r, { angle: a, spread: 0.8, min: R * 1.1, max: Math.max(R * 1.3, d) });
    } else if (spec.place === 'deposit') {
      const dep = Object.values(world.gold?.deposits ?? {}).find((d) => d.settlement === id);
      const a = dep ? angleTo(dep) : null;
      const d = dep ? Math.min(reach, distTo(dep)) : R * 1.5;
      pos = find(rng, r, { angle: a, spread: 0.7, min: R * 1.2, max: Math.max(R * 1.4, d) });
    }
    pos ??= find(rng, r, { min: R * 0.8, max: R * 2.2, tries: 120 });
    if (!pos) continue;
    const building = b === place.construction && !place.buildings.includes(b);
    items.push({ kind: building ? 'scaffold' : 'building', sprite: b, x: pos.x, y: pos.y, r, w: spec.size });
    if (spec.life?.includes('workers') || building) sites.push({ x: pos.x, y: pos.y, kind: building ? 'works' : b });
  }

  // Houses fill the heart outward; a walled place keeps them inside the wall.
  const hs = cfg.core[type].house;
  const hr = hs * 0.42;
  const nHouses = houseCount(cfg, type, place.people);
  const rngH = rngFor('houses');
  const maxH = walls ? R - hr : R * 1.15;
  for (let i = 0; i < nHouses; i++) {
    const ring = Math.sqrt((i + 1) / nHouses);
    // A crowded heart spills over into new streets beyond it, outside the
    // walls if it has them.
    const pos = find(rngH, hr, { min: lm * 0.55, max: Math.max(lm, maxH * ring + hr), tries: 40 })
      ?? find(rngH, hr, { min: walls ? R + 1.2 + hr : R * 0.6, max: R * 1.75, tries: 60 });
    if (pos) items.push({ kind: 'house', sprite: 'house', x: pos.x, y: pos.y, r: hr, w: hs, chimney: i % 3 === 0, variant: rngH.int(4) });
  }

  // Fields spread outward as patchwork, more with every drained field; a
  // pasture or two for the beasts.
  const fc = cfg.fields;
  if (fc.types.includes(type)) {
    const count = (fc.base[type] ?? (place.production === 'food' ? fc.base.food : fc.base.other)) + (want.includes('fields') && place.buildings.includes('fields') ? fc.perBuilding : 0);
    const rngF = rngFor('fields');
    const pastures = cfg.pastures[type] ?? 0;
    for (let i = 0; i < count + pastures; i++) {
      const w = fc.size[0] + rngF.next() * (fc.size[1] - fc.size[0]);
      const h = w * (0.55 + rngF.next() * 0.35);
      const r = Math.hypot(w, h) * 0.42;
      const pos = find(rngF, r, { min: R * fc.ring[0] + r * 0.5, max: R * fc.ring[1] + r, tries: 50 });
      if (!pos) continue;
      const pasture = i >= count;
      fields.push({ kind: pasture ? 'pasture' : 'field', x: pos.x, y: pos.y, w, h, r, angle: Math.atan2(pos.y, pos.x) + (rngF.next() - 0.5) * 0.5, tone: rngF.int(3) });
      if (!pasture && i % 2 === 0) sites.push({ x: pos.x, y: pos.y, kind: 'field' });
    }
  }

  // Smoke rises from every third house and from the smoky trades.
  const smoke = [];
  for (const it of items) {
    if (it.kind === 'house' && it.chimney) smoke.push({ x: it.x + it.w * 0.15, y: it.y - it.w * 0.55, big: false });
    const life = it.kind === 'building' ? cfg.buildings[it.sprite]?.life ?? [] : [];
    if (life.includes('smoke')) smoke.push({ x: it.x, y: it.y - it.w * 0.6, big: true });
    if (life.includes('steam')) smoke.push({ x: it.x, y: it.y - it.w * 0.5, big: true, steam: true });
  }
  const lifeOf = (it) => (it.kind === 'building' ? cfg.buildings[it.sprite]?.life ?? [] : []);
  const boats = items.filter((it) => lifeOf(it).includes('boats')).map((it) => ({ x: it.x, y: it.y }));
  // Sheep on the downs by a pasture, horses in the paddocks by a stud.
  const herds = items.filter((it) => lifeOf(it).includes('sheep') || lifeOf(it).includes('horses'))
    .map((it) => ({ x: it.x, y: it.y + it.r * 0.6, w: it.w, horses: lifeOf(it).includes('horses') }));

  let extent = R;
  for (const it of [...items, ...fields]) extent = Math.max(extent, Math.hypot(it.x, it.y) + it.r + 1);
  // Draw back to front: what stands lower on the map overlaps what is behind it.
  items.sort((a, b) => a.y + a.r - (b.y + b.r) || a.x - b.x);
  return {
    id, radius: R, extent, items, fields, sites, smoke, boats, herds,
    walls: walls ? { r: R + 0.6 } : null,
    lanes: roadAngles, paved,
  };
}

// The nearest river (or, for a harbour, any water) to a place.
function waterPoint(world, g, rivers, lakes, place, anyWater) {
  if (anyWater && world.waterOf?.[place.id]) return world.waterOf[place.id];
  let best = null;
  for (const s of rivers) {
    const q = segNearest(place.x, place.y, s);
    const d = Math.hypot(q.x - place.x, q.y - place.y);
    if (!best || d < best.d) best = { ...q, d };
  }
  if (anyWater) {
    for (const l of lakes) {
      const a = Math.atan2((place.y - l.y) / l.ry, (place.x - l.x) / l.rx);
      const q = { x: l.x + Math.cos(a) * l.rx, y: l.y + Math.sin(a) * l.ry };
      const d = Math.hypot(q.x - place.x, q.y - place.y);
      if (!best || d < best.d) best = { ...q, d };
    }
  }
  return best;
}

// Overlap check used by tests: no two pieces of a plan share ground.
export function overlaps(plan, between = 0) {
  const all = [...plan.items, ...plan.fields];
  const out = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < all[i].r + all[j].r + between - 1e-9) out.push([all[i], all[j]]);
    }
  }
  return out;
}

export { geoOf, segDist };
