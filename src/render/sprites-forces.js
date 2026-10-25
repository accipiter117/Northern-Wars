// Placeholder art for forces and threats on the map: banner tokens for the
// crown's companies, lords' men, foreign raiders, bandits and Scoia'tael;
// silhouettes for roaming beasts; camps and lairs set in the terrain; and
// the rumour marker. Like every sprite, each can be replaced by a painted
// image with registerImage.
import { registerPlaceholder, getSprite } from './sprites.js';

const INK = '#2b2116';

function line(ctx, w) {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// The look of each kind of force: banner colours, coats, and the banner's cut.
export const LOOK = {
  crown: { colours: ['#23365e', '#efe6cf'], coat: '#23365e', banner: 'lily' },
  bandits: { colours: ['#2e2622', '#8b1e1e'], coat: '#4a3a2e', banner: 'ragged' },
  scoiatael: { colours: ['#3e5a2a', '#c96a2a'], coat: '#4c6a34', banner: 'tail' },
  raiders: { banner: 'plain' },
  house: { banner: 'plain' },
};

// A banner token: up to five figures in their coats behind a standard. The
// standard's cut says who they are at a glance.
registerPlaceholder('force', 'token', (ctx, x, y, size, opts = {}) => {
  const look = LOOK[opts.look] ?? LOOK.crown;
  const [field, charge] = opts.colours ?? look.colours;
  const coat = opts.dim ? '#7d776c' : opts.coat ?? look.coat ?? field;
  const n = Math.max(1, Math.min(5, opts.figures ?? 1));
  const f = opts.facing ?? 1;
  const fig = size * 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.3, size * (0.35 + n * 0.08), size * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.3)';
  ctx.fill();
  const offsets = [[0, 0], [-0.3, 0.08], [0.3, 0.08], [-0.15, 0.2], [0.15, 0.2]].slice(0, n);
  for (const [dx, dy] of offsets.reverse()) {
    getSprite('military', 'soldier').draw(ctx, x + dx * size * f, y + dy * size, fig, { coat });
  }
  const sx = x + f * size * 0.4;
  ctx.beginPath();
  ctx.moveTo(sx, y + size * 0.28);
  ctx.lineTo(sx, y - size * 0.78);
  line(ctx, 1.2);
  ctx.beginPath();
  const top = y - size * 0.78;
  if (look.banner === 'ragged') {
    // Torn cloth, tatters at the fly.
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + f * size * 0.46, top + size * 0.06);
    ctx.lineTo(sx + f * size * 0.36, top + size * 0.14);
    ctx.lineTo(sx + f * size * 0.48, top + size * 0.2);
    ctx.lineTo(sx + f * size * 0.3, top + size * 0.26);
    ctx.lineTo(sx + f * size * 0.4, top + size * 0.36);
    ctx.lineTo(sx, top + size * 0.34);
  } else if (look.banner === 'tail') {
    // A long pennon with a squirrel's tail tied to the staff.
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + f * size * 0.55, top + size * 0.12);
    ctx.lineTo(sx, top + size * 0.24);
  } else {
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + f * size * 0.48, top + size * 0.12);
    ctx.lineTo(sx + f * size * 0.36, top + size * 0.24);
    ctx.lineTo(sx + f * size * 0.48, top + size * 0.36);
    ctx.lineTo(sx, top + size * 0.44);
  }
  ctx.closePath();
  ctx.fillStyle = field;
  ctx.fill();
  line(ctx, 0.8);
  if (look.banner === 'tail') {
    ctx.beginPath();
    ctx.ellipse(sx - f * size * 0.05, top + size * 0.32, size * 0.06, size * 0.14, f * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = charge;
    ctx.fill();
  } else if (look.banner === 'lily') {
    // A small white lily of Temeria.
    const cx = sx + f * size * 0.2;
    const cy = top + size * 0.2;
    ctx.fillStyle = charge;
    for (const dx of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * size * 0.05, cy - (dx ? 0 : size * 0.03), size * 0.03, size * 0.07, dx * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.banner !== 'ragged') {
    ctx.beginPath();
    ctx.arc(sx + f * size * 0.2, top + size * 0.2, size * 0.065, 0, Math.PI * 2);
    ctx.fillStyle = charge;
    ctx.fill();
  }
});

