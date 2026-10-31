// What a great house gives and what it wants (M27 A and B). A loyal house
// guards its own lands (clearing the camps and lairs there with its own
// men), brings a strong retinue when called and pays a real due. Each house
// has one want at a time, drawn from its traits: land, a command, a war, honours or
// justice. Granting it turns ambition into loyalty; leaving it unmet
// for months turns ambition into grievance.
import { addDispatch, clamp } from './realm.js';
import { authority } from './meters.js';
import { foeKind } from './combat.js';
import { atWar, TEMERIA, sideName } from './conflict.js';
import { crownArmies } from './armies.js';
import { totalPopulation } from './state.js';
import { threatName } from './threats.js';

const say = (state, text) => addDispatch(state, text, 'nobles');
const C = (world) => world.houses;

// A house's description: from the data for the founding houses, or from
// the state for a house raised in this reign (M27 E).
export function houseDef(state, world, id) {
  return state.houses?.[id]?.def ?? C(world).houses[id] ?? null;
}

// A lord's pronouns, from the title the data gives him or her.
export function pronoun(def) {
  const she = /^(Lady|Dame)\b/.test(def?.lord ?? '');
  return { he: she ? 'she' : 'he', his: she ? 'her' : 'his', him: she ? 'her' : 'him' };
}

const landsOf = (state, id) => Object.keys(state.settlements).filter((sid) => state.settlements[sid].holder === id && !state.settlements[sid].occupier);

// ---- Guarding his lands (A.1) ----

// Whether a house keeps its own lands: loyal enough and not risen.
export function guards(state, world, id) {
  const h = state.houses[id];
  return !!h && !h.rebel && !h.captive && h.loyalty >= C(world).guard.above;
}

// The month's work of each loyal house's men: at most one camp, lair or
// band in its lands put down (never the supernatural: that stays witchers'
// work).
export function monthlyGuard(state, world, rng) {
  const g = C(world).guard;
  if (!g || !state.threats) return;
  for (const id of Object.keys(state.houses)) {
    if (!guards(state, world, id)) continue;
    const lands = new Set(landsOf(state, id));
    const prey = state.threats.list.filter((t) => !t.abroad && lands.has(t.near) && g.kinds.includes(t.kind) && foeKind(t, world) !== 'supernatural');
    if (!prey.length || !rng.chance(g.chance)) continue;
    const t = prey[Math.floor(rng.next() * prey.length)];
    const what = threatName(world, t).toLowerCase();
    const s = state.settlements[t.near];
    if (s && (t.kind === 'bandits' || t.kind === 'monsters')) s.cleared = { ...(s.cleared ?? {}), [t.kind]: state.day + 120 };
    state.threats.list = state.threats.list.filter((x) => x !== t);
    state.threats.tally.cleared = (state.threats.tally.cleared ?? 0) + 1;
    const h = state.houses[id];
    h.guarded = (h.guarded ?? 0) + 1;
    h.lastGuard = { day: state.day, place: t.near, what };
    say(state, `${houseDef(state, world, id).name}'s men put down the ${what} near ${world.byId[t.near].name}.`);
  }
}

// Unrest in a house's lands from how it keeps them: calmer under a loyal
// house's watch, restless where a disloyal one lets trouble fester.
export function guardUnrest(state, world, s) {
  const g = C(world).guard;
  const h = state.houses?.[s.holder];
  if (!g || !h || s.holder === 'crown') return 0;
  if (h.rebel) return 0;
  if (h.loyalty >= g.above) return -g.calm;
  if (h.loyalty < g.festerBelow) return g.fester;
  return 0;
}

// ---- Dues (A.3) ----

// How much of its full due a house pays: all when loyal, less as loyalty
// falls, nothing in rebellion or while exempt.
export function duesShare(state, world, id) {
  const h = state.houses[id];
  const d = world.economy.taxes.nobles;
  if (!h || h.rebel || (h.exemptUntil !== null && state.day < h.exemptUntil)) return 0;
  if (h.loyalty >= d.fullAbove) return 1;
  return clamp((h.loyalty - d.noneBelow) / (d.fullAbove - d.noneBelow), d.least, 1);
}

