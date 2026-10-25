// What the crown can see beyond its borders. Its own towns watch the land
// around them (further from a watchtower), patrols and Temerian merchants
// abroad see as they travel, an embassy sees round a foreign capital,
// friendly realms share the ground round their towns, and a true ally or a
// spy in place shows a whole realm.
//
// The fog this leaves is kept with the cosmetic traffic in state.ambient:
// nothing in the rules of the game reads it, so it never changes outcomes.
import { pointInPolygon } from './geometry.js';
import { patrolledSet } from './military.js';
import { armyPosition } from './armies.js';
import { TEMERIA, ownerOf } from './conflict.js';

export function buildGrid(world) {
  const g = world.geography;
  const cell = world.realms?.vision.cell ?? 20;
  const [x0, y0, x1, y1] = g.bounds ?? [0, 0, g.width, g.height];
  const cols = Math.ceil((x1 - x0) / cell);
  const rows = Math.ceil((y1 - y0) / cell);
  const home = [];
  const realmCells = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * cell;
      const y = y0 + (r + 0.5) * cell;
      const i = r * cols + c;
      if (pointInPolygon(x, y, g.temeria)) home.push(i);
      for (const [rid, n] of Object.entries(g.neighbours)) {
        if (n.shapes.some((sh) => pointInPolygon(x, y, sh))) (realmCells[rid] ??= []).push(i);
      }
    }
  }
  return { cell, x0, y0, cols, rows, home, realmCells };
}

// Circles of sight plus whole realms in view. `positions` are the map
// positions of Temerian units abroad ({ kind, x, y }).
export function visionOf(state, world, positions = []) {
  const v = world.realms.vision;
  const circles = [];
  const realms = new Set();
  const patrolled = state.patrols ? patrolledSet(state, world) : new Set();
  for (const s of world.geography.settlements) {
    let r = v.home[s.type] ?? 40;
    if (state.settlements[s.id].buildings.includes('watchtower')) r = Math.max(r, v.watchtower);
    if (patrolled.has(s.id)) r += v.patrol;
    circles.push({ x: s.x, y: s.y, r });
  }
  // Our armies abroad see the country they march through; towns we have
  // taken watch the land round them as our own do.
  for (const a of state.armies ?? []) {
    if (a.side !== TEMERIA) continue;
    const p = armyPosition(world, a);
    circles.push({ x: p.x, y: p.y, r: v.army ?? 90 });
  }
  for (const s of world.foreign) {
    if (state.realms?.[s.realm]?.settlements[s.id]?.owner === TEMERIA) circles.push({ x: s.x, y: s.y, r: v.home[s.type] ?? 40 });
  }
  for (const rid of Object.keys(state.embassies ?? {})) {
    const cap = world.byId[world.realms.realms[rid]?.capital];
    if (cap) circles.push({ x: cap.x, y: cap.y, r: v.embassy });
  }
  for (const [rid, n] of Object.entries(state.neighbours ?? {})) {
    if ((state.spies?.[rid] ?? 0) > state.day) realms.add(rid);
    else if (n.stance === 'friendly' && n.relation >= v.allyAt) realms.add(rid);
    else if (n.stance === 'friendly' && n.relation >= v.friendlyAt) {
      for (const id of world.foreignByRealm[rid] ?? []) circles.push({ x: world.byId[id].x, y: world.byId[id].y, r: v.friendly });
    }
  }
  for (const p of positions) circles.push({ x: p.x, y: p.y, r: p.kind === 'export' ? v.export : v.patrol });
  return { circles, realms };
}

export function canSee(world, vision, x, y) {
  for (const c of vision.circles) if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) return true;
  for (const rid of vision.realms) {
    if (world.geography.neighbours[rid].shapes.some((sh) => pointInPolygon(x, y, sh))) return true;
  }
  return pointInPolygon(x, y, world.geography.temeria);
}

// ---- The explored map, as a bitset of grid cells in 30-bit numbers ----

const BITS = 30;

export function hasBit(bits, i) {
  return ((bits[(i / BITS) | 0] ?? 0) >> (i % BITS)) & 1;
}

function setBit(bits, i) {
  const w = (i / BITS) | 0;
  bits[w] = (bits[w] ?? 0) | (1 << (i % BITS));
}

export function newIntel(world) {
  const grid = world.grid;
  const explored = new Array(Math.ceil((grid.cols * grid.rows) / BITS)).fill(0);
  for (const i of grid.home) setBit(explored, i);
  return { explored, seen: {} };
}

// Marks newly seen ground as explored and notes how each foreign settlement
// in sight looks today, so the map can show it as last seen once the fog
// returns.
export function updateIntel(state, world, vision) {
  const intel = (state.ambient.intel ??= newIntel(world));
  const g = world.grid;
  for (const c of vision.circles) {
    const c0 = Math.max(0, Math.floor((c.x - c.r - g.x0) / g.cell));
    const c1 = Math.min(g.cols - 1, Math.floor((c.x + c.r - g.x0) / g.cell));
    const r0 = Math.max(0, Math.floor((c.y - c.r - g.y0) / g.cell));
    const r1 = Math.min(g.rows - 1, Math.floor((c.y + c.r - g.y0) / g.cell));
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const x = g.x0 + (col + 0.5) * g.cell;
        const y = g.y0 + (r + 0.5) * g.cell;
        if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) setBit(intel.explored, r * g.cols + col);
      }
    }
  }
  for (const rid of vision.realms) for (const i of g.realmCells[rid] ?? []) setBit(intel.explored, i);
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    for (const [id, s] of Object.entries(realm.settlements)) {
      const p = world.byId[id];
      if (!canSee(world, vision, p.x, p.y)) continue;
      intel.seen[id] = {
        day: state.day, realm: rid, owner: ownerOf(state, world, id), population: s.population, prosperity: s.prosperity, garrison: s.garrison,
        buildings: [...s.buildings], construction: s.construction?.building ?? null,
      };
    }
  }
  return intel;
}