// ---- Beasts ----

function beastShape(ctx, family, x, y, s, f) {
  ctx.beginPath();
  if (family === 'wolves') {
    // Body, head forward, tail behind, four legs.
    ctx.ellipse(x, y - s * 0.3, s * 0.38, s * 0.16, 0, 0, Math.PI * 2);
    ctx.moveTo(x + f * s * 0.3, y - s * 0.35);
    ctx.lineTo(x + f * s * 0.55, y - s * 0.48);
    ctx.lineTo(x + f * s * 0.58, y - s * 0.33);
    ctx.lineTo(x + f * s * 0.32, y - s * 0.25);
    ctx.moveTo(x - f * s * 0.35, y - s * 0.32);
    ctx.lineTo(x - f * s * 0.6, y - s * 0.42);
    for (const dx of [-0.25, -0.12, 0.15, 0.27]) {
      ctx.moveTo(x + dx * s, y - s * 0.18);
      ctx.lineTo(x + dx * s, y);
    }
  } else if (family === 'harpies' || family === 'griffin') {
    // Spread wings over a small body.
    ctx.moveTo(x, y - s * 0.3);
    ctx.quadraticCurveTo(x - s * 0.35, y - s * 0.75, x - s * 0.62, y - s * 0.45);
    ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.45, x, y - s * 0.2);
    ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.45, x + s * 0.62, y - s * 0.45);
    ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.75, x, y - s * 0.3);
    ctx.moveTo(x, y - s * 0.25);
    ctx.lineTo(x - s * 0.05, y);
    ctx.lineTo(x + s * 0.05, y);
  } else if (family === 'wyverns' || family === 'forktail') {
    // A long neck, bat wings and a barbed tail.
    ctx.moveTo(x - f * s * 0.5, y - s * 0.1);
    ctx.quadraticCurveTo(x, y - s * 0.25, x + f * s * 0.35, y - s * 0.5);
    ctx.lineTo(x + f * s * 0.55, y - s * 0.55);
    ctx.lineTo(x + f * s * 0.38, y - s * 0.42);
    ctx.moveTo(x, y - s * 0.25);
    ctx.lineTo(x - f * s * 0.2, y - s * 0.8);
    ctx.lineTo(x + f * s * 0.15, y - s * 0.38);
    ctx.moveTo(x - f * s * 0.5, y - s * 0.1);
    ctx.lineTo(x - f * s * 0.62, y - s * 0.2);
  } else if (family === 'leshen') {
    // A tall gaunt figure crowned with antlers.
    ctx.moveTo(x - s * 0.12, y);
    ctx.lineTo(x - s * 0.08, y - s * 0.65);
    ctx.lineTo(x + s * 0.08, y - s * 0.65);
    ctx.lineTo(x + s * 0.12, y);
    ctx.moveTo(x - s * 0.06, y - s * 0.75);
    ctx.lineTo(x - s * 0.3, y - s * 1.05);
    ctx.moveTo(x + s * 0.06, y - s * 0.75);
    ctx.lineTo(x + s * 0.3, y - s * 1.05);
    ctx.moveTo(x - s * 0.2, y - s * 0.92);
    ctx.lineTo(x - s * 0.32, y - s * 0.85);
    ctx.moveTo(x + s * 0.2, y - s * 0.92);
    ctx.lineTo(x + s * 0.32, y - s * 0.85);
  } else {
    // Drowners and their kin: hunched, long-armed things.
    ctx.ellipse(x, y - s * 0.38, s * 0.16, s * 0.22, f * 0.5, 0, Math.PI * 2);
    ctx.moveTo(x + f * s * 0.08, y - s * 0.5);
    ctx.arc(x + f * s * 0.15, y - s * 0.58, s * 0.08, 0, Math.PI * 2);
    ctx.moveTo(x - s * 0.05, y - s * 0.2);
    ctx.lineTo(x - s * 0.12, y);
    ctx.moveTo(x + s * 0.05, y - s * 0.2);
    ctx.lineTo(x + s * 0.12, y);
    ctx.moveTo(x + f * s * 0.12, y - s * 0.4);
    ctx.lineTo(x + f * s * 0.32, y - s * 0.12);
  }
}

