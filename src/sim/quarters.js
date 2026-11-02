// The non-human quarters (M32 B). Every town with a meaningful share of
// dwarves, elves, halflings or gnomes has a quarter: how its people regard
// the crown (their opinion, darkened for years by a pogrom), how they stand
// with their human neighbours (the town's tension), and the chance of a
// pogrom this month, with what drives it.
import { totalPopulation } from './state.js';
import { NONHUMAN, nonhumanShare, tensionFactors, pogromRisk } from './culture.js';
import { clamp } from './realm.js';

const Q = (world) => world.culture.quarters;

export function hasQuarter(world, s) {
  const q = Q(world);
  if (!s || s.occupier) return false;
  const total = NONHUMAN.reduce((a, p) => a + (s.population[p] ?? 0), 0);
  return (total >= q.minTotal && nonhumanShare(s) >= q.minShare) || NONHUMAN.some((p) => (s.population[p] ?? 0) >= q.minPeople);
}

// How a quarter regards the crown: its peoples' opinion, weighted by their
// numbers there, less the memory of a pogrom fading over the years.
export function quarterRegard(state, world, id) {
  const s = state.settlements[id];
  let n = 0;
  let v = 0;
  for (const p of NONHUMAN) {
    const k = s.population[p] ?? 0;
    n += k;
    v += k * (state.opinion?.[p] ?? 50);
  }
  let regard = n > 0 ? v / n : 50;
  const p = world.culture.pogrom;
  if (s.quarter?.pogrom !== undefined) regard -= p.regard * Math.max(0, 1 - (state.day - s.quarter.pogrom) / p.remember);
  return clamp(regard, 0, 100);
}

const word = (v, words) => words.find(([at]) => v >= at)?.[1] ?? words.at(-1)[1];
const REGARD = [[65, 'loyal'], [45, 'wary'], [25, 'bitter'], [0, 'hostile']];
const NEIGHBOURS = [[75, 'at peace'], [55, 'uneasy'], [35, 'afraid'], [0, 'in terror']];

export function quarterOf(state, world, id) {
  const s = state.settlements[id];
  if (!hasQuarter(world, s)) return s?.quarter?.pogrom !== undefined ? emptied(state, world, id) : null;
  const pop = totalPopulation(s);
  const peoples = NONHUMAN.map((p) => ({ people: p, n: s.population[p] ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const regard = quarterRegard(state, world, id);
  const neighbours = clamp(100 - s.tension, 0, 100);
  return {
    id,
    peoples,
    total: peoples.reduce((a, x) => a + x.n, 0),
    share: nonhumanShare(s),
    regard,
    regardWord: word(regard, REGARD),
    neighbours,
    neighboursWord: word(neighbours, NEIGHBOURS),
    risk: pogromRisk(world, s),
    warn: pogromRisk(world, s) >= world.culture.pogrom.risk.warnAt,
    factors: tensionFactors(state, world, id).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)),
    pogrom: s.quarter ?? null,
    pop,
  };
}

// A quarter emptied by a pogrom still has a card: the stain stays.
function emptied(state, world, id) {
  const s = state.settlements[id];
  return { id, peoples: [], total: 0, share: nonhumanShare(s), regard: quarterRegard(state, world, id), regardWord: 'gone', neighbours: 100 - s.tension, neighboursWord: 'empty', risk: 0, warn: false, factors: [], pogrom: s.quarter, pop: totalPopulation(s) };
}

// Every quarter the crown holds, worst risk first.
export function quarters(state, world) {
  return Object.keys(state.settlements).map((id) => quarterOf(state, world, id)).filter((q) => q && q.total > 0).sort((a, b) => b.risk - a.risk);
}
