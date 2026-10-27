// The board of the North (M20 D), drawn on a light layer of its own over the
// map and faded in as the camera pulls back: each realm tinted over its
// land and named large, a marker on its seat with its men (in hundreds, only
// where the crown can see) and pips for the state of its works, thin routes
// between neighbours, and dashed lines for armies on the march. The tiled
// map underneath simply draws at its far level of detail.
import { toScreen, toWorld } from './camera.js';
import { TEMERIA, sideColours, boardRealms, boardRealm, boardLinks, realmGeometry, marches, realmAtPoint } from '../sim/index.js';

const MARKER = 15;

export function createBoardLayer(parent, world) {
  const canvas = document.createElement('canvas');
  canvas.className = 'map-board';
  canvas.setAttribute('aria-hidden', 'true');
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let shown = false;
  let markers = [];

  function resize(w, h, ratio) {
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function path(cam, shape) {
    ctx.beginPath();
    shape.forEach(([x, y], i) => {
      const p = toScreen(cam, x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
  }

  function draw(state, cam, alpha, { selected = null, orders = [] } = {}) {
    canvas.style.opacity = String(alpha);
    if (alpha <= 0.01) {
      if (shown) ctx.clearRect(0, 0, canvas.width, canvas.height);
      shown = false;
      markers = [];
      return;
    }
    shown = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const realms = boardRealms(state, world);
    const views = Object.fromEntries(realms.map((r) => [r, boardRealm(state, world, r)]));
    // Lands, tinted by who holds them.
    for (const rid of realms) {
      const [field] = sideColours(world, rid);
      ctx.fillStyle = hexA(field, rid === TEMERIA ? 0.34 : 0.26);
      ctx.strokeStyle = hexA(field, 0.7);
      ctx.lineWidth = rid === selected ? 3 : 1.2;
      for (const sh of realmGeometry(world, rid).shapes) {
        path(cam, sh);
        ctx.fill();
        ctx.stroke();
      }
    }
    const at = (rid) => toScreen(cam, views[rid].at.x, views[rid].at.y);
    // Routes between neighbours.
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(234, 220, 188, 0.45)';
    for (const [a, b] of boardLinks(world)) {
      if (!views[a] || !views[b]) continue;
      const p = at(a);
      const q = at(b);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    // Armies on the march, as dashed lines with an arrow.
    for (const m of marches(state, world)) {
      if (!views[m.from] || !views[m.to]) continue;
      const p = at(m.from);
      const q = at(m.to);
      const [field] = sideColours(world, m.side);
      ctx.strokeStyle = field;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      const tip = { x: q.x - Math.cos(a) * (MARKER + 4), y: q.y - Math.sin(a) * (MARKER + 4) };
      ctx.fillStyle = field;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - Math.cos(a - 0.45) * 12, tip.y - Math.sin(a - 0.45) * 12);
      ctx.lineTo(tip.x - Math.cos(a + 0.45) * 12, tip.y - Math.sin(a + 0.45) * 12);
      ctx.closePath();
      ctx.fill();
    }
    // Names, large over each land: over its middle, else above or below its
    // marker. The biggest realms are named first, and a name that would cover
    // another, or a marker, is made smaller, moved, or left out.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const taken = realms.map((rid) => { const p = at(rid); return { x0: p.x - MARKER - 30, x1: p.x + MARKER + 30, y0: p.y - MARKER, y1: p.y + MARKER + 10 }; });
    const hits = (b) => taken.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0);
    for (const rid of [...realms].sort((a, b) => (b === TEMERIA) - (a === TEMERIA) || views[b].towns - views[a].towns)) {
      const c = realmGeometry(world, rid).centre;
      const m = at(rid);
      const mid = toScreen(cam, c.x, c.y);
      const spots = [mid, { x: m.x, y: m.y - MARKER - 14 }, { x: m.x, y: m.y + MARKER + 22 }];
      if (Math.hypot(mid.x - m.x, mid.y - m.y) < MARKER * 3) spots.shift();
      const name = views[rid].name.toUpperCase();
      let placed = false;
      for (const size of rid === TEMERIA ? [22, 17] : [17, 13]) {
        ctx.font = `600 ${size}px "Palatino Linotype", Palatino, Georgia, serif`;
        const w = ctx.measureText(name).width / 2 + 2;
        for (const p of spots) {
          const box = { x0: p.x - w, x1: p.x + w, y0: p.y - size / 2, y1: p.y + size / 2 };
          if (hits(box)) continue;
          taken.push(box);
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(29, 22, 16, 0.75)';
          ctx.strokeText(name, p.x, p.y);
          ctx.fillStyle = '#efe2c2';
          ctx.fillText(name, p.x, p.y);
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    // Markers: banner disc, men in hundreds, works pips; pending orders.
    markers = [];
    for (const rid of realms) {
      const v = views[rid];
      const p = at(rid);
      const [field, charge] = sideColours(world, rid);
      ctx.beginPath();
      ctx.arc(p.x, p.y, MARKER, 0, Math.PI * 2);
      ctx.fillStyle = field;
      ctx.fill();
      ctx.lineWidth = rid === selected ? 3.5 : 2;
      ctx.strokeStyle = rid === selected ? '#d2ab5f' : v.war ? '#c0392b' : 'rgba(239, 226, 194, 0.9)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, MARKER * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = charge;
      ctx.fill();
      // Men, in hundreds.
      const men = v.men === null ? '?' : `${Math.round(v.men / 100)}`;
      ctx.font = '700 12px Georgia, serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(29, 22, 16, 0.85)';
      ctx.strokeText(men, p.x + MARKER + 9, p.y - 3);
      ctx.fillStyle = '#efe2c2';
      ctx.fillText(men, p.x + MARKER + 9, p.y - 3);
      // Five pips for the works: red for those worn or ruined.
      const bad = v.works.n ? Math.round((5 * v.works.worn) / v.works.n) : 0;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(p.x - 12 + i * 6, p.y + MARKER + 6, 2.3, 0, Math.PI * 2);
        ctx.fillStyle = i >= 5 - bad ? '#c0392b' : '#8fbf62';
        ctx.fill();
      }
      const mine = orders.filter((o) => o.realm === rid);
      mine.forEach((o, i) => {
        const x = p.x - MARKER - 10 - i * 14;
        ctx.beginPath();
        ctx.arc(x, p.y - 4, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#d2ab5f';
        ctx.fill();
        ctx.font = '700 9px Georgia, serif';
        ctx.fillStyle = '#1d1610';
        ctx.fillText(o.kind[0].toUpperCase(), x, p.y - 4);
      });
      markers.push({ rid, x: p.x, y: p.y });
    }
  }

  // The realm under a tap: a marker, or the land itself.
  function pick(cam, sx, sy) {
    let best = null;
    for (const m of markers) {
      const d = Math.hypot(m.x - sx, m.y - sy);
      if (d < MARKER + 12 && (!best || d < best.d)) best = { d, rid: m.rid };
    }
    if (best) return best.rid;
    if (!markers.length) return null;
    const w = toWorld(cam, sx, sy);
    const rid = realmAtPoint(world, w.x, w.y);
    return rid && markers.some((m) => m.rid === rid) ? rid : null;
  }

  return { canvas, resize, draw, pick };
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// How far the map has turned into the board: 0 in the kingdom view, 1 on
// the board, a cross-fade between around two thirds of the opening zoom.
export function boardness(cam) {
  const s = cam.scale / (cam.cover || cam.scale);
  return Math.max(0, Math.min(1, (BOARD.full - s) / (BOARD.full - BOARD.board)));
}

// The zoom band of the cross-fade, against the opening zoom (cover).
export const BOARD = { full: 0.76, board: 0.56 };
