// The static map: sea, neighbours, Temeria, terrain, water, roads. Drawn in
// world units under a camera transform. Terrain marks are scattered once with
// a fixed seed so the map looks the same every visit.
import { makeRng } from '../sim/rng.js';
import { pointInPolygon, centroid, bounds, pathOf, linePath } from './geometry.js';

export const COLOURS = {
  sea: '#4d6266',
  seaInk: 'rgba(225, 235, 230, 0.10)',
  neighbour: '#a99d84',
  neighbourInk: 'rgba(40, 30, 20, 0.45)',
  land: '#dccaa0',
  ink: '#2b2116',
  border: '#6e1d16',
  water: '#5f8794',
  road: '#6d4c2c',
  marsh: 'rgba(104, 112, 62, 0.28)',
  forest: 'rgba(58, 86, 44, 0.30)',
  hills: 'rgba(140, 108, 62, 0.22)',
  mountains: 'rgba(110, 96, 82, 0.35)',
};

const SPACING = { marsh: 15, forest: 11, hills: 17, mountains: 24 };

export function prepareMap(world) {
  const g = world.geography;
  const rng = makeRng(0x7e3e71a);
  const temeria = g.temeria;
  const neighbours = Object.entries(g.neighbours).map(([id, n]) => {
    const biggest = n.shapes.reduce((a, b) => (area(b) > area(a) ? b : a));
    return { id, name: n.name, paths: n.shapes.map(pathOf), label: labelSpot(biggest) };
  });

  const terrain = [];
  for (const [kind, zones] of Object.entries(g.terrain)) {
    for (const zone of zones) {
      const marks = [];
      const b = bounds(zone.shape);
      const s = SPACING[kind] ?? 16;
      for (let y = b.minY; y <= b.maxY; y += s * 0.8) {
        for (let x = b.minX; x <= b.maxX; x += s) {
          const px = x + (rng.next() - 0.5) * s * 0.8 + (Math.round(y / s) % 2) * s * 0.5;
          const py = y + (rng.next() - 0.5) * s * 0.6;
          if (pointInPolygon(px, py, zone.shape) && pointInPolygon(px, py, temeria)) {
            marks.push({ x: px, y: py, r: 0.8 + rng.next() * 0.4 });
          }
        }
      }
      marks.sort((a, b2) => a.y - b2.y);
      terrain.push({ kind, name: zone.name, path: pathOf(zone.shape), marks, label: labelSpot(zone.shape) });
    }
  }

  const rivers = Object.entries(g.rivers).map(([name, pts]) => ({ name, path: linePath(pts), label: midPoint(pts) }));
  const roads = new Path2D();
  for (const [a, b] of g.roads) {
    roads.moveTo(world.byId[a].x, world.byId[a].y);
    roads.lineTo(world.byId[b].x, world.byId[b].y);
  }

  // Faint wave strokes scattered over open water.
  const waves = [];
  for (let i = 0; i < 260; i++) {
    const x = rng.next() * g.width;
    const y = rng.next() * g.height;
    const onLand = pointInPolygon(x, y, temeria)
      || Object.values(g.neighbours).some((n) => n.shapes.some((sh) => pointInPolygon(x, y, sh)));
    if (!onLand) waves.push({ x, y });
  }

  return { temeria: pathOf(temeria), neighbours, terrain, rivers, roads, waves };
}

function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a / 2);
}

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

