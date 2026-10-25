// Placeholder art for settlement layouts: houses, landmarks, each kind of
// building, fields and pastures, walls, and the small life around them.
// Everything is drawn standing on its ground point (x, y is the middle of
// its base) so pieces overlap correctly when drawn back to front, as
// painted 2.5D art will. Any of them can be replaced with registerImage.
import { registerPlaceholder } from './sprites.js';

const INK = '#2b2116';
const ROOFS = ['#9a5638', '#b89b5a', '#5d6066', '#7a5a3a'];
const WALL = '#e4d6b4';
const STONE = '#b9ae98';
const TIMBER = '#8a6844';

function line(ctx, w = 0.8) {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// A box seen a little from above: a front wall, a sliver of side wall and a
// roof. `h` is the wall height, `roof` the ridge height above it.
function house(ctx, x, y, w, h, roofH, wall, roof, opts = {}) {
  const lw = Math.max(0.5, w * 0.05);
  const left = x - w / 2;
  const top = y - h;
  // Side wall, in shadow.
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2 + w * 0.18, y - w * 0.12);
  ctx.lineTo(x + w / 2 + w * 0.18, top - w * 0.12);
  ctx.lineTo(x + w / 2, top);
  ctx.closePath();
  ctx.fillStyle = shade(wall, -0.25);
  ctx.fill();
  line(ctx, lw);
  ctx.fillStyle = wall;
  ctx.fillRect(left, top, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.strokeRect(left, top, w, h);
  // Roof: a ridge running back, so the front shows its eaves.
  ctx.beginPath();
  ctx.moveTo(left - w * 0.06, top);
  ctx.lineTo(x + w / 2 + w * 0.06, top);
  ctx.lineTo(x + w / 2 + w * 0.22, top - w * 0.12);
  ctx.lineTo(x + w * 0.2, top - roofH);
  ctx.lineTo(x - w * 0.15, top - roofH);
  ctx.closePath();
  ctx.fillStyle = opts.snow ? '#f2f2ee' : roof;
  ctx.fill();
  line(ctx, lw);
  if (!opts.snow) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.15, top - roofH);
    ctx.lineTo(x + w * 0.2, top - roofH);
    ctx.strokeStyle = shade(roof, -0.3);
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  // A door.
  if (w > 5) {
    ctx.fillStyle = '#4a3624';
    ctx.fillRect(x - w * 0.08, y - h * 0.5, w * 0.16, h * 0.5);
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + (f < 0 ? v * f : (255 - v) * f))));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function tower(ctx, x, y, w, h, colour = STONE, roof = '#5d6066', opts = {}) {
  ctx.fillStyle = colour;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.5, w * 0.07);
  ctx.strokeRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, y - h);
  ctx.lineTo(x, y - h - w * 1.1);
  ctx.lineTo(x + w * 0.62, y - h);
  ctx.closePath();
  ctx.fillStyle = opts.snow ? '#f2f2ee' : roof;
  ctx.fill();
  line(ctx, Math.max(0.5, w * 0.07));
}

function flag(ctx, x, y, h, colour = '#23365e') {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  line(ctx, Math.max(0.5, h * 0.05));
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + h * 0.45, y - h * 0.85);
  ctx.lineTo(x, y - h * 0.7);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

// ---- Houses ----

registerPlaceholder('structure', 'house', (ctx, x, y, size, opts = {}) => {
  const v = opts.variant ?? 0;
  const tall = opts.type === 'city' ? 1.15 : opts.type === 'town' ? 0.85 : 0.6;
  house(ctx, x, y, size * 0.8, size * 0.5 * tall, size * 0.45, v === 2 ? '#d9cdb0' : WALL, ROOFS[v % ROOFS.length], opts);
});

// ---- Landmarks at the heart of each place ----