// What each house gives, in three plain lines for its card (A.4).
export function houseGives(state, world, id, retinue, dues) {
  const lands = landsOf(state, id);
  const guarded = guards(state, world, id);
  const names = lands.slice(0, 3).map((sid) => world.byId[sid].name);
  const more = lands.length > 3 ? ` and ${lands.length - 3} more` : '';
  return {
    guard: guarded ? `Guards ${names.join(', ').replace(/, ([^,]*)$/, ' and $1')}${more}` : 'Lets trouble fester in its lands',
    retinue: retinue.men ? `Retinue about ${Math.round(retinue.men / 10) * 10} men` : 'Would send no retinue',
    dues: dues > 0 ? `Dues about ${Math.round(dues / 10) * 10} crowns a month` : 'Pays no dues',
  };
}

// ---- What a lord wants (B.1) ----

const KINDS = ['land', 'command', 'war', 'honours', 'justice'];

// Crown land a house could be given: villages, castles and towns (not the
// capital, a city or a temple), the conquered ones first.
export function grantableLand(state, world) {
  return Object.keys(state.settlements).filter((sid) => {
    const s = state.settlements[sid];
    const type = world.byId[sid]?.type;
    return s.holder === 'crown' && !s.occupier && sid !== world.kingdom.capital && ['village', 'castle', 'town'].includes(type);
  }).sort((a, b) => (state.settlements[b].conquered ? 1 : 0) - (state.settlements[a].conquered ? 1 : 0));
}

function rivalRealm(state, world) {
  const skip = new Set(C(world).wants.notRivals ?? []);
  const list = Object.entries(state.neighbours ?? {}).filter(([rid]) => !skip.has(rid)).sort((a, b) => a[1].relation - b[1].relation);
  return list[0]?.[0] ?? null;
}

function pickWant(state, world, id, rng) {
  const w = C(world).wants;
  const def = houseDef(state, world, id);
  const weights = {};
  for (const k of KINDS) weights[k] = w.kinds[k].weight;
  for (const t of def.traits) for (const [k, v] of Object.entries(C(world).traits[t]?.wants ?? {})) weights[k] *= v;
  const h = state.houses[id];
  if (h.grievance < w.kinds.justice.grievanceAbove) weights.justice = 0;
  const land = grantableLand(state, world);
  if (!land.length) weights.land = 0;
  const realm = rivalRealm(state, world);
  if (!realm) weights.war = 0;
  if (!crownArmies(state).length) weights.command *= w.kinds.command.noArmy ?? 1;
  let roll = rng.next() * KINDS.reduce((a, k) => a + weights[k], 0);
  const kind = KINDS.find((k) => (roll -= weights[k]) < 0) ?? 'honours';
  const want = { kind, since: state.day };
  if (kind === 'land') want.target = land.find((sid) => state.settlements[sid].conquered) ?? land[Math.floor(rng.next() * land.length)];
  if (kind === 'war') want.realm = realm;
  return want;
}

export function wantText(state, world, id) {
  const h = state.houses[id];
  const want = h?.want;
  if (!want) return null;
  const def = houseDef(state, world, id);
  const lord = def.lord;
  const p = pronoun(def);
  const realm = want.realm ? sideName(world, want.realm) : '';
  switch (want.kind) {
    case 'land': return { title: `Wants ${world.byId[want.target]?.name ?? 'land'}`, text: `${lord} asks to hold ${world.byId[want.target]?.name ?? 'more land'} of the crown.`, how: `Grant ${p.him} the land.` };
    case 'command': return { title: 'Wants a command', text: `${lord} asks to lead one of the crown's armies.`, how: `Give ${p.him} a command when an army takes the field.` };
    case 'war': return { title: `Wants war with ${realm}`, text: `${lord} urges war on ${realm} and would ride at the head of ${p.his} house's men.`, how: `It is granted while the crown is at war with ${realm}.` };
    case 'honours': return { title: 'Wants honours', text: `${lord} expects to be honoured at court, with coin and a feast.`, how: 'Bestow honours.' };
    default: return { title: 'Wants justice', text: `${lord} wants ${p.his} grievances against the crown set right.`, how: `Redress ${p.his} grievance.` };
  }
}