function midPoint(pts) {
  const i = Math.floor(pts.length / 2);
  const a = pts[i - 1] ?? pts[i];
  const b = pts[i];
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

// Draws the map in world units. `px` converts screen pixels to world units at
// the current zoom, so strokes keep a steady on-screen weight.
export function drawMap(ctx, prep, world, px) {
  const g = world.geography;
  ctx.fillStyle = COLOURS.sea;
  ctx.fillRect(-2000, -2000, g.width + 4000, g.height + 4000);

  ctx.strokeStyle = COLOURS.seaInk;
  ctx.lineWidth = 1.2 * px;
  for (const w of prep.waves) {
    ctx.beginPath();
    ctx.moveTo(w.x - 5, w.y);
    ctx.quadraticCurveTo(w.x - 2.5, w.y - 2.5, w.x, w.y);
    ctx.quadraticCurveTo(w.x + 2.5, w.y + 2.5, w.x + 5, w.y);
    ctx.stroke();
  }

  for (const n of prep.neighbours) {
    for (const p of n.paths) {
      ctx.fillStyle = COLOURS.neighbour;
      ctx.fill(p);
      ctx.strokeStyle = COLOURS.neighbourInk;
      ctx.lineWidth = 1 * px;
      ctx.stroke(p);
    }
  }

  ctx.fillStyle = COLOURS.land;
  ctx.fill(prep.temeria);

  // Terrain washes and marks, clipped to the realm.
  ctx.save();
  ctx.clip(prep.temeria);
  for (const t of prep.terrain) {
    ctx.fillStyle = COLOURS[t.kind];
    ctx.fill(t.path);
    drawMarks(ctx, t, px);
  }
  // A dark band inside the border, like an old map's hand-tinted frontier.
  ctx.strokeStyle = 'rgba(110, 29, 22, 0.22)';
  ctx.lineWidth = 10 * px;
  ctx.stroke(prep.temeria);
  ctx.restore();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of prep.rivers) {
    ctx.strokeStyle = COLOURS.water;
    ctx.lineWidth = Math.max(2.4, 1.8 * px);
    ctx.stroke(r.path);
  }
  for (const lake of g.lakes) {
    ctx.beginPath();
    ctx.ellipse(lake.x, lake.y, lake.rx, lake.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS.water;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 50, 60, 0.6)';
    ctx.lineWidth = 1 * px;
    ctx.stroke();
  }

  ctx.setLineDash([4 * px, 3 * px]);
  ctx.strokeStyle = COLOURS.road;
  ctx.lineWidth = 1.6 * px;
  ctx.stroke(prep.roads);
  ctx.setLineDash([]);

  ctx.strokeStyle = COLOURS.ink;
  ctx.lineWidth = 2.2 * px;
  ctx.stroke(prep.temeria);
}

function drawMarks(ctx, t, px) {
  ctx.lineWidth = Math.min(1.1, 1 * px);
  ctx.strokeStyle = 'rgba(43, 33, 22, 0.55)';
  for (const m of t.marks) {
    const r = m.r;
    ctx.beginPath();
    if (t.kind === 'forest') {
      ctx.moveTo(m.x, m.y + 2 * r);
      ctx.lineTo(m.x, m.y + 4.5 * r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.6 * r, 0, Math.PI * 2);
      ctx.fillStyle = '#5d7445';
      ctx.fill();
      ctx.stroke();
    } else if (t.kind === 'marsh') {
      ctx.moveTo(m.x - 4 * r, m.y);
      ctx.lineTo(m.x + 4 * r, m.y);
      for (const dx of [-2, 0, 2]) {
        ctx.moveTo(m.x + dx * r, m.y);
        ctx.lineTo(m.x + dx * 1.6 * r, m.y - (dx ? 3.5 : 5) * r);
      }
      ctx.stroke();
    } else if (t.kind === 'hills') {
      ctx.arc(m.x, m.y + 3 * r, 6 * r, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (t.kind === 'mountains') {
      // Lit from the upper left, so the right flank is in shadow.
      const h = 10 * r;
      const w = 8 * r;
      ctx.moveTo(m.x - w, m.y + h / 2);
      ctx.lineTo(m.x, m.y - h / 2);
      ctx.lineTo(m.x + w, m.y + h / 2);
      ctx.closePath();
      ctx.fillStyle = '#b8a888';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - h / 2);
      ctx.lineTo(m.x + w, m.y + h / 2);
      ctx.lineTo(m.x + w * 0.15, m.y + h / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(60, 48, 36, 0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m.x - w, m.y + h / 2);
      ctx.lineTo(m.x, m.y - h / 2);
      ctx.lineTo(m.x + w, m.y + h / 2);
      ctx.stroke();
    }
  }
}