registerPlaceholder('structure', 'landmark:city', (ctx, x, y, size, opts = {}) => {
  house(ctx, x, y, size * 0.8, size * 0.5, size * 0.3, STONE, '#5d6066', opts);
  tower(ctx, x - size * 0.42, y + size * 0.02, size * 0.22, size * 0.85, STONE, '#7a1f1a', opts);
  tower(ctx, x + size * 0.46, y + size * 0.02, size * 0.22, size * 0.75, STONE, '#7a1f1a', opts);
  tower(ctx, x, y - size * 0.25, size * 0.26, size * 0.95, STONE, '#7a1f1a', opts);
  flag(ctx, x, y - size * 1.5, size * 0.3, '#23365e');
});

registerPlaceholder('structure', 'landmark:town', (ctx, x, y, size, opts = {}) => {
  house(ctx, x, y, size * 0.8, size * 0.45, size * 0.3, '#d8c9a4', '#9a5638', opts);
  tower(ctx, x + size * 0.3, y - size * 0.05, size * 0.2, size * 0.85, STONE, '#5d6066', opts);
});

registerPlaceholder('structure', 'landmark:village', (ctx, x, y, size, opts = {}) => {
  // A small chapel and the village well.
  house(ctx, x - size * 0.15, y, size * 0.55, size * 0.35, size * 0.35, WALL, '#7a5a3a', opts);
  tower(ctx, x + size * 0.18, y - size * 0.02, size * 0.14, size * 0.55, WALL, '#7a5a3a', opts);
  ctx.beginPath();
  ctx.ellipse(x + size * 0.45, y + size * 0.12, size * 0.1, size * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4d6266';
  ctx.fill();
  line(ctx, 0.5);
});

registerPlaceholder('structure', 'landmark:castle', (ctx, x, y, size, opts = {}) => {
  const w = size * 0.75;
  const h = size * 0.55;
  ctx.fillStyle = STONE;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.6, size * 0.04);
  ctx.strokeRect(x - w / 2, y - h, w, h);
  // Crenellations.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = STONE;
    ctx.fillRect(x - w / 2 + (i * w) / 4.5, y - h - size * 0.08, w / 9, size * 0.08);
    ctx.strokeRect(x - w / 2 + (i * w) / 4.5, y - h - size * 0.08, w / 9, size * 0.08);
  }
  tower(ctx, x - w / 2, y, size * 0.2, size * 0.75, STONE, '#5d6066', opts);
  tower(ctx, x + w / 2, y, size * 0.2, size * 0.75, STONE, '#5d6066', opts);
  flag(ctx, x, y - h - size * 0.08, size * 0.35, opts.colour ?? '#23365e');
});

registerPlaceholder('structure', 'landmark:temple', (ctx, x, y, size, opts = {}) => {
  house(ctx, x, y, size * 0.7, size * 0.4, size * 0.2, '#efe6cf', '#c9a03a', opts);
  ctx.beginPath();
  ctx.arc(x, y - size * 0.6, size * 0.2, Math.PI, 0);
  ctx.fillStyle = opts.snow ? '#f2f2ee' : '#c9a03a';
  ctx.fill();
  line(ctx, 0.6);
});

// ---- Buildings ----

