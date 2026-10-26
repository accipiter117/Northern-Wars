// War on the map (M19), drawn in screen pixels: a battle in progress (two
// banners facing, figures clashing, each side's numbers above it, dust and
// smoke, the broken side fleeing), a siege camp (tents and works round the
// town, its walls drawn as they stand, smoke where they are breached),
// smoke over a sacked town, and rebel banners over a town in revolt. All
// motion comes from the clock, so the map stays still while paused.

const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const now = () => (reduce ? 0 : performance.now() / 1000);

function puff(ctx, x, y, r, alpha, tint = '120, 110, 96') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${tint}, ${alpha})`);
  g.addColorStop(1, `rgba(${tint}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function banner(ctx, x, y, h, [field, charge], facing, wave = 0) {
  ctx.strokeStyle = '#2b2116';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  const w = h * 0.55 * facing;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + w * 0.5, y - h - 2 + wave, x + w, y - h + 1);
  ctx.lineTo(x + w, y - h * 0.6 + 1);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.6 - 2 + wave, x, y - h * 0.6);
  ctx.closePath();
  ctx.fillStyle = field;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 20, 10, 0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = charge;
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y - h * 0.8, h * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function figure(ctx, x, y, s, colour, lean = 0) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x + lean, y - s * 1.7, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.45, y);
  ctx.lineTo(x + lean - s * 0.4, y - s * 1.3);
  ctx.lineTo(x + lean + s * 0.4, y - s * 1.3);
  ctx.lineTo(x + s * 0.45, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 30, 20, 0.85)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x + lean, y - s * 1.2);
  ctx.lineTo(x + lean + s * 1.1, y - s * 1.9);
  ctx.stroke();
}

function count(ctx, x, y, n, colour) {
  const text = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
  ctx.font = '600 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(245, 236, 214, 0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

// A battle: `men` is each side's strength now, `over` how it ended (with
// the day it ended), `size` the scale in pixels.
export function drawBattle(ctx, x, y, size, { colours, men, phase, over, loser, seed = 0 }) {
  const t = now() + seed;
  const gap = size * (phase === 'skirmish' ? 0.9 : 0.42);
  // Dust over the field, thicker in the melee.
  const dust = phase === 'skirmish' ? 0.18 : 0.32;
  for (let k = 0; k < 5; k++) {
    const a = t * 0.6 + k * 1.3;
    puff(ctx, x + Math.sin(a) * size * 0.35, y - size * 0.15 + Math.cos(a * 0.8) * size * 0.12, size * (0.28 + 0.06 * Math.sin(a * 1.7)), dust * (over ? 0.5 : 1));
  }
  for (const i of [0, 1]) {
    const side = i === 0 ? -1 : 1;
    const fleeing = over && loser === i;
    const off = fleeing ? side * size * (0.5 + 0.25 * Math.sin(t)) : 0;
    const bx = x + side * (gap + size * 0.25) + off;
    const facing = fleeing ? side : -side;
    ctx.globalAlpha = fleeing ? 0.55 : 1;
    banner(ctx, bx, y + size * 0.1, size * 0.62, colours[i], facing, Math.sin(t * 3 + i) * 1.5);
    const n = Math.max(1, Math.min(5, Math.ceil(men[i] / 500)));
    for (let k = 0; k < n; k++) {
      const fx = x + side * (gap * 0.55 + (k % 3) * size * 0.12) + off;
      const fy = y + size * 0.12 + Math.floor(k / 3) * size * 0.1;
      const strike = phase === 'melee' && !over ? Math.sin(t * 6 + k + i * 2) * size * 0.04 : 0;
      figure(ctx, fx, fy, size * 0.09, colours[i][0], -side * strike * (fleeing ? -1 : 1));
    }
    ctx.globalAlpha = 1;
    count(ctx, bx, y - size * 0.62, men[i], colours[i][0]);
  }
  // Arrows in the skirmish, steel glinting in the melee.
  if (!over && phase === 'skirmish') {
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.6)';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) {
      const p = (t * 0.8 + k * 0.25) % 1;
      const ax = x - gap + p * gap * 2;
      const ay = y - size * 0.35 - Math.sin(p * Math.PI) * size * 0.25;
      ctx.beginPath();
      ctx.moveTo(ax - 3, ay + 1);
      ctx.lineTo(ax + 3, ay - 1);
      ctx.stroke();
    }
  }
}

// A siege camp round a town of radius `r`: tents by the besiegers' number,
// works between them, the walls drawn as they stand, smoke when breached.
export function drawSiege(ctx, x, y, r, { colours, men, walls, wallsMax, breached, seed = 0 }) {
  const t = now() + seed;
  if (wallsMax > 0) {
    const share = walls / wallsMax;
    ctx.strokeStyle = wallsMax >= 80 ? 'rgba(90, 82, 70, 0.9)' : 'rgba(110, 76, 40, 0.9)';
    ctx.lineWidth = (wallsMax >= 80 ? 3 : 2.2) * Math.max(1, r / 30);
    // Gaps in the ring where the works have brought the walls down.
    const pieces = 12;
    for (let k = 0; k < pieces; k++) {
      const standing = ((k * 7 + 3) % pieces) / pieces < share;
      if (!standing) continue;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.95, (k / pieces) * Math.PI * 2 + 0.05, ((k + 1) / pieces) * Math.PI * 2 - 0.05);
      ctx.stroke();
    }
  }
  const tents = Math.max(6, Math.min(12, Math.round(men / 300)));
  const ts = Math.max(4, r * 0.14);
  for (let k = 0; k < tents; k++) {
    const a = (k / tents) * Math.PI * 2 + 0.3;
    const tx = x + Math.cos(a) * r * 1.25;
    const ty = y + Math.sin(a) * r * 1.05;
    ctx.fillStyle = k % 3 === 0 ? colours[0] : 'rgba(232, 222, 196, 0.95)';
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(tx - ts, ty + ts * 0.75);
    ctx.lineTo(tx, ty - ts);
    ctx.lineTo(tx + ts, ty + ts * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // The works: a dashed line of stakes between the tents and the walls.
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = 'rgba(70, 50, 30, 0.7)';
  ctx.lineWidth = Math.max(1, r / 30);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (breached) smoke(ctx, x, y - r * 0.2, r * 0.6, t);
  banner(ctx, x + r * 1.35, y + r * 0.5, Math.max(10, r * 0.55), colours, -1, Math.sin(t * 3) * 1.2);
}

// A plume of smoke, as from a burned or breached town.
export function smoke(ctx, x, y, size, t = now()) {
  for (let k = 0; k < 6; k++) {
    const p = ((t * 0.25 + k / 6) % 1);
    puff(ctx, x + Math.sin(p * 4 + k) * size * 0.2, y - p * size * 1.6, size * (0.25 + p * 0.45), 0.45 * (1 - p), '70, 64, 58');
  }
  puff(ctx, x, y, size * 0.3, 0.35, '200, 90, 40');
}

// Rebel banners over a town in revolt: the old crown's colours, torn.
export function drawRebels(ctx, x, y, size, colours, seed = 0) {
  const t = now() + seed;
  banner(ctx, x - size * 0.3, y, size, colours, 1, Math.sin(t * 3) * 1.5);
  banner(ctx, x + size * 0.35, y + 2, size * 0.8, ['#2b2116', colours[0]], -1, Math.sin(t * 3 + 1) * 1.5);
}
