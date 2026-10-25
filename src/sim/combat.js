// Fights between the crown's companies and whatever they meet: bandits,
// beasts, Scoia'tael, raiders and foreign armies. Each side's strength is its
// men times their worth, their morale and experience, how well the troop
// suits the foe, and the ground. The stronger side usually wins, never
// surely: the chance goes with the cube of the strengths, as in the battles
// between armies. The same reckoning gives the odds shown before a Hunt.
import { clamp } from './realm.js';
import { pointInPolygon } from './geometry.js';

const F = (world) => world.forces;

const terrainCache = new WeakMap();
// The kind of ground at a point: the terrain zone it lies in, or open
// country. Looked up on a coarse grid, as forces cross it every day.
export function groundAt(world, x, y) {
  let cache = terrainCache.get(world);
  if (!cache) terrainCache.set(world, (cache = new Map()));
  const key = `${Math.round(x / 10)},${Math.round(y / 10)}`;
  let g = cache.get(key);
  if (!g) {
    g = 'open';
    for (const [kind, zones] of Object.entries(world.geography.terrain)) {
      if (zones.some((z) => pointInPolygon(x, y, z.shape))) { g = kind; break; }
    }
    cache.set(key, g);
  }
  return g;
}

export const mounted = (world, type) => !!F(world).companies[type]?.horses;

// One company's strength against a kind of foe, on a kind of ground.
export function companyStrength(world, c, foe, ground = 'open', walls = false) {
  const f = F(world);
  const t = f.companies[c.type];
  let v = c.men * t.perMan * (0.5 + c.morale / 100) * (1 + (c.xp ?? 0) * f.xp.bonus) * (f.suits[foe]?.[c.type] ?? 1);
  if (t.horses) v *= f.ground.mounted[ground] ?? 1;
  if (walls && t.walls) v *= t.walls;
  return v;
}

// What a threat is worth in a fight. Bandits, elves and raiders by their
// men; beasts by their number and how dreadful each one is.
export function threatStrength(world, t, ground = 'open') {
  const f = F(world);
  const body = t.band ?? t;
  const morale = 0.5 + (t.morale ?? 70) / 100;
  if (t.kind === 'monsters') return (body.count ?? t.count) * speciesOf(world, t).power * morale;
  let v = (body.men ?? t.men) * f.threats[t.kind].perMan * morale;
  if (t.kind === 'scoiatael' && ground === 'forest') v *= f.ground.elvesInForest;
  return v;
}

export function speciesOf(world, t) {
  return F(world).species[t.terrain]?.find((s) => s.id === t.species) ?? { power: 1, name: 'Beasts', one: 'beast' };
}

// What kind of foe a threat is, for how well each troop suits it.
export function foeKind(t) {
  if (t.kind === 'raiders') return 'soldiers';
  return t.kind;
}

// The chance the first side wins.
export function winChance(world, sa, sb) {
  const k = F(world).fight.power;
  if (sa <= 0) return 0;
  if (sb <= 0) return 1;
  return sa ** k / (sa ** k + sb ** k);
}

export function oddsWord(world, p) {
  return F(world).odds.find((o) => p >= o.at)?.word ?? 'Hopeless';
}

// Settles a fight: who wins, and the share of each side lost.
export function resolve(world, rng, sa, sb) {
  const f = F(world).fight;
  const p = winChance(world, sa, sb);
  const aWins = rng.next() < p;
  const lerp = ([lo, hi], t) => lo + (hi - lo) * t;
  const [sWin, sLose] = aWins ? [sa, sb] : [sb, sa];
  const loserLoss = clamp(lerp(f.loserLoss, rng.next()) * clamp(sWin / Math.max(1, sLose), 0.6, 1.6), 0, 0.9);
  const winnerLoss = clamp(lerp(f.winnerLoss, rng.next()) * clamp(sLose / Math.max(1, sWin), 0.3, 2), 0, 0.6);
  return { aWins, p, lossA: aWins ? winnerLoss : loserLoss, lossB: aWins ? loserLoss : winnerLoss };
}