const B = {};
B.granary = (ctx, x, y, s, o) => tower(ctx, x, y, s * 0.42, s * 0.55, '#d2b47a', '#9a7a3a', o);
B.mill = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.5, s * 0.45, s * 0.3, WALL, '#7a5a3a', o);
  // The wheel in the race.
  ctx.save();
  ctx.translate(x - s * 0.32, y - s * 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
  ctx.strokeStyle = TIMBER;
  ctx.lineWidth = Math.max(0.6, s * 0.04);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(s * 0.2, 0);
    ctx.stroke();
  }
  ctx.restore();
};
B.lumber = (ctx, x, y, s, o) => {
  // Stacked logs and a sawpit shed.
  house(ctx, x + s * 0.12, y, s * 0.45, s * 0.25, s * 0.2, TIMBER, '#5a4430', o);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x - s * 0.3 + i * s * 0.1, y - s * 0.06 - (i % 2) * s * 0.08, s * 0.06, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a66b';
    ctx.fill();
    line(ctx, 0.5);
  }
};
B.quarry = (ctx, x, y, s, o) => {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y);
  ctx.lineTo(x - s * 0.3, y - s * 0.45);
  ctx.lineTo(x + s * 0.2, y - s * 0.5);
  ctx.lineTo(x + s * 0.5, y);
  ctx.closePath();
  ctx.fillStyle = o.snow ? '#e8e6e0' : '#a89a84';
  ctx.fill();
  line(ctx, 0.6);
  ctx.fillStyle = '#7e7262';
  ctx.fillRect(x - s * 0.15, y - s * 0.3, s * 0.3, s * 0.3);
};
B.mine = (ctx, x, y, s, o) => {
  B.quarry(ctx, x, y, s, o);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.05, s * 0.16, Math.PI, 0);
  ctx.fillStyle = '#2b2116';
  ctx.fill();
  ctx.strokeStyle = TIMBER;
  ctx.lineWidth = Math.max(0.6, s * 0.05);
  ctx.stroke();
};
B.goldmine = (ctx, x, y, s, o) => {
  B.mine(ctx, x, y, s, o);
  // A headframe and a cart of ore that glints.
  ctx.beginPath();
  ctx.moveTo(x + s * 0.25, y);
  ctx.lineTo(x + s * 0.35, y - s * 0.7);
  ctx.lineTo(x + s * 0.45, y);
  line(ctx, Math.max(0.6, s * 0.04));
  ctx.beginPath();
  ctx.arc(x - s * 0.3, y - s * 0.05, s * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = '#e6c04a';
  ctx.fill();
  line(ctx, 0.5);
};
B.market = (ctx, x, y, s, o) => {
  // A row of stalls under striped awnings.
  const cols = ['#8b1e1e', '#23365e', '#c9a03a'];
  for (let i = 0; i < 3; i++) {
    const sx = x - s * 0.35 + i * s * 0.35;
    ctx.fillStyle = TIMBER;
    ctx.fillRect(sx - s * 0.14, y - s * 0.18, s * 0.28, s * 0.18);
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.17, y - s * 0.18);
    ctx.lineTo(sx, y - s * 0.38);
    ctx.lineTo(sx + s * 0.17, y - s * 0.18);
    ctx.closePath();
    ctx.fillStyle = o.snow ? '#f2f2ee' : cols[i];
    ctx.fill();
    line(ctx, 0.5);
  }
};
B.workshop = (ctx, x, y, s, o) => house(ctx, x, y, s * 0.75, s * 0.4, s * 0.25, '#d6c59c', '#7a5a3a', o);
B.shrine = (ctx, x, y, s, o) => {
  tower(ctx, x, y, s * 0.35, s * 0.4, '#efe6cf', '#7a5a3a', o);
};
B.watchtower = (ctx, x, y, s, o) => {
  tower(ctx, x, y, s * 0.3, s * 1.0, TIMBER, '#5a4430', o);
  flag(ctx, x, y - s * 1.3, s * 0.3);
};
B.harbour = (ctx, x, y, s, o) => {
  // A quay and a pier into the water, with a crane.
  ctx.fillStyle = TIMBER;
  ctx.fillRect(x - s * 0.5, y - s * 0.1, s, s * 0.14);
  ctx.fillRect(x + s * 0.25, y - s * 0.1, s * 0.1, s * 0.45);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x - s * 0.5, y - s * 0.1, s, s * 0.14);
  house(ctx, x - s * 0.2, y - s * 0.1, s * 0.4, s * 0.25, s * 0.18, WALL, '#5d6066', o);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y - s * 0.1);
  ctx.lineTo(x + s * 0.12, y - s * 0.65);
  ctx.lineTo(x + s * 0.45, y - s * 0.5);
  line(ctx, Math.max(0.6, s * 0.04));
};
B.warehouse = (ctx, x, y, s, o) => house(ctx, x, y, s * 0.9, s * 0.4, s * 0.3, '#c4a87a', '#6e5a3e', o);
B.smithy = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.6, s * 0.35, s * 0.25, STONE, '#5d6066', o);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(x + s * 0.12, y - s * 0.75, s * 0.12, s * 0.4);
  // The forge's glow at the door.
  ctx.fillStyle = '#e07a2a';
  ctx.fillRect(x - s * 0.08, y - s * 0.16, s * 0.16, s * 0.16);
};
B.armoury = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.75, s * 0.45, s * 0.2, STONE, '#5d6066', o);
  // Crossed spears over the door.
  ctx.beginPath();
  ctx.moveTo(x - s * 0.18, y - s * 0.05);
  ctx.lineTo(x + s * 0.18, y - s * 0.42);
  ctx.moveTo(x + s * 0.18, y - s * 0.05);
  ctx.lineTo(x - s * 0.18, y - s * 0.42);
  line(ctx, Math.max(0.6, s * 0.04));
};
B.tannery = (ctx, x, y, s, o) => {
  house(ctx, x + s * 0.12, y, s * 0.45, s * 0.3, s * 0.2, WALL, '#7a5a3a', o);
  // Hides on drying frames.
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = '#a07048';
    ctx.fillRect(x - s * 0.45 + i * s * 0.2, y - s * 0.35, s * 0.14, s * 0.22);
    ctx.strokeRect(x - s * 0.45 + i * s * 0.2, y - s * 0.35, s * 0.14, s * 0.22);
  }
};
B.brewery = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.65, s * 0.4, s * 0.25, WALL, '#9a5638', o);
  ctx.beginPath();
  ctx.ellipse(x - s * 0.42, y - s * 0.1, s * 0.09, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = TIMBER;
  ctx.fill();
  line(ctx, 0.5);
};
B.inn = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.7, s * 0.45, s * 0.3, '#e0cf9e', '#9a5638', o);
  // The hanging sign.
  ctx.beginPath();
  ctx.moveTo(x + s * 0.35, y - s * 0.38);
  ctx.lineTo(x + s * 0.55, y - s * 0.38);
  line(ctx, 0.6);
  ctx.fillStyle = '#c9a03a';
  ctx.fillRect(x + s * 0.47, y - s * 0.36, s * 0.1, s * 0.1);
};
B.bathhouse = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.75, s * 0.35, s * 0.1, '#e6dcc4', '#8a9aa0', o);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.45, s * 0.2, Math.PI, 0);
  ctx.fillStyle = o.snow ? '#f2f2ee' : '#8a9aa0';
  ctx.fill();
  line(ctx, 0.6);
};
B.hospice = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.75, s * 0.4, s * 0.25, '#efe6cf', '#6e8a5a', o);
  // Melitele's sheaf over the door.
  ctx.fillStyle = '#c9a03a';
  ctx.fillRect(x - s * 0.03, y - s * 0.62, s * 0.06, s * 0.18);
  ctx.fillRect(x - s * 0.09, y - s * 0.56, s * 0.18, s * 0.05);
};
B.cathedral = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.7, s * 0.5, s * 0.25, '#e8dfc8', '#7a1f1a', o);
  tower(ctx, x - s * 0.22, y - s * 0.05, s * 0.18, s * 0.95, '#e8dfc8', '#7a1f1a', o);
  tower(ctx, x + s * 0.22, y - s * 0.05, s * 0.18, s * 0.95, '#e8dfc8', '#7a1f1a', o);
  // The eternal flame.
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.62, s * 0.05, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e07a2a';
  ctx.fill();
};
B.guildhall = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.7, s * 0.6, s * 0.35, '#d8c9a4', '#23365e', o);
  ctx.fillStyle = '#c9a03a';
  ctx.fillRect(x - s * 0.25, y - s * 0.45, s * 0.5, s * 0.06);
};
B.bank = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.7, s * 0.45, s * 0.12, '#cfc7b8', '#5d6066', o);
  // Columns.
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.5, s * 0.03);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.25 + i * s * 0.17, y);
    ctx.lineTo(x - s * 0.25 + i * s * 0.17, y - s * 0.4);
    ctx.stroke();
  }
};
B.barracks = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.95, s * 0.3, s * 0.2, '#cbbfa2', '#6e5a3e', o);
  flag(ctx, x + s * 0.4, y - s * 0.3, s * 0.4);
};

