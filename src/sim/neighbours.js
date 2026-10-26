// The kingdoms around Temeria. Each holds a view of the crown that drifts
// towards where the crown's stance and laws put it; warmth brings trade over
// the border, and now and then an envoy arrives wanting an answer.
import { addDispatch, clamp } from './realm.js';
import { realmProsperity } from './realms.js';
import { totalPopulation } from './state.js';
import { TEMERIA, hostile, placesHeldBy, originOf } from './conflict.js';
import { mahakamGrudge } from './gold.js';
import { moodTarget, tradeBonus } from './diplomacy.js';

const say = (state, text) => addDispatch(state, text, 'abroad');

export function defaultNeighbours(world) {
  const out = {};
  for (const [id, r] of Object.entries(world.neighbours.realms)) out[id] = { relation: r.relation, stance: 'neutral', stanceSince: null };
  return out;
}

export function relationTarget(state, world, id) {
  // Since M17 the relation is a ruler's mood, the sum of its reasons.
  if (state.diplomacy && world.diplomacy) return moodTarget(state, world, id);
  const r = world.neighbours.realms[id];
  // At war, nothing warms them; towns of theirs we hold rankle long after.
  if (world.war && hostile(state, TEMERIA, id)) return world.war.atWarRelation;
  let t = r.relation + world.neighbours.stances[state.neighbours[id].stance].relation;
  for (const [key, v] of Object.entries(r.cares)) {
    const [law, option] = key.split(':');
    if (state.laws[law]?.option === option) t += v;
  }
  if (id === 'mahakam') t += mahakamGrudge(state, world);
  if (world.war && state.wars) t += world.war.claimRelation * placesHeldBy(state, world, TEMERIA).filter((pid) => originOf(world, pid) === id).length;
  return clamp(t, -100, 100);
}

export function stepNeighboursDay(state, world) {
  const drift = world.neighbours.drift;
  for (const [id, n] of Object.entries(state.neighbours)) {
    n.relation += (relationTarget(state, world, id) - n.relation) * drift;
  }
  // Envoys left waiting too long take the cautious answer for you.
  const wait = world.neighbours.envoyDefaultDays;
  for (const e of [...state.envoys]) {
    if (state.day - e.day >= wait) {
      const choices = world.envoys.envoys[e.envoy].choices;
      resolveEnvoy(state, world, e.id, Math.max(0, choices.findIndex((c) => c.default)), true);
    }
  }
}

export function tradeFactor(world, relation) {
  if (relation < world.neighbours.closedBelow) return 0;
  return clamp(0.5 + relation / 100, 0, 1.5);
}

// A richer neighbour buys and sells more: its prosperity scales the trade.
export function foreignTrade(state, world) {
  const by = {};
  let total = 0;
  for (const [id, r] of Object.entries(world.neighbours.realms)) {
    const wealth = state.realms ? clamp(realmProsperity(state, id) / 55, 0.6, 1.5) : 1;
    by[id] = r.trade * tradeFactor(world, state.neighbours[id].relation) * wealth * (state.diplomacy ? tradeBonus(state, world, id) : 1);
    total += by[id];
  }
  return { total, by };
}

export function stanceCost(state, world) {
  let c = 0;
  for (const n of Object.values(state.neighbours)) c += world.neighbours.stances[n.stance].monthly;
  return c;
}

export function canSetStance(state, world, id, stance) {
  const n = state.neighbours[id];
  if (!n || !world.neighbours.stances[stance]) return { ok: false, reason: 'Unknown realm.' };
  if (n.stance === stance) return { ok: false, reason: 'Already our stance.' };
  const cd = world.neighbours.stanceCooldown;
  if (n.stanceSince !== null && state.day - n.stanceSince < cd) {
    return { ok: false, reason: `Too soon to change again (${cd - (state.day - n.stanceSince)} days).` };
  }
  return { ok: true };
}

export function setStance(state, world, id, stance) {
  state.neighbours[id].stance = stance;
  state.neighbours[id].stanceSince = state.day;
  const name = world.geography.neighbours[id].name;
  const words = { friendly: `Gifts and warm letters go to ${name}.`, neutral: `The crown's envoys to ${name} are told to be correct, and no more.`, cold: `Envoys from ${name} are kept waiting at Vizima.` };
  say(state, words[stance]);
}

// Once a month an envoy may arrive from a realm whose mood and trade suit
// one of the envoy cards.
export function monthlyEnvoy(state, world, rng) {
  if (!rng.chance(world.neighbours.envoyChance)) return;
  const options = [];
  for (const [eid, e] of Object.entries(world.envoys.envoys)) {
    for (const [rid, r] of Object.entries(world.neighbours.realms)) {
      if (e.only && !e.only.includes(rid)) continue;
      if (e.excludes?.includes(rid)) continue;
      if (e.needsTrade && !r.trade) continue;
      if (e.minRelation !== undefined && state.neighbours[rid].relation < e.minRelation) continue;
      if (state.envoys.some((p) => p.realm === rid)) continue;
      if (world.war && hostile(state, TEMERIA, rid)) continue;
      options.push({ eid, rid, w: e.weight });
    }
  }
  if (!options.length) return;
  let roll = rng.next() * options.reduce((a, o) => a + o.w, 0);
  const pick = options.find((o) => (roll -= o.w) < 0) ?? options[options.length - 1];
  state.envoys.push({ id: state.nextEnvoyId++, envoy: pick.eid, realm: pick.rid, day: state.day });
}

export function envoyText(world, pending) {
  const e = world.envoys.envoys[pending.envoy];
  const r = world.neighbours.realms[pending.realm];
  const fill = (t) => t
    .replaceAll('{ruler}', r.ruler)
    .replaceAll('{realm}', world.geography.neighbours[pending.realm].name)
    .replaceAll('{gateway}', world.byId[r.gateway].name);
  return { title: e.title, text: fill(e.text), choices: e.choices.map((c) => c.label) };
}

export function resolveEnvoy(state, world, envoyId, choice, ignored = false) {
  const i = state.envoys.findIndex((p) => p.id === envoyId);
  if (i < 0) return false;
  const pending = state.envoys[i];
  const c = world.envoys.envoys[pending.envoy].choices[choice];
  if (!c) return false;
  state.envoys.splice(i, 1);
  const fx = c.effects;
  const realm = world.neighbours.realms[pending.realm];
  const gate = state.settlements[realm.gateway];
  if (fx.relation) state.neighbours[pending.realm].relation = clamp(state.neighbours[pending.realm].relation + fx.relation, -100, 100);
  if (fx.treasury) state.treasury += fx.treasury;
  if (fx.authority) state.authority = clamp(state.authority + fx.authority, 0, 100);
  for (const [g, v] of Object.entries(fx.opinion ?? {})) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
  if (fx.settlers) gate.population.human += fx.settlers;
  if (fx.losses) gate.garrison = Math.max(0, gate.garrison - fx.losses);
  const { title } = envoyText(world, pending);
  const name = world.geography.neighbours[pending.realm].name;
  say(state, ignored
    ? `${title} (${name}): no answer came from Vizima, so it was taken as "${c.label.toLowerCase()}".`
    : `${title} (${name}): the crown chose to ${c.label.toLowerCase()}.`);
  return true;
}
