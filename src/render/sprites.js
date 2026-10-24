// Sprite registry. Everything drawable is asked for by kind and id, falling
// back to a generic id (a settlement's type, a unit's kind). Painted art can be
// dropped in later with registerImage and nothing else needs to change.

const sprites = new Map();

const INK = '#2b2116';

export function registerImage(kind, id, image, { anchorX = 0.5, anchorY = 0.5 } = {}) {
  sprites.set(`${kind}:${id}`, {
    draw(ctx, x, y, size) {
      const h = size;
      const w = size * (image.width / image.height);
      ctx.drawImage(image, x - w * anchorX, y - h * anchorY, w, h);
    },
  });
}

export function registerPlaceholder(kind, id, draw) {
  sprites.set(`${kind}:${id}`, { draw });
}

export function getSprite(kind, id, fallback) {
  return sprites.get(`${kind}:${id}`) ?? sprites.get(`${kind}:${fallback}`) ?? sprites.get('any:missing');
}

// Placeholders. Each draws centred on (x, y) inside a box of `size` pixels.

function stroke(ctx, width) {
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

registerPlaceholder('any', 'missing', (ctx, x, y, size) => {
  ctx.beginPath();
  ctx.arc(x, y, size / 3, 0, Math.PI * 2);
  ctx.fillStyle = '#c0392b';
  ctx.fill();
});

registerPlaceholder('settlement', 'city', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  // Ring wall with four towers, a keep in the middle.
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = opts.capital ? '#d8c08a' : '#d2c19a';
  ctx.fill();
  stroke(ctx, Math.max(1.5, size * 0.09));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = '#b9a272';
    ctx.fill();
    stroke(ctx, Math.max(1, size * 0.06));
  }
  ctx.fillStyle = opts.capital ? '#7a1f1a' : INK;
  ctx.fillRect(x - r * 0.28, y - r * 0.28, r * 0.56, r * 0.56);
});

registerPlaceholder('settlement', 'town', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = '#d2c19a';
  ctx.fill();
  stroke(ctx, Math.max(1.2, size * 0.1));
  ctx.beginPath();
  ctx.moveTo(x - r * 0.4, y + r * 0.35);
  ctx.lineTo(x - r * 0.4, y - r * 0.1);
  ctx.lineTo(x, y - r * 0.45);
  ctx.lineTo(x + r * 0.4, y - r * 0.1);
  ctx.lineTo(x + r * 0.4, y + r * 0.35);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
});

registerPlaceholder('settlement', 'village', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.75, y + r * 0.55);
  ctx.lineTo(x - r * 0.75, y - r * 0.05);
  ctx.lineTo(x, y - r * 0.75);
  ctx.lineTo(x + r * 0.75, y - r * 0.05);
  ctx.lineTo(x + r * 0.75, y + r * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#a8865a';
  ctx.fill();
  stroke(ctx, Math.max(1, size * 0.12));
});

registerPlaceholder('settlement', 'castle', (ctx, x, y, size) => {
  const r = size / 2;
  const w = r * 1.3;
  const h = r * 1.1;
  const top = y - h / 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + h / 2);
  ctx.lineTo(x - w / 2, top);
  for (let i = 0; i < 3; i++) {
    const cx = x - w / 2 + (i * w) / 2.5;
    ctx.lineTo(cx, top - r * 0.3);
    ctx.lineTo(cx + w / 5, top - r * 0.3);
    ctx.lineTo(cx + w / 5, top);
    ctx.lineTo(cx + w / 2.5, top);
  }
  ctx.lineTo(x + w / 2, top - r * 0.3);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = '#8f7f68';
  ctx.fill();
  stroke(ctx, Math.max(1, size * 0.09));
  ctx.fillStyle = INK;
  ctx.fillRect(x - r * 0.15, y + h / 2 - r * 0.5, r * 0.3, r * 0.5);
});

