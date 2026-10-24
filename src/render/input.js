import { panBy, zoomAt } from './camera.js';

const TAP_SLOP = 10;

// Pointer handling for the map: one finger pans, two pinch, a short still
// touch is a tap, the mouse wheel zooms. onChange fires whenever the view moves.
export function attachMapInput(canvas, cam, world, { onTap, onChange }) {
  const pointers = new Map();
  let tapStart = null;
  let pinch = null;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) tapStart = { ...local(e), t: performance.now(), moved: 0 };
    else {
      tapStart = null;
      pinch = pinchInfo();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      panBy(cam, world, p.x - prev.x, p.y - prev.y);
      if (tapStart) tapStart.moved = Math.max(tapStart.moved, Math.hypot(p.x - tapStart.x, p.y - tapStart.y));
      onChange();
    } else if (pointers.size === 2 && pinch) {
      const now = pinchInfo();
      panBy(cam, world, now.mx - pinch.mx, now.my - pinch.my);
      if (pinch.d > 0) zoomAt(cam, world, now.mx, now.my, now.d / pinch.d);
      pinch = now;
      onChange();
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (e.type === 'pointerup' && tapStart && tapStart.moved < TAP_SLOP && performance.now() - tapStart.t < 600) {
      onTap(p.x, p.y);
    }
    if (pointers.size === 0) tapStart = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(cam, world, p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    onChange();
  }, { passive: false });
}
