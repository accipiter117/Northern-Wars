// Rebellion as a war (M27 C). A house that rises declares against the crown
// as a side of its own ("rebel:<house>"): its castles and villages go over
// to it with their garrisons, its retinue becomes a rebel army at its seat,
// and it is fought with the crown's ordinary armies, battles and sieges.
// It ends when the rebel's seat falls, when he is taken after a lost battle,
// or when heavy defeats make him sue for terms: each of those brings him
// before the king's judgement (judgement.js). A crown too weak to crush him
// for a long time is forced to terms instead.
import { addDispatch, clamp } from './realm.js';
import { nudge, fearCollapse } from './meters.js';
import { TEMERIA, ownerOf, setOwner, hostile, rebelSide, rebelHouse } from './conflict.js';
import { newArmy, armyPosition, armyStrength, routeTo, halt, refuge, placeDefence } from './armies.js';
import { retinueCompanies } from './companies.js';
import { totalPopulation } from './state.js';
import { houseDef, pronoun } from './lords.js';
import { roadPath } from './world.js';

const say = (state, text) => addDispatch(state, text, 'nobles');
const R = (world) => world.houses.rebellion;

export const rebelArmies = (state, hid) => (state.armies ?? []).filter((a) => a.side === rebelSide(hid));

// A house rises. Its holdings turn, their garrisons with them, and its
// retinue takes the field at its seat.
export function rise(state, world, hid, joining = null) {
  const h = state.houses[hid];
  const def = houseDef(state, world, hid);
  const r = R(world);
  const side = rebelSide(hid);
  h.rebel = { since: state.day, months: 0, side, defeats: 0, joined: joining };
  const lands = Object.keys(state.settlements).filter((id) => state.settlements[id].holder === hid && !state.settlements[id].occupier);
  let people = 0;
  let sworn = 0;
  for (const id of lands) {
    setOwner(state, world, id, side);
    people += totalPopulation(state.settlements[id]);
    // Half of each garrison marches with the host; the rest holds the walls.
    const g = Math.floor(state.settlements[id].garrison * r.garrisonShare);
    state.settlements[id].garrison -= g;
    sworn += g;
  }
  const men = Math.max(r.armyMin, Math.round(people * r.armyPerPerson)) + sworn;
  const at = state.settlements[def.seat] && ownerOf(state, world, def.seat) === side ? def.seat : lands[0] ?? def.seat;
  newArmy(state, world, side, at, men, {}, {
    name: `The host of ${def.name}`, bands: retinueCompanies(world, hid, men), stance: 'bold', order: 'siege', target: null,
  });
  const a = state.armies.at(-1);
  a.rebel = hid;
  a.folk = true;
  say(state, joining
    ? `${def.name} joins the rising of ${houseDef(state, world, joining).name}: ${men} men under its banners at ${world.byId[at].name}.`
    : `${def.name} has risen in rebellion! ${def.lord} raises ${men} men at ${world.byId[at].name}; ${lands.map((id) => world.byId[id].name).join(', ')} fly ${pronoun(def).his} banners.`);
}

// A rebel host's mind: fight a crown army it can beat, fall back on its
// seat from one it cannot, else take the nearest crown town within reach of
// its lands (raiding the open villages, besieging the walled towns).
export function thinkRebel(state, world, a) {
  const hid = a.rebel;
  const def = houseDef(state, world, hid);
  const pos = armyPosition(world, a);
  const r = R(world);
  let near = null;
  for (const b of state.armies) {
    if (b === a || !hostile(state, a.side, b.side) || (b.routed ?? 0) > state.day) continue;
    const p = armyPosition(world, b);
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d <= 140 && (!near || d < near.d)) near = { b, d };
  }
  if (near) {
    const ratio = armyStrength(state, world, a) / Math.max(1, armyStrength(state, world, near.b, true));
    if (ratio >= r.engageAt) {
      a.siege = null;
      return routeTo(world, a, near.b.to ?? near.b.at);
    }
    if (ratio < 0.8) {
      a.siege = null;
      a.order = 'defend';
      const back = ownerOf(state, world, def.seat) === a.side ? def.seat : refuge(state, world, a);
      return a.at === back && !a.to ? halt(a) : routeTo(world, a, back);
    }
  }
  if (!a.target || ownerOf(state, world, a.target) !== TEMERIA) a.target = rebelTarget(state, world, a);
  if (!a.target) return halt(a);
  a.order = 'siege';
  if (a.at === a.target && !a.to) return halt(a);
  return routeTo(world, a, a.target);
}

function rebelTarget(state, world, a) {
  const def = houseDef(state, world, a.rebel);
  const seat = world.byId[def.seat];
  let best = null;
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier || id === world.kingdom.capital) continue;
    const p = world.byId[id];
    const d = Math.hypot(p.x - seat.x, p.y - seat.y);
    if (d > R(world).reach) continue;
    const easy = a.soldiers >= placeDefence(state, world, id) ? 1 : 0.25;
    const score = easy / (d + 50);
    if ((!best || score > best.score) && roadPath(world, a.to ?? a.at, id, true)) best = { id, score };
  }
  return best?.id ?? null;
}