// ---- Industries ----

function fence(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = TIMBER;
  ctx.lineWidth = Math.max(0.5, w * 0.03);
  ctx.stroke();
}
function barrel(ctx, x, y, s, colour = TIMBER) {
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.12, s * 0.09, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  line(ctx, 0.5);
}
B.pasture = (ctx, x, y, s, o) => {
  // A fold and a shepherd's hut on the downs.
  fence(ctx, x - s * 0.1, y, s * 0.7, s * 0.25);
  house(ctx, x + s * 0.35, y, s * 0.28, s * 0.2, s * 0.16, WALL, '#7a5a3a', o);
};
B.weavers = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.85, s * 0.42, s * 0.28, '#e0d2ae', '#9a5638', o);
  // Bolts of red and blue cloth drying on a line.
  ctx.fillStyle = '#8b1e1e';
  ctx.fillRect(x - s * 0.55, y - s * 0.32, s * 0.08, s * 0.22);
  ctx.fillStyle = '#23365e';
  ctx.fillRect(x - s * 0.44, y - s * 0.32, s * 0.08, s * 0.22);
};
B.distillery = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.6, s * 0.4, s * 0.25, STONE, '#7a5a3a', o);
  // The copper still by the door, and barrels of rye.
  ctx.beginPath();
  ctx.arc(x + s * 0.45, y - s * 0.15, s * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = '#b8733a';
  ctx.fill();
  line(ctx, 0.5);
  barrel(ctx, x - s * 0.42, y, s);
  barrel(ctx, x - s * 0.52, y + s * 0.04, s);
};
B.charcoal = (ctx, x, y, s, o) => {
  // Two smoking clamps of turf-covered wood.
  for (const dx of [-0.22, 0.2]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, y - s * 0.02, s * 0.2, s * 0.22, 0, Math.PI, 0);
    ctx.fillStyle = o.snow ? '#e8e6e0' : '#4a3a2a';
    ctx.fill();
    line(ctx, 0.5);
  }
};
B.weaponsmith = (ctx, x, y, s, o) => {
  B.smithy(ctx, x, y, s, o);
  // A rack of blades by the wall.
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(x - s * 0.5 + i * s * 0.06, y);
    ctx.lineTo(x - s * 0.5 + i * s * 0.06, y - s * 0.32);
  }
  ctx.strokeStyle = '#9aa0a8';
  ctx.lineWidth = Math.max(0.6, s * 0.03);
  ctx.stroke();
};
B.silvermine = (ctx, x, y, s, o) => {
  B.mine(ctx, x, y, s, o);
  ctx.beginPath();
  ctx.arc(x + s * 0.3, y - s * 0.05, s * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#d8dde4';
  ctx.fill();
  line(ctx, 0.5);
};
B.saltpans = (ctx, x, y, s, o) => {
  // Shallow square pans, white with salt, and a raking shed.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 1 ? '#f4f4f4' : '#b9cdd2';
    ctx.fillRect(x - s * 0.55 + i * s * 0.3, y - s * 0.16, s * 0.26, s * 0.16);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - s * 0.55 + i * s * 0.3, y - s * 0.16, s * 0.26, s * 0.16);
  }
  house(ctx, x + s * 0.1, y - s * 0.18, s * 0.26, s * 0.16, s * 0.12, WALL, '#5d6066', o);
};
B.fishery = (ctx, x, y, s, o) => {
  // A jetty, a smokehouse and nets on poles.
  ctx.fillStyle = TIMBER;
  ctx.fillRect(x - s * 0.1, y - s * 0.06, s * 0.6, s * 0.1);
  house(ctx, x - s * 0.25, y, s * 0.38, s * 0.3, s * 0.2, '#c4a87a', '#5a4430', o);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y - s * 0.06);
  ctx.lineTo(x + s * 0.2, y - s * 0.4);
  ctx.lineTo(x + s * 0.42, y - s * 0.4);
  ctx.lineTo(x + s * 0.42, y - s * 0.06);
  line(ctx, 0.5);
};
B.tollbridge = (ctx, x, y, s, o) => {
  // A stone span with a tollhouse and a striped bar.
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y);
  ctx.quadraticCurveTo(x, y - s * 0.35, x + s * 0.6, y);
  ctx.lineTo(x + s * 0.6, y - s * 0.1);
  ctx.quadraticCurveTo(x, y - s * 0.45, x - s * 0.6, y - s * 0.1);
  ctx.closePath();
  ctx.fillStyle = STONE;
  ctx.fill();
  line(ctx, 0.6);
  tower(ctx, x - s * 0.45, y - s * 0.08, s * 0.2, s * 0.32, WALL, '#7a1f1a', o);
  ctx.fillStyle = '#c9a03a';
  ctx.fillRect(x - s * 0.3, y - s * 0.3, s * 0.3, s * 0.04);
};
B.shipyard = (ctx, x, y, s, o) => {
  // A hull on the slipway and a timber crane.
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y - s * 0.3);
  ctx.lineTo(x + s * 0.3, y - s * 0.3);
  ctx.lineTo(x + s * 0.15, y - s * 0.05);
  ctx.lineTo(x - s * 0.38, y - s * 0.05);
  ctx.closePath();
  ctx.fillStyle = '#a07a4a';
  ctx.fill();
  line(ctx, 0.6);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.4 + i * s * 0.2, y - s * 0.3);
    ctx.lineTo(x - s * 0.35 + i * s * 0.2, y - s * 0.55);
    line(ctx, 0.5);
  }
  ctx.beginPath();
  ctx.moveTo(x + s * 0.45, y);
  ctx.lineTo(x + s * 0.45, y - s * 0.8);
  ctx.lineTo(x + s * 0.15, y - s * 0.65);
  line(ctx, Math.max(0.6, s * 0.04));
};
B.stud = (ctx, x, y, s, o) => {
  fence(ctx, x - s * 0.15, y, s * 0.6, s * 0.22);
  house(ctx, x + s * 0.35, y, s * 0.4, s * 0.25, s * 0.18, '#c4a87a', '#9a5638', o);
};
B.quarter = (ctx, x, y, s, o) => {
  // Tall counting houses shoulder to shoulder.
  house(ctx, x - s * 0.28, y, s * 0.32, s * 0.6, s * 0.2, '#e0cf9e', '#23365e', o);
  house(ctx, x + s * 0.05, y, s * 0.32, s * 0.7, s * 0.2, '#d8c9a4', '#7a1f1a', o);
  house(ctx, x + s * 0.38, y, s * 0.3, s * 0.55, s * 0.2, '#e4d6b4', '#5d6066', o);
};
B.hostel = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.85, s * 0.35, s * 0.25, '#efe6cf', '#6e8a5a', o);
  ctx.fillStyle = '#c9a03a';
  ctx.fillRect(x + s * 0.3, y - s * 0.55, s * 0.05, s * 0.16);
  ctx.fillRect(x + s * 0.26, y - s * 0.5, s * 0.13, s * 0.04);
};
B.alchemist = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.5, s * 0.45, s * 0.3, '#cfc7b8', '#4a3a5a', o);
  // A green glow in the window.
  ctx.fillStyle = '#6fbf6a';
  ctx.fillRect(x + s * 0.08, y - s * 0.35, s * 0.1, s * 0.1);
};
B.lodge = (ctx, x, y, s, o) => {
  house(ctx, x, y, s * 0.6, s * 0.32, s * 0.28, TIMBER, '#5a4430', o);
  // Antlers over the door.
  ctx.beginPath();
  ctx.moveTo(x - s * 0.12, y - s * 0.45);
  ctx.lineTo(x, y - s * 0.38);
  ctx.lineTo(x + s * 0.12, y - s * 0.45);
  ctx.moveTo(x - s * 0.08, y - s * 0.5);
  ctx.lineTo(x - s * 0.06, y - s * 0.42);
  ctx.moveTo(x + s * 0.08, y - s * 0.5);
  ctx.lineTo(x + s * 0.06, y - s * 0.42);
  line(ctx, Math.max(0.5, s * 0.03));
};

