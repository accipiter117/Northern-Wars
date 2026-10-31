// The faiths on the map close up (M26 E): pyres, groves and stone circles,
// Melitele's hospice banners, processions and pilgrims. Placeholders drawn
// in code, like every other mark, until painted art is registered.
import { registerPlaceholder } from './sprites.js';

const INK = '#2b2116';

// A pyre in the square: stacked logs, a stake and flames, smoke rising.
registerPlaceholder('mark', 'pyre', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.fillStyle = 'rgba(70, 64, 60, 0.35)';
  for (const [dx, dy, k] of [[0.1, -1.6, 0.45], [0.35, -2.2, 0.55], [0.15, -2.9, 0.6]]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, k * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#5a3e22';
  ctx.lineWidth = Math.max(1, size * 0.1);
  for (const dy of [0.55, 0.3]) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y + dy * r);
    ctx.lineTo(x + r * 0.7, y + dy * r);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.8, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.6);
  ctx.lineTo(x, y - r * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y + r * 0.2);
  ctx.quadraticCurveTo(x - r * 0.4, y - r * 0.6, x - r * 0.05, y - r * 1.1);
  ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.5, x + r * 0.35, y - r * 0.8);
  ctx.quadraticCurveTo(x + r * 0.55, y - r * 0.2, x + r * 0.6, y + r * 0.2);
  ctx.closePath();
  ctx.fillStyle = '#d9662a';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y + r * 0.2);
  ctx.quadraticCurveTo(x - r * 0.1, y - r * 0.4, x + r * 0.05, y - r * 0.6);
  ctx.quadraticCurveTo(x + r * 0.25, y - r * 0.2, x + r * 0.3, y + r * 0.2);
  ctx.closePath();
  ctx.fillStyle = '#f2c14e';
  ctx.fill();
});

// A sacred grove: a ring of dark trees, and once the druids hold their
// power, standing stones in a circle within.
registerPlaceholder('mark', 'grove', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const tx = x + Math.cos(a) * r * 0.85;
    const ty = y + Math.sin(a) * r * 0.55;
    ctx.beginPath();
    ctx.arc(tx, ty - r * 0.2, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#4d6b3c' : '#3f5c33';
    ctx.fill();
    ctx.strokeStyle = 'rgba(43, 33, 22, 0.5)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  if (opts.stones) {
    ctx.fillStyle = '#a9a294';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sx = x + Math.cos(a) * r * 0.38;
      const sy = y + Math.sin(a) * r * 0.24;
      ctx.fillRect(sx - r * 0.07, sy - r * 0.3, r * 0.14, r * 0.3);
      ctx.strokeRect(sx - r * 0.07, sy - r * 0.3, r * 0.14, r * 0.3);
    }
  }
});

// Melitele's banner over a hospice: a pale pennant with a gold sheaf.
registerPlaceholder('mark', 'hospice', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.8, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.lineTo(x, y - r);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.9, y - r);
  ctx.lineTo(x + r * 0.9, y - r * 0.05);
  ctx.lineTo(x + r * 0.45, y - r * 0.3);
  ctx.lineTo(x, y - r * 0.05);
  ctx.closePath();
  ctx.fillStyle = '#efe6cf';
  ctx.fill();
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = '#c9a43c';
  ctx.lineWidth = Math.max(0.8, size * 0.06);
  ctx.beginPath();
  for (const dx of [-0.12, 0, 0.12]) {
    ctx.moveTo(x + r * 0.45, y - r * 0.25);
    ctx.lineTo(x + r * (0.45 + dx), y - r * 0.8);
  }
  ctx.stroke();
});

// A procession: the faithful walking two by two behind a banner in the
// faith's colour.
registerPlaceholder('mark', 'procession', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const colour = opts.colour ?? '#d9c27a';
  const dir = opts.angle ?? 0;
  const cos = Math.cos(dir);
  const sin = Math.sin(dir);
  const at = (along, side) => [x - cos * along * r + -sin * side * r, y - sin * along * r + cos * side * r];
  for (let i = 0; i < 6; i++) {
    const [fx, fy] = at(0.5 + Math.floor(i / 2) * 0.55, i % 2 ? 0.18 : -0.18);
    ctx.beginPath();
    ctx.arc(fx, fy - r * 0.18, r * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#c9b48a';
    ctx.fill();
    ctx.fillStyle = i < 2 ? colour : '#6b5a3a';
    ctx.fillRect(fx - r * 0.1, fy - r * 0.08, r * 0.2, r * 0.3);
  }
  const [bx, by] = at(0, 0);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.8, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(bx, by + r * 0.2);
  ctx.lineTo(bx, by - r * 0.9);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.fillRect(bx - r * 0.22, by - r * 0.9, r * 0.44, r * 0.38);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(bx - r * 0.22, by - r * 0.9, r * 0.44, r * 0.38);
});

// A headsman's scaffold (M27 D): a raised platform, the block and the axe.
registerPlaceholder('mark', 'block', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(x - r * 0.9, y - r * 0.1, r * 1.8, r * 0.35);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.8, size * 0.05);
  ctx.strokeRect(x - r * 0.9, y - r * 0.1, r * 1.8, r * 0.35);
  for (const dx of [-0.75, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * r, y + r * 0.25);
    ctx.lineTo(x + dx * r, y + r * 0.7);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a3420';
  ctx.fillRect(x - r * 0.2, y - r * 0.4, r * 0.4, r * 0.3);
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35, y - r * 0.1);
  ctx.lineTo(x + r * 0.6, y - r * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#9a9a9a';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.95);
  ctx.lineTo(x + r * 0.85, y - r * 0.8);
  ctx.lineTo(x + r * 0.62, y - r * 0.6);
  ctx.closePath();
  ctx.fill();
});
