// The static map: sea, the lands (Temeria, the realms, the lands beyond),
// terrain, rivers, lakes, scattered copses and stones, and the roads. Drawn
// in world units under a camera transform, by tiles (see tiles.js), so each
// piece knows its bounding box and is skipped when it lies outside the tile.
// Marks are scattered once with a fixed seed so the map looks the same on
// every visit.
import { makeRng } from '../sim/rng.js';
import { pointInPolygon, centroid, bounds, pathOf, linePath } from './geometry.js';

export const COLOURS = {
  sea: '#4d6266',
  seaInk: 'rgba(225, 235, 230, 0.10)',
  neighbour: '#cdbf9b',
  beyond: '#d2c8ab',
  neighbourInk: 'rgba(40, 30, 20, 0.45)',
  land: '#dccaa0',
  ink: '#2b2116',
  border: '#6e1d16',
  water: '#5f8794',
  waterLight: 'rgba(190, 214, 216, 0.45)',
  shore: 'rgba(214, 196, 150, 0.85)',
  road: '#6d4c2c',
  marsh: 'rgba(104, 112, 62, 0.28)',
  forest: 'rgba(58, 86, 44, 0.30)',
  hills: 'rgba(140, 108, 62, 0.22)',
  mountains: 'rgba(110, 96, 82, 0.35)',
};

// The great rivers run widest.
const MAIN_RIVERS = new Set(['Pontar', 'Yaruga']);

function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a / 2);
}

const boxOf = (poly, pad = 0) => {
  const b = bounds(poly);
  return { x0: b.minX - pad, y0: b.minY - pad, x1: b.maxX + pad, y1: b.maxY + pad };
};
const boxOfPoints = (pts, pad = 0) => boxOf(pts, pad);
export const overlaps = (a, b) => a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;

function labelSpot(poly) {
  const c = centroid(poly);
  if (pointInPolygon(c.x, c.y, poly)) return c;
  // Concave shapes: fall back to the middle of the bounding box's widest inside run.
  const b = bounds(poly);
  const y = (b.minY + b.maxY) / 2;
  let best = null;
  for (let x = b.minX; x <= b.maxX; x += 4) if (pointInPolygon(x, y, poly)) best = best ?? { x, y };
  return best ?? c;
}

function nearSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function prepareMap(world) {
  const g = world.geography;
  const rng = makeRng(0x7e3e71a);
  const temeria = g.temeria;
  const landShapes = [temeria, ...Object.values(g.neighbours).flatMap((n) => n.shapes), ...Object.values(g.lands ?? {}).flatMap((n) => n.shapes)];
  const onLand = (x, y) => landShapes.some((sh) => pointInPolygon(x, y, sh));
  const lands = [
    ...Object.entries(g.neighbours).map(([id, n]) => ({ id, n, beyond: false })),
    ...Object.entries(g.lands ?? {}).map(([id, n]) => ({ id, n, beyond: true })),
  ].map(({ id, n, beyond }) => {
    const biggest = n.shapes.reduce((a, b) => (area(b) > area(a) ? b : a));
    return { id, name: n.name, beyond, paths: n.shapes.map(pathOf), label: labelSpot(biggest), boxes: n.shapes.map((sh) => boxOf(sh)), size: Math.sqrt(area(biggest)) };
  });
  // Temeria's own country stays inside Temeria; the atlas's country abroad
  // runs over whatever land it covers, borders or none, but never the sea.
  const ownShapes = (realm) => (realm ? landShapes : [temeria]);

  const terrain = [];
  for (const [kind, zones] of Object.entries(g.terrain)) {
    for (const zone of zones) {
      const own = ownShapes(zone.realm);
      const inside = (x, y) => pointInPolygon(x, y, zone.shape) && own.some((sh) => pointInPolygon(x, y, sh));
      const b = bounds(zone.shape);
      const marks = [];
      // How big the country is decides how big its marks are: a great range
      // has great peaks.
      const size = Math.max(0.8, Math.min(2.2, Math.sqrt(area(zone.shape)) / 90));
      if (kind === 'forest') {
        // Trees in clumps, a few to a clump, with clearings between.
        for (let y = b.minY; y <= b.maxY; y += 15) {
          for (let x = b.minX; x <= b.maxX; x += 17) {
            const cx = x + (rng.next() - 0.5) * 10;
            const cy = y + (rng.next() - 0.5) * 8;
            const n = 2 + rng.int(4);
            for (let i = 0; i < n; i++) {
              const tx = cx + (rng.next() - 0.5) * 12;
              const ty = cy + (rng.next() - 0.5) * 9;
              if (inside(tx, ty)) marks.push({ x: tx, y: ty, r: 0.75 + rng.next() * 0.45, d: rng.next() });
            }
          }
        }
      } else if (kind === 'mountains') {
        const s = 20 * size * 0.8;
        for (let y = b.minY; y <= b.maxY; y += s * 0.7) {
          for (let x = b.minX; x <= b.maxX; x += s) {
            const px = x + (rng.next() - 0.5) * s * 0.7 + (Math.round(y / s) % 2) * s * 0.5;
            const py = y + (rng.next() - 0.5) * s * 0.5;
            if (inside(px, py)) marks.push({ x: px, y: py, r: size * (0.7 + rng.next() * 0.5), d: rng.next() });
          }
        }
      } else {
        const s = kind === 'hills' ? 17 : 14;
        for (let y = b.minY; y <= b.maxY; y += s * 0.8) {
          for (let x = b.minX; x <= b.maxX; x += s) {
            const px = x + (rng.next() - 0.5) * s * 0.8 + (Math.round(y / s) % 2) * s * 0.5;
            const py = y + (rng.next() - 0.5) * s * 0.6;
            if (inside(px, py)) marks.push({ x: px, y: py, r: 0.8 + rng.next() * 0.4, d: rng.next(), pool: kind === 'marsh' && rng.chance(0.35) });
          }
        }
      }
      // Back to front, so nearer peaks and trees overlap those behind.
      marks.sort((a, c) => a.y - c.y);
      terrain.push({
        kind, name: zone.name, realm: zone.realm ?? null, shape: zone.shape, path: pathOf(zone.shape), marks, label: labelSpot(zone.shape), size,
        clip: own.map(pathOf), box: boxOf(zone.shape, 30 * size),
      });
    }
  }

  // Rivers run from source to mouth, widening as they go. The mouth is the
  // end that meets the sea or another river.
  const rivers = [];
  const riverPts = Object.entries(g.rivers).map(([name, pts]) => ({ name, pts }));
  for (const { name, pts } of riverPts) {
    const toWater = ([x, y]) => {
      if (!onLand(x, y)) return 0;
      let d = 60;
      for (const o of riverPts) {
        if (o.name === name) continue;
        for (let i = 1; i < o.pts.length; i++) d = Math.min(d, nearSegment(x, y, o.pts[i - 1][0], o.pts[i - 1][1], o.pts[i][0], o.pts[i][1]));
      }
      for (const l of g.lakes ?? []) d = Math.min(d, Math.max(0, Math.hypot(x - l.x, y - l.y) - Math.max(l.rx, l.ry)));
      return d;
    };
    const ordered = toWater(pts[0]) < toWater(pts.at(-1)) ? [...pts].reverse() : pts;
    const main = MAIN_RIVERS.has(name);
    rivers.push({ name, main, pts: ordered, path: linePath(ordered), box: boxOfPoints(ordered, 10), from: main ? 1.4 : 0.7, to: main ? 4.4 : 2.4 });
  }

  const lakes = (g.lakes ?? []).map((l) => ({ ...l, box: { x0: l.x - l.rx - 6, y0: l.y - l.ry - 6, x1: l.x + l.rx + 6, y1: l.y + l.ry + 6 } }));

  const roadSegs = (list, byId) => list.map(([a, b]) => ({ a: byId(a), b: byId(b) })).filter((s) => s.a && s.b)
    .map((s) => ({ ...s, box: { x0: Math.min(s.a.x, s.b.x) - 4, y0: Math.min(s.a.y, s.b.y) - 4, x1: Math.max(s.a.x, s.b.x) + 4, y1: Math.max(s.a.y, s.b.y) + 4 } }));
  const distantById = Object.fromEntries((g.distantTowns ?? []).map((t) => [t.id, t]));
  const roads = roadSegs([...g.roads, ...(g.foreignRoads ?? [])], (id) => world.byId[id] ?? distantById[id]);
  const distantRoads = roadSegs(g.distantRoads ?? [], (id) => distantById[id] ?? world.byId[id]);

  // Scattered life on open land: a copse, a lone peak, a ring of standing
  // stones; never on a town, a road or a river.
  const places = [...g.settlements, ...(world.foreign ?? []), ...(g.distantTowns ?? [])];
  const allRoads = [...roads, ...distantRoads];
  const scatter = [];
  const [bx0, by0, bx1, by1] = g.bounds ?? [0, 0, g.width, g.height];
  for (let y = by0; y < by1; y += 34) {
    for (let x = bx0; x < bx1; x += 34) {
      const px = x + rng.next() * 34;
      const py = y + rng.next() * 34;
      const roll = rng.next();
      if (roll > 0.42 || !onLand(px, py)) continue;
      if (terrain.some((t) => t.box.x0 < px && t.box.x1 > px && t.box.y0 < py && t.box.y1 > py && pointInPolygon(px, py, t.shape))) continue;
      if (places.some((p) => Math.hypot(p.x - px, p.y - py) < 32)) continue;
      if (allRoads.some((s) => nearSegment(px, py, s.a.x, s.a.y, s.b.x, s.b.y) < 9)) continue;
      if (rivers.some((r) => r.pts.some((q, i) => i && nearSegment(px, py, r.pts[i - 1][0], r.pts[i - 1][1], q[0], q[1]) < 9))) continue;
      const kind = roll < 0.27 ? 'copse' : roll < 0.37 ? 'peak' : 'stones';
      scatter.push({ kind, x: px, y: py, r: 0.8 + rng.next() * 0.4, n: 3 + rng.int(3), seed: rng.next() });
    }
  }
  scatter.sort((a, b) => a.y - b.y);

  // Faint wave strokes scattered over open water.
  const waves = [];
  for (let i = 0; i < 1400; i++) {
    const x = bx0 + rng.next() * (bx1 - bx0);
    const y = by0 + rng.next() * (by1 - by0);
    if (!onLand(x, y)) waves.push({ x, y });
  }

  const landClip = new Path2D();
  for (const sh of landShapes) landClip.addPath(pathOf(sh));
  const [mx0, my0, mx1, my1] = g.bounds ?? [0, 0, g.width, g.height];
  return { landClip, bounds: { x0: mx0, y0: my0, x1: mx1, y1: my1 }, temeria: pathOf(temeria), temeriaBox: boxOf(temeria), neighbours: lands.filter((l) => !l.beyond), lands, terrain, rivers, lakes, roads, distantRoads, scatter, waves };
}