for (const [id, draw] of Object.entries(B)) {
  registerPlaceholder('structure', id, (ctx, x, y, size, opts = {}) => draw(ctx, x, y, size, opts));
}

// Scaffolding and a crane over a building going up.
registerPlaceholder('structure', 'scaffold', (ctx, x, y, size) => {
  const w = size * 0.7;
  const h = size * 0.5;
  ctx.strokeStyle = TIMBER;
  ctx.lineWidth = Math.max(0.6, size * 0.04);
  ctx.strokeRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y - h);
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x - w / 2, y - h);
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(201, 180, 140, 0.6)';
  ctx.fillRect(x - w / 2, y - h * 0.35, w, h * 0.35);
});

// ---- Ground: fields and pastures, coloured by season ----

const FIELD = {
  spring: ['#8fae5a', '#9cb862', '#86a452'],
  summer: ['#a8b35a', '#b8b05a', '#9eaa52'],
  harvest: ['#d8b65a', '#e0c070', '#cfa94e'],
  winter: ['#a08a6a', '#998366', '#a8927a'],
};

registerPlaceholder('structure', 'field', (ctx, x, y, size, opts = {}) => {
  const { w, h, angle = 0, tone = 0, season = 'summer', snow } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = FIELD[season][tone % 3];
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // Furrows.
  ctx.strokeStyle = 'rgba(60, 45, 25, 0.25)';
  ctx.lineWidth = Math.max(0.4, w * 0.012);
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const fy = -h / 2 + (i * h) / 6;
    ctx.moveTo(-w / 2, fy);
    ctx.lineTo(w / 2, fy);
  }
  ctx.stroke();
  if (snow) {
    ctx.fillStyle = 'rgba(245, 245, 240, 0.55)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.strokeStyle = 'rgba(80, 60, 35, 0.45)';
  ctx.lineWidth = Math.max(0.4, w * 0.02);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
});

