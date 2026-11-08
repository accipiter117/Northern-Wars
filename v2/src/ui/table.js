// The war table (v2 step 2): the North on a wooden table, provinces tinted
// by realm, rivers, roads and crossings, towers for capitals, pins for the
// smaller realms, and carved pieces for armies. Drag one of your pieces to
// a lit region to march; tap a region or a piece to see it. Pan with one
// finger on the table, pinch or wheel to zoom.
import { realmShapes } from '../engine/board.js';
import { controller, reachable } from '../engine/game.js';

const RASTER = 4; // map units per pixel of the province layer

export function createTable(canvas, app) {
  const ctx = canvas.getContext('2d');
  const { table } = app;
  const geo = table.world.geography;
  const [bx0, by0, bx1, by1] = geo.bounds;
  const view = { x: 0, y: 0, z: 1 };
  let layer = null;
  let drag = null;
  let dpr = 1;

  // ---- The province layer: each pixel to the nearest heart of its realm ----
  function buildLayer() {
    const w = Math.ceil((bx1 - bx0) / RASTER);
    const h = Math.ceil((by1 - by0) / RASTER);
    const realms = realmShapes(geo);
    const ids = [...new Set(realms.map((r) => r.realm))];
    const mask = new OffscreenCanvasOr(w, h);
    const mctx = mask.getContext('2d');
    mctx.imageSmoothingEnabled = false;
    realms.forEach((r) => {
      const i = ids.indexOf(r.realm) + 1;
      mctx.fillStyle = `rgb(${i},0,0)`;
      mctx.beginPath();
      r.shape.forEach(([x, y], k) => (k ? mctx.lineTo : mctx.moveTo).call(mctx, (x - bx0) / RASTER, (y - by0) / RASTER));
      mctx.closePath();
      mctx.fill();
    });
    const m = mctx.getImageData(0, 0, w, h).data;
    const hearts = {};
    for (const r of Object.values(table.board.regions)) (hearts[r.realm] ??= []).push(r);
    const owner = new Int16Array(w * h).fill(-1);
    const index = Object.keys(table.board.regions);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const realm = ids[m[(py * w + px) * 4] - 1];
        const list = realm && hearts[realm];
        if (!list) continue;
        const x = bx0 + px * RASTER;
        const y = by0 + py * RASTER;
        let best = list[0];
        let bd = Infinity;
        for (const r of list) {
          const d = (r.x - x) ** 2 + (r.y - y) ** 2;
          if (d < bd) { bd = d; best = r; }
        }
        owner[py * w + px] = index.indexOf(best.id);
      }
    }
    return { w, h, owner, index, canvas: new OffscreenCanvasOr(w, h), key: '' };
  }

  // Paint the layer by who controls each region now.
  function paintLayer() {
    const key = Object.keys(app.state.cities).map((id) => controller(app.state, id)).join(',');
    if (layer.key === key) return;
    layer.key = key;
    const { w, h, owner, index } = layer;
    const lctx = layer.canvas.getContext('2d');
    const img = lctx.createImageData(w, h);
    const tint = index.map((id) => hex(colourOf(controller(app.state, id))));
    const realmOf = index.map((id) => table.board.regions[id].realm);
    for (let i = 0; i < w * h; i++) {
      const o = owner[i];
      if (o < 0) continue;
      const [r, g, b] = tint[o];
      const right = i % w < w - 1 ? owner[i + 1] : o;
      const down = i + w < w * h ? owner[i + w] : o;
      const edge = right !== o || down !== o;
      const realmEdge = edge && ((right >= 0 && realmOf[right] !== realmOf[o]) || (down >= 0 && realmOf[down] !== realmOf[o]) || right < 0 || down < 0);
      const k = realmEdge ? 0.35 : edge ? 0.7 : 1;
      // Parchment, washed with the controller's colour.
      img.data[i * 4] = (239 * 0.62 + r * 0.38) * k;
      img.data[i * 4 + 1] = (226 * 0.62 + g * 0.38) * k;
      img.data[i * 4 + 2] = (192 * 0.62 + b * 0.38) * k;
      img.data[i * 4 + 3] = 255;
    }
    lctx.putImageData(img, 0, 0);
  }

  const colourOf = (rid) => table.colours[rid]?.[0] ?? '#777777';

  // ---- Camera ----
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    if (!view.set) {
      // Start over the player's own realm.
      const own = Object.values(table.board.regions).filter((r) => r.realm === app.state.player);
      const cx = own.reduce((a, r) => a + r.x, 0) / own.length;
      const cy = own.reduce((a, r) => a + r.y, 0) / own.length;
      view.z = Math.min(canvas.clientWidth / 900, canvas.clientHeight / 1000) * 1.1;
      view.x = cx;
      view.y = cy;
      view.set = true;
    }
    draw();
  }
  const toScreen = (x, y) => [((x - view.x) * view.z + canvas.clientWidth / 2), ((y - view.y) * view.z + canvas.clientHeight / 2)];
  const toMap = (sx, sy) => [(sx - canvas.clientWidth / 2) / view.z + view.x, (sy - canvas.clientHeight / 2) / view.z + view.y];

  // ---- Drawing ----
  function draw() {
    if (!layer) layer = buildLayer();
    paintLayer();
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The table.
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#3b2715');
    grd.addColorStop(1, '#24170c');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let y = (view.y * view.z) % 23; y < H; y += 23) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W / 3, y + 6, (2 * W) / 3, y - 6, W, y + 2);
      ctx.stroke();
    }
    // The map.
    const [mx, my] = toScreen(bx0, by0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer.canvas, mx, my, layer.w * RASTER * view.z, layer.h * RASTER * view.z);
    drawRivers();
    drawLinks();
    if (drag?.reach) drawReach(drag.reach);
    else if (app.selected?.army) drawReach(app.selected.reach);
    drawRegions();
    drawArmies();
  }

  function drawRivers() {
    const barriers = new Set(table.data.board.barriers);
    for (const [name, pts] of Object.entries(geo.rivers ?? {})) {
      ctx.strokeStyle = barriers.has(name) ? '#3f6f99' : 'rgba(70,120,160,0.7)';
      ctx.lineWidth = (barriers.has(name) ? 3.2 : 1.4) * Math.max(0.6, view.z);
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const [sx, sy] = toScreen(x, y); (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx, sy); });
      ctx.stroke();
    }
    for (const l of geo.lakes ?? []) {
      const [sx, sy] = toScreen(l.x, l.y);
      ctx.fillStyle = '#5b86ab';
      ctx.beginPath();
      ctx.ellipse(sx, sy, l.rx * view.z, l.ry * view.z, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLinks() {
    for (const l of Object.values(table.board.links)) {
      if (l.closed) continue;
      const a = table.board.regions[l.a];
      const b = table.board.regions[l.b];
      const [ax, ay] = toScreen(a.x, a.y);
      const [bx, by] = toScreen(b.x, b.y);
      ctx.strokeStyle = l.road ? 'rgba(92,60,30,0.85)' : 'rgba(92,60,30,0.35)';
      ctx.lineWidth = l.road ? 2 : 1.2;
      ctx.setLineDash(l.road ? [] : [4, 5]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      if (l.crossing) {
        // A small bridge where a road crosses a great river.
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        ctx.fillStyle = '#e9d9b0';
        ctx.strokeStyle = '#4a3218';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, Math.PI, 0);
        ctx.lineTo(cx + 6, cy + 3);
        ctx.lineTo(cx - 6, cy + 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawReach(reach) {
    for (const id of Object.keys(reach ?? {})) {
      const r = table.board.regions[id];
      const [sx, sy] = toScreen(r.x, r.y);
      ctx.fillStyle = 'rgba(255, 220, 120, 0.35)';
      ctx.strokeStyle = '#f3d27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawRegions() {
    const big = view.z > 0.55;
    for (const r of Object.values(table.board.regions)) {
      const [sx, sy] = toScreen(r.x, r.y);
      if (sx < -60 || sy < -60 || sx > canvas.clientWidth + 60 || sy > canvas.clientHeight + 60) continue;
      const ctl = controller(app.state, r.id);
      const great = table.data.game.powers.includes(r.realm);
      if (r.capital && great) tower(sx, sy, colourOf(r.realm));
      else if (r.capital) pin(sx, sy, colourOf(r.realm));
      else {
        ctx.fillStyle = r.type === 'castle' ? '#4a3a2a' : '#6b5232';
        ctx.beginPath();
        if (r.type === 'castle') ctx.rect(sx - 4, sy - 4, 8, 8);
        else ctx.arc(sx, sy, r.type === 'city' ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // A vassal's capital flies its suzerain's flag beside its own pin.
      const suz = r.capital && app.state.minors?.[r.realm]?.suzerain;
      if (suz) flag(sx - 14, sy - 4, colourOf(suz));
      // An occupied region flies its holder's flag.
      if (ctl !== r.realm) flag(sx + 8, sy - 6, colourOf(ctl));
      if (app.state.cities[r.id].siege) {
        ctx.strokeStyle = '#c0503a';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (big || r.capital) {
        ctx.font = `${r.capital ? 'bold ' : ''}${r.capital ? 13 : 11}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(239,226,192,0.9)';
        ctx.strokeText(r.name, sx, sy + 18);
        ctx.fillStyle = '#2b2116';
        ctx.fillText(r.name, sx, sy + 18);
      }
      if (app.selected?.region === r.id) {
        ctx.strokeStyle = '#fff4c8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function tower(x, y, colour) {
    ctx.fillStyle = '#d8c79c';
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 8);
    ctx.lineTo(x - 6, y - 8);
    for (let i = 0; i < 3; i++) { ctx.lineTo(x - 6 + i * 4, y - 12); ctx.lineTo(x - 4 + i * 4, y - 12); ctx.lineTo(x - 4 + i * 4, y - 8); ctx.lineTo(x - 2 + i * 4, y - 8); }
    ctx.lineTo(x + 6, y - 8);
    ctx.lineTo(x + 7, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    flag(x, y - 12, colour);
  }

  function pin(x, y, colour) {
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y - 12);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 10, y - 9);
    ctx.lineTo(x, y - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function flag(x, y, colour) {
    ctx.strokeStyle = '#2b2116';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 9);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.fillRect(x, y - 9, 8, 5);
  }

  // Armies: carved pieces, stacked when several share a region.
  function armyPositions() {
    const by = {};
    for (const a of app.state.armies) (by[a.region] ??= []).push(a);
    const out = [];
    for (const [id, list] of Object.entries(by)) {
      const r = table.board.regions[id];
      list.forEach((a, i) => {
        const [sx, sy] = toScreen(r.x, r.y);
        out.push({ a, x: sx - 14 + i * 9, y: sy - 22 - i * 4 });
      });
    }
    return out;
  }

  function drawArmies() {
    for (const p of armyPositions()) {
      if (drag?.army === p.a) continue;
      piece(p.x, p.y, p.a, app.selected?.army === p.a.id);
    }
    if (drag?.army) piece(drag.x, drag.y - 20, drag.army, true);
  }

  function piece(x, y, a, lit) {
    const colour = colourOf(a.owner);
    // A carved and painted wooden piece: a base, a rounded body, a head.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 15, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.strokeStyle = lit ? '#fff4c8' : '#1a120a';
    ctx.lineWidth = lit ? 2.5 : 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 14);
    ctx.quadraticCurveTo(x - 12, y - 2, x - 6, y - 4);
    ctx.lineTo(x + 6, y - 4);
    ctx.quadraticCurveTo(x + 12, y - 2, x + 11, y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 9, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x - 7, y - 2, 3, 14);
    ctx.fillStyle = table.colours[a.owner]?.[1] ?? '#efe6cf';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(a.companies.length), x, y + 10);
    if (a.owner === app.state.player && a.points <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(x, y - 9, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Input ----
  const pointers = new Map();
  let pan = null;
  let pinch = null;
  let moved = 0;

  const local = (e) => {
    const b = canvas.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };

  function pieceAt(sx, sy) {
    const list = armyPositions().reverse();
    return list.find((p) => Math.abs(p.x - sx) < 16 && sy > p.y - 18 && sy < p.y + 18)?.a ?? null;
  }

  function regionAt(sx, sy, within = 28) {
    let best = null;
    let bd = within ** 2;
    for (const r of Object.values(table.board.regions)) {
      const [x, y] = toScreen(r.x, r.y);
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = local(e);
    pointers.set(e.pointerId, [sx, sy]);
    moved = 0;
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), z: view.z };
      drag = null;
      pan = null;
      return;
    }
    const a = pieceAt(sx, sy);
    if (a && a.owner === app.state.player && !app.state.over) {
      drag = { army: a, x: sx, y: sy, reach: reachable(app.state, table, a) };
    } else pan = { sx, sy, x: view.x, y: view.y, hit: a };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const [sx, sy] = local(e);
    const [px, py] = pointers.get(e.pointerId);
    moved += Math.abs(sx - px) + Math.abs(sy - py);
    pointers.set(e.pointerId, [sx, sy]);
    if (pinch && pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      view.z = clampZ(pinch.z * (Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) / pinch.d));
      draw();
    } else if (drag) {
      drag.x = sx;
      drag.y = sy;
      draw();
    } else if (pan) {
      view.x = pan.x - (sx - pan.sx) / view.z;
      view.y = pan.y - (sy - pan.sy) / view.z;
      draw();
    }
  });

  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const [sx, sy] = local(e);
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (drag) {
      const d = drag;
      drag = null;
      if (moved < 8) app.select({ army: d.army.id });
      else {
        const r = regionAt(sx, sy, 34);
        if (r && d.reach[r.id]) app.march(d.army.id, r.id);
        else draw();
      }
      return;
    }
    if (pan && moved < 8) {
      // A tap: a piece, a lit region for the chosen army, or a region.
      const hit = pan.hit;
      const r = regionAt(sx, sy);
      if (app.selected?.army && r && app.selected.reach?.[r.id]) app.march(app.selected.army, r.id);
      else if (hit) app.select({ army: hit.id });
      else if (r) app.select({ region: r.id });
      else app.select(null);
    }
    pan = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.z = clampZ(view.z * (e.deltaY < 0 ? 1.12 : 0.9));
    draw();
  }, { passive: false });
  window.addEventListener('resize', fit);

  const clampZ = (z) => Math.max(0.2, Math.min(3, z));

  // For browser tests: where a region or a piece sits on screen.
  const screenOf = (id) => {
    const r = table.board.regions[id];
    const b = canvas.getBoundingClientRect();
    const [x, y] = toScreen(r.x, r.y);
    return { x: x + b.left, y: y + b.top };
  };
  const pieceOf = (armyId) => {
    const p = armyPositions().find((q) => q.a.id === armyId);
    const b = canvas.getBoundingClientRect();
    return p ? { x: p.x + b.left, y: p.y + b.top } : null;
  };
  const centreOn = (id) => {
    const r = table.board.regions[id];
    view.x = r.x;
    view.y = r.y;
    draw();
  };

  fit();
  return { draw, fit, screenOf, pieceOf, centreOn };
}

function OffscreenCanvasOr(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
