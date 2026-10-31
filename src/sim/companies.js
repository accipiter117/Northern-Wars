// One military (M22 C): every soldier belongs to a company, with a troop type,
// men, experience and a source (a standing company, a levy, a retinue, hired
// swords or a garrison). Armies are lists of companies, and their strength is
// the sum of each company's by the one formula in combat.js.
import { companyStrength } from './combat.js';
import { bookEffect } from './book.js';
import { totalPopulation } from './state.js';

const F = (world) => world.forces;
const round = Math.round;

// Split `men` into companies of about `size`, each of `type`.
function split(men, size, type, extra) {
  const out = [];
  if (men < 1) return out;
  const n = Math.max(1, Math.round(men / size));
  let left = round(men);
  for (let i = 0; i < n; i++) {
    const m = i === n - 1 ? left : round(men / n);
    left -= m;
    if (m > 0) out.push({ type, men: m, xp: 0, ...extra });
  }
  return out;
}

// A place's levy as companies (M22 C): militia spearmen everywhere, the rest
// crossbowmen from towns and cities, archers from villages, castles and the
// woods.
export function levyCompanies(world, id, men, extra = {}) {
  const l = F(world).levy;
  const st = world.byId[id];
  if (!l || !st) return split(men, 200, 'militia', { source: 'levy', from: id, ...extra });
  const town = (st.type === 'town' || st.type === 'city') && !world.forestNear?.[id];
  // A small levy stands as one company of spears; bows only where there
  // are enough men for a company of them.
  const spears = men - Math.round(men * (1 - l.spears)) < 0 || men * (1 - l.spears) < l.size * 0.4 ? men : Math.round(men * l.spears);
  const name = st.name;
  return [
    ...split(spears, l.size, 'militia', { source: 'levy', from: id, name: `${name} spearmen`, ...extra }),
    ...split(men - spears, l.size, town ? l.town : l.country, { source: 'levy', from: id, name: `${name} ${town ? 'crossbowmen' : 'bowmen'}`, ...extra }),
  ];
}

// A levy from many places (M22 C): each district's (a town and the villages
// that lend it their hands) pooled into companies of about 200, named for
// its town, each remembering the places its men came from.
export function districtLevy(world, levy, district) {
  const pools = {};
  for (const [id, n] of Object.entries(levy)) {
    if (!(n > 0)) continue;
    const head = district?.[id] ?? id;
    (pools[head] ??= {})[id] = n;
  }
  const out = [];
  for (const [head, places] of Object.entries(pools)) {
    const men = Object.values(places).reduce((v, n) => v + n, 0);
    for (const b of levyCompanies(world, head, men)) out.push({ ...b, places: Object.fromEntries(Object.entries(places).map(([id, n]) => [id, (n * b.men) / men])) });
  }
  // The handfuls from out-of-the-way villages and castles stand together as
  // the village levies, in companies of their own size.
  const size = F(world).levy?.size ?? 200;
  const small = out.filter((b) => b.men < size * 0.25);
  if (small.length < 2) return out;
  const rest = out.filter((b) => !small.includes(b));
  const places = {};
  for (const b of small) for (const [id, n] of Object.entries(b.places)) places[id] = (places[id] ?? 0) + n;
  const men = small.reduce((v, b) => v + b.men, 0);
  for (const b of split(men, size, 'militia', { source: 'levy', name: 'Village levies' })) {
    rest.push({ ...b, from: Object.keys(places)[0], places: Object.fromEntries(Object.entries(places).map(([id, n]) => [id, (n * b.men) / men])) });
  }
  return rest;
}

// What a place could raise at a full call, as companies.
export function placeMuster(state, world, id, call = 1) {
  const share = world.war?.raise?.muster?.share?.[world.byId[id]?.type] ?? 0;
  const s = state.settlements[id];
  if (!s || s.occupier || !share) return [];
  return levyCompanies(world, id, Math.floor(totalPopulation(s) * share * call * Math.max(0, 1 + bookEffect(state, world, 'levy'))));
}

// A garrison as companies of garrison soldiers.
export function garrisonCompanies(world, id, men) {
  const g = F(world).garrison;
  return split(men, g?.size ?? 150, 'garrison', { source: 'garrison', from: id, name: `Garrison of ${world.byId[id]?.name ?? id}` });
}

// A great house's retinue as companies.
export function retinueCompanies(world, house, men) {
  const types = F(world).retinue?.types ?? ['militia'];
  const name = world.houses?.houses[house]?.name ?? house;
  const per = men / types.length;
  // A grade between levies and standing companies (M27 A).
  return types.flatMap((t) => split(per, F(world).levy?.size ?? 200, t, { source: 'retinue', from: house, name: `${name} ${t === 'militia' ? 'spears' : 'men-at-arms'}`, xp: F(world).retinue?.xp ?? 0 }));
}

// A hired company as companies of its troop type.
export function mercenaryCompanies(world, id) {
  const m = world.war.raise.mercenaries.companies[id];
  return split(m.men, 400, m.type ?? 'menatarms', { source: 'mercenary', merc: id, name: m.name, xp: m.xp ?? 0 });
}

// A realm's own army (foreign or standing men) as companies: its standing
// men as men-at-arms, its levy as militia and bowmen.
export function realmCompanies(world, rid, standing, levied) {
  const name = world.geography?.neighbours?.[rid]?.name ?? rid;
  return [
    ...split(standing, 150, 'menatarms', { source: 'standing', name: `${name} men-at-arms` }),
    ...split(levied * 0.6, 200, 'militia', { source: 'levy', name: `${name} levies` }),
    ...split(levied * 0.4, 200, 'archers', { source: 'levy', name: `${name} bowmen` }),
  ];
}

// The companies of an army always add up to its men: losses, desertion and
// attrition take from every company alike.
export function normalise(a) {
  if (!a.bands?.length) return a.bands ?? [];
  const sum = a.bands.reduce((v, b) => v + b.men, 0);
  if (sum > 0 && Math.abs(sum - a.soldiers) > 0.5) {
    const k = a.soldiers / sum;
    for (const b of a.bands) b.men *= k;
  }
  return a.bands;
}

// The sum of a list of companies' strength against a foe.
export function bandStrength(world, bands, morale, foe = 'soldiers', ground = 'open', walls = false) {
  let v = 0;
  for (const b of bands) v += companyStrength(world, { ...b, morale }, foe, ground, walls);
  return v;
}
