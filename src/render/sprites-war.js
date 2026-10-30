// Placeholder art for armies on the march, battlefields and sieges. Like
// every sprite, each can be replaced by a painted image with registerImage.
import { registerPlaceholder, getSprite } from './sprites.js';

const INK = '#2b2116';

// An army: a block of soldiers in its colours behind a tall standard. The
// number of figures grows with its size; `selected` adds a gold ring.
registerPlaceholder('army', 'host', (ctx, x, y, size, opts = {}) => {
  const [field, charge] = opts.colours ?? ['#23365e', '#efe6cf'];
  const n = Math.max(1, Math.min(5, opts.figures ?? 2));
  const f = opts.facing ?? 1;
  const fig = size * 0.55;
  // A parchment shadow under the column keeps it readable over any ground.
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.32, size * 0.62, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.28)';
  ctx.fill();
  const offsets = [[0, 0], [-0.32, 0.1], [0.32, 0.1], [-0.16, 0.22], [0.16, 0.22]].slice(0, n);
  for (const [dx, dy] of offsets.reverse()) {
    getSprite('military', 'soldier').draw(ctx, x + dx * size * f, y + dy * size, fig, { coat: opts.dim ? '#7d776c' : field });
  }
  // The standard, held at the head of the column.
  const sx = x + f * size * 0.42;
  ctx.beginPath();
  ctx.moveTo(sx, y + size * 0.3);
  ctx.lineTo(sx, y - size * 0.75);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx, y - size * 0.75);
  ctx.lineTo(sx + f * size * 0.5, y - size * 0.62);
  ctx.lineTo(sx + f * size * 0.38, y - size * 0.5);
  ctx.lineTo(sx + f * size * 0.5, y - size * 0.38);
  ctx.lineTo(sx, y - size * 0.32);
  ctx.closePath();
  ctx.fillStyle = field;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx + f * size * 0.2, y - size * 0.53, size * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = charge;
  ctx.fill();
});

// Crossed swords where a battle was fought.
registerPlaceholder('marker', 'battle', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(236, 224, 194, 0.9)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#8b1e1e';
  ctx.stroke();
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(x - s * r * 0.6, y + r * 0.6);
    ctx.lineTo(x + s * r * 0.55, y - r * 0.55);
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * r * 0.55, y + r * 0.2);
    ctx.lineTo(x - s * r * 0.2, y + r * 0.55);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
});

