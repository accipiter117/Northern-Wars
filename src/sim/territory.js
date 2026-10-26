// Borders that follow the towns (M19). Every point of land in the North
// belongs to the town nearest it among the towns of the realm whose traced
// outline it lies in: so at the start every border is the atlas's, and when
// a town changes realm, the country round it changes with it. A realm's
// territory is the union of its towns' cells. Worked out once on a grid of
// cells per world (it never changes), and the owners per state as towns
// move.
import { pointInPolygon } from './geometry.js';
import { TEMERIA } from './conflict.js';

const cache = new WeakMap();
const CELL = 6;

function boxOf(shape) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of shape) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// The grid, the traced realm of each cell, and the town each cell belongs to.
export function territoryGrid(world) {
  let t = cache.get(world);
  if (t) return t;
  const g = world.geography;
  const [bx0, by0, bx1, by1] = g.bounds ?? [0, 0, g.width, g.height];
  const cols = Math.ceil((bx1 - bx0) / CELL);
  const rows = Math.ceil((by1 - by0) / CELL);
  // Each traced outline with its box, Temeria's first.
  const shapes = [{ realm: TEMERIA, shape: g.temeria, box: boxOf(g.temeria) }];
  for (const [rid, n] of Object.entries(g.neighbours)) for (const sh of n.shapes) shapes.push({ realm: rid, shape: sh, box: boxOf(sh) });
  // The towns as the atlas has them: Temeria's own, and each realm's.
  const base = world.base ?? { home: g.settlements, foreign: world.foreign };
  const towns = [...base.home.map((s) => ({ id: s.id, realm: TEMERIA, x: s.x, y: s.y })), ...base.foreign.map((s) => ({ id: s.id, realm: s.realm, x: s.x, y: s.y }))];
  const byRealm = {};
  towns.forEach((tw, i) => (byRealm[tw.realm] ??= []).push(i));
  const town = new Int16Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) {
    const y = by0 + (r + 0.5) * CELL;
    for (let c = 0; c < cols; c++) {
      const x = bx0 + (c + 0.5) * CELL;
      let realm = null;
      for (const s of shapes) {
        if (x < s.box.x0 || x > s.box.x1 || y < s.box.y0 || y > s.box.y1) continue;
        if (pointInPolygon(x, y, s.shape)) { realm = s.realm; break; }
      }
      const list = realm && byRealm[realm];
      if (!list) continue;
      let best = -1;
      let bd = Infinity;
      for (const i of list) {
        const d = (towns[i].x - x) ** 2 + (towns[i].y - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      town[r * cols + c] = best;
    }
  }
  t = { x0: bx0, y0: by0, cell: CELL, cols, rows, town, towns };
  cache.set(world, t);
  return t;
}

// The realm each cell belongs to now, as an index into `realms`, and which
// cells have changed realm since the atlas was drawn (-1: sea or the lands
// beyond our dealings).
export function territoryOwners(world) {
  const t = territoryGrid(world);
  if (t.ownersVersion === world.landsVersion && t.owners) return t;
  const realms = [TEMERIA, ...Object.keys(world.geography.neighbours)];
  const index = Object.fromEntries(realms.map((r, i) => [r, i]));
  const ofTown = t.towns.map((tw) => index[world.realmOf[tw.id] ?? TEMERIA] ?? -1);
  const atlas = t.towns.map((tw) => index[tw.realm] ?? -1);
  const owners = new Int8Array(t.cols * t.rows).fill(-1);
  const changed = new Uint8Array(t.cols * t.rows);
  let any = false;
  for (let i = 0; i < owners.length; i++) {
    const tw = t.town[i];
    if (tw < 0) continue;
    owners[i] = ofTown[tw];
    if (ofTown[tw] !== atlas[tw]) { changed[i] = 1; any = true; }
  }
  Object.assign(t, { owners, changed, any, realms, ownersVersion: world.landsVersion });
  return t;
}

// Who holds the land at a point of the map, by the towns.
export function territoryAt(world, x, y) {
  const t = territoryOwners(world);
  const c = Math.floor((x - t.x0) / t.cell);
  const r = Math.floor((y - t.y0) / t.cell);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return null;
  const o = t.owners[r * t.cols + c];
  return o < 0 ? null : t.realms[o];
}