// Draws the map in world units. `px` converts screen pixels to world units at
// the current zoom, so strokes keep a steady on-screen weight. `view` is the
// world rectangle being drawn (a tile), and `detail` (0 far, 1, 2 close) how
// many marks to draw.
// Borders that follow the towns (M19): the land that has changed realm,
// by owner, as cells; the ground near it where the atlas's old border must
// not show; and the new borders as smoothed lines. Built once each time
// towns change realm.
const territoryCache = new WeakMap();
export function territoryPaths(t) {
  let out = territoryCache.get(t);
  if (out && out.version === t.ownersVersion) return out;
  out = { version: t.ownersVersion, fills: {}, hide: new Path2D(), borders: [], any: t.any };
  if (t.any) {
    const { cols, rows, cell, x0, y0, owners, changed } = t;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!changed[i]) continue;
        const o = t.realms[owners[i]];
        const path = (out.fills[o] ??= new Path2D());
        path.rect(x0 + c * cell - 0.3, y0 + r * cell - 0.3, cell + 0.6, cell + 0.6);
        // Reach into the shore cells, so the coastline (clipped to the
        // land) comes out clean.
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || owners[rr * cols + cc] >= 0) continue;
          path.rect(x0 + cc * cell - 0.3, y0 + rr * cell - 0.3, cell + 0.6, cell + 0.6);
        }
        out.hide.rect(x0 + (c - 1) * cell, y0 + (r - 1) * cell, cell * 3, cell * 3);
      }
    }
    // Edges between cells of different owners, where either has changed.
    const edges = [];
    const differs = (a, b) => owners[a] >= 0 && owners[b] >= 0 && owners[a] !== owners[b] && (changed[a] || changed[b]);
    const V = (r, c) => r * (cols + 1) + c;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 1 < cols && differs(i, i + 1)) edges.push([V(r, c + 1), V(r + 1, c + 1)]);
        if (r + 1 < rows && differs(i, i + cols)) edges.push([V(r + 1, c), V(r + 1, c + 1)]);
      }
    }
    const at = new Map();
    edges.forEach(([a, b], k) => {
      (at.get(a) ?? at.set(a, []).get(a)).push(k);
      (at.get(b) ?? at.set(b, []).get(b)).push(k);
    });
    const used = new Uint8Array(edges.length);
    const point = (v) => [x0 + (v % (cols + 1)) * cell, y0 + Math.floor(v / (cols + 1)) * cell];
    const walk = (start, from) => {
      const chain = [];
      let v = from;
      let k = start;
      for (;;) {
        used[k] = 1;
        const next = edges[k][0] === v ? edges[k][1] : edges[k][0];
        chain.push(next);
        const more = (at.get(next) ?? []).filter((e) => !used[e]);
        if (more.length !== 1 || (at.get(next) ?? []).length > 2) break;
        v = next;
        k = more[0];
      }
      return chain;
    };
    for (let k = 0; k < edges.length; k++) {
      if (used[k]) continue;
      const [a, b] = edges[k];
      const fwd = walk(k, a);
      used[k] = 0;
      const back = (at.get(a) ?? []).filter((e) => e !== k && !used[e]).length === 1 && (at.get(a) ?? []).length <= 2
        ? walk((at.get(a)).find((e) => e !== k && !used[e]), a) : [];
      used[k] = 1;
      const chain = [...back.reverse(), a, ...fwd].map(point);
      out.borders.push(chaikin(chaikin(chain)));
    }
  }
  territoryCache.set(t, out);
  return out;
}