registerPlaceholder('structure', 'pasture', (ctx, x, y, size, opts = {}) => {
  const { w, h, angle = 0, snow } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = snow ? '#e8e8e2' : opts.season === 'winter' ? '#9a9a72' : '#8fa860';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // A post-and-rail fence.
  ctx.setLineDash([Math.max(1, w * 0.06), Math.max(1, w * 0.03)]);
  ctx.strokeStyle = 'rgba(90, 65, 40, 0.8)';
  ctx.lineWidth = Math.max(0.4, w * 0.02);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);
  ctx.restore();
});

// Walls: drawn as two halves, the far one behind the town and the near one
// in front, so the town sits inside them.
registerPlaceholder('structure', 'walls', (ctx, x, y, size, opts = {}) => {
  const r = size;
  const half = opts.half ?? 'all';
  const [a0, a1] = half === 'back' ? [Math.PI, Math.PI * 2] : half === 'front' ? [0, Math.PI] : [0, Math.PI * 2];
  const h = Math.max(1.5, r * 0.05);
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = h + 1.4;
  ctx.stroke();
  ctx.strokeStyle = opts.snow ? '#ecebe6' : STONE;
  ctx.lineWidth = h;
  ctx.stroke();
  // Towers round the ring.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const inHalf = half === 'all' || (half === 'back' ? Math.sin(a) < 0 : Math.sin(a) >= 0);
    if (inHalf) tower(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r + h, h * 1.7, h * 2.6, STONE, '#5d6066', opts);
  }
});

