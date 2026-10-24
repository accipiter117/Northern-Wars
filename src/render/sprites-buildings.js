// Placeholder art for crown buildings, drawn beside their settlement, and
// for the soldiers who garrison it. Like every sprite, each can be replaced
// by a painted image with registerImage('building', id, img).
import { registerPlaceholder } from './sprites.js';

const INK = '#2b2116';

function outline(ctx, w = 0.9) {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// A small parchment disc behind each icon keeps it readable over terrain.
function plate(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(236, 224, 194, 0.85)';
  ctx.fill();
  outline(ctx, 0.6);
}

const ICONS = {
  fields(ctx, x, y, r) {
    ctx.fillStyle = '#c9a54a';
    ctx.fillRect(x - r * 0.65, y - r * 0.5, r * 1.3, r);
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x - r * 0.65, y + i * r * 0.2);
      ctx.lineTo(x + r * 0.65, y + i * r * 0.2);
    }
    outline(ctx, 0.6);
  },
  mill(ctx, x, y, r) {
    ctx.fillStyle = '#b08a5a';
    ctx.fillRect(x - r * 0.15, y - r * 0.5, r * 0.75, r);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x - r * 0.15, y - r * 0.5, r * 0.75, r);
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y + r * 0.1, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#6b4a2b';
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(x - r * 0.25 - Math.cos(a) * r * 0.45, y + r * 0.1 - Math.sin(a) * r * 0.45);
      ctx.lineTo(x - r * 0.25 + Math.cos(a) * r * 0.45, y + r * 0.1 + Math.sin(a) * r * 0.45);
    }
    outline(ctx, 0.7);
  },
  granary(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y + r * 0.55);
    ctx.lineTo(x - r * 0.6, y - r * 0.1);
    ctx.lineTo(x, y - r * 0.65);
    ctx.lineTo(x + r * 0.6, y - r * 0.1);
    ctx.lineTo(x + r * 0.6, y + r * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#9a4a32';
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#e2c46a';
    ctx.fillRect(x - r * 0.18, y + r * 0.05, r * 0.36, r * 0.5);
  },
  lumber(ctx, x, y, r) {
    ctx.fillStyle = '#8a6238';
    for (const dy of [0.25, -0.15]) {
      ctx.beginPath();
      ctx.rect(x - r * 0.6, y + dy * r - r * 0.17, r * 1.2, r * 0.34);
      ctx.fill();
      outline(ctx, 0.6);
    }
    ctx.beginPath();
    ctx.arc(x + r * 0.6, y + r * 0.25, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#d9b77f';
    ctx.fill();
    outline(ctx, 0.5);
  },
  quarry(ctx, x, y, r) {
    ctx.fillStyle = '#a49c8c';
    ctx.beginPath();
    ctx.rect(x - r * 0.6, y, r * 0.55, r * 0.45);
    ctx.rect(x + r * 0.05, y, r * 0.55, r * 0.45);
    ctx.rect(x - r * 0.3, y - r * 0.45, r * 0.6, r * 0.45);
    ctx.fill();
    outline(ctx, 0.6);
  },
  mine(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y + r * 0.5);
    ctx.lineTo(x - r * 0.6, y - r * 0.1);
    ctx.quadraticCurveTo(x, y - r * 0.75, x + r * 0.6, y - r * 0.1);
    ctx.lineTo(x + r * 0.6, y + r * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#5a4a3a';
    ctx.fill();
    outline(ctx);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y + r * 0.5);
    ctx.lineTo(x - r * 0.3, y);
    ctx.quadraticCurveTo(x, y - r * 0.35, x + r * 0.3, y);
    ctx.lineTo(x + r * 0.3, y + r * 0.5);
    ctx.fillStyle = '#1a140e';
    ctx.fill();
  },
  market(ctx, x, y, r) {
    ctx.fillStyle = '#e9dcc0';
    ctx.fillRect(x - r * 0.55, y - r * 0.05, r * 1.1, r * 0.55);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x - r * 0.55, y - r * 0.05, r * 1.1, r * 0.55);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.65 + i * r * 0.33, y - r * 0.05);
      ctx.lineTo(x - r * 0.48 + i * r * 0.33, y - r * 0.55);
      ctx.lineTo(x - r * 0.32 + i * r * 0.33, y - r * 0.05);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#e9dcc0' : '#a3322a';
      ctx.fill();
      outline(ctx, 0.5);
    }
  },
  workshop(ctx, x, y, r) {
    ctx.fillStyle = '#8f7f68';
    ctx.fillRect(x - r * 0.6, y - r * 0.15, r * 1.0, r * 0.65);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x - r * 0.6, y - r * 0.15, r * 1.0, r * 0.65);
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(x + r * 0.15, y - r * 0.65, r * 0.25, r * 0.5);
    ctx.fillStyle = 'rgba(90, 80, 70, 0.6)';
    ctx.beginPath();
    ctx.arc(x + r * 0.45, y - r * 0.8, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  },
  shrine(ctx, x, y, r) {
    ctx.fillStyle = '#e6dcc0';
    ctx.fillRect(x - r * 0.35, y - r * 0.2, r * 0.7, r * 0.7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x - r * 0.35, y - r * 0.2, r * 0.7, r * 0.7);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.2);
    ctx.lineTo(x, y - r * 0.7);
    ctx.lineTo(x + r * 0.5, y - r * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#7a5a3a';
    ctx.fill();
    outline(ctx, 0.7);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.1, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#e2a23a';
    ctx.fill();
  },
  // Works in progress: a timber frame and a ladder.
  scaffold(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y + r * 0.55);
    ctx.lineTo(x - r * 0.55, y - r * 0.55);
    ctx.moveTo(x + r * 0.55, y + r * 0.55);
    ctx.lineTo(x + r * 0.55, y - r * 0.55);
    ctx.moveTo(x - r * 0.7, y - r * 0.2);
    ctx.lineTo(x + r * 0.7, y - r * 0.2);
    ctx.moveTo(x - r * 0.7, y + r * 0.2);
    ctx.lineTo(x + r * 0.7, y + r * 0.2);
    ctx.moveTo(x - r * 0.55, y + r * 0.55);
    ctx.lineTo(x + r * 0.55, y - r * 0.55);
    ctx.strokeStyle = '#8a6238';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },
};