const FAMILY = { drowners: 'drowners', hag: 'drowners', wolves: 'wolves', werewolf: 'wolves', leshen: 'leshen', harpies: 'harpies', griffin: 'griffin', wyverns: 'wyverns', forktail: 'forktail' };
const BEAST_COLOUR = { drowners: '#4f6b5c', hag: '#3a4a3a', wolves: '#5d5852', werewolf: '#3a302a', leshen: '#5a4630', harpies: '#7a6a58', griffin: '#a8884a', wyverns: '#6a5a40', forktail: '#4a3a2a' };
const BIG = new Set(['hag', 'werewolf', 'leshen', 'griffin', 'forktail']);

// A pack of beasts on the prowl: one to five shapes, or one great one.
registerPlaceholder('force', 'beasts', (ctx, x, y, size, opts = {}) => {
  const sp = opts.species ?? 'drowners';
  const family = FAMILY[sp] ?? 'drowners';
  const f = opts.facing ?? 1;
  const big = BIG.has(sp);
  const n = big ? 1 : Math.max(1, Math.min(5, opts.figures ?? 1));
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.3, size * (0.35 + n * 0.08), size * 0.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.3)';
  ctx.fill();
  const offsets = [[0, 0], [-0.32, 0.1], [0.32, 0.1], [-0.16, 0.22], [0.16, 0.22]].slice(0, n);
  const s = size * (big ? 1.1 : 0.62);
  for (const [dx, dy] of offsets.reverse()) {
    beastShape(ctx, family, x + dx * size, y + dy * size + size * 0.3, s, f);
    ctx.fillStyle = BEAST_COLOUR[sp] ?? '#4f4a44';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.8, s * 0.05);
    ctx.fill();
    ctx.stroke();
  }
});

// ---- Camps and lairs ----

// A bandit camp: tents in a ring of stakes, more of them as it grows.
registerPlaceholder('lair', 'bandits', (ctx, x, y, size, opts = {}) => {
  const lv = Math.max(1, Math.min(3, opts.level ?? 1));
  const r = size * 0.5;
  // A trampled clearing.
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(120, 96, 64, 0.45)';
  ctx.fill();
  const tents = [[-0.35, -0.05], [0.3, -0.1], [0, 0.15], [-0.15, -0.28], [0.4, 0.2]].slice(0, lv + 1);
  for (const [dx, dy] of tents) {
    const tx = x + dx * r;
    const ty = y + dy * r;
    ctx.beginPath();
    ctx.moveTo(tx - r * 0.22, ty + r * 0.1);
    ctx.lineTo(tx, ty - r * 0.3);
    ctx.lineTo(tx + r * 0.22, ty + r * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#6b5a44';
    ctx.fill();
    line(ctx, 0.7);
  }
  // A fire, and a palisade once the camp is big enough to fear.
  ctx.beginPath();
  ctx.arc(x + r * 0.05, y - r * 0.02, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = '#e07a2a';
  ctx.fill();
  if (lv >= 2) {
    ctx.strokeStyle = '#4a3624';
    ctx.lineWidth = Math.max(1, r * 0.06);
    const posts = lv === 3 ? 22 : 12;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      if (lv === 2 && a > 0.3 && a < 1.4) continue;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.55;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - r * 0.22);
      ctx.stroke();
    }
  }
  ragged(ctx, x - r * 0.55, y - r * 0.2, r * 0.6);
});