// Corner cutting: the grid's steps become a gentle line.
function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  out.push(pts.at(-1));
  return out;
}

export function drawMap(ctx, prep, world, px, tints = {}, view = null, detail = 2, territory = null) {
  const land = territory?.any ? territoryPaths(territory) : null;
  const g = world.geography;
  const seen = (box) => !view || overlaps(box, view);
  const v = view ?? (() => {
    const [bx0, by0, bx1, by1] = g.bounds ?? [0, 0, g.width, g.height];
    return { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  })();
  ctx.fillStyle = COLOURS.sea;
  ctx.fillRect(v.x0 - 10, v.y0 - 10, v.x1 - v.x0 + 20, v.y1 - v.y0 + 20);

  ctx.strokeStyle = COLOURS.seaInk;
  ctx.lineWidth = 1.2 * px;
  for (const w of prep.waves) {
    if (w.x < v.x0 - 6 || w.x > v.x1 + 6 || w.y < v.y0 - 4 || w.y > v.y1 + 4) continue;
    ctx.beginPath();
    ctx.moveTo(w.x - 5, w.y);
    ctx.quadraticCurveTo(w.x - 2.5, w.y - 2.5, w.x, w.y);
    ctx.quadraticCurveTo(w.x + 2.5, w.y + 2.5, w.x + 5, w.y);
    ctx.stroke();
  }

  for (const n of prep.lands) {
    n.paths.forEach((p, i) => {
      if (!seen(n.boxes[i])) return;
      ctx.fillStyle = n.beyond ? COLOURS.beyond : COLOURS.neighbour;
      ctx.fill(p);
      if (tints[n.id]) {
        ctx.fillStyle = tints[n.id];
        ctx.fill(p);
      }
      ctx.strokeStyle = COLOURS.neighbourInk;
      ctx.lineWidth = 1 * px;
      // The lands beyond our dealings are drawn with a broken line.
      if (n.beyond) ctx.setLineDash([5 * px, 4 * px]);
      ctx.stroke(p);
      ctx.setLineDash([]);
    });
  }

  if (seen(prep.temeriaBox)) {
    ctx.fillStyle = COLOURS.land;
    ctx.fill(prep.temeria);
  }
  // Land that has changed realm takes its new master's look (M19), never
  // over the sea.
  if (land) {
    ctx.save();
    ctx.clip(prep.landClip);
    for (const [owner, path] of Object.entries(land.fills)) {
      ctx.fillStyle = owner === 'temeria' ? COLOURS.land : COLOURS.neighbour;
      ctx.fill(path);
      if (owner !== 'temeria' && tints[owner]) {
        ctx.fillStyle = tints[owner];
        ctx.fill(path);
      }
    }
    ctx.restore();
  }

  // Terrain, each zone clipped to its own land. Temeria's frontier band goes
  // over its own country.
  for (const t of prep.terrain) {
    if (!seen(t.box)) continue;
    ctx.save();
    if (t.clip.length === 1) ctx.clip(t.clip[0]);
    else {
      const all = new Path2D();
      for (const c of t.clip) all.addPath(c);
      ctx.clip(all);
    }
    drawZone(ctx, t, px, v, detail);
    ctx.restore();
  }
  if (seen(prep.temeriaBox)) {
    ctx.save();
    ctx.clip(prep.temeria);
    if (land) clipOut(ctx, land, prep);
    // A dark band inside the border, like an old map's hand-tinted frontier.
    ctx.strokeStyle = 'rgba(110, 29, 22, 0.22)';
    ctx.lineWidth = 10 * px;
    ctx.stroke(prep.temeria);
    ctx.restore();
  }

  if (detail > 0) drawScatter(ctx, prep, px, v, detail);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of prep.rivers) {
    if (!seen(r.box)) continue;
    drawRiver(ctx, r, px);
  }
  for (const lake of prep.lakes) {
    if (!seen(lake.box)) continue;
    // A sandy shore, the water, a lighter shallows ring, an ink edge.
    ctx.beginPath();
    ctx.ellipse(lake.x, lake.y, lake.rx + 2.5, lake.ry + 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS.shore;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(lake.x, lake.y, lake.rx, lake.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS.water;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 50, 60, 0.6)';
    ctx.lineWidth = 1 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(lake.x, lake.y, Math.max(1, lake.rx - 3), Math.max(1, lake.ry - 2.5), 0, 0, Math.PI * 2);
    ctx.strokeStyle = COLOURS.waterLight;
    ctx.lineWidth = Math.max(1, 1.4 * px);
    ctx.stroke();
  }

  ctx.setLineDash([4 * px, 3 * px]);
  ctx.strokeStyle = COLOURS.road;
  ctx.lineWidth = 1.6 * px;
  ctx.beginPath();
  for (const s of prep.roads) {
    if (!seen(s.box)) continue;
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
  }
  ctx.stroke();
  // Roads in the lands beyond, fainter: we know of them, no more.
  ctx.strokeStyle = 'rgba(109, 76, 44, 0.5)';
  ctx.lineWidth = 1.2 * px;
  ctx.beginPath();
  for (const s of prep.distantRoads) {
    if (!seen(s.box)) continue;
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (seen(prep.temeriaBox)) {
    ctx.save();
    if (land) clipOut(ctx, land, prep);
    ctx.strokeStyle = COLOURS.ink;
    ctx.lineWidth = 2.2 * px;
    ctx.stroke(prep.temeria);
    ctx.restore();
  }
  // The borders as the towns now draw them.
  if (land) {
    ctx.save();
    ctx.clip(prep.landClip);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const line of land.borders) {
      const p = new Path2D();
      p.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) p.lineTo(line[i][0], line[i][1]);
      ctx.strokeStyle = 'rgba(110, 29, 22, 0.22)';
      ctx.lineWidth = 7 * px;
      ctx.stroke(p);
      ctx.strokeStyle = COLOURS.ink;
      ctx.lineWidth = 1.8 * px;
      ctx.stroke(p);
    }
    ctx.restore();
  }
}