// A want granted: ambition becomes loyalty.
export function grantWant(state, world, id, how = '') {
  const h = state.houses[id];
  if (!h?.want) return false;
  const w = C(world).wants;
  const turned = Math.min(h.ambition, w.convert);
  h.ambition = clamp(h.ambition - turned, 0, 100);
  h.favour += turned;
  const def = houseDef(state, world, id);
  const what = wantText(state, world, id)?.title.replace(/^Wants /, '').replace(/^[A-Z]/, (c) => c.toLowerCase()) ?? 'the want';
  h.want = null;
  h.wantAfter = state.day + w.gap;
  h.wantNagged = false;
  say(state, `${def.lord} is granted ${how || what}. The house is the crown's.`);
  return true;
}

// The monthly turn of wants: a new one once the last is settled, a war
// want granted by war itself, and an unmet one souring into grievance.
export function monthlyWants(state, world, rng) {
  const w = C(world).wants;
  if (!w) return;
  for (const [id, h] of Object.entries(state.houses)) {
    if (h.rebel || h.captive) continue;
    if (!h.want) {
      if (state.day >= (h.wantAfter ?? 0)) h.want = pickWant(state, world, id, rng);
      continue;
    }
    const want = h.want;
    // Wants that can no longer be had are dropped without blame.
    if (want.kind === 'land' && state.settlements[want.target]?.holder !== 'crown') {
      if (state.settlements[want.target]?.holder === id) grantWant(state, world, id);
      else h.want = null;
      continue;
    }
    if (want.kind === 'war' && atWar(state, TEMERIA) && (state.wars ?? []).some((x) => x.sides.flat().includes(want.realm) && x.sides.flat().includes(TEMERIA))) {
      grantWant(state, world, id, `the war on ${sideName(world, want.realm)}`);
      continue;
    }
    if (want.kind === 'command' && crownArmies(state).some((a) => a.lordOf === id)) {
      grantWant(state, world, id, 'a command');
      continue;
    }
    const months = (state.day - want.since) / 30;
    if (months >= (w.lapse ?? Infinity)) {
      // He gives up asking, and remembers it.
      h.want = null;
      h.wantAfter = state.day + w.gap;
      h.wantNagged = false;
      continue;
    }
    if (months >= w.patience) {
      h.ambition = clamp(h.ambition + w.unmet.ambition, 0, 100);
      h.grievance += w.unmet.grievance;
      if (!h.wantNagged) {
        h.wantNagged = true;
        const def = houseDef(state, world, id);
        say(state, `${def.lord} has waited long for the crown to hear ${pronoun(def).him}. ${pronoun(def).his[0].toUpperCase()}${pronoun(def).his.slice(1)} patience is wearing thin.`);
      }
    }
  }
}

// Whether a lord obeys the crown's summons or call to arms: a loyal one
// always; a doubtful one only while the crown's Authority holds (B.3).
export function obeys(state, world, id) {
  const h = state.houses[id];
  const o = C(world).obey;
  if (!h || h.rebel) return false;
  if (!o || h.loyalty >= o.loyalAbove) return true;
  return authority(state, world) >= o.authorityAbove;
}

// Armies the crown could hand to a lord: its own, led by a captain.
export function commandable(state) {
  return crownArmies(state).filter((a) => !a.marshal && !a.lordOf);
}

export function landsPeople(state, id) {
  return landsOf(state, id).reduce((a, sid) => a + totalPopulation(state.settlements[sid]), 0);
}
