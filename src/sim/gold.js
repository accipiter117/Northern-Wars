// Gold. A few hill and mountain sites hold seams of gold; some are known,
// some must be found by prospectors. A gold mine on a known seam pays the
// treasury directly until the seam runs out, slowly at first and then
// tapering away. Gold draws miners (dwarves among them), bandits, the eyes
// of greedy neighbours, and Mahakam's displeasure when dug near its border.
import { addDispatch } from './realm.js';
import { distanceToPolygon } from './geometry.js';
import { crownShare } from './houses.js';
import { creditLimit } from './economy.js';

const G = (world) => world.gold;
const say = (state, text) => addDispatch(state, text, 'treasury');

export function defaultGold(world) {
  const deposits = {};
  for (const [id, d] of Object.entries(G(world)?.deposits ?? {})) deposits[id] = { known: d.known, remaining: d.gold };
  return { deposits, prospects: [], prospected: {} };
}

export function depositsOf(world, settlementId) {
  return Object.entries(G(world)?.deposits ?? {}).filter(([, d]) => d.settlement === settlementId).map(([id]) => id);
}

// The known, unexhausted deposit a settlement could mine, if any.
export function depositAt(state, world, settlementId) {
  for (const id of depositsOf(world, settlementId)) {
    const d = state.gold?.deposits[id];
    if (d?.known && d.remaining > 0) return id;
  }
  return null;
}

// Mines at work: a gold mine standing on a deposit with gold left, in a
// place the crown still holds.
export function activeMines(state, world) {
  const out = [];
  for (const [id, d] of Object.entries(G(world)?.deposits ?? {})) {
    const s = state.settlements[d.settlement];
    const left = state.gold?.deposits[id];
    if (s && !s.occupier && s.buildings.includes('goldmine') && left?.known && left.remaining > 0) out.push({ id, settlement: d.settlement });
  }
  return out;
}

// Full yield until less than a third of the seam is left, then less and
// less as the miners chase thinner veins.
export function goldYield(state, world, depositId) {
  const g = G(world);
  const left = state.gold.deposits[depositId].remaining;
  const frac = left / g.deposits[depositId].gold;
  return Math.min(left, g.yield * Math.max(g.minShare, Math.min(1, frac / g.taper)));
}

export function goldLedger(state, world, income) {
  if (!state.gold) return;
  for (const { id, settlement } of activeMines(state, world)) {
    const y = goldYield(state, world, id);
    state.gold.deposits[id].remaining -= y;
    income.gold += y * crownShare(state, world, state.settlements[settlement]);
    if (state.gold.deposits[id].remaining < 1) {
      state.gold.deposits[id].remaining = 0;
      say(state, `${G(world).deposits[id].name} is worked out. The last cart of ore comes up from ${world.byId[settlement].name}, and the miners drift away.`);
    }
  }
}

// Each month the mines draw miners, and a fair share of them dwarves.
export function monthlyGold(state, world) {
  const m = G(world)?.miners;
  if (!m) return;
  for (const { settlement } of activeMines(state, world)) {
    const s = state.settlements[settlement];
    const people = Object.values(s.population).reduce((a, b) => a + b, 0);
    const come = Math.max(1, Math.round(people * m.growthPerMonth));
    const dwarves = Math.round(come * m.dwarfShare);
    s.population.dwarf += dwarves;
    s.population.human += come - dwarves;
  }
}

// Extra bandit threat round a working mine.
export function goldThreat(state, world, id) {
  const g = G(world);
  if (!g || !state.gold) return 0;
  const p = world.byId[id];
  let v = 0;
  for (const { id: dep } of activeMines(state, world)) {
    const d = g.deposits[dep];
    if (Math.hypot(d.x - p.x, d.y - p.y) <= g.banditReach) v += g.banditThreat;
  }
  return v;
}

// How much the mines whet a greedy neighbour's appetite.
export function goldGreed(state, world) {
  return G(world) ? activeMines(state, world).length * G(world).greed : 0;
}

const nearMahakam = new WeakMap();
// Mahakam's elders frown on every mine dug near their mountains.
export function mahakamGrudge(state, world) {
  const g = G(world);
  const shapes = world.geography.neighbours.mahakam?.shapes;
  if (!g || !shapes || !state.gold) return 0;
  let near = nearMahakam.get(world);
  if (!near) {
    near = new Set(Object.entries(g.deposits).filter(([, d]) => shapes.some((sh) => distanceToPolygon(d.x, d.y, sh) < g.mahakam.reach)).map(([id]) => id));
    nearMahakam.set(world, near);
  }
  return activeMines(state, world).filter((m) => near.has(m.id)).length * g.mahakam.relation;
}

// ---- Prospecting ----

const hilly = new WeakMap();
// Places with hill or mountain country within a prospector's walk.
export function prospectable(world, id) {
  let set = hilly.get(world);
  if (!set) {
    const p = G(world).prospect;
    const zones = p.terrain.flatMap((t) => (world.geography.terrain[t] ?? []).filter((z) => !z.realm).map((z) => z.shape));
    set = new Set(world.geography.settlements.filter((s) => zones.some((sh) => distanceToPolygon(s.x, s.y, sh) < p.reach)).map((s) => s.id));
    hilly.set(world, set);
  }
  return set.has(id);
}

export function canProspect(state, world, id) {
  const g = G(world);
  const s = state.settlements[id];
  if (!g || !s) return { ok: false, reason: 'Unknown place.' };
  if (s.occupier) return { ok: false, reason: 'The enemy holds it.' };
  if (!prospectable(world, id)) return { ok: false, reason: 'No hills or mountains near enough to prospect.', hidden: true };
  if (depositAt(state, world, id)) return { ok: false, reason: 'Gold is already known here.', hidden: true };
  if (state.gold.prospected[id]) return { ok: false, reason: 'Prospectors have searched here and found nothing.' };
  if (state.gold.prospects.some((p) => p.settlement === id)) return { ok: false, reason: 'Prospectors are already at work here.' };
  if (state.treasury - g.prospect.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true };
}

export function startProspect(state, world, id) {
  const p = G(world).prospect;
  state.treasury -= p.coin;
  state.ledger.decrees = (state.ledger.decrees ?? 0) + p.coin;
  state.gold.prospects.push({ settlement: id, until: state.day + p.days });
  say(state, `Prospectors set out into the hills above ${world.byId[id].name}, with picks, pans and the crown's ${p.coin} crowns.`);
}

export function stepGoldDay(state, world, rng) {
  if (!state.gold?.prospects.length) return;
  for (const p of [...state.gold.prospects]) {
    if (p.until > state.day) continue;
    state.gold.prospects = state.gold.prospects.filter((x) => x !== p);
    const name = world.byId[p.settlement].name;
    const hidden = depositsOf(world, p.settlement).find((d) => !state.gold.deposits[d].known);
    if (hidden && rng.chance(G(world).prospect.find)) {
      state.gold.deposits[hidden].known = true;
      say(state, `Gold! The prospectors above ${name} have struck ${G(world).deposits[hidden].name}. A gold mine can be sunk there.`);
    } else if (hidden) {
      say(state, `The prospectors come back from the hills above ${name} with sore backs and empty pans. The old miners swear there is gold there still.`);
    } else {
      state.gold.prospected[p.settlement] = true;
      say(state, `The prospectors above ${name} found nothing but fool's gold and frostbite.`);
    }
  }
}
