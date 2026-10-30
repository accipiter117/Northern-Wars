import { panBy, zoomAt } from './camera.js';

const TAP_SLOP = 10;
const PRESS_MS = 450;
// The ring only appears once a touch has lasted this long, so quick taps
// never flash it.
const RING_AFTER = 110;
const DOUBLE_MS = 300;
const DOUBLE_SLOP = 30;
// Momentum: how fast a flick must be to glide (px per ms), and how quickly
// the glide dies away (ms for the speed to fall to about a third).
const FLICK = 0.25;
const FRICTION_MS = 325;

// Pointer handling for the map. One finger pans, and a flick glides on with
// friction; two pinch, anchored between the fingers; a short still touch is
// a tap, two quick taps zoom in, a two-finger tap zooms out; a still touch
// held about half a second is a long press, with a ring filling under the
// finger as it comes. The mouse wheel zooms. onChange fires whenever the
// view moves.
export function attachMapInput(canvas, cam, world, { onTap, onDoubleTap, onLongPress, onPress, onChange }) {
  const pointers = new Map();
  let tapStart = null;
  let pinch = null;
  let press = null;
  let lastTap = null;
  let twoTap = null;
  let glide = null;
  let zoomAnim = null;
  let samples = [];

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.ring);
    clearTimeout(press.fire);
    if (press.shown) onPress?.(null);
    press = null;
  }

  function stopMotion() {
    glide = null;
    zoomAnim = null;
  }

  // Glide on after a flick, slowing with friction until it comes to rest.
  function startGlide(vx, vy) {
    glide = { vx, vy, t: performance.now() };
    const step = (now) => {
      if (!glide) return;
      const dt = Math.min(50, now - glide.t);
      glide.t = now;
      const before = { x: cam.x, y: cam.y };
      panBy(cam, world, glide.vx * dt, glide.vy * dt);
      const decay = Math.exp(-dt / FRICTION_MS);
      glide.vx *= decay;
      glide.vy *= decay;
      onChange();
      // Stop when it has all but stopped, or run into the edge of the world.
      if (Math.hypot(glide.vx, glide.vy) < 0.02 || (before.x === cam.x && before.y === cam.y)) glide = null;
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Zoom smoothly by `factor` about a screen point.
  function animateZoom(sx, sy, factor, ms = 220) {
    stopMotion();
    const start = performance.now();
    let done = 1;
    zoomAnim = {};
    const anim = zoomAnim;
    const step = (now) => {
      if (zoomAnim !== anim) return;
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      const want = factor ** eased;
      zoomAt(cam, world, sx, sy, want / done);
      done = want;
      onChange();
      if (t < 1) requestAnimationFrame(step);
      else zoomAnim = null;
    };
    requestAnimationFrame(step);
  }

  // Glide the view to a map point at a given scale (M24 follow-up): pan and
  // zoom together, easing in and out, so the player sees where an order
  // has sent someone. Reduced motion jumps straight there.
  function flyTo(x, y, scale, ms = 900) {
    stopMotion();
    const s0 = cam.scale;
    const x0 = cam.x;
    const y0 = cam.y;
    const place = (e) => {
      zoomAt(cam, world, cam.viewW / 2, cam.viewH / 2, (s0 * (scale / s0) ** e) / cam.scale);
      const cx = x0 + (x - x0) * e;
      const cy = y0 + (y - y0) * e;
      panBy(cam, world, (cam.x - cx) * cam.scale, (cam.y - cy) * cam.scale);
      onChange();
    };
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return place(1);
    const start = performance.now();
    zoomAnim = {};
    const anim = zoomAnim;
    const step = (now) => {
      if (zoomAnim !== anim) return;
      const t = Math.min(1, (now - start) / ms);
      place(t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
      if (t < 1) requestAnimationFrame(step);
      else zoomAnim = null;
    };
    requestAnimationFrame(step);
  }

  canvas.addEventListener('pointerdown', (e) => {
    stopMotion();
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      tapStart = { ...p, t: performance.now(), moved: 0, pressed: false };
      samples = [{ ...p, t: e.timeStamp || performance.now() }];
      press = {
        x: p.x, y: p.y, shown: false,
        ring: setTimeout(() => { if (press) { press.shown = true; onPress?.({ x: p.x, y: p.y, ms: PRESS_MS - RING_AFTER }); } }, RING_AFTER),
        fire: setTimeout(() => {
          if (!press || !tapStart) return;
          const at = press;
          cancelPress();
          tapStart.pressed = true;
          onLongPress?.(at.x, at.y);
        }, PRESS_MS),
      };
    } else {
      cancelPress();
      tapStart = null;
      pinch = pinchInfo();
      if (pointers.size === 2) twoTap = { t: performance.now(), moved: 0, start: pinch };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      if (tapStart?.pressed) return;
      if (tapStart) tapStart.moved = Math.max(tapStart.moved, Math.hypot(p.x - tapStart.x, p.y - tapStart.y));
      if (press && Math.hypot(p.x - press.x, p.y - press.y) > TAP_SLOP) cancelPress();
      panBy(cam, world, p.x - prev.x, p.y - prev.y);
      // When the finger moved, not when the event was handled: a long
      // frame (tiles being painted) must not swallow a flick.
      samples.push({ ...p, t: e.timeStamp || performance.now() });
      if (samples.length > 8) samples.shift();
      onChange();
    } else if (pointers.size === 2 && pinch) {
      const now = pinchInfo();
      if (twoTap) twoTap.moved = Math.max(twoTap.moved, Math.abs(now.d - twoTap.start.d), Math.hypot(now.mx - twoTap.start.mx, now.my - twoTap.start.my));
      panBy(cam, world, now.mx - pinch.mx, now.my - pinch.my);
      if (pinch.d > 0) zoomAt(cam, world, now.mx, now.my, now.d / pinch.d);
      pinch = now;
      onChange();
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    const was = pointers.size;
    pointers.delete(e.pointerId);
    const now = performance.now();
    // A two-finger tap: both fingers down and up again quickly, barely moved.
    if (was === 2 && twoTap && e.type === 'pointerup' && now - twoTap.t < DOUBLE_MS && twoTap.moved < 15) {
      const mid = twoTap.start;
      twoTap = null;
      tapStart = null;
      animateZoom(mid.mx, mid.my, 0.5);
    }
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      twoTap = null;
      cancelPress();
      if (e.type === 'pointerup' && tapStart && !tapStart.pressed && tapStart.moved < TAP_SLOP && now - tapStart.t < 600) {
        const dbl = lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_SLOP;
        lastTap = dbl ? null : { x: p.x, y: p.y, t: now };
        if (!(dbl && onDoubleTap?.(p.x, p.y, (f) => animateZoom(p.x, p.y, f)))) onTap(p.x, p.y);
      } else if (e.type === 'pointerup' && tapStart && !tapStart.pressed && tapStart.moved >= TAP_SLOP) {
        // A flick: the speed over the last tenth of a second carries on,
        // timed by when the finger moved and lifted.
        const lift = e.timeStamp || now;
        const recent = samples.filter((s) => lift - s.t < 100);
        const a = recent[0];
        const b = recent.at(-1);
        if (a && b && b.t > a.t && lift - b.t < 60) {
          const vx = (b.x - a.x) / (b.t - a.t);
          const vy = (b.y - a.y) / (b.t - a.t);
          if (Math.hypot(vx, vy) > FLICK) startGlide(vx, vy);
        }
      }
      tapStart = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopMotion();
    const p = local(e);
    zoomAt(cam, world, p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    onChange();
  }, { passive: false });

  return {
    get gliding() { return !!glide || !!zoomAnim; },
    stop: stopMotion,
    animateZoom,
    flyTo,
  };
}
