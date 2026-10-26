// The camera maps world units to CSS pixels: screen = (world - centre) * scale + half the view.
// It opens framed on the home realm (the geography's width and height) and
// can roam the whole world (its bounds).

export function worldBounds(world) {
  const g = world.geography;
  const [x0, y0, x1, y1] = g.bounds ?? [0, 0, g.width, g.height];
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function createCamera(world) {
  return { x: world.geography.width / 2, y: world.geography.height / 2, scale: 1, minScale: 0.1, maxScale: 8, viewW: 1, viewH: 1 };
}

export function resizeCamera(cam, world, viewW, viewH, first) {
  const { width, height } = world.geography;
  const b = worldBounds(world);
  // Zoom levels are measured against the home realm so labels and dressing
  // appear at the same zoom as before the world grew.
  const contain = Math.min(viewW / width, viewH / height);
  const cover = Math.max(viewW / width, viewH / height);
  cam.viewW = viewW;
  cam.viewH = viewH;
  cam.minScale = Math.min(viewW / b.w, viewH / b.h) * 0.95;
  cam.maxScale = cover * 7;
  cam.contain = contain;
  // Start filling the screen with the home realm rather than letterboxed.
  if (first) cam.scale = cover;
  clampCamera(cam, world);
}

export function clampCamera(cam, world) {
  cam.scale = Math.min(cam.maxScale, Math.max(cam.minScale, cam.scale));
  const b = worldBounds(world);
  // Keep the centre over the world, but let its edges come fully into view.
  const halfW = cam.viewW / 2 / cam.scale;
  const halfH = cam.viewH / 2 / cam.scale;
  cam.x = halfW * 2 >= b.w ? b.x0 + b.w / 2 : Math.min(b.x1 - halfW, Math.max(b.x0 + halfW, cam.x));
  cam.y = halfH * 2 >= b.h ? b.y0 + b.h / 2 : Math.min(b.y1 - halfH, Math.max(b.y0 + halfH, cam.y));
}

export function toScreen(cam, x, y) {
  return { x: (x - cam.x) * cam.scale + cam.viewW / 2, y: (y - cam.y) * cam.scale + cam.viewH / 2 };
}

export function toWorld(cam, sx, sy) {
  return { x: (sx - cam.viewW / 2) / cam.scale + cam.x, y: (sy - cam.viewH / 2) / cam.scale + cam.y };
}

// Zoom by `factor` keeping the world point under (sx, sy) where it is.
export function zoomAt(cam, world, sx, sy, factor) {
  const before = toWorld(cam, sx, sy);
  cam.scale *= factor;
  clampCamera(cam, world);
  const after = toWorld(cam, sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCamera(cam, world);
}

export function panBy(cam, world, dx, dy) {
  cam.x -= dx / cam.scale;
  cam.y -= dy / cam.scale;
  clampCamera(cam, world);
}
