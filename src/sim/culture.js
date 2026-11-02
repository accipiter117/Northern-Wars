// Faith, tension between peoples, and the Scoia'tael. Faiths drift slowly
// towards where the crown's patronage and laws pull them. Tension between
// humans and non-humans rises with Eternal Fire preaching, hunger and
// poverty, and boils over as riots and, at its worst, pogroms; wronged elves
// go to the woods, and the woods start shooting back.
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';
// A strong crown, loved or feared, keeps a troubled town from rioting (M24 B).
import { lawStands, crownFaith } from './book.js';
import { faithEffect } from './faiths.js';
import { canRiot } from './meters.js';
import { damagePlace } from './works.js';

const say = (state, text) => addDispatch(state, text, 'faith');

// Gnomes join the old three in M32 B.
export const NONHUMAN = ['dwarf', 'elf', 'halfling', 'gnome'];

export function nonhumanShare(s) {
  const pop = totalPopulation(s);
  return pop > 0 ? NONHUMAN.reduce((a, p) => a + (s.population[p] ?? 0), 0) / pop : 0;
}

const lawActive = lawStands;

// Where a settlement's faith is heading: its founding mix, bent by the
// crown's patronage, laws and, in cities, the Fire's appeal to the crowd.
export function faithTarget(state, world, id) {
  const c = world.culture.faith;
  const base = world.settlementData[id].faith;
  const patron = crownFaith(state);
  const w = {};
  for (const [f, v] of Object.entries(base)) {
    let m = 1;
    if (patron) m *= f === patron ? c.patron : c.rival;
    if (f === 'eternal_fire' && world.byId[id].type === 'city') m *= c.cityFire;
    for (const [key, pulls] of Object.entries(c.lawPulls)) if (lawActive(state, key) && pulls[f]) m *= pulls[f];
    // A cathedral or a hospice draws the faithful of its own.
    for (const b of state.settlements[id]?.buildings ?? []) m *= world.buildings[b].effects.faith?.[f] ?? 1;
    w[f] = v * m;
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const f of Object.keys(w)) w[f] = (w[f] / total) * 100;
  return w;
}

// What stirs a town's humans against its non-humans, and what calms them
// (M32 B): each a line the quarter's card can show.
export function tensionFactors(state, world, id) {
  const t = world.culture.tension;
  const s = state.settlements[id];
  const out = [];
  const add = (why, v) => { if (Math.abs(v) >= 0.5) out.push({ why, v }); };
  add('Old grudges', t.base);
  add("The Fire's preaching", s.faith.eternal_fire * t.perFirePercent);
  add('Hunger', s.hunger * t.hunger);
  if (s.prosperity < 50) add('Poverty', (50 - s.prosperity) * t.povertyPerPoint);
  else add('Prosperity', -(s.prosperity - 50) * (t.prosperityPerPoint ?? 0));
  // The Hierarch's favour (the Fire, level 5) halves the anger persecution stirs.
  const favour = Math.max(0, 1 + faithEffect(state, world, 'persecutionUnrest'));
  for (const [key, d] of Object.entries(t.laws)) if (lawActive(state, key)) add(LAW_WHY[key] ?? 'The laws', d > 0 ? d * favour : d);
  let works = 0;
  for (const b of s.buildings) works += world.buildings[b].effects.tension ?? 0;
  add('Its works', works);
  if (t.scoiatael && (s.scoiaNear ?? -Infinity) > state.day - t.scoiataelDays) add("Scoia'tael attacks nearby", t.scoiatael);
  const arriving = (state.conquest?.exodus ?? []).filter((e) => e.to === id && e.until > state.day).length;
  if (t.refugees && arriving) add('Refugees crowding in', Math.min(t.refugeesMost, arriving * t.refugees));
  const pop = totalPopulation(s);
  if (t.garrisonPer100 && pop > 0) add('The garrison keeps the peace', -Math.min(t.garrisonMost, (s.garrison / pop) * 100 * t.garrisonPer100));
  const dev = state.faiths?.devotion;
  if (t.devotion && dev) add("Lebioda's and Melitele's faithful", -t.devotion * ((dev.lebioda ?? 0) + (dev.melitele ?? 0)) / 200);
  return out;
}

const LAW_WHY = {
  'book:nonhuman_charter': 'The non-human charter',
  'book:restrictions': 'Restrictions on non-humans',
  'faith:eternal_fire': 'The Fire as the crown\'s faith',
  'book:curfews': 'Curfews',
  'book:inquisition': 'The inquisition',
};

export function tensionTarget(state, world, id) {
  return clamp(tensionFactors(state, world, id).reduce((a, f) => a + f.v, 0), 0, 100);
}

// The chance of a pogrom this month (M32 B): none below `from`, rising
// steeply as the tension climbs.
export function pogromRisk(world, s) {
  const r = world.culture.pogrom.risk;
  if (!r || s.tension <= r.from || tensionWeight(world, s) <= 0) return 0;
  return r.most * Math.pow((s.tension - r.from) / (100 - r.from), r.power);
}

// How much a settlement's tension weighs on its order: nothing where no
// non-humans live, full weight once they are an eighth of the people.
export function tensionWeight(world, s) {
  const t = world.culture.tension;
  const share = nonhumanShare(s);
  return share < t.minShare ? 0 : Math.min(1, share / t.fullShare);
}

export function tensionUnrest(world, s) {
  return s.tension * world.culture.tension.unrest * tensionWeight(world, s);
}

