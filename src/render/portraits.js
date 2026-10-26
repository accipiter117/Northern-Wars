// Rulers' portraits through the sprite registry, as portrait:<ruler id>.
// Until painted portraits are registered (registerImage('portrait', id,
// image)), every ruler gets a procedural one: a field in the realm's
// heraldic colours, a crowned figure in ink, and the realm's emblem on a
// roundel. Drawn in a square of `size` pixels centred on (x, y).
import { registerPlaceholder, getSprite } from './sprites.js';

const INK = '#2b2116';
const GOLD = '#d2ab5f';

// Small emblems, each drawn inside a unit circle at (0, 0) with radius 1.
const EMBLEMS = {
  eagle(c) {
    c.beginPath();
    c.moveTo(0, -0.7); c.lineTo(0.18, -0.35); c.lineTo(0.85, -0.55); c.lineTo(0.45, 0); c.lineTo(0.6, 0.15); c.lineTo(0.15, 0.1);
    c.lineTo(0.2, 0.7); c.lineTo(0, 0.45); c.lineTo(-0.2, 0.7); c.lineTo(-0.15, 0.1); c.lineTo(-0.6, 0.15); c.lineTo(-0.45, 0);
    c.lineTo(-0.85, -0.55); c.lineTo(-0.18, -0.35); c.closePath(); c.fill();
  },
  unicorn(c) {
    c.beginPath(); c.ellipse(0, 0.15, 0.45, 0.4, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(0.15, -0.2); c.lineTo(0.55, -0.85); c.lineTo(0.32, -0.12); c.closePath(); c.fill();
    c.fillRect(-0.35, 0.4, 0.15, 0.4); c.fillRect(0.2, 0.4, 0.15, 0.4);
  },
  sun(c) {
    c.beginPath(); c.arc(0, 0, 0.38, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath(); c.moveTo(Math.cos(a - 0.12) * 0.45, Math.sin(a - 0.12) * 0.45); c.lineTo(Math.cos(a) * 0.85, Math.sin(a) * 0.85);
      c.lineTo(Math.cos(a + 0.12) * 0.45, Math.sin(a + 0.12) * 0.45); c.fill();
    }
  },
  hammer(c) {
    c.fillRect(-0.55, -0.6, 1.1, 0.4);
    c.fillRect(-0.1, -0.25, 0.2, 1.0);
  },
  tree(c) {
    c.beginPath(); c.arc(0, -0.2, 0.55, 0, Math.PI * 2); c.fill();
    c.fillRect(-0.1, 0.2, 0.2, 0.6);
  },
  ship(c) {
    c.beginPath(); c.moveTo(-0.8, 0.25); c.lineTo(0.8, 0.25); c.lineTo(0.5, 0.65); c.lineTo(-0.5, 0.65); c.closePath(); c.fill();
    c.fillRect(-0.05, -0.75, 0.1, 1.0);
    c.beginPath(); c.moveTo(0.05, -0.7); c.lineTo(0.6, 0.1); c.lineTo(0.05, 0.1); c.closePath(); c.fill();
  },
  fish(c) {
    c.beginPath(); c.ellipse(-0.1, 0, 0.55, 0.3, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(0.35, 0); c.lineTo(0.8, -0.35); c.lineTo(0.8, 0.35); c.closePath(); c.fill();
  },
  wolf(c) {
    c.beginPath(); c.moveTo(-0.5, 0.6); c.lineTo(-0.55, -0.2); c.lineTo(-0.35, -0.75); c.lineTo(-0.1, -0.3); c.lineTo(0.1, -0.3);
    c.lineTo(0.35, -0.75); c.lineTo(0.55, -0.2); c.lineTo(0.5, 0.6); c.lineTo(0, 0.85); c.closePath(); c.fill();
  },
  tower(c) {
    c.fillRect(-0.4, -0.35, 0.8, 1.1);
    for (const x of [-0.4, -0.08, 0.24]) c.fillRect(x, -0.7, 0.16, 0.35);
  },
  star(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.35 : 0.85;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  },
  lion(c) {
    c.beginPath(); c.arc(-0.1, -0.25, 0.42, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(0.15, 0.3, 0.5, 0.32, 0, 0, Math.PI * 2); c.fill();
    c.fillRect(0.5, 0.0, 0.32, 0.1);
  },
};

function rrect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function crown(ctx, x, y, w, kind) {
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, w * 0.05);
  ctx.beginPath();
  if (kind === 'circlet') {
    ctx.rect(x - w / 2, y - w * 0.12, w, w * 0.18);
  } else {
    // Five points over a band.
    ctx.moveTo(x - w / 2, y + w * 0.12);
    for (let i = 0; i <= 4; i++) {
      const px = x - w / 2 + (i * w) / 4;
      ctx.lineTo(px, y - w * 0.28);
      if (i < 4) ctx.lineTo(px + w / 8, y - w * 0.05);
    }
    ctx.lineTo(x + w / 2, y + w * 0.12);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}

registerPlaceholder('portrait', 'ruler', (ctx, x, y, size, opts = {}) => {
  const [field, second] = opts.colours ?? ['#555', '#eee'];
  const s = size;
  const left = x - s / 2;
  const top = y - s / 2;
  ctx.save();
  // The field: the realm's colour, its second colour in a broad band.
  ctx.beginPath();
  rrect(ctx, left, top, s, s, s * 0.08);
  ctx.clip();
  ctx.fillStyle = field;
  ctx.fillRect(left, top, s, s);
  ctx.fillStyle = second;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.moveTo(left, top + s * 0.62); ctx.lineTo(left + s, top + s * 0.38); ctx.lineTo(left + s, top + s * 0.55); ctx.lineTo(left, top + s * 0.79);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // The figure: shoulders and head in ink, edged in the second colour.
  ctx.fillStyle = INK;
  ctx.strokeStyle = second;
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  ctx.moveTo(left + s * 0.14, top + s);
  ctx.quadraticCurveTo(left + s * 0.18, top + s * 0.66, left + s * 0.5, top + s * 0.62);
  ctx.quadraticCurveTo(left + s * 0.82, top + s * 0.66, left + s * 0.86, top + s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, top + s * 0.45, s * 0.15, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // A crown for kings and queens, a circlet for the rest, none for a council.
  if (opts.crown !== 'none') crown(ctx, x, top + s * 0.25, s * 0.3, opts.crown ?? 'crown');
  // The emblem on a roundel at the breast.
  const ex = x;
  const ey = top + s * 0.84;
  const er = s * 0.11;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = second;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  const draw = EMBLEMS[opts.emblem];
  if (draw) {
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(er * 0.78, er * 0.78);
    ctx.fillStyle = field;
    draw(ctx);
    ctx.restore();
  }
  ctx.restore();
  // A thin gold frame.
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.strokeStyle = GOLD;
  ctx.beginPath();
  rrect(ctx, left + 1, top + 1, s - 2, s - 2, s * 0.08);
  ctx.stroke();
});

// Draw a ruler's portrait: a painted one if registered, the placeholder
// otherwise.
export function drawPortrait(ctx, x, y, size, ruler, colours) {
  const crownKind = ['King', 'Queen'].includes(ruler?.title) ? 'crown' : ruler?.title ? 'circlet' : 'none';
  getSprite('portrait', ruler?.id, 'ruler').draw(ctx, x, y, size, { colours, emblem: ruler?.emblem, crown: crownKind });
}