// A siege: a ring of the besieger's tents round the town, the ring closing
// as the town starves.
registerPlaceholder('marker', 'siege', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const [field] = opts.colours ?? ['#8b1e1e'];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(139, 30, 30, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  const progress = Math.max(0, Math.min(1, (opts.progress ?? 0) / 100));
  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = 'rgba(139, 30, 30, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  const tents = 6;
  for (let i = 0; i < tents; i++) {
    const a = (i / tents) * Math.PI * 2 + Math.PI / 6;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(tx - 3.5, ty + 3);
    ctx.lineTo(tx, ty - 3.5);
    ctx.lineTo(tx + 3.5, ty + 3);
    ctx.closePath();
    ctx.fillStyle = field;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
});

// ---- Armies and figures on the move (M23 C) ----

// A column on the march: its men in a file along the road (one figure for
// every `per` men, up to `max`), the standard at its head, wagons at its
// tail for a large army, and dust behind it while it marches. `angle` is
// the road's heading on screen. Dust is placed from the army's own seed,
// not the clock, so a paused map needs no frames.
registerPlaceholder('army', 'column', (ctx, x, y, size, opts = {}) => {
  const [field, charge] = opts.colours ?? ['#23365e', '#efe6cf'];
  const n = Math.max(2, Math.min(opts.max ?? 12, opts.figures ?? 3));
  const ang = opts.angle ?? 0;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang) * 0.6;
  const gap = size * 0.24;
  const fig = size * 0.5;
  const len = gap * (n - 1);
  // The head of the column is ahead of (x, y), the tail behind.
  const hx = x + ux * len * 0.5;
  const hy = y + uy * len * 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.3, Math.max(size * 0.6, len * 0.62), size * 0.18, Math.atan2(uy, ux), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.25)';
  ctx.fill();
  if (opts.marching && opts.dust !== false) {
    let s = (opts.seed ?? 1) * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 4; i++) {
      const back = len * 0.5 + size * (0.3 + i * 0.28);
      ctx.beginPath();
      ctx.arc(x - ux * back + (rnd() - 0.5) * size * 0.3, y - uy * back + size * 0.15 - rnd() * size * 0.2, size * (0.14 + i * 0.05), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(196, 170, 120, ${0.32 - i * 0.06})`;
      ctx.fill();
    }
  }
  // Wagons at the tail.
  for (let i = 0; i < (opts.wagons ?? 0); i++) {
    const back = len * 0.5 + size * (0.35 + i * 0.42);
    const wx = x - ux * back;
    const wy = y - uy * back + size * 0.08;
    ctx.fillStyle = '#7a5a36';
    ctx.fillRect(wx - size * 0.18, wy - size * 0.12, size * 0.36, size * 0.18);
    ctx.fillStyle = '#e6d8b4';
    ctx.beginPath();
    ctx.ellipse(wx, wy - size * 0.12, size * 0.17, size * 0.1, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx - size * 0.11, wy + size * 0.08, size * 0.05, 0, Math.PI * 2);
    ctx.arc(wx + size * 0.11, wy + size * 0.08, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  // The men, tail first so the head is drawn on top.
  const f = ux >= 0 ? 1 : -1;
  for (let i = n - 1; i >= 0; i--) {
    // i = 0 is the head of the column.
    const t = 0.5 - i / Math.max(1, n - 1);
    const off = (i % 2 ? 1 : -1) * size * 0.05;
    getSprite('military', 'soldier').draw(ctx, x + ux * len * t, y + uy * len * t + off, fig, { coat: opts.dim ? '#7d776c' : field });
  }
  // The standard at the head.
  const sx = hx + ux * size * 0.25;
  const sy = hy + uy * size * 0.25;
  ctx.beginPath();
  ctx.moveTo(sx, sy + size * 0.3);
  ctx.lineTo(sx, sy - size * 0.8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx, sy - size * 0.8);
  ctx.lineTo(sx + f * size * 0.5, sy - size * 0.67);
  ctx.lineTo(sx + f * size * 0.38, sy - size * 0.55);
  ctx.lineTo(sx + f * size * 0.5, sy - size * 0.43);
  ctx.lineTo(sx, sy - size * 0.37);
  ctx.closePath();
  ctx.fillStyle = field;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx + f * size * 0.2, sy - size * 0.58, size * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = charge;
  ctx.fill();
});

// A camp for the night: a few tents in the army's colours round a fire.
registerPlaceholder('army', 'camp', (ctx, x, y, size, opts = {}) => {
  const [field] = opts.colours ?? ['#23365e'];
  const n = Math.max(2, Math.min(6, opts.tents ?? 3));
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.25, size * 0.75, size * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.25)';
  ctx.fill();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const tx = x + Math.cos(a) * size * 0.45;
    const ty = y + Math.sin(a) * size * 0.2;
    ctx.beginPath();
    ctx.moveTo(tx - size * 0.16, ty + size * 0.1);
    ctx.lineTo(tx, ty - size * 0.2);
    ctx.lineTo(tx + size * 0.16, ty + size * 0.1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#e6d8b4' : field;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // The fire, and its glow.
  const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.4);
  g.addColorStop(0, 'rgba(255, 190, 90, 0.7)');
  g.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.06, y + size * 0.05);
  ctx.lineTo(x, y - size * 0.12);
  ctx.lineTo(x + size * 0.06, y + size * 0.05);
  ctx.closePath();
  ctx.fillStyle = '#f2a03a';
  ctx.fill();
});

// A figure on the road: a rider with a mark of his errand. Envoys carry a
// white pennant, couriers a satchel and go bent low, lords a plume in
// their house colours, commanders a small standard; a spy goes on foot in
// a dark cloak.
registerPlaceholder('unit', 'figure', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const f = opts.facing ?? 1;
  const kind = opts.kind ?? 'courier';
  const colours = opts.colours ?? ['#23365e', '#efe6cf'];
  if (kind === 'spy') {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y + r * 0.8);
    ctx.lineTo(x, y - r * 0.6);
    ctx.lineTo(x + r * 0.35, y + r * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#2f2a26';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - r * 0.7, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  getSprite('unit', 'patrol').draw(ctx, x, y, size, { facing: f, colours: [kind === 'courier' ? '#6b5a3a' : colours[0]] });
  const mx = x - f * r * 0.05;
  if (kind === 'envoy' || kind === 'commander' || kind === 'progress') {
    ctx.beginPath();
    ctx.moveTo(mx, y - r * 0.3);
    ctx.lineTo(mx, y - r * 1.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx, y - r * 1.5);
    ctx.lineTo(mx - f * r * 0.7, y - r * 1.35);
    ctx.lineTo(mx, y - r * 1.15);
    ctx.closePath();
    // The king's progress flies gold.
    ctx.fillStyle = kind === 'envoy' ? '#f4efe2' : kind === 'progress' ? '#d2ab5f' : colours[0];
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.stroke();
  } else if (kind === 'lord') {
    ctx.beginPath();
    ctx.ellipse(mx, y - r * 1.05, r * 0.12, r * 0.3, -0.4 * f, 0, Math.PI * 2);
    ctx.fillStyle = colours[1] ?? '#efe6cf';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  } else if (kind === 'levy') {
    // Levies on the road to a muster (M24 E): a spear over the shoulder.
    ctx.beginPath();
    ctx.moveTo(mx - f * r * 0.5, y + r * 0.2);
    ctx.lineTo(mx + f * r * 0.6, y - r * 1.4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  } else if (kind === 'courier') {
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(x - f * r * 0.45, y - r * 0.15, r * 0.3, r * 0.25);
  }
});

// ---- The crown's hand on the map (M24 B) ----

// A gibbet at a crossroads, its cage swinging.
registerPlaceholder('mark', 'gibbet', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.4, y + r);
  ctx.lineTo(x - r * 0.4, y - r);
  ctx.lineTo(x + r * 0.5, y - r);
  ctx.moveTo(x - r * 0.4, y - r * 0.55);
  ctx.lineTo(x - r * 0.05, y - r);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.6, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + r * 0.4, y - r);
  ctx.lineTo(x + r * 0.4, y - r * 0.6);
  ctx.stroke();
  ctx.strokeRect(x + r * 0.22, y - r * 0.6, r * 0.36, r * 0.6);
});

// Heads on spikes over a town's gate.
registerPlaceholder('mark', 'heads', (ctx, x, y, size) => {
  const r = size / 2;
  for (const dx of [-0.5, 0, 0.5]) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.6, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + dx * r, y + r * 0.6);
    ctx.lineTo(x + dx * r, y - r * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + dx * r, y - r * 0.55, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#b89a7a';
    ctx.fill();
  }
});

// Bunting and banners round a town for a feast or the king's progress.
registerPlaceholder('mark', 'bunting', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const [a, b] = opts.colours ?? ['#23365e', '#d2ab5f'];
  ctx.strokeStyle = 'rgba(43, 33, 22, 0.6)';
  ctx.lineWidth = Math.max(0.6, size * 0.02);
  for (let k = 0; k < 2; k++) {
    const y0 = y - r * (0.15 + k * 0.25);
    ctx.beginPath();
    ctx.moveTo(x - r, y0);
    ctx.quadraticCurveTo(x, y0 + r * 0.3, x + r, y0);
    ctx.stroke();
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const px = x - r + 2 * r * t;
      const py = y0 + r * 0.3 * 2 * t * (1 - t) * 2 * 0.5;
      ctx.beginPath();
      ctx.moveTo(px - r * 0.05, py);
      ctx.lineTo(px + r * 0.05, py);
      ctx.lineTo(px, py + r * 0.11);
      ctx.closePath();
      ctx.fillStyle = (i + k) % 2 ? a : b;
      ctx.fill();
    }
  }
  // Two tall banners at the sides.
  for (const s of [-1, 1]) {
    const bx = x + s * r * 1.05;
    ctx.beginPath();
    ctx.moveTo(bx, y + r * 0.2);
    ctx.lineTo(bx, y - r * 0.8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.8, size * 0.025);
    ctx.stroke();
    ctx.fillStyle = a;
    ctx.fillRect(bx, y - r * 0.8, s * r * 0.22, r * 0.45);
  }
});
