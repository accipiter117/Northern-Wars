// What each people brings (M32 C). Dwarves smith and mine, gnomes make fine
// crafts and the best blades, halflings farm and keep inns, elves heal and
// hunt. Each gift grows with that people's share of the town (full at a
// tenth) and with how it feels about the crown, so a crown that wrongs its
// non-humans loses their work as well as their goodwill. The Vivaldi bank is
// dwarven, and in war a people that loves the crown may send volunteers.
import { totalPopulation } from './state.js';
import { NONHUMAN } from './culture.js';
import { addDispatch, clamp } from './realm.js';
import { atWar, TEMERIA } from './conflict.js';
import { suzerainOf } from './tiers.js';

const G = (world) => world.culture?.gifts;

// How much of a people's gift a town gets: 0 to moodMost.
export function giftWeight(state, world, s, people) {
  const g = G(world);
  if (!g || !s || s.occupier) return 0;
  const pop = totalPopulation(s);
  if (pop <= 0) return 0;
  const share = Math.min(1, ((s.population[people] ?? 0) / pop) / g.fullShare);
  const mood = clamp(((state.opinion?.[people] ?? 50) - g.moodFrom) / g.moodSpan, 0, g.moodMost);
  return share * mood;
}

// All the gifts at work in a town, each as a fraction to add (0.12 = +12%).
export function townGifts(state, world, s) {
  const g = G(world);
  const out = { crafts: {}, mines: 0, arms: 0, food: 0, plague: 0, prosperity: 0, lines: [] };
  if (!g || !s) return out;
  for (const people of NONHUMAN) {
    const def = g[people];
    const w = giftWeight(state, world, s, people);
    if (!def || w <= 0) continue;
    for (const [b, v] of Object.entries(def.crafts ?? {})) out.crafts[b] = (out.crafts[b] ?? 0) + v * w;
    out.mines += (def.mines ?? 0) * w;
    out.arms += (def.arms ?? 0) * w;
    out.food += (def.food ?? 0) * w;
    out.plague += (def.plague ?? 0) * w;
    if (def.prosperity && s.prosperity < (def.prosperityCap ?? 100)) out.prosperity += def.prosperity * w;
    const line = giftLine(def, w, s);
    if (line) out.lines.push({ people, name: def.name, w, line });
  }
  return out;
}

const pct = (v) => `+${Math.round(v * 100)}%`;

// What a people's gift comes to in a town, in a few words: only what the
// town has the works for.
function giftLine(def, w, s) {
  const parts = [];
  const big = (v) => v * w >= 0.01;
  const crafts = Object.entries(def.crafts ?? {}).filter(([b, v]) => s.buildings.includes(b) && big(v));
  if (crafts.length) parts.push(`${crafts.map(([b]) => b).join(', ')} ${pct(Math.max(...crafts.map(([, v]) => v)) * w)}`);
  const mining = ['iron', 'stone'].includes(s.production) || s.buildings.some((b) => ['goldmine', 'silvermine', 'mine', 'quarry'].includes(b));
  if (def.mines && mining && big(def.mines)) parts.push(`mines ${pct(def.mines * w)}`);
  if (def.arms && s.buildings.includes('weaponsmith') && big(def.arms)) parts.push(`arms ${pct(def.arms * w)}`);
  if (def.food && big(def.food)) parts.push(`harvest ${pct(def.food * w)}`);
  if (def.plague && big(def.plague)) parts.push(`plague deaths -${Math.round(def.plague * w * 100)}%`);
  if (def.prosperity && def.prosperity * w >= 0.05 && s.prosperity < (def.prosperityCap ?? 100)) parts.push('prosperity grows');
  return parts.join(', ');
}

// ---- The Vivaldi bank ----

// Interest scales by how the dwarves feel: 0.7 at 80, 1.3 at 20.
export function bankRate(state, world) {
  const b = G(world)?.bank;
  if (!b) return 1;
  return Math.max(0.4, 1 + (50 - (state.opinion?.dwarf ?? 50)) * b.perPoint);
}

export function bankLimit(state, world) {
  const b = G(world)?.bank;
  if (!b) return 0;
  return ((state.opinion?.dwarf ?? 50) - 50) * b.limitPerPoint;
}

// ---- Companies ----