export function stepCultureDay(state, world) {
  const drift = world.culture.tension.drift;
  for (const [id, s] of Object.entries(state.settlements)) {
    s.tension = clamp(s.tension + (tensionTarget(state, world, id) - s.tension) * drift, 0, 100);
    if (s.troubled > 0) s.troubled -= 1;
  }
}

export function monthlyCulture(state, world, rng) {
  const c = world.culture;
  for (const [id, s] of Object.entries(state.settlements)) {
    // Faith shifts a little each month.
    const target = faithTarget(state, world, id);
    for (const f of Object.keys(s.faith)) s.faith[f] += (target[f] - s.faith[f]) * c.faith.driftPerMonth;
    normaliseFaith(s);

    if (tensionWeight(world, s) <= 0) continue;
    const name = world.byId[id].name;
    const risk = pogromRisk(world, s);
    if (risk > 0 && rng.chance(risk)) {
      pogrom(state, world, rng, id, s, name);
    } else if (s.tension > c.riot.above && rng.chance(((s.tension - c.riot.above) / (100 - c.riot.above)) * c.riot.chance * (canRiot(state, world) ? 1 : 0.3))) {
      s.unrest = clamp(s.unrest + c.riot.unrest, 0, 100);
      s.prosperity = clamp(s.prosperity - c.riot.prosperity, 0, 100);
      s.troubled = c.riot.troubledDays;
      if (state.reign) state.reign.riots += 1;
      say(state, `Riot in ${name}. Stones thrown, shutters broken, a dwarf's shop set alight. The watch restored order by nightfall.`);
    }
    // A warning when a quarter's risk first passes the mark (M32 B).
    const now = pogromRisk(world, s);
    const warn = c.pogrom.risk?.warnAt ?? Infinity;
    if (now >= warn && !s.pogromWarned) {
      s.pogromWarned = true;
      say(state, `The non-human quarter of ${name} bars its doors at dusk. Its people fear a pogrom (${Math.round(now * 100)}% a month).`);
    } else if (now < warn / 2) delete s.pogromWarned;
  }

  // Scoia'tael sympathy follows how the elves feel about the crown.
  const sy = c.sympathy;
  const target = clamp((50 - state.opinion.elf) * sy.perElfPoint + 20, 0, 100);
  // High sympathy now sends commandos out of the woods (threats.js).
  state.sympathy = clamp(state.sympathy + (target - state.sympathy) * sy.driftPerMonth, 0, 100);
}

// A pogrom (M32 B) is a disaster: the quarter emptied (most dead or fled),
// its works burned, its young gone to the woods, and the town remembered
// for it.
export function pogrom(state, world, rng, id, s = state.settlements[id], name = world.byId[id].name) {
  const p = world.culture.pogrom;
  const loss = p.lossMin + rng.next() * (p.lossMax - p.lossMin);
  let lost = 0;
  let young = 0;
  for (const people of NONHUMAN) {
    const n = Math.round((s.population[people] ?? 0) * loss);
    s.population[people] = (s.population[people] ?? 0) - n;
    lost += n;
    if (people === 'elf' || people === 'dwarf') young += n;
  }
  const dead = Math.round(lost * (p.deadShare ?? 0));
  for (const [g, d] of Object.entries(p.opinion)) if (state.opinion[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] + d, 0, 100);
  for (const [r, d] of Object.entries(p.relation)) {
    if (state.neighbours[r]) state.neighbours[r].relation = clamp(state.neighbours[r].relation + d, -100, 100);
  }
  state.sympathy = clamp(state.sympathy + p.sympathy, 0, 100);
  // The young who survive go to the forests (M32 D draws on them).
  const recruits = Math.round(young * (p.recruitShare ?? 0));
  if (recruits) {
    const sc = (state.scoiatael ??= { recruits: 0, from: {} });
    sc.recruits += recruits;
    sc.from.pogroms = (sc.from.pogroms ?? 0) + recruits;
  }
  s.tension = clamp(s.tension + p.tensionAfter, 0, 100);
  s.unrest = clamp(s.unrest + world.culture.riot.unrest, 0, 100);
  s.troubled = world.culture.riot.troubledDays * 2;
  const burned = p.works ? damagePlace(state, world, rng, id, { count: p.works, amount: p.worksDamage, why: 'Burned in the pogrom' }) : [];
  // The stain stays on the town's card for years.
  s.quarter = { pogrom: state.day, lost, dead };
  delete s.pogromWarned;
  if (state.reign) state.reign.pogroms += 1;
  addDispatch(state, `Pogrom in ${name}. A mob went through the non-human quarter with torches and cudgels: ${dead} dead, ${lost - dead} fled, the quarter emptied${burned.length ? ` and ${burned.length === 1 ? 'a works' : `${burned.length} works`} burned` : ''}.${recruits ? ` ${recruits} of their young have gone to the woods.` : ''} Mahakam and Brokilon will hear of it, and it will not be forgotten.`, 'faith');
}

function normaliseFaith(s) {
  const total = Object.values(s.faith).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  for (const f of Object.keys(s.faith)) s.faith[f] = (Math.max(0, s.faith[f]) / total) * 100;
}

export function realmFaith(state) {
  const out = {};
  let pop = 0;
  for (const s of Object.values(state.settlements)) {
    const n = totalPopulation(s);
    pop += n;
    for (const [f, v] of Object.entries(s.faith)) out[f] = (out[f] ?? 0) + n * v;
  }
  for (const f of Object.keys(out)) out[f] /= pop || 1;
  return out;
}

export function shiftFaith(s, shifts) {
  for (const [f, d] of Object.entries(shifts)) s.faith[f] = Math.max(0, s.faith[f] + d);
  normaliseFaith(s);
}