registerPlaceholder('settlement', 'temple', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#e6dcc0';
  ctx.fill();
  stroke(ctx, Math.max(1, size * 0.09));
  // A simple flame-like leaf, Melitele's harvest rather than any real emblem.
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.quadraticCurveTo(x + r * 0.45, y, x, y + r * 0.5);
  ctx.quadraticCurveTo(x - r * 0.45, y, x, y - r * 0.5);
  ctx.fillStyle = '#5a7a3a';
  ctx.fill();
});

function wheel(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
}

registerPlaceholder('unit', 'caravan', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const f = opts.facing ?? 1;
  ctx.fillStyle = '#e9dcc0';
  ctx.beginPath();
  ctx.ellipse(x + f * r * 0.1, y - r * 0.15, r * 0.6, r * 0.45, 0, Math.PI, 0);
  ctx.fill();
  stroke(ctx, 1);
  ctx.fillStyle = '#7b5530';
  ctx.fillRect(x - r * 0.75, y - r * 0.15, r * 1.5, r * 0.4);
  ctx.strokeRect(x - r * 0.75, y - r * 0.15, r * 1.5, r * 0.4);
  wheel(ctx, x - r * 0.45, y + r * 0.35, r * 0.2);
  wheel(ctx, x + r * 0.45, y + r * 0.35, r * 0.2);
});

registerPlaceholder('unit', 'grain', (ctx, x, y, size) => {
  const r = size / 2;
  ctx.fillStyle = '#d9b45a';
  for (const dx of [-0.4, 0.05, 0.45]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y - r * 0.25, r * 0.28, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx, 0.8);
  }
  ctx.fillStyle = '#7b5530';
  ctx.fillRect(x - r * 0.8, y + r * 0.05, r * 1.6, r * 0.3);
  ctx.strokeRect(x - r * 0.8, y + r * 0.05, r * 1.6, r * 0.3);
  wheel(ctx, x - r * 0.5, y + r * 0.45, r * 0.2);
  wheel(ctx, x + r * 0.5, y + r * 0.45, r * 0.2);
});

// A caravan from abroad flies a pennant so it reads as foreign at a glance.
registerPlaceholder('unit', 'foreign', (ctx, x, y, size, opts = {}) => {
  getSprite('unit', 'caravan').draw(ctx, x, y, size, opts);
  const r = size / 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.2);
  ctx.lineTo(x - r * 0.6, y - r * 1.2);
  stroke(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 1.2);
  ctx.lineTo(x + r * 0.2, y - r * 1.0);
  ctx.lineTo(x - r * 0.6, y - r * 0.8);
  ctx.closePath();
  ctx.fillStyle = '#a3322a';
  ctx.fill();
});

registerPlaceholder('unit', 'patrol', (ctx, x, y, size) => {
  const r = size / 2;
  // A kite shield in deep blue, the crown's colour.
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.6);
  ctx.lineTo(x + r * 0.6, y - r * 0.6);
  ctx.lineTo(x + r * 0.55, y + r * 0.05);
  ctx.lineTo(x, y + r * 0.75);
  ctx.lineTo(x - r * 0.55, y + r * 0.05);
  ctx.closePath();
  ctx.fillStyle = '#23365e';
  ctx.fill();
  stroke(ctx, 1.2);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = '#e9e2cf';
  ctx.fill();
});

registerPlaceholder('unit', 'barge', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  const f = opts.facing ?? 1;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y);
  ctx.lineTo(x + r * 0.8, y);
  ctx.lineTo(x + f * r * 0.5, y + r * 0.4);
  ctx.lineTo(x - f * r * 0.6, y + r * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#6b4a2b';
  ctx.fill();
  stroke(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - r * 0.8);
  stroke(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.75);
  ctx.lineTo(x + f * r * 0.5, y - r * 0.15);
  ctx.lineTo(x, y - r * 0.1);
  ctx.closePath();
  ctx.fillStyle = '#efe6cf';
  ctx.fill();
  stroke(ctx, 0.8);
});
