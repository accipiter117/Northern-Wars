// What makes the page feel like an installed app: no text selection, callouts,
// image dragging or context menus on game surfaces; a pressed state on every
// button the moment it is touched; haptic ticks where the phone has them;
// keeping the screen awake while playing; and the service worker that keeps
// the game for offline play, with a prompt when a new version is ready.

const isField = (el) => el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable="true"]');

export function stopBrowserGestures() {
  // Long-press menus, the right-click menu and drags belong to the game.
  document.addEventListener('contextmenu', (e) => { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('selectstart', (e) => { if (!isField(e.target)) e.preventDefault(); });
  // iOS Safari still pinch-zooms the page from its own gesture events.
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  // A quick second tap on a button must not zoom the page either.
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
}

// Buttons show they are pressed within the frame they are touched, rather
// than when the browser gets round to :active.
export function instantPress() {
  let pressed = null;
  const release = () => {
    pressed?.classList.remove('pressed');
    pressed = null;
  };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button, .row, [role="button"]');
    if (!b || b.disabled) return;
    release();
    pressed = b;
    b.classList.add('pressed');
  }, { passive: true });
  for (const t of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(t, release, { passive: true });
  document.addEventListener('pointermove', (e) => {
    if (pressed && e.buttons === 0) release();
  }, { passive: true });
}

// Short ticks on Android; iOS has no vibration and is silently skipped.
const PATTERNS = { press: 12, confirm: 18, alert: [20, 60, 20] };
export function createHaptics(prefs) {
  return (kind) => {
    if (prefs.haptics === false || !('vibrate' in navigator)) return;
    try { navigator.vibrate(PATTERNS[kind] ?? 10); } catch { /* not allowed yet */ }
  };
}

// Keep the screen awake while the realm runs, if the player asked for it.
export function createWakeLock(prefs) {
  let lock = null;
  let want = false;
  async function sync() {
    const should = want && prefs.keepAwake && document.visibilityState === 'visible' && 'wakeLock' in navigator;
    if (should && !lock) {
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } catch { lock = null; }
    } else if (!should && lock) {
      const l = lock;
      lock = null;
      try { await l.release(); } catch { /* already gone */ }
    }
  }
  document.addEventListener('visibilitychange', sync);
  return {
    playing(on) {
      want = on;
      sync();
    },
    sync,
    get held() { return !!lock; },
    supported: 'wakeLock' in navigator,
  };
}

// The service worker: registered for players (and for tests that ask with
// ?sw), never for automated runs that did not ask, so tests always see the
// files as they are on disk.
export function registerWorker({ onUpdate }) {
  if (!('serviceWorker' in navigator)) return;
  const asked = new URLSearchParams(location.search).has('sw');
  if (navigator.webdriver && !asked) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !navigator.serviceWorker.controller) return;
    if (window.__nwRestart) {
      reloading = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const waiting = (w) => {
      if (!w || !navigator.serviceWorker.controller) return;
      onUpdate(() => {
        window.__nwRestart = true;
        w.postMessage('restart');
      });
    };
    waiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') waiting(w); });
    });
  }).catch(() => { /* offline play is a nicety */ });
}