// Can a company of this people be raised here? Dwarven axemen need dwarves
// enough and their goodwill (less of it while Mahakam stands with us).
export function peopleCompanyCheck(state, world, id, t) {
  if (!t.people) return { ok: true };
  const s = state.settlements[id];
  const p = t.people;
  const name = world.groups?.groups?.[p.people]?.name ?? p.people;
  if ((s.population[p.people] ?? 0) < p.min) return { ok: false, reason: `Needs ${p.min} ${name.toLowerCase()} here.`, hidden: (s.population[p.people] ?? 0) === 0 };
  const mahakam = p.mahakamOpinion !== undefined && suzerainOf(state, 'mahakam') === TEMERIA;
  const need = mahakam ? p.mahakamOpinion : p.opinion;
  if ((state.opinion?.[p.people] ?? 50) < need) return { ok: false, reason: `The ${name.toLowerCase()} will not serve a crown they think so little of (needs ${need}).` };
  return { ok: true };
}

// Archers raised where elves live, while the elves are willing, shoot with
// elven skill.
export function elvenArchers(state, world, id) {
  const a = G(world)?.elf?.archers;
  const s = state.settlements[id];
  if (!a || !s) return 0;
  return (s.population.elf ?? 0) >= a.min && (state.opinion?.elf ?? 50) >= a.opinion ? a.bonus : 0;
}

// ---- Months ----

// Each town keeps its gifts for the month (s.gifts), so the harvest, the
// mines and the crafts can read them without the whole state.
export function refreshGifts(state, world) {
  if (!G(world)) return;
  for (const s of Object.values(state.settlements)) {
    const t = townGifts(state, world, s);
    const crafts = Object.fromEntries(Object.entries(t.crafts).filter(([, v]) => v > 0));
    const any = Object.keys(crafts).length || t.mines || t.arms || t.food || t.plague;
    if (any) s.gifts = { crafts, mines: t.mines, arms: t.arms, food: t.food, plague: t.plague };
    else delete s.gifts;
  }
}

export function monthlyPeoples(state, world, rng) {
  const g = G(world);
  if (!g) return;
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    const p = townGifts(state, world, s).prosperity;
    if (p > 0) s.prosperity = clamp(s.prosperity + p, 0, 100);
  }
  refreshGifts(state, world);
  volunteers(state, world, rng);
}

// In war, a people that loves the crown may send a company of volunteers,
// raised where most of them live, at no cost but its keep.
function volunteers(state, world, rng) {
  const v = G(world)?.volunteers;
  if (!v || !atWar(state, TEMERIA) || !state.forces) return;
  const P = (state.peoples ??= { volunteered: {} });
  for (const [people, type] of Object.entries(v.people)) {
    if ((state.opinion?.[people] ?? 50) < v.opinion) continue;
    if (state.day - (P.volunteered[people] ?? -Infinity) < v.days) continue;
    const towns = Object.entries(state.settlements).filter(([, s]) => !s.occupier && s.holder === 'crown' && (s.population[people] ?? 0) >= v.min);
    if (!towns.length || !rng.chance(v.chance)) continue;
    const [id, s] = towns.sort((a, b) => (b[1].population[people] ?? 0) - (a[1].population[people] ?? 0))[0];
    const t = world.forces.companies[type];
    const men = Math.min(t.men, Math.floor((s.population[people] ?? 0) / 4));
    if (men < 20) continue;
    s.population[people] -= men;
    const p = world.byId[id];
    const name = `${p.name} ${world.groups.groups[people]?.name ?? people} volunteers`;
    const c = {
      id: state.forces.nextId++, type, name, home: id, station: id, people, volunteer: true,
      men, max: men, wounded: 0, morale: world.forces.morale.start + 10, xp: 0,
      order: { kind: 'station' }, task: null, x: p.x, y: p.y, node: id, way: [], army: null, wins: 0, fought: -1, routed: 0,
      ...(type === 'archers' && people === 'elf' ? { bonus: G(world).elf.archers.bonus } : {}),
    };
    state.forces.companies.push(c);
    P.volunteered[people] = state.day;
    addDispatch(state, `${men} ${world.groups.groups[people]?.name.toLowerCase() ?? people} of ${p.name} come forward to fight for the crown, asking nothing but their keep: ${name}.`, 'military');
  }
}
