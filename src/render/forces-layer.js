// Forces and threats on the map: camps and lairs set in the terrain, rumour
// rings where something has been heard of but not seen, and banner tokens
// for every company, band, commando, raiding party and roaming pack, sized
// by strength. Close up, each token shows its men and a morale bar. Moving
// forces draw a faint line to where they are going; a chosen company shows
// its patrol road, the route it guards or how far it will ride.
import { getSprite } from './sprites.js';
import { toScreen } from './camera.js';
import { roadPath } from '../sim/world.js';
import { sideColours } from '../sim/conflict.js';
import { threatStrength, companyStrength } from '../sim/combat.js';
import { isCamp } from '../sim/threats.js';
import { targetOf, targetPos } from '../sim/forces.js';

const TOKEN = 22;
const CAMP = 30;
// Strength bands for one to five figures.
const BANDS = [40, 90, 150, 230];
// Close enough to read numbers on the tokens.
const DETAIL_ZOOM = 2.2;

export function figuresFor(strength) {
  let n = 1;
  for (const b of BANDS) if (strength >= b) n++;
  return n;
}

const tokenSize = (zoom) => TOKEN * Math.max(0.8, Math.min(1.25, Math.sqrt(zoom)));

// Where a mover stands between days: its last place plus the part of a day
// gone, toward its next waypoint.
function between(mob, speed, frac) {
  const w = mob.way?.[0];
  if (!w) return { x: mob.x, y: mob.y };
  const d = Math.hypot(w.x - mob.x, w.y - mob.y);
  if (!d) return { x: mob.x, y: mob.y };
  const t = Math.min(1, (speed * frac) / d);
  return { x: mob.x + (w.x - mob.x) * t, y: mob.y + (w.y - mob.y) * t, facing: w.x >= mob.x ? 1 : -1 };
}

function companyPos(world, c, frac) {
  const f = world.forces;
  return between(c, f.baseSpeed * f.companies[c.type].speed, frac);
}

function bandPos(world, t, frac) {
  if (!t.band) return { x: t.x, y: t.y };
  return between(t.band, world.forces.threats[t.kind].speed, frac);
}

function onScreen(cam, p, pad = 40) {
  return p.x > -pad && p.y > -pad && p.x < cam.viewW + pad && p.y < cam.viewH + pad;
}

// Men and a morale bar under a token, close up.
function detail(ctx, x, y, men, morale) {
  ctx.font = '600 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(236, 224, 194, 0.9)';
  ctx.lineWidth = 3;
  const text = String(Math.round(men));
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#2b2116';
  ctx.fillText(text, x, y);
  if (morale === null || morale === undefined) return;
  const w = 20;
  ctx.fillStyle = 'rgba(43, 33, 22, 0.6)';
  ctx.fillRect(x - w / 2, y + 12, w, 3);
  ctx.fillStyle = morale > 60 ? '#5f8f3a' : morale > 35 ? '#c9a03a' : '#9a3324';
  ctx.fillRect(x - w / 2, y + 12, (w * Math.max(0, Math.min(100, morale))) / 100, 3);
}