// Leave out the ground round changed land, where the atlas's border no
// longer runs.
function clipOut(ctx, land, prep) {
  const p = new Path2D();
  p.rect(prep.bounds.x0 - 50, prep.bounds.y0 - 50, prep.bounds.x1 - prep.bounds.x0 + 100, prep.bounds.y1 - prep.bounds.y0 + 100);
  p.addPath(land.hide);
  ctx.clip(p, 'evenodd');
}

// A river widening from its source to its mouth, drawn a stretch at a time.
function drawRiver(ctx, r, px) {
  const pts = r.pts;
  let total = 0;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(total);
  }
  ctx.strokeStyle = COLOURS.water;
  const least = (r.main ? 2.2 : 1.4) * px;
  for (let i = 1; i < pts.length; i++) {
    const t = (lens[i - 1] + lens[i]) / 2 / (total || 1);
    ctx.lineWidth = Math.max(least, r.from + (r.to - r.from) * t);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
}

function drawZone(ctx, t, px, v, detail) {
  ctx.fillStyle = COLOURS[t.kind];
  ctx.fill(t.path);
  if (t.kind === 'forest') {
    // Darker woods at the edge, as an engraver hatches a forest's rim.
    ctx.strokeStyle = 'rgba(40, 62, 30, 0.35)';
    ctx.lineWidth = 7;
    ctx.stroke(t.path);
  } else if (t.kind === 'marsh') {
    ctx.strokeStyle = 'rgba(80, 96, 60, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke(t.path);
  }
  // Pulled back, only some of the marks: enough to read the country.
  const keep = detail >= 2 ? 1 : detail === 1 ? 0.6 : 0.3;
  ctx.lineWidth = Math.min(1.1, 1 * px);
  ctx.strokeStyle = 'rgba(43, 33, 22, 0.55)';
  for (const m of t.marks) {
    if (m.d > keep) continue;
    const pad = 12 * m.r * (t.size ?? 1);
    if (m.x < v.x0 - pad || m.x > v.x1 + pad || m.y < v.y0 - pad || m.y > v.y1 + pad) continue;
    if (t.kind === 'forest') tree(ctx, m.x, m.y, m.r);
    else if (t.kind === 'marsh') {
      if (m.pool) {
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, 4 * m.r, 1.8 * m.r, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(95, 135, 148, 0.55)';
        ctx.fill();
      } else {
        const r = m.r;
        ctx.beginPath();
        ctx.moveTo(m.x - 4 * r, m.y);
        ctx.lineTo(m.x + 4 * r, m.y);
        for (const dx of [-2, 0, 2]) {
          ctx.moveTo(m.x + dx * r, m.y);
          ctx.lineTo(m.x + dx * 1.6 * r, m.y - (dx ? 3.5 : 5) * r);
        }
        ctx.stroke();
      }
    } else if (t.kind === 'hills') mound(ctx, m.x, m.y, m.r);
    else if (t.kind === 'mountains') peak(ctx, m.x, m.y, m.r);
  }
}

