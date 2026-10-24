// The camera maps world units to CSS pixels: screen = (world - centre) * scale + half the view.

export function createCamera(world) {
  return { x: world.geography.width / 2, y: world.geography.height / 2, scale: 1, minScale: 0.1, maxScale: 8, viewW: 1, viewH: 1 };
}

export function resizeCamera(cam, world, viewW, viewH, first) {
  const { width, height } = world.geography;
  const contain = Math.min(viewW / width, viewH / height);
  const cover = Math.max(viewW / width, viewH / height);
  cam.viewW = viewW;
  cam.viewH = viewH;
  cam.minScale = contain * 0.9;
  cam.maxScale = cover * 7;
  cam.contain = contain;
  // Start filling the screen rather than letterboxed: on a phone the map is
  // otherwise a postage stamp.
  if (first) cam.scale = cover;
  clampCamera(cam, world);
}

export function clampCamera(cam, world) {
  cam.scale = Math.min(cam.maxScale, Math.max(cam.minScale, cam.scale));
  const { width, height } = world.geography;
  // Keep the centre over the map, but let the edges come fully into view.
  const halfW = cam.viewW / 2 / cam.scale;
  const halfH = cam.viewH / 2 / cam.scale;
  cam.x = halfW * 2 >= width ? width / 2 : Math.min(width - halfW, Math.max(halfW, cam.x));
  cam.y = halfH * 2 >= height ? height / 2 : Math.min(height - halfH, Math.max(halfH, cam.y));
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