// The day: a seat retaken, a host broken in the field and its lord perhaps
// taken.
export function stepRebellionDay(state, world, rng) {
  if (!state.houses) return;
  for (const [hid, h] of Object.entries(state.houses)) {
    if (!h.rebel?.side) continue;
    const def = houseDef(state, world, hid);
    if (state.settlements[def.seat] && ownerOf(state, world, def.seat) === TEMERIA) {
      endRebellion(state, world, hid, 'seat');
      continue;
    }
    for (const a of rebelArmies(state, hid)) {
      if ((a.routed ?? 0) > state.day && a.countedRout !== a.routed) {
        a.countedRout = a.routed;
        h.rebel.defeats += 1;
        if (rng.chance(R(world).captureChance) || a.soldiers < R(world).armyMin / 2) {
          endRebellion(state, world, hid, 'captured');
          break;
        }
      }
    }
  }
}

// The month: the rising goes on, costs the crown Love, may draw in other
// disloyal houses, and ends in terms one way or the other.
export function monthlyRebellion(state, world, rng) {
  const r = R(world);
  for (const [hid, h] of Object.entries(state.houses)) {
    if (!h.rebel) continue;
    // A save from before M27: the rising becomes a war at last.
    if (!h.rebel.side) {
      h.rebel = null;
      rise(state, world, hid);
    }
    h.rebel.months += 1;
    nudge(state, world, 'love', -r.trustPerMonth, 'A great house in rebellion');
    const mine = rebelArmies(state, hid).reduce((v, a) => v + armyStrength(state, world, a), 0);
    if (h.rebel.defeats >= r.sueAfterDefeats && mine < r.sueBelow) {
      endRebellion(state, world, hid, 'terms');
      continue;
    }
    if (h.rebel.months >= r.forceTermsAfter) {
      const crown = (state.armies ?? []).filter((a) => a.side === TEMERIA).reduce((v, a) => v + armyStrength(state, world, a), 0);
      if (crown < Math.max(mine, 1) * r.crownWinsAt) forceTerms(state, world, hid);
    }
  }
}

// The rising is over and the lord is in the king's hands: his lands come
// back under the crown, his host disperses, and the Judgement awaits.
export function endRebellion(state, world, hid, how) {
  const h = state.houses[hid];
  const def = houseDef(state, world, hid);
  const side = h.rebel.side;
  for (const [id, s] of Object.entries(state.settlements)) if (s.occupier === side) setOwner(state, world, id, TEMERIA);
  state.armies = state.armies.filter((a) => a.side !== side);
  const months = h.rebel.months;
  h.rebel = null;
  h.captive = { day: state.day, how, months };
  (state.judgements ??= []).push({ id: (state.nextJudgementId = (state.nextJudgementId ?? 0) + 1), house: hid, how, day: state.day, months });
  const words = {
    seat: `${world.byId[def.seat].name} falls to the crown, and ${def.lord} with it.`,
    captured: `${def.lord} is taken on the field as the host of ${def.name} breaks.`,
    terms: `Beaten in the field, ${def.lord} sues for the king's mercy and lays down ${pronoun(def).his} arms.`,
  };
  const p = pronoun(def);
  say(state, `${words[how]} The rising of ${def.name} is over. ${p.he[0].toUpperCase()}${p.he.slice(1)} waits on the king's judgement.`);
  nudge(state, world, 'fear', R(world).crushedFear, 'A rising crushed');
}

// Too weak to win, the crown makes terms: the rebel keeps his lands, wins
// a village more and a respite from his dues.
function forceTerms(state, world, hid) {
  const h = state.houses[hid];
  const def = houseDef(state, world, hid);
  const side = h.rebel.side;
  for (const [id, s] of Object.entries(state.settlements)) if (s.occupier === side) setOwner(state, world, id, TEMERIA);
  state.armies = state.armies.filter((a) => a.side !== side);
  const t = R(world).terms;
  const land = Object.keys(state.settlements).find((id) => state.settlements[id].holder === 'crown' && !state.settlements[id].occupier
    && world.byId[id].type === 'village' && (world.adjacency[id] ?? []).some((e) => state.settlements[e.to]?.holder === hid));
  if (land) state.settlements[land].holder = hid;
  h.exemptUntil = state.day + t.exemptDays;
  h.rebel = null;
  Object.assign(h, { loyalty: t.loyalty, grievance: 0, favour: h.favour + t.favour, office: true });
  say(state, `Too weak to break ${def.name}, the crown makes terms: ${def.lord} keeps ${pronoun(def).his} lands${land ? `, gains ${world.byId[land].name}` : ''}, a seat on the council and a year free of dues.`);
  nudge(state, world, 'love', -t.love, 'Terms made with rebels');
  fearCollapse(state, world, world.meters?.fear.revoltWon ?? 0, 'A rising that won its terms');
}

export { rebelHouse };
