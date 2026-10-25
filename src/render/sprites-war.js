// Placeholder art for armies on the march, battlefields and sieges. Like
// every sprite, each can be replaced by a painted image with registerImage.
import { registerPlaceholder, getSprite } from './sprites.js';

const INK = '#2b2116';

// An army: a block of soldiers in its colours behind a tall standard. The
// number of figures grows with its size; `selected` adds a gold ring.
registerPlaceholder('army', 'host', (ctx, x, y, size, opts = {}) => {
  const [field, charge] = opts.colours ?? ['#23365e', '#efe6cf'];
  const n = Math.max(1, Math.min(4, opts.figures ?? 2));
  const f = opts.facing ?? 1;
  const fig = size * 0.55;
  // A parchment shadow under the column keeps it readable over any ground.
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.32, size * 0.62, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.28)';
  ctx.fill();
  const offsets = [[0, 0], [-0.32, 0.1], [0.32, 0.1], [0, 0.2]].slice(0, n);
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
