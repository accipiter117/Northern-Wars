// The countryside (M23 D): the land between the towns, made busy. Fields in
// patchwork where people live (their colours follow the year), orchards,
// farmsteads and the odd windmill near the bigger places, copses and wild
// heath where few do, and a scatter of wayside shrines, ruins and old
// watchtowers. All of it is placed once, from a fixed seed, by how many
// people live near by (ours and abroad alike), and never over a road, a
// river, a lake, a town or a name; it is drawn into the map's tiles, so a
// pan or a pinch costs nothing. The tiles are drawn afresh only when the
// season turns or the land's look changes: fields burnt round a sacked
// town, bare round a hungry one, or Battery saver thinning it.
import { makeRng } from '../sim/rng.js';
import { pointInPolygon } from '../sim/geometry.js';

const STEP = 11;
const BAND = 32;
const CAP = 12000;
// How many people a foreign place stands for (their numbers are not ours
// to know exactly; the map only needs their weight).
const FOREIGN_PEOPLE = { city: 20000, town: 6000, village: 1500, castle: 800, temple: 600 };

function nearSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// A coarse grid of what lies where, so each candidate spot looks only at
// its neighbours.
const CELL = 64;
function index(items, boxOf) {
  const m = new Map();
  for (const it of items) {
    const b = boxOf(it);
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) {
      for (let cy = Math.floor(b.y0 / CELL); cy <= Math.floor(b.y1 / CELL); cy++) {
        const k = `${cx},${cy}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(it);
      }
    }
  }
  return (x, y) => m.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? [];
}
const around = (p, r) => ({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });

export function prepareCountryside(world, prep) {
  const g = world.geography;
  const rng = makeRng(0xc0a7e5);
  const ours = g.settlements.map((st) => ({ id: st.id, x: st.x, y: st.y, type: st.type, people: Object.values(world.settlementData?.[st.id]?.population ?? {}).reduce((a, b) => a + b, 0) || 1000 }));
  const theirs = (world.foreign ?? []).map((st) => ({ id: st.id, x: st.x, y: st.y, type: st.type, people: FOREIGN_PEOPLE[st.type] ?? 1500 }));
  const places = [...ours, ...theirs];
  const distant = g.distantTowns ?? [];
  // Where names are written: under every place, and the regions' and
  // lands' labels. Nothing is drawn there.
  const labels = [
    // A place's name sits below it, lower the closer the map comes (the
    // town's own ground grows round it), so the whole run is kept clear.
    ...places.map((p) => ({ x: p.x, y: p.y + (p.type === 'city' ? 34 : p.type === 'town' ? 26 : 18), w: p.type === 'city' ? 70 : 50, h: p.type === 'city' ? 40 : p.type === 'town' ? 28 : 14 })),
    ...distant.map((p) => ({ x: p.x, y: p.y + 14, w: 40, h: 10 })),
    ...prep.terrain.filter((t) => t.label).map((t) => ({ x: t.label.x, y: t.label.y, w: 70, h: 14 })),
    ...prep.lands.filter((l) => l.label).map((l) => ({ x: l.label.x, y: l.label.y, w: 90, h: 18 })),
  ];
  const landShapes = [g.temeria, ...Object.values(g.neighbours).flatMap((n) => n.shapes), ...Object.values(g.lands ?? {}).flatMap((n) => n.shapes)];
  const onLand = (x, y) => landShapes.some((sh) => pointInPolygon(x, y, sh));
  const roads = [...prep.roads, ...prep.distantRoads];
  const riverSegs = prep.rivers.flatMap((r) => r.pts.slice(1).map((q, i) => ({ a: r.pts[i], b: q })));
  const near = {
    places: index([...places, ...distant.map((p) => ({ ...p, distant: true }))], (p) => around(p, 48)),
    labels: index(labels, (l) => ({ x0: l.x - l.w / 2 - 3, y0: l.y - l.h / 2 - 3, x1: l.x + l.w / 2 + 3, y1: l.y + l.h / 2 + 3 })),
    roads: index(roads, (s) => ({ x0: s.box.x0 - 6, y0: s.box.y0 - 6, x1: s.box.x1 + 6, y1: s.box.y1 + 6 })),
    rivers: index(riverSegs, (s) => ({ x0: Math.min(s.a[0], s.b[0]) - 7, y0: Math.min(s.a[1], s.b[1]) - 7, x1: Math.max(s.a[0], s.b[0]) + 7, y1: Math.max(s.a[1], s.b[1]) + 7 })),
    lakes: index(prep.lakes, (l) => ({ x0: l.x - l.rx - 6, y0: l.y - l.ry - 6, x1: l.x + l.rx + 6, y1: l.y + l.ry + 6 })),
    terrain: index(prep.terrain, (t) => t.box),
    scatter: index(prep.scatter, (m) => around(m, 9)),
    reach: index(places, (p) => around(p, 140)),
  };
  const clear = (x, y) => {
    // A place's own ground (its houses, works and fields) stays its own.
    for (const p of near.places(x, y)) if (Math.hypot(p.x - x, p.y - y) < (p.distant ? 16 : p.type === 'city' ? 46 : p.type === 'town' ? 32 : p.type === 'castle' ? 22 : 19)) return false;
    for (const l of near.labels(x, y)) if (Math.abs(l.x - x) < l.w / 2 + 3 && Math.abs(l.y - y) < l.h / 2 + 3) return false;
    for (const s of near.roads(x, y)) if (nearSegment(x, y, s.a.x, s.a.y, s.b.x, s.b.y) < 5.5) return false;
    for (const s of near.rivers(x, y)) if (nearSegment(x, y, s.a[0], s.a[1], s.b[0], s.b[1]) < 6) return false;
    for (const l of near.lakes(x, y)) if (((x - l.x) / (l.rx + 6)) ** 2 + ((y - l.y) / (l.ry + 6)) ** 2 < 1) return false;
    for (const m of near.scatter(x, y)) if (Math.hypot(m.x - x, m.y - y) < 9) return false;
    for (const t of near.terrain(x, y)) if (x > t.box.x0 && x < t.box.x1 && y > t.box.y0 && y < t.box.y1 && pointInPolygon(x, y, t.shape)) return false;
    return true;
  };
  // People within reach of a point, thinning with distance, and the place
  // whose fields these are.
  const density = (x, y) => {
    let d = 0;
    let best = null;
    let bestW = 0;
    for (const p of near.reach(x, y)) {
      const r = Math.hypot(p.x - x, p.y - y);
      if (r > 140) continue;
      const w = (p.people / 4000) * Math.exp(-r / 38);
      d += w;
      if (w > bestW) { bestW = w; best = p.id; }
    }
    return { d, town: best };
  };

  const marks = [];
  const { x0, y0, x1, y1 } = prep.bounds;
  for (let y = y0; y < y1 && marks.length < CAP; y += STEP) {
    for (let x = x0; x < x1 && marks.length < CAP; x += STEP) {
      const px = x + rng.next() * STEP;
      const py = y + rng.next() * STEP;
      const roll = rng.next();
      const seed = rng.next();
      if (!clear(px, py) || !onLand(px, py)) continue;
      const { d, town } = density(px, py);
      let kind = null;
      if (d > 0.55) {
        kind = roll < 0.62 ? 'field' : roll < 0.7 ? 'farmstead' : roll < 0.78 ? 'orchard' : roll < 0.81 && d > 1.1 ? 'windmill' : null;
      } else if (d > 0.18) {
        kind = roll < 0.4 ? 'field' : roll < 0.52 ? 'copse' : roll < 0.57 ? 'farmstead' : roll < 0.61 ? 'orchard' : roll < 0.625 ? 'poi' : roll < 0.7 ? 'wild' : null;
      } else {
        kind = roll < 0.3 ? 'wild' : roll < 0.42 ? 'copse' : roll < 0.445 ? 'poi' : roll < 0.47 ? 'field' : null;
      }
      if (!kind) continue;
      marks.push({
        kind, x: px, y: py, town, seed,
        a: (seed - 0.5) * 0.9, w: 4 + seed * 4, h: 3 + ((seed * 7) % 1) * 3,
        crop: Math.floor(((seed * 13) % 1) * 3), poi: ['shrine', 'ruin', 'tower', 'stones'][Math.floor(((seed * 29) % 1) * 4)],
      });
    }
  }
  marks.sort((a, b) => a.y - b.y);
  // Bands of rows, so a tile looks only at the marks in its own band
  // (each band keeps the back-to-front order).
  const bands = new Map();
  for (const m of marks) {
    const k = Math.floor(m.y / BAND);
    if (!bands.has(k)) bands.set(k, []);
    bands.get(k).push(m);
  }
  return { marks, bands };
}

// Field colours through the year, three crops to a season.
const FIELDS = {
  spring: ['#b9cc86', '#a8c27a', '#cbd394'],
  summer: ['#d8c06a', '#c9b45e', '#b7c272'],
  harvest: ['#d6b25a', '#c39a4e', '#bfa37a'],
  winter: ['#d9d3c2', '#cfc7b2', '#e3ddcd'],
};
const INK = 'rgba(70, 52, 30, 0.55)';

// Draw the countryside within `v` (map units). `look` = { season, snow,
// burnt: Set of towns, bare: Set of towns, thin }.
export function drawCountryside(ctx, cs, px, v, detail, look) {
  if (!cs || detail <= 0) return 0;
  let n = 0;
  const season = look.snow ? 'winter' : look.season;
  const from = Math.floor((v.y0 - 8) / BAND);
  const to = Math.floor((v.y1 + 8) / BAND);
  for (let k = from; k <= to; k++) for (const m of cs.bands?.get(k) ?? []) {
    if (m.x < v.x0 - 8 || m.x > v.x1 + 8 || m.y < v.y0 - 8 || m.y > v.y1 + 8) continue;
    // Battery saver: half the marks, the fields kept.
    if (look.thin && m.kind !== 'field' && m.seed > 0.5) continue;
    // From afar only the patchwork of fields.
    if (detail < 2 && m.kind !== 'field' && m.kind !== 'orchard') continue;
    n += 1;
    const burnt = look.burnt?.has(m.town);
    const bare = !burnt && look.bare?.has(m.town);
    if (m.kind === 'field') field(ctx, m, px, burnt ? '#5a4836' : bare ? '#d8cdb0' : FIELDS[season][m.crop], burnt, season);
    else if (m.kind === 'orchard') orchard(ctx, m, px, season, burnt);
    else if (m.kind === 'farmstead') farmstead(ctx, m, px, burnt);
    else if (m.kind === 'windmill') windmill(ctx, m, px, burnt);
    else if (m.kind === 'copse') copse(ctx, m, px, season);
    else if (m.kind === 'wild') wild(ctx, m, px, season);
    else poi(ctx, m, px);
  }
  return n;
}

function field(ctx, m, px, colour, burnt, season) {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.a);
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(-m.w / 2, -m.h / 2, m.w, m.h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = burnt ? 'rgba(40, 30, 22, 0.6)' : 'rgba(110, 90, 50, 0.35)';
  ctx.lineWidth = 0.6 * px;
  // Furrows, or the stubble after the harvest.
  ctx.beginPath();
  const step = Math.max(1, m.h / 3);
  for (let y = -m.h / 2 + step / 2; y < m.h / 2; y += step) {
    ctx.moveTo(-m.w / 2 + 0.4, y);
    ctx.lineTo(m.w / 2 - 0.4, y);
  }
  ctx.stroke();
  if (season === 'harvest' && !burnt && m.crop === 0) {
    // Sheaves stooked in the field.
    ctx.fillStyle = '#b98f3e';
    ctx.fillRect(-1, -0.6, 0.9, 1.2);
    ctx.fillRect(1, -0.6, 0.9, 1.2);
  }
  ctx.restore();
}

function tree(ctx, x, y, r, colour) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

function orchard(ctx, m, px, season, burnt) {
  const colour = burnt ? '#4a3d30' : season === 'winter' ? '#8a7a62' : season === 'spring' ? '#cfe0b8' : '#6f9a4a';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) tree(ctx, m.x - 2.4 + i * 2.4, m.y - 1.2 + j * 2.4, 0.9, colour);
  }
  if (season === 'spring' && !burnt) {
    ctx.fillStyle = '#f3e1ea';
    for (let i = 0; i < 3; i++) ctx.fillRect(m.x - 2.6 + i * 2.4, m.y - 1.6, 0.5, 0.5);
  }
  void px;
}

function farmstead(ctx, m, px, burnt) {
  ctx.fillStyle = burnt ? '#3d3229' : '#e8dcc0';
  ctx.fillRect(m.x - 1.6, m.y - 1, 3.2, 2);
  ctx.beginPath();
  ctx.moveTo(m.x - 2, m.y - 1);
  ctx.lineTo(m.x, m.y - 2.6);
  ctx.lineTo(m.x + 2, m.y - 1);
  ctx.closePath();
  ctx.fillStyle = burnt ? '#2b241e' : '#9a5a3a';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5 * px;
  ctx.stroke();
  // A barn beside it.
  ctx.fillStyle = burnt ? '#3d3229' : '#b48a5a';
  ctx.fillRect(m.x + 2.2, m.y - 0.6, 2.2, 1.6);
}

function windmill(ctx, m, px, burnt) {
  ctx.fillStyle = burnt ? '#3d3229' : '#e8dcc0';
  ctx.beginPath();
  ctx.moveTo(m.x - 1.2, m.y + 1.5);
  ctx.lineTo(m.x - 0.7, m.y - 2);
  ctx.lineTo(m.x + 0.7, m.y - 2);
  ctx.lineTo(m.x + 1.2, m.y + 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5 * px;
  ctx.stroke();
  if (burnt) return;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = m.seed * 6 + (i * Math.PI) / 2;
    ctx.moveTo(m.x, m.y - 2);
    ctx.lineTo(m.x + Math.cos(a) * 2.6, m.y - 2 + Math.sin(a) * 2.6);
  }
  ctx.strokeStyle = 'rgba(70, 52, 30, 0.8)';
  ctx.lineWidth = 0.7 * px;
  ctx.stroke();
}

function copse(ctx, m, px, season) {
  const colour = season === 'winter' ? '#7d8a6a' : season === 'harvest' ? '#8a8a46' : '#5f8a4a';
  tree(ctx, m.x, m.y, 1.4, colour);
  tree(ctx, m.x + 1.8, m.y + 0.6, 1.1, colour);
  tree(ctx, m.x - 1.5, m.y + 0.8, 1, colour);
  void px;
}

function wild(ctx, m, px, season) {
  ctx.strokeStyle = season === 'winter' ? 'rgba(120, 110, 90, 0.5)' : 'rgba(110, 120, 70, 0.55)';
  ctx.lineWidth = 0.6 * px;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(m.x + i * 1.2, m.y + 1);
    ctx.lineTo(m.x + i * 1.2 + i * 0.5, m.y - 0.6);
  }
  ctx.stroke();
}

function poi(ctx, m, px) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6 * px;
  ctx.fillStyle = '#d9cdb0';
  if (m.poi === 'shrine') {
    ctx.fillRect(m.x - 0.6, m.y - 2, 1.2, 2.4);
    ctx.beginPath();
    ctx.moveTo(m.x - 1.2, m.y - 2);
    ctx.lineTo(m.x, m.y - 3);
    ctx.lineTo(m.x + 1.2, m.y - 2);
    ctx.stroke();
  } else if (m.poi === 'tower') {
    ctx.fillRect(m.x - 1, m.y - 3, 2, 4);
    ctx.strokeRect(m.x - 1, m.y - 3, 2, 4);
  } else if (m.poi === 'ruin') {
    ctx.beginPath();
    ctx.moveTo(m.x - 2, m.y + 1);
    ctx.lineTo(m.x - 2, m.y - 1.5);
    ctx.lineTo(m.x - 0.8, m.y - 0.5);
    ctx.moveTo(m.x + 0.6, m.y + 1);
    ctx.lineTo(m.x + 0.6, m.y - 2.2);
    ctx.lineTo(m.x + 2, m.y - 1);
    ctx.stroke();
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.fillRect(m.x + Math.cos(a) * 1.8 - 0.4, m.y + Math.sin(a) * 1 - 0.9, 0.8, 1.4);
    }
  }
}