function ragged(ctx, x, y, h) {
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.4);
  ctx.lineTo(x, y - h);
  line(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + h * 0.5, y - h * 0.9);
  ctx.lineTo(x + h * 0.38, y - h * 0.75);
  ctx.lineTo(x + h * 0.5, y - h * 0.62);
  ctx.lineTo(x, y - h * 0.6);
  ctx.closePath();
  ctx.fillStyle = '#2e2622';
  ctx.fill();
}

// A lair by its country: a bog pool in the marsh, a den among trees, a
// nest of sticks on the hills, a cave mouth in the crags. Bones show how
// long it has fed.
registerPlaceholder('lair', 'marsh', (ctx, x, y, size, opts = {}) => {
  const r = size * 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3e5a52';
  ctx.fill();
  line(ctx, 0.8);
  ctx.strokeStyle = '#6a7a3a';
  ctx.lineWidth = 1;
  for (const dx of [-0.7, -0.55, 0.6, 0.72]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * r, y + r * 0.1);
    ctx.lineTo(x + dx * r + r * 0.05, y - r * 0.45);
    ctx.stroke();
  }
  bones(ctx, x + r * 0.1, y + r * 0.45, r, opts.level);
});

registerPlaceholder('lair', 'forest', (ctx, x, y, size, opts = {}) => {
  const r = size * 0.5;
  for (const [dx, dy] of [[-0.55, -0.15], [0.55, -0.1], [-0.2, -0.45], [0.3, -0.42]]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#3e5a2a';
    ctx.fill();
    line(ctx, 0.6);
  }
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.05, r * 0.32, r * 0.24, 0, Math.PI, 0);
  ctx.fillStyle = '#1e1810';
  ctx.fill();
  line(ctx, 0.8);
  bones(ctx, x, y + r * 0.4, r, opts.level);
});

registerPlaceholder('lair', 'hills', (ctx, x, y, size, opts = {}) => {
  const r = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y + r * 0.3);
  ctx.lineTo(x - r * 0.4, y - r * 0.3);
  ctx.lineTo(x + r * 0.35, y - r * 0.4);
  ctx.lineTo(x + r * 0.8, y + r * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#9a8a72';
  ctx.fill();
  line(ctx, 0.8);
  // The nest, a tangle of sticks on top.
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.4, r * 0.4, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6b5236';
  ctx.fill();
  line(ctx, 0.7);
  bones(ctx, x + r * 0.2, y + r * 0.45, r, opts.level);
});

registerPlaceholder('lair', 'mountains', (ctx, x, y, size, opts = {}) => {
  const r = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.9, y + r * 0.35);
  ctx.lineTo(x - r * 0.2, y - r * 0.8);
  ctx.lineTo(x + r * 0.9, y + r * 0.35);
  ctx.closePath();
  ctx.fillStyle = opts.snow ? '#e8e6e0' : '#8a8478';
  ctx.fill();
  line(ctx, 0.8);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.05, y + r * 0.2, r * 0.26, r * 0.2, 0, Math.PI, 0);
  ctx.fillStyle = '#1e1810';
  ctx.fill();
  bones(ctx, x + r * 0.3, y + r * 0.45, r, opts.level);
});

function bones(ctx, x, y, r, level = 1) {
  ctx.strokeStyle = '#efe6cf';
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  for (let i = 0; i < Math.min(3, level ?? 1); i++) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15 + i * r * 0.18, y);
    ctx.lineTo(x + r * 0.02 + i * r * 0.18, y - r * 0.08);
    ctx.stroke();
  }
}

// A rumour: a dashed ring over a rough area, with a question mark.
registerPlaceholder('marker', 'rumour', (ctx, x, y, size, opts = {}) => {
  const r = size / 2;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = opts.kind === 'monsters' ? 'rgba(80, 60, 90, 0.10)' : 'rgba(110, 30, 20, 0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(110, 40, 30, 0.6)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
  ctx.font = `bold ${Math.round(Math.max(12, Math.min(22, r * 0.5)))}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(110, 40, 30, 0.8)';
  ctx.fillText('?', x, y);
});