function dashed(ctx, a, b, colour) {
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function ring(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 236, 170, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

// What a chosen company is charged with, drawn on the ground beneath it.
function drawCharge(view, state, c) {
  const { ctx, cam, world } = view;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const road = (ids, colour) => {
    ctx.beginPath();
    ids.forEach((id, i) => {
      const p = toScreen(cam, world.byId[id].x, world.byId[id].y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.strokeStyle = colour;
    ctx.lineWidth = 7;
    ctx.stroke();
  };
  const o = c.order;
  if (o.kind === 'patrol') road(roadPath(world, o.from, o.to) ?? [], 'rgba(255, 236, 170, 0.6)');
  else if (o.kind === 'escort') {
    const r = state.routes?.find((x) => x.id === o.route);
    if (r) road(roadPath(world, r.from, r.to, true) ?? [], 'rgba(255, 236, 170, 0.6)');
  } else if (o.kind === 'respond') {
    const st = world.byId[c.station];
    const p = toScreen(cam, st.x, st.y);
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, o.radius * cam.scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(35, 54, 94, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(35, 54, 94, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// Companies resting in a town stand in rows of four off its north-east side,
// so a tap on the town still means the town.
function standOff(state, c, size) {
  if (c.way.length || !c.node) return { dx: 0, dy: 0 };
  const here = state.forces.companies.filter((x) => !x.army && !x.way.length && x.node === c.node);
  const i = here.indexOf(c);
  return { dx: 22 + (i % 4) * size * 0.75, dy: -16 - Math.floor(i / 4) * size * 0.85 };
}

export function drawForces(view, state, layer) {
  const { ctx, cam, world, zoom, selection, frac } = view;
  if (!state.threats || !world.forces) return;
  const close = zoom >= DETAIL_ZOOM;
  if (layer === 'ground') {
    const chosen = selection?.company ? state.forces.companies.find((c) => c.id === selection.company) : null;
    if (chosen && !chosen.army) drawCharge(view, state, chosen);
    for (const t of state.threats.list) {
      // Rumours: something out there, roughly here.
      if (!t.sighted && !t.campSeen && t.rumour) {
        const p = toScreen(cam, t.rumour.x, t.rumour.y);
        const r = Math.max(14, t.rumour.r * cam.scale);
        if (onScreen(cam, p, r)) getSprite('marker', 'rumour').draw(ctx, p.x, p.y, r * 2, { kind: t.kind });
        continue;
      }
      if (!isCamp(t) || !t.campSeen) continue;
      const p = toScreen(cam, t.x, t.y);
      if (!onScreen(cam, p)) continue;
      const strength = threatStrength(world, { ...t, band: null });
      const level = strength < 40 ? 1 : strength < 100 ? 2 : 3;
      const size = CAMP * Math.max(0.8, Math.min(1.6, Math.sqrt(zoom))) * (0.8 + level * 0.15);
      getSprite('lair', t.kind === 'bandits' ? 'bandits' : t.terrain).draw(ctx, p.x, p.y, size, { level });
      // A lair shows what lives there, standing beside it.
      if (t.kind === 'monsters' && !t.band && t.count > 0) {
        getSprite('force', 'beasts').draw(ctx, p.x + size * 0.45, p.y + size * 0.05, tokenSize(zoom) * 0.8, { species: t.species, figures: Math.min(5, t.count) });
      }
      if (close) detail(ctx, p.x, p.y + size * 0.35, t.kind === 'monsters' ? t.count : t.men, null);
      if (selection?.threat === t.id) ring(ctx, p.x, p.y, size * 0.6);
    }
    return;
  }

  const size = tokenSize(zoom);
  // Threats out and about: bands, packs, commandos, raiders.
  for (const t of state.threats.list) {
    if (!t.band || !t.sighted) continue;
    const w = bandPos(world, t, frac);
    const p = toScreen(cam, w.x, w.y);
    if (!onScreen(cam, p)) continue;
    const strength = threatStrength(world, t);
    const facing = w.facing ?? 1;
    if (t.kind === 'monsters') {
      getSprite('force', 'beasts').draw(ctx, p.x, p.y - 6, size, { species: t.species, figures: t.band.count, facing });
    } else {
      const look = t.kind === 'raiders' ? 'raiders' : t.kind;
      const colours = t.kind === 'raiders' ? sideColours(world, t.realm) : undefined;
      getSprite('force', 'token').draw(ctx, p.x, p.y - 6, size, { look, colours, coat: colours?.[0], figures: figuresFor(strength), facing });
    }
    if (t.band.way?.length) {
      const end = t.band.way[t.band.way.length - 1];
      dashed(ctx, p, toScreen(cam, end.x, end.y), 'rgba(110, 30, 20, 0.45)');
    }
    if (close) detail(ctx, p.x, p.y + size * 0.35, t.kind === 'monsters' ? t.band.count : t.band.men, t.kind === 'monsters' ? null : t.morale);
    if (selection?.threat === t.id) ring(ctx, p.x, p.y - 6, size * 0.65);
  }
  // The crown's companies, always in sight.
  for (const c of state.forces?.companies ?? []) {
    if (c.army) continue;
    const w = companyPos(world, c, frac);
    const p = toScreen(cam, w.x, w.y);
    if (!onScreen(cam, p)) continue;
    const at = standOff(state, c, size);
    const strength = companyStrength(world, c, 'soldiers');
    if (c.way.length && c.dest) dashed(ctx, p, toScreen(cam, c.dest.x, c.dest.y), 'rgba(35, 54, 94, 0.5)');
    const target = targetOf(state, c);
    if (target && selection?.company === c.id) {
      const tp = targetPos(world, target);
      dashed(ctx, p, toScreen(cam, tp.x, tp.y), 'rgba(139, 30, 30, 0.8)');
    }
    getSprite('force', 'token').draw(ctx, p.x + at.dx, p.y - 6 + at.dy, size, {
      look: 'crown', figures: figuresFor(strength), facing: w.facing ?? 1, dim: c.routed > state.day,
    });
    if (close) detail(ctx, p.x + at.dx, p.y + size * 0.35 + at.dy, c.men, c.morale);
    if (selection?.company === c.id) ring(ctx, p.x + at.dx, p.y - 6 + at.dy, size * 0.65);
  }
}

// What lies under a finger: a company, or a threat the crown can see.
export function pickForces(view, state, sx, sy) {
  const { cam, world, zoom, frac } = view;
  if (!state.threats || !world.forces) return null;
  const size = tokenSize(zoom);
  let best = null;
  const consider = (p, hit, reach) => {
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < reach && (!best || d < best.d)) best = { d, hit };
  };
  for (const c of state.forces?.companies ?? []) {
    if (c.army) continue;
    const w = companyPos(world, c, frac);
    const p = toScreen(cam, w.x, w.y);
    const at = standOff(state, c, size);
    consider({ x: p.x + at.dx, y: p.y - 6 + at.dy }, { company: c.id }, size * (at.dx ? 0.6 : 0.8));
  }
  for (const t of state.threats.list) {
    if (t.band && t.sighted) {
      const w = bandPos(world, t, frac);
      const p = toScreen(cam, w.x, w.y);
      consider({ x: p.x, y: p.y - 6 }, { threat: t.id }, size * 0.8);
    }
    if (isCamp(t) && t.campSeen) consider(toScreen(cam, t.x, t.y), { threat: t.id }, CAMP * 0.6);
  }
  return best?.hit ?? null;
}

