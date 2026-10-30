// Petitions from the crown's own settlements: a preacher in the square, a
// grove the priests want felled, a quarter the townsfolk want walled off.
// Like envoys, they wait for an answer, and take the default if ignored.
import { nudge } from './meters.js';
import { sendFigure } from './figures.js';
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';
import { nonhumanShare, shiftFaith } from './culture.js';

const say = (state, text) => addDispatch(state, text, 'faith');

function fits(state, world, p, id) {
  const s = state.settlements[id];
  if (p.types && !p.types.includes(world.byId[id].type)) return false;
  for (const [f, v] of Object.entries(p.minFaith ?? {})) if (s.faith[f] < v) return false;
  for (const [g, v] of Object.entries(p.minPeople ?? {})) if (s.population[g] < v) return false;
  if (p.minTension !== undefined && s.tension < p.minTension) return false;
  if (p.minNonhuman !== undefined && nonhumanShare(s) < p.minNonhuman) return false;
  if (p.minSympathy !== undefined && state.sympathy < p.minSympathy) return false;
  return true;
}

export function monthlyPetition(state, world, rng) {
  if (!rng.chance(world.culture.petitionChance)) return;
  const options = [];
  for (const [pid, p] of Object.entries(world.petitions.petitions)) {
    for (const st of world.geography.settlements) {
      if (state.petitions.some((q) => q.place === st.id) || state.settlements[st.id].occupier) continue;
      if (fits(state, world, p, st.id)) options.push({ pid, place: st.id, w: p.weight * Math.sqrt(totalPopulation(state.settlements[st.id])) });
    }
  }
  if (!options.length) return;
  let roll = rng.next() * options.reduce((a, o) => a + o.w, 0);
  const pick = options.find((o) => (roll -= o.w) < 0) ?? options[options.length - 1];
  state.petitions.push({ id: state.nextPetitionId++, petition: pick.pid, place: pick.place, day: state.day });
  // Its courier on the road to Vizima (M23 C).
  sendFigure(state, world, { kind: 'courier', from: pick.place, to: world.kingdom.capital, about: world.petitions.petitions[pick.pid].title.toLowerCase() });
}

export function petitionText(world, pending) {
  const p = world.petitions.petitions[pending.petition];
  const place = world.byId[pending.place].name;
  return { title: p.title, text: p.text.replaceAll('{place}', place), choices: p.choices.map((c) => c.label), place };
}

export function stepPetitionsDay(state, world) {
  for (const p of [...state.petitions]) {
    if (state.day - p.day >= world.culture.petitionDefaultDays) {
      const choices = world.petitions.petitions[p.petition].choices;
      resolvePetition(state, world, p.id, Math.max(0, choices.findIndex((c) => c.default)), true);
    }
  }
}

export function resolvePetition(state, world, petitionId, choice, ignored = false) {
  const i = state.petitions.findIndex((p) => p.id === petitionId);
  if (i < 0) return false;
  const pending = state.petitions[i];
  const c = world.petitions.petitions[pending.petition].choices[choice];
  if (!c) return false;
  state.petitions.splice(i, 1);
  const s = state.settlements[pending.place];
  // A grant the treasury cannot pay is a promise broken (M22 D): the coin
  // never comes, the town is angrier than if it had been refused, and the
  // folk's Love for the crown falls.
  if (!ignored && (c.effects.treasury ?? 0) < 0 && state.treasury + c.effects.treasury < 0) {
    const b = world.meters?.love.brokenPromise ?? { love: 4, unrest: 5 };
    nudge(state, world, 'love', -b.love, 'Promises to petitioners broken');
    s.unrest = clamp(s.unrest + b.unrest, 0, 100);
    const { title, place } = petitionText(world, pending);
    say(state, `${title} (${place}): the crown promised, but the treasury could not pay. The folk remember.`);
    return true;
  }
  const fx = c.effects;
  if (fx.treasury) state.treasury += fx.treasury;
  if (fx.love) nudge(state, world, 'love', fx.love, 'Answers to the realm');
  for (const [g, v] of Object.entries(fx.opinion ?? {})) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
  if (fx.unrest) s.unrest = clamp(s.unrest + fx.unrest, 0, 100);
  if (fx.tension) s.tension = clamp(s.tension + fx.tension, 0, 100);
  if (fx.faith) shiftFaith(s, fx.faith);
  if (fx.sympathy) state.sympathy = clamp(state.sympathy + fx.sympathy, 0, 100);
  // An escort rides with them, on the map (M24 follow-up).
  if (fx.escort && !ignored) sendFigure(state, world, { kind: 'escort', from: pending.place, to: fx.escort, name: 'Soldiers of the crown', about: 'escorting pilgrims to the Temple of Melitele' });
  const { title, place } = petitionText(world, pending);
  say(state, ignored
    ? `${title} (${place}): Vizima sent no answer, so it was taken as "${c.label.toLowerCase()}".`
    : `${title} (${place}): the crown chose to ${c.label.toLowerCase()}.`);
  return true;
}