// A treetop: a dark trunk stub and a round crown, darker at its edge.
function tree(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + 2 * r);
  ctx.lineTo(x, y + 4.5 * r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 3.6 * r, 0, Math.PI * 2);
  ctx.fillStyle = '#5d7445';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - 1 * r, y - 1 * r, 1.6 * r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(160, 182, 120, 0.35)';
  ctx.fill();
}

// A soft mound, lit on its left flank.
function mound(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - 7 * r, y + 3 * r);
  ctx.quadraticCurveTo(x, y - 6 * r, x + 7 * r, y + 3 * r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(176, 146, 98, 0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 1.5 * r);
  ctx.quadraticCurveTo(x + 4 * r, y, x + 7 * r, y + 3 * r);
  ctx.lineTo(x + 1 * r, y + 3 * r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(90, 70, 44, 0.25)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 7 * r, y + 3 * r);
  ctx.quadraticCurveTo(x, y - 6 * r, x + 7 * r, y + 3 * r);
  ctx.stroke();
}

// A peak lit from the upper left, so the right flank is in shadow, with a
// cap of snow on the tallest.
function peak(ctx, x, y, r) {
  const h = 11 * r;
  const w = 8 * r;
  ctx.beginPath();
  ctx.moveTo(x - w, y + h / 2);
  ctx.lineTo(x, y - h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = '#b8a888';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w * 0.15, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(60, 48, 36, 0.45)';
  ctx.fill();
  if (r > 1.3) {
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x - w * 0.3, y - h / 2 + h * 0.3);
    ctx.lineTo(x + w * 0.05, y - h / 2 + h * 0.22);
    ctx.lineTo(x + w * 0.3, y - h / 2 + h * 0.3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 240, 228, 0.85)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x - w, y + h / 2);
  ctx.lineTo(x, y - h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
}

function drawScatter(ctx, prep, px, v, detail) {
  ctx.lineWidth = Math.min(1.1, 1 * px);
  ctx.strokeStyle = 'rgba(43, 33, 22, 0.55)';
  for (const s of prep.scatter) {
    if (s.x < v.x0 - 15 || s.x > v.x1 + 15 || s.y < v.y0 - 15 || s.y > v.y1 + 15) continue;
    if (detail < 2 && s.kind === 'stones') continue;
    if (s.kind === 'copse') {
      for (let i = 0; i < s.n; i++) {
        const a = s.seed * 6.28 + i * 2.1;
        tree(ctx, s.x + Math.cos(a) * 5, s.y + Math.sin(a) * 3.5, s.r * 0.75);
      }
    } else if (s.kind === 'peak') {
      mound(ctx, s.x, s.y, s.r * 0.9);
    } else {
      // A ring of standing stones.
      ctx.fillStyle = '#9a917e';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = s.x + Math.cos(a) * 4.5;
        const y = s.y + Math.sin(a) * 2.6;
        ctx.fillRect(x - 0.6, y - 1.8, 1.2, 2.4);
      }
    }
  }
}
