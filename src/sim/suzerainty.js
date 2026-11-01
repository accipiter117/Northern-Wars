// Suzerain and vassal (M29 B): the old protectorate treaty and the vassal
// peace term widened into one relationship, reached four ways. A petty king
// under threat asks a great power for protection (or the crown offers it);
// a feared crown with a gift in hand can press him into it; a beaten one
// can be made a vassal at the peace; and the great powers of the North
// court vassals by the same routes, so spheres form. A vassal has one
// suzerain. Mahakam will only ever be a protectorate.
import { addDispatch, clamp } from './realm.js';
import { TEMERIA, sideName, hostile, atWar } from './conflict.js';
import { tierOf, suzerainOf } from './tiers.js';
import { dangerTo, powerOf, endTreaty } from './diplomacy.js';
import { fearOf as dreadOf } from './conquest.js';
import { affinity } from './audiences.js';

const S = (world) => world.diplomacy?.suzerainty;
const say = (state, text) => addDispatch(state, text, 'abroad');

const living = (state, rid) => !!state.realms?.[rid] && !state.realms[rid].fallen;
export const protectorateOnly = (world, rid) => !!world.realms?.realms[rid]?.protectorateOnly;

// The great powers of the North that could take a vassal.
export function greatPowers(state, world) {
  return [TEMERIA, ...Object.keys(state.realms ?? {}).filter((r) => living(state, r) && tierOf(world, r) === 'great')];
}

export function suzerainty(state) {
  return (state.suzerainty ??= { asks: [], nextId: 1, cooldowns: {} });
}

// A realm becomes a vassal: one suzerain at a time, the old bond broken.
export function makeVassal(state, world, rid, lord, route, loyalty) {
  if (!living(state, rid) || tierOf(world, rid) !== 'petty') return false;
  if (protectorateOnly(world, rid) && route !== 'protection') return false;
  const realm = state.realms[rid];
  const old = suzerainOf(state, rid);
  for (const t of [...(state.diplomacy?.treaties ?? [])]) {
    if (t.kind === 'protectorate' && t.b === rid && t.a !== lord) endTreaty(state, world, t, { why: 'as it finds a new protector' });
  }
  realm.suzerain = lord;
  realm.vassal = { since: state.day, route, loyalty, ambition: S(world).ambition, from: old && old !== lord ? old : null };
  const title = world.diplomacy.tiers?.titles?.[rid];
  const words = {
    protection: `places itself under ${sideName(world, lord)}'s protection`,
    pressure: `bows to ${sideName(world, lord)}'s pressure and becomes its vassal`,
    peace: `bends the knee to ${sideName(world, lord)} at the peace`,
  }[route] ?? `becomes ${sideName(world, lord)}'s vassal`;
  const text = `${sideName(world, rid)} ${words}${old && old !== lord ? `, leaving ${sideName(world, old)}` : ''}.${lord === TEMERIA && title ? ` The king of Temeria is now ${title}.` : ''}`;
  if (lord === TEMERIA || old === TEMERIA) addDispatch(state, text, 'abroad');
  else say(state, text);
  return true;
}

export function releaseVassal(state, world, rid) {
  const realm = state.realms?.[rid];
  if (!realm?.suzerain) return;
  delete realm.suzerain;
  delete realm.vassal;
}

// ---- Protection ----

// Real danger, not old rivalry: a war, or an army mustering against it.
export function threatened(state, world, rid) {
  return atWar(state, rid) || (state.musters ?? []).some((m) => (m.against ?? TEMERIA) === rid);
}

// A great power can hold only so many vassals; the AI takes no more.
const roomFor = (state, world, p) => p === TEMERIA || vassalsOfSide(state, p) < S(world).ai.most;
const vassalsOfSide = (state, p) => Object.keys(state.realms ?? {}).filter((r) => !state.realms[r].fallen && suzerainOf(state, r) === p).length;