for (const [id, draw] of Object.entries(ICONS)) {
  registerPlaceholder('building', id, (ctx, x, y, size) => {
    const r = size / 2;
    plate(ctx, x, y, r);
    draw(ctx, x, y, r * 0.8);
  });
}

// Stone walls are drawn as a ring round the settlement rather than an icon.
registerPlaceholder('building', 'walls', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#6f6656';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([2, 2.5]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
});

// One soldier: a spearman in the crown's blue. `unpaid` greys him out.
registerPlaceholder('military', 'soldier', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const coat = opts.unpaid ? '#6a6a6a' : '#23365e';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.45, y + r * 0.9);
  ctx.lineTo(x + r * 0.45, y - r * 1.1);
  ctx.strokeStyle = '#5a4430';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.32, y - r * 0.95);
  ctx.lineTo(x + r * 0.45, y - r * 1.35);
  ctx.lineTo(x + r * 0.58, y - r * 0.95);
  ctx.fillStyle = '#c8c8c8';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.35, y + r * 0.9);
  ctx.lineTo(x - r * 0.3, y - r * 0.2);
  ctx.lineTo(x + r * 0.3, y - r * 0.2);
  ctx.lineTo(x + r * 0.35, y + r * 0.9);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  outline(ctx, 0.6);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.5, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#9a9a9a';
  ctx.fill();
  outline(ctx, 0.6);
});

// The garrison's banner: Temerian blue with a white charge, or ragged grey
// when the soldiers are unpaid.
registerPlaceholder('military', 'banner', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.lineTo(x, y - r);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.9, y - r);
  if (opts.unpaid) {
    ctx.lineTo(x + r * 0.7, y - r * 0.6);
    ctx.lineTo(x + r * 0.9, y - r * 0.35);
    ctx.lineTo(x + r * 0.5, y - r * 0.2);
  } else {
    ctx.lineTo(x + r * 0.9, y - r * 0.2);
    ctx.lineTo(x + r * 0.45, y);
  }
  ctx.lineTo(x, y - r * 0.2);
  ctx.closePath();
  ctx.fillStyle = opts.unpaid ? '#7d776c' : '#23365e';
  ctx.fill();
  outline(ctx, 0.7);
  if (!opts.unpaid) {
    ctx.beginPath();
    ctx.arc(x + r * 0.45, y - r * 0.6, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#efe6cf';
    ctx.fill();
  }
});