// Lanes through the heart of a place: mud, or cobbles once paved.
registerPlaceholder('structure', 'lane', (ctx, x, y, size, opts = {}) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(opts.angle) * size, y + Math.sin(opts.angle) * size * 0.8);
  ctx.strokeStyle = opts.paved ? 'rgba(150, 140, 125, 0.95)' : 'rgba(150, 115, 75, 0.55)';
  ctx.lineWidth = opts.width;
  ctx.lineCap = 'round';
  ctx.stroke();
  if (opts.paved) {
    ctx.setLineDash([opts.width * 0.4, opts.width * 0.4]);
    ctx.strokeStyle = 'rgba(90, 85, 75, 0.5)';
    ctx.lineWidth = opts.width * 0.25;
    ctx.stroke();
    ctx.setLineDash([]);
  }
});

// ---- Life ----

registerPlaceholder('life', 'smoke', (ctx, x, y, size, opts = {}) => {
  const t = opts.phase ?? 0;
  for (let i = 0; i < 3; i++) {
    const k = (t + i / 3) % 1;
    ctx.beginPath();
    ctx.arc(x + Math.sin((t + i) * 3) * size * 0.3 + k * size * 0.4, y - k * size * 1.6, size * (0.18 + k * 0.3), 0, Math.PI * 2);
    ctx.fillStyle = opts.steam ? `rgba(240, 240, 240, ${0.5 * (1 - k)})` : `rgba(105, 100, 95, ${0.6 * (1 - k)})`;
    ctx.fill();
  }
});