// Who a threatened petty king would turn to: the great power he likes best,
// strong enough to matter, near enough to come, not his enemy.
function protectorFor(state, world, rid) {
  let best = null;
  for (const p of greatPowers(state, world)) {
    if (hostile(state, p, rid) || !roomFor(state, world, p)) continue;
    const rel = p === TEMERIA ? state.neighbours[rid]?.relation ?? 0 : affinity(state, world, rid, p);
    const strength = Math.log10(Math.max(10, powerOf(state, world, p)));
    // A power that already holds many vassals looks like a master, not a friend.
    const score = rel + strength * S(world).protection.strengthWeight - distance(world, rid, p) * S(world).protection.distanceWeight - vassalsOfSide(state, p) * S(world).protection.perVassal;
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}

function capitalOf(world, side) {
  return world.byId[side === TEMERIA ? world.kingdom.capital : world.realms.realms[side]?.capital];
}

function distance(world, a, b) {
  const p = capitalOf(world, a);
  const q = capitalOf(world, b);
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 1000;
}

export function protectionAsks(state) {
  return suzerainty(state).asks;
}

// Answering a petty king who asks for the crown's protection.
export function answerProtection(state, world, id, accept) {
  const z = suzerainty(state);
  const ask = z.asks.find((a) => a.id === id);
  if (!ask) return false;
  z.asks = z.asks.filter((a) => a !== ask);
  if (accept) return makeVassal(state, world, ask.realm, TEMERIA, 'protection', S(world).protection.loyalty);
  if (state.neighbours[ask.realm]) state.neighbours[ask.realm].relation = clamp(state.neighbours[ask.realm].relation + S(world).protection.refuseRelation, -100, 100);
  addDispatch(state, `Vizima refuses ${sideName(world, ask.realm)} its protection. They will look elsewhere.`, 'abroad');
  z.cooldowns[`ask:${ask.realm}`] = state.day + S(world).protection.askAgainDays;
  return true;
}

// The crown offers protection through an envoy.
export function offerOdds(state, world, rid) {
  const c = S(world).offer;
  const danger = dangerTo(state, world, rid);
  const rel = state.neighbours[rid]?.relation ?? 0;
  return clamp(c.base + danger * c.dangerWeight + rel * c.relationWeight, 0, c.most);
}

export function canOfferProtection(state, world, rid) {
  if (!S(world)) return { ok: false, reason: 'No suzerainty in this world.' };
  if (!living(state, rid) || tierOf(world, rid) !== 'petty') return { ok: false, reason: 'Only a petty kingdom seeks a protector.' };
  if (suzerainOf(state, rid) === TEMERIA) return { ok: false, reason: 'Already under our protection.' };
  if (hostile(state, TEMERIA, rid)) return { ok: false, reason: 'We are at war with them.' };
  const until = suzerainty(state).cooldowns[`offer:${rid}`] ?? 0;
  if (until > state.day) return { ok: false, reason: `Our last envoy was turned away (${until - state.day} days).` };
  return { ok: true, odds: offerOdds(state, world, rid) };
}

export function offerProtection(state, world, rng, rid) {
  const z = suzerainty(state);
  const odds = offerOdds(state, world, rid);
  z.cooldowns[`offer:${rid}`] = state.day + S(world).offer.cooldown;
  if (rng.chance(odds)) return makeVassal(state, world, rid, TEMERIA, 'protection', S(world).offer.loyalty);
  addDispatch(state, `${sideName(world, rid)} thanks our envoy and declines the crown's protection. For now.`, 'abroad');
  return false;
}

// ---- Pressure ----

// Fear of the crown (M19), a gift and a stronger crown press a petty king
// into vassalage; he accepts reluctantly.
export function pressureOdds(state, world, rid, gift = 0) {
  const c = S(world).pressure;
  if (protectorateOnly(world, rid) || tierOf(world, rid) !== 'petty') return 0;
  const fear = dreadOf(state, rid, TEMERIA);
  const rel = state.neighbours[rid]?.relation ?? 0;
  const ratio = powerOf(state, world, TEMERIA) / Math.max(1, powerOf(state, world, rid));
  return clamp(c.base + fear * c.fearWeight + (gift / c.giftPer) * c.giftWeight + rel * c.relationWeight + Math.min(c.ratioMost, Math.log2(Math.max(1, ratio)) * c.ratioWeight), 0, c.most);
}

export function canPressure(state, world, rid, gift = 0) {
  if (!S(world)) return { ok: false, reason: 'No suzerainty in this world.' };
  if (protectorateOnly(world, rid)) return { ok: false, reason: 'The dwarves will take protection, never a master.' };
  if (!living(state, rid) || tierOf(world, rid) !== 'petty') return { ok: false, reason: 'Only a petty kingdom can be pressed into vassalage.' };
  if (suzerainOf(state, rid) === TEMERIA) return { ok: false, reason: 'Already our vassal.' };
  if (hostile(state, TEMERIA, rid)) return { ok: false, reason: 'Make peace first, or win the war.' };
  if (gift && state.treasury < gift) return { ok: false, reason: 'Not enough in the treasury.' };
  const until = suzerainty(state).cooldowns[`press:${rid}`] ?? 0;
  if (until > state.day) return { ok: false, reason: `They still smart from the last time (${until - state.day} days).` };
  return { ok: true, odds: pressureOdds(state, world, rid, gift) };
}

export function pressure(state, world, rng, rid, gift = 0) {
  const c = S(world).pressure;
  const odds = pressureOdds(state, world, rid, gift);
  state.treasury -= gift;
  suzerainty(state).cooldowns[`press:${rid}`] = state.day + c.cooldown;
  if (rng.chance(odds)) return makeVassal(state, world, rid, TEMERIA, 'pressure', c.loyalty);
  if (state.neighbours[rid]) state.neighbours[rid].relation = clamp(state.neighbours[rid].relation + c.refuseRelation, -100, 100);
  addDispatch(state, `${sideName(world, rid)} will not bow to Vizima${gift ? ', and keeps the gift' : ''}. Its court takes it ill.`, 'abroad');
  return false;
}

// ---- The month ----

// Threatened petty kings seek protection; the North's other great powers
// press their weaker neighbours.
export function monthlySuzerainty(state, world, rng) {
  const c = S(world);
  if (!c || !state.realms) return;
  const z = suzerainty(state);
  z.asks = z.asks.filter((a) => state.day - a.day < c.protection.askDays);
  for (const rid of Object.keys(state.realms)) {
    if (!living(state, rid) || tierOf(world, rid) !== 'petty') continue;
    if (suzerainOf(state, rid)) continue;
    // Protection, when in danger.
    if (threatened(state, world, rid) && dangerTo(state, world, rid) >= c.protection.dangerAbove && rng.chance(c.protection.chance)) {
      const p = protectorFor(state, world, rid);
      if (p === TEMERIA) {
        if (!z.asks.some((a) => a.realm === rid) && (z.cooldowns[`ask:${rid}`] ?? 0) <= state.day) {
          z.asks.push({ id: z.nextId++, realm: rid, day: state.day });
        }
      } else if (p) makeVassal(state, world, rid, p, 'protection', c.protection.loyalty);
      continue;
    }
    // Pressure from a great neighbour far stronger and not unfriendly.
    if (protectorateOnly(world, rid)) continue;
    for (const p of greatPowers(state, world)) {
      if (p === TEMERIA || hostile(state, p, rid) || !roomFor(state, world, p)) continue;
      if (distance(world, rid, p) > c.ai.reach) continue;
      const ratio = powerOf(state, world, p) / Math.max(1, powerOf(state, world, rid));
      if (ratio < c.ai.ratio || affinity(state, world, rid, p) < c.ai.affinity) continue;
      if (rng.chance(c.ai.chance)) {
        makeVassal(state, world, rid, p, 'pressure', c.pressure.loyalty);
        break;
      }
    }
  }
}
