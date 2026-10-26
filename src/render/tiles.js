// The static map pre-rendered into square tiles at a few levels of detail,
// so a pan or a pinch only copies finished pictures instead of drawing every
// forest, peak and river again. A level is a resolution in device pixels per
// map unit; the renderer asks for the finest level its zoom needs. Tiles are
// drawn as they are first wanted, a few each frame within a time budget,
// with a coarser tile standing in until the fine one is ready. The coarsest
// level covers the whole world in a handful of tiles and is drawn first.
const LEVELS = [0.25, 0.5, 1, 2, 4, 8];

export function createTiles({ paint, size = 256, cap = 140 }) {
  const cache = new Map();
  const stats = { drawn: 0 };
  const span = (l) => size / LEVELS[l];
  const key = (l, tx, ty) => `${l}:${tx}:${ty}`;

  function make(l, tx, ty) {
    const L = LEVELS[l];
    const w = span(l);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.setTransform(L, 0, 0, L, -tx * w * L, -ty * w * L);
    paint(ctx, { x0: tx * w, y0: ty * w, x1: (tx + 1) * w, y1: (ty + 1) * w }, L);
    const k = key(l, tx, ty);
    cache.set(k, c);
    stats.drawn += 1;
    // Forget the least recently used, keeping the coarsest for stand-ins.
    if (cache.size > cap) {
      for (const old of cache.keys()) {
        if (cache.size <= cap) break;
        if (!old.startsWith('0:')) cache.delete(old);
      }
    }
    return c;
  }

  function get(l, tx, ty) {
    const k = key(l, tx, ty);
    const c = cache.get(k);
    if (c) {
      cache.delete(k);
      cache.set(k, c);
    }
    return c;
  }

  // Draw the tiles covering `view` (map units) onto a context already set to
  // map units. Returns true when every tile was at the wanted level.
  function draw(ctx, view, density, budgetMs = 6) {
    let l = LEVELS.findIndex((L) => L >= density * 0.95);
    if (l < 0) l = LEVELS.length - 1;
    const start = performance.now();
    let complete = true;
    const w = span(l);
    const tx0 = Math.floor(view.x0 / w);
    const ty0 = Math.floor(view.y0 / w);
    const tx1 = Math.floor(view.x1 / w);
    const ty1 = Math.floor(view.y1 / w);
    // A hair of overlap hides the seams between tiles.
    const lap = w / size;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        let tile = get(l, tx, ty);
        if (!tile && performance.now() - start < budgetMs) tile = make(l, tx, ty);
        if (tile) {
          ctx.drawImage(tile, tx * w, ty * w, w + lap, w + lap);
          continue;
        }
        complete = false;
        // Stand in with the finest coarser tile already drawn (the coarsest
        // level is always drawn when wanted).
        for (let k = l - 1; k >= 0; k--) {
          const cw = span(k);
          const cx = Math.floor((tx * w) / cw);
          const cy = Math.floor((ty * w) / cw);
          const c = get(k, cx, cy) ?? (k === 0 ? make(0, cx, cy) : null);
          if (!c) continue;
          // Only the part of the coarse tile under this fine one.
          const sx = ((tx * w - cx * cw) / cw) * size;
          const sy = ((ty * w - cy * cw) / cw) * size;
          const sw = (w / cw) * size;
          ctx.drawImage(c, sx, sy, sw, sw, tx * w, ty * w, w + lap, w + lap);
          break;
        }
      }
    }
    return complete;
  }

  return {
    draw,
    clear: () => cache.clear(),
    stats,
    get size() { return cache.size; },
  };
}