registerPlaceholder('life', 'worker', (ctx, x, y, size, opts = {}) => {
  const step = Math.sin((opts.phase ?? 0) * Math.PI * 8) * size * 0.12;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, y);
  ctx.lineTo(x + step * 0.3, y - size * 0.35);
  ctx.lineTo(x + size * 0.12, y);
  line(ctx, Math.max(0.5, size * 0.08));
  ctx.fillStyle = opts.colour ?? '#6e5a3e';
  ctx.fillRect(x - size * 0.13, y - size * 0.75, size * 0.26, size * 0.42);
  ctx.beginPath();
  ctx.arc(x, y - size * 0.88, size * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#d8b48a';
  ctx.fill();
});

registerPlaceholder('life', 'sheep', (ctx, x, y, size, opts = {}) => {
  if (opts.horse) {
    // Legs under a longer, darker body.
    ctx.beginPath();
    for (const dx of [-0.25, 0.25]) {
      ctx.moveTo(x + dx * size, y - size * 0.3);
      ctx.lineTo(x + dx * size, y);
    }
    line(ctx, Math.max(0.4, size * 0.06));
  }
  ctx.beginPath();
  ctx.ellipse(x, y - size * (opts.horse ? 0.4 : 0.3), size * (opts.horse ? 0.45 : 0.4), size * (opts.horse ? 0.2 : 0.26), 0, 0, Math.PI * 2);
  ctx.fillStyle = opts.horse ? '#6b4a2e' : opts.cow ? '#7a5a3a' : '#f0ece0';
  ctx.fill();
  line(ctx, 0.4);
  ctx.beginPath();
  ctx.arc(x + (opts.facing ?? 1) * size * 0.38, y - size * 0.38, size * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#3a3026';
  ctx.fill();
});

registerPlaceholder('life', 'boat', (ctx, x, y, size, opts = {}) => {
  const bob = Math.sin((opts.phase ?? 0) * Math.PI * 2) * size * 0.06;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.5, y - size * 0.15 + bob);
  ctx.lineTo(x + size * 0.5, y - size * 0.15 + bob);
  ctx.lineTo(x + size * 0.32, y + bob);
  ctx.lineTo(x - size * 0.32, y + bob);
  ctx.closePath();
  ctx.fillStyle = TIMBER;
  ctx.fill();
  line(ctx, 0.5);
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.15 + bob);
  ctx.lineTo(x, y - size * 0.75 + bob);
  ctx.lineTo(x + size * 0.3, y - size * 0.25 + bob);
  ctx.closePath();
  ctx.fillStyle = '#efe6cf';
  ctx.fill();
  line(ctx, 0.4);
});
