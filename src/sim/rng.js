// mulberry32. The whole generator state is one uint32, so it lives inside the
// game state and a save resumes the exact same sequence.

export function nextRandom(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { seed: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

// A small mutable wrapper for use inside one step. Read .seed back afterwards.
export function makeRng(seed) {
  const rng = {
    seed: seed >>> 0,
    next() {
      const out = nextRandom(rng.seed);
      rng.seed = out.seed;
      return out.value;
    },
    int(n) { return Math.floor(rng.next() * n); },
    pick(list) { return list[rng.int(list.length)]; },
    chance(p) { return rng.next() < p; },
  };
  return rng;
}

// Derive independent stream seeds from one game seed so gameplay and ambient
// traffic never share draws.
export function streamSeed(seed, salt) {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
