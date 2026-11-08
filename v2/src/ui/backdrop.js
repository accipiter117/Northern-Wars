// The real-time game's map under the war table (v2): the painted North,
// its towns and countryside, and the life on its roads (caravans, patrols,
// pilgrims, refugees) going about their business whatever month it is.
// It runs on a cosmetic copy of the real-time world that the turn-based
// game never reads, so nothing on it can change the game.
import { createState, step } from '../../../src/sim/index.js';
import { stepAmbientDay } from '../../../src/sim/ambient.js';
import { makeRng } from '../../../src/sim/rng.js';
import { createRenderer } from '../../../src/render/renderer.js';
import { resizeCamera } from '../../../src/render/camera.js';

// A day of road life passes in this many milliseconds.
const DAY_MS = 700;

export function createBackdrop(canvas, world, cam, layoutCfg) {
  const renderer = createRenderer(canvas, world, cam, layoutCfg, { noFog: true, noBoard: true });
  let shadow = createState(world, 7, { dawn: false });
  const rng = makeRng(shadow.rng.ambient);
  let last = performance.now();
  let acc = 0;
  let baseDay = 0;
  let days = 0;

  // A few days' head start, so the roads are busy from the first frame;
  // then, once the map is up, two months of the realm's life so trade,
  // barges and patrols get going (a month at a time, not to stall a frame).
  for (let i = 0; i < 20; i++) stepAmbientDay(shadow, world, rng);
  let warm = 2;
  const warmUp = () => {
    if (!warm) return;
    warm -= 1;
    shadow = step(shadow, 31, world);
    // The real-time world's bandits and beasts mean nothing on the war table.
    if (shadow.threats) { shadow.threats.list = []; shadow.threats.contracts = []; }
    rng.seed = shadow.rng.ambient;
    shadow.day = baseDay + (days % 28);
    setTimeout(warmUp, 50);
  };
  setTimeout(warmUp, 300);

  return {
    renderer,
    resize(w, h, first) {
      resizeCamera(cam, world, w, h, first);
      // Not so far out that the painted map turns to its roughest sketch.
      cam.minScale = Math.max(cam.minScale, cam.cover * 0.45);
      if (first) {
        // Where the real-time game opens: over Vizima, filling the screen.
        cam.x = 500;
        cam.y = 420;
        cam.scale = cam.cover;
      }
      renderer.resize(w, h);
    },
    // The month on the table sets the season the map is painted in.
    setDay(day) {
      baseDay = day;
      shadow.day = baseDay + (days % 28);
    },
    // Advance the travellers by the time that has passed, and paint.
    frame(now = performance.now()) {
      acc += Math.min(now - last, 2000);
      last = now;
      while (acc >= DAY_MS) {
        acc -= DAY_MS;
        days += 1;
        shadow.day = baseDay + (days % 28);
        stepAmbientDay(shadow, world, rng);
      }
      renderer.draw(shadow, acc / DAY_MS, null, { tick: now / 1000 });
    },
    get shadow() { return shadow; },
    reset() { shadow = createState(world, 7, { dawn: false }); },
  };
}
