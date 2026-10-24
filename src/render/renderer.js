// Draws the map, settlements, labels and ambient units, and answers "what is
// under this finger". The static map is cached in an offscreen canvas and only
// redrawn when the camera moves, so a still map costs little battery.
import { prepareMap, drawMap, COLOURS } from './mapLayer.js';
import { getSprite } from './sprites.js';
import { toScreen } from './camera.js';
import { unitPosition } from '../sim/ambient.js';

const ICON_SIZE = { city: 24, town: 17, castle: 15, temple: 15, village: 10 };
const LABEL_FONT = {
  city: 'bold 15px',
  town: '600 13px',
  castle: '12px',
  temple: 'italic 12px',
  village: '11px',
};
// Zoom (relative to fitting the whole map) at which each kind of label appears.
const LABEL_ZOOM = { city: 0, town: 1.5, castle: 1.9, temple: 1.9, village: 2.6 };
const PRIORITY = { city: 0, town: 1, temple: 2, castle: 3, village: 4 };
const SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
const UNIT_SIZE = 14;

export function createRenderer(canvas, world, cam) {
  const prep = prepareMap(world);
  const ctx = canvas.getContext('2d');
  const cache = document.createElement('canvas');
  const cctx = cache.getContext('2d');
  let dpr = 1;
  let dirty = true;
  let lastSelected = null;
  const ordered = [...world.geography.settlements].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);

  function resize(w, h) {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const c of [canvas, cache]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    dirty = true;
  }

  const zoomRel = () => cam.scale / cam.contain;
  const iconSize = (type) => ICON_SIZE[type] * Math.min(1.5, Math.max(0.8, Math.sqrt(zoomRel() / 2)));

  function drawStatic(selectedId) {
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, cache.width, cache.height);
    const s = cam.scale * dpr;
    cctx.setTransform(s, 0, 0, s, dpr * (cam.viewW / 2 - cam.x * cam.scale), dpr * (cam.viewH / 2 - cam.y * cam.scale));
    drawMap(cctx, prep, world, 1 / cam.scale);

    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRegionLabels(cctx);
    for (const st of ordered.slice().reverse()) {
      const p = toScreen(cam, st.x, st.y);
      getSprite('settlement', st.id, st.type).draw(cctx, p.x, p.y, iconSize(st.type), { capital: st.id === world.kingdom.capital });
    }
    drawSettlementLabels(cctx, selectedId);
  }

  function drawRegionLabels(c) {
    const z = zoomRel();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const n of prep.neighbours) {
      const p = toScreen(cam, n.label.x, n.label.y);
      c.font = `600 ${Math.round(12 + Math.min(6, z * 1.5))}px ${SERIF}`;
      c.fillStyle = 'rgba(52, 40, 28, 0.6)';
      spaced(c, n.name.toUpperCase(), p.x, p.y, 3);
    }
    if (z >= 1.8) {
      c.font = `italic 12px ${SERIF}`;
      c.fillStyle = 'rgba(43, 33, 22, 0.7)';
      for (const t of prep.terrain) {
        const p = toScreen(cam, t.label.x, t.label.y);
        haloText(c, t.name, p.x, p.y + 16);
      }
      c.fillStyle = 'rgba(34, 64, 76, 0.85)';
      for (const r of prep.rivers) {
        const p = toScreen(cam, r.label.x, r.label.y);
        c.save();
        c.translate(p.x, p.y);
        let a = r.label.angle;
        if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
        c.rotate(a);
        haloText(c, r.name, 0, -8);
        c.restore();
      }
    }
    // The realm's own name, faint across the heartland when zoomed out.
    if (z < 2.2) {
      const p = toScreen(cam, 520, 470);
      c.font = `600 ${Math.round(18 + z * 4)}px ${SERIF}`;
      c.fillStyle = 'rgba(110, 29, 22, 0.35)';
      spaced(c, world.kingdom.name.toUpperCase(), p.x, p.y, 8);
    }
  }

  function drawSettlementLabels(c, selectedId) {
    const z = zoomRel();
    const placed = [];
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineJoin = 'round';
    for (const st of ordered) {
      if (z < LABEL_ZOOM[st.type] && st.id !== selectedId) continue;
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -80 || p.y < -40 || p.x > cam.viewW + 80 || p.y > cam.viewH + 40) continue;
      c.font = `${LABEL_FONT[st.type]} ${SERIF}`;
      const w = c.measureText(st.name).width;
      const y = p.y + iconSize(st.type) / 2 + 2;
      const box = { x0: p.x - w / 2 - 2, x1: p.x + w / 2 + 2, y0: y, y1: y + 15 };
      if (st.id !== selectedId && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      c.strokeStyle = 'rgba(236, 224, 194, 0.9)';
      c.lineWidth = 3.5;
      c.strokeText(st.name, p.x, y);
      c.fillStyle = st.id === world.kingdom.capital ? COLOURS.border : COLOURS.ink;
      c.fillText(st.name, p.x, y);
    }
  }

  function draw(state, frac, selection) {
    const selectedId = selection?.settlement ?? null;
    if (dirty || selectedId !== lastSelected) {
      drawStatic(selectedId);
      dirty = false;
      lastSelected = selectedId;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (selectedId) {
      const st = world.byId[selectedId];
      const p = toScreen(cam, st.x, st.y);
      ring(ctx, p.x, p.y, iconSize(st.type) / 2 + 6);
    }

    for (const u of state.ambient.units) {
      const w = unitPosition(world, u, u.pos + u.speed * frac);
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -20 || p.y < -20 || p.x > cam.viewW + 20 || p.y > cam.viewH + 20) continue;
      const facing = Math.cos(w.angle) >= 0 ? 1 : -1;
      getSprite('unit', u.kind, u.kind).draw(ctx, p.x, p.y - 4, UNIT_SIZE, { facing });
      if (selection?.unit === u.id) ring(ctx, p.x, p.y - 4, UNIT_SIZE / 2 + 5);
    }
  }

  // Units first (they sit on top), then settlements. Generous radii keep
  // small targets comfortable for a thumb.
  function pick(sx, sy, state, frac) {
    let best = null;
    for (const u of state.ambient.units) {
      const w = unitPosition(world, u, u.pos + u.speed * frac);
      const p = toScreen(cam, w.x, w.y);
      const d = Math.hypot(p.x - sx, p.y - 4 - sy);
      if (d < 20 && (!best || d < best.d)) best = { d, unit: u.id };
    }
    if (best) return { unit: best.unit };
    for (const st of world.geography.settlements) {
      const p = toScreen(cam, st.x, st.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < Math.max(22, iconSize(st.type) / 2 + 8) && (!best || d < best.d)) best = { d, settlement: st.id };
    }
    return best ? { settlement: best.settlement } : null;
  }

  function unitScreen(state, id, frac) {
    const u = state.ambient.units.find((x) => x.id === id);
    if (!u) return null;
    const w = unitPosition(world, u, u.pos + u.speed * frac);
    return toScreen(cam, w.x, w.y);
  }

  return { resize, draw, pick, unitScreen, invalidate: () => (dirty = true) };
}

function ring(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 236, 170, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = COLOURS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function haloText(c, text, x, y) {
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(236, 224, 194, 0.85)';
  c.lineWidth = 3;
  c.strokeText(text, x, y);
  c.fillText(text, x, y);
}

function spaced(c, text, x, y, gap) {
  const widths = [...text].map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let cx = x - total / 2;
  const align = c.textAlign;
  c.textAlign = 'left';
  [...text].forEach((ch, i) => {
    c.fillText(ch, cx, y);
    cx += widths[i] + gap;
  });
  c.textAlign = align;
}
