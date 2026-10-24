// Faith, tension between peoples, and the Scoia'tael. Faiths drift slowly
// towards where the crown's patronage and laws pull them. Tension between
// humans and non-humans rises with Eternal Fire preaching, hunger and
// poverty, and boils over as riots and, at its worst, pogroms; wronged elves
// go to the woods, and the woods start shooting back.
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';

const say = (state, text) => addDispatch(state, text, 'faith');

const NONHUMAN = ['dwarf', 'elf', 'halfling'];

export function nonhumanShare(s) {
  const pop = totalPopulation(s);
  return pop > 0 ? (s.population.dwarf + s.population.elf + s.population.halfling) / pop : 0;
}

function lawActive(state, key) {
  const [law, option] = key.split(':');
  return state.laws[law]?.option === option;
}

// Where a settlement's faith is heading: its founding mix, bent by the
// crown's patronage, laws and, in cities, the Fire's appeal to the crowd.
export function faithTarget(state, world, id) {
  const c = world.culture.faith;
  const base = world.settlementData[id].faith;
  const patron = state.laws.patronage?.option;
  const w = {};
  for (const [f, v] of Object.entries(base)) {
    let m = 1;
    if (patron && patron !== 'tolerance') m *= f === patron ? c.patron : c.rival;
    if (f === 'eternal_fire' && world.byId[id].type === 'city') m *= c.cityFire;
    for (const [key, pulls] of Object.entries(c.lawPulls)) if (lawActive(state, key) && pulls[f]) m *= pulls[f];
    w[f] = v * m;
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const f of Object.keys(w)) w[f] = (w[f] / total) * 100;
  return w;
}

export function tensionTarget(state, world, id) {
  const t = world.culture.tension;
  const s = state.settlements[id];
  let v = t.base + s.faith.eternal_fire * t.perFirePercent + s.hunger * t.hunger + Math.max(0, 50 - s.prosperity) * t.povertyPerPoint;
  for (const [key, d] of Object.entries(t.laws)) if (lawActive(state, key)) v += d;
  return clamp(v, 0, 100);
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
    if (s.tension > c.pogrom.above && rng.chance(c.pogrom.chance)) {
      pogrom(state, world, rng, id, s, name);
    } else if (s.tension > c.riot.above && rng.chance(((s.tension - c.riot.above) / (100 - c.riot.above)) * c.riot.chance)) {
      s.unrest = clamp(s.unrest + c.riot.unrest, 0, 100);
      s.prosperity = clamp(s.prosperity - c.riot.prosperity, 0, 100);
      s.troubled = c.riot.troubledDays;
      if (state.reign) state.reign.riots += 1;
      say(state, `Riot in ${name}. Stones thrown, shutters broken, a dwarf's shop set alight. The watch restored order by nightfall.`);
    }
  }

  // Scoia'tael sympathy follows how the elves feel about the crown.
  const sy = c.sympathy;
  const target = clamp((50 - state.opinion.elf) * sy.perElfPoint + 20, 0, 100);
  state.sympathy = clamp(state.sympathy + (target - state.sympathy) * sy.driftPerMonth, 0, 100);
  if (state.sympathy > sy.ambushAbove && rng.chance(sy.ambushChance * (state.sympathy / 100))) ambush(state, world, rng);
}

function pogrom(state, world, rng, id, s, name) {
  const p = world.culture.pogrom;
  const loss = p.lossMin + rng.next() * (p.lossMax - p.lossMin);
  let lost = 0;
  for (const people of NONHUMAN) {
    const n = Math.round(s.population[people] * loss);
    s.population[people] -= n;
    lost += n;
  }
  for (const [g, d] of Object.entries(p.opinion)) state.opinion[g] = clamp(state.opinion[g] + d, 0, 100);
  for (const [r, d] of Object.entries(p.relation)) {
    if (state.neighbours[r]) state.neighbours[r].relation = clamp(state.neighbours[r].relation + d, -100, 100);
  }
  state.sympathy = clamp(state.sympathy + p.sympathy, 0, 100);
  s.tension = clamp(s.tension + p.tensionAfter, 0, 100);
  s.unrest = clamp(s.unrest + world.culture.riot.unrest, 0, 100);
  s.troubled = world.culture.riot.troubledDays * 2;
  if (state.reign) state.reign.pogroms += 1;
  say(state, `Pogrom in ${name}. A mob went through the non-human quarter with torches and cudgels. ${lost} dwarves, elves and halflings are dead or fled. Mahakam and Brokilon will hear of it.`);
}

// A Scoia'tael band strikes near woodland: a settlement close to a forest
// loses goods, trade and a little of its confidence.
function ambush(state, world, rng) {
  const near = world.geography.settlements.filter((st) => world.forestNear[st.id]);
  if (!near.length) return;
  const st = rng.pick(near);
  const s = state.settlements[st.id];
  s.prosperity = clamp(s.prosperity - world.culture.sympathy.ambushProsperity, 0, 100);
  s.unrest = clamp(s.unrest + 5, 0, 100);
  s.troubled = Math.max(s.troubled, 30);
  say(state, `Scoia'tael on the road near ${st.name}. A cart burned, two drovers dead, arrows in the trees. The commandos melted back into the forest.`);
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
