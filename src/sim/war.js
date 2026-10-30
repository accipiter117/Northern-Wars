// War and peace between the realms of the North. Temeria may declare war, be
// invaded by a neighbour it has soured or that smells weakness, be called to
// a friend's side, or watch its neighbours fight one another. Wars end in a
// peace: towns handed back or kept, sometimes tribute, and a truce.
import { windfall } from './economy.js';
import { creditLimit } from './economy.js';
import { addDispatch, clamp } from './realm.js';
import { goldGreed } from './gold.js';
import { informed } from './realms.js';
import { newArmy, disbandArmy, crownArmies } from './armies.js';
import { treatyBetween, treatiesOf, partnerOf, endTreaty, hasTrait, changeTrust } from './diplomacy.js';
import { treatyCalls, crownBound } from './audiences.js';
import { settleOwnership } from './lands.js';
import { leagueAllies, setWarHook, integrationFactor } from './conquest.js';
import { answerTerms } from './siege.js';
import {
  TEMERIA, ownerOf, originOf, placeOf, placesHeldBy, valueOf, hostile, warBetween, sideIndex, sideName, warsOf, atWar,
  heldValue, warScore, exhaustion, setOwner, truceUntil, setTruce,
} from './conflict.js';

const W = (world) => world.war;
const say = (state, text) => addDispatch(state, text, 'military');
const abroad = (state, text) => addDispatch(state, text, 'abroad');

// ---- Strength of a side ----

export function soldiersOf(state, world, side) {
  let n = 0;
  for (const id of placesHeldBy(state, world, side)) n += placeOf(state, world, id).garrison;
  for (const a of state.armies) if (a.side === side) n += a.soldiers;
  return Math.round(n);
}

// How large an army a realm could put in the field.
export function realmPotential(state, world, rid) {
  const ai = W(world).ai;
  let n = 0;
  let people = 0;
  const muster = W(world).raise.muster;
  for (const [id, s] of Object.entries(state.realms[rid]?.settlements ?? {})) {
    if (ownerOf(state, world, id) !== rid) continue;
    // Since M21 a realm musters a share of its people, as the crown does.
    if (muster) {
      n += Math.floor(s.population * (muster.share[world.byId[id].type] ?? 0) * ai.muster.call * integrationFactor(world, s, 'levyAt'));
      continue;
    }
    n += Math.floor(s.garrison * ai.armyShare);
    // A conquered town sends few men until it has taken to its new crown (M19).
    people += s.population * integrationFactor(world, s, 'levyAt');
  }
  // The standing army (M18) counts in full.
  return n + Math.round(people * ai.levyPerPeople) + Math.round(state.realms[rid]?.army ?? 0);
}

function claimsAgainstTemeria(state, world, rid) {
  return placesHeldBy(state, world, TEMERIA).filter((id) => originOf(world, id) === rid).length;
}

// ---- Starting a war ----

export function startWar(state, world, rng, attacker, defender, cause) {
  const war = {
    id: state.nextWarId++, sides: [[attacker], [defender]], since: state.day, cause, taken: [], points: [0, 0], lost: [0, 0],
    base: [soldiersOf(state, world, attacker), soldiersOf(state, world, defender)], lastOffer: state.day, called: false,
  };
  state.wars.push(war);
  // The league against Temeria (M19) stands together when Vizima strikes.
  if (attacker === TEMERIA) for (const r of leagueAllies(state, defender)) if (!war.sides[1].includes(r)) war.sides[1].push(r);
  for (const rid of [attacker, defender]) if (rid !== TEMERIA) hostility(state, world, rid);
  const text = `${sideName(world, attacker)} is at war with ${sideName(world, defender)}.`;
  if (attacker === TEMERIA || defender === TEMERIA) say(state, text);
  else if (informed(state, world, attacker) || informed(state, world, defender)) abroad(state, text);

  // Treaties bring their partners in: foreign rulers answer by temper and
  // trust; a partner of ours attacked (or an ally attacking) asks for us.
  if (state.diplomacy) {
    treatyCalls(state, world, rng, war);
    if (attacker !== TEMERIA && defender !== TEMERIA) crownCall(state, world, war);
  }
  raiseForWar(state, world, war);
  return war;
}

// Is the crown bound by treaty to join this war, and on whose side?
function crownCall(state, world, war) {
  if (war.called || war.sides.flat().includes(TEMERIA)) return;
  const [att, def] = [war.sides[0][0], war.sides[1][0]];
  if (crownBound(state, def, false) && truceUntil(state, TEMERIA, att) <= state.day) callToArms(state, world, war, def, att);
  else if (crownBound(state, att, true) && truceUntil(state, TEMERIA, def) <= state.day) callToArms(state, world, war, att, def);
}

function hostility(state, world, rid) {
  const n = state.neighbours[rid];
  if (n && hostile(state, TEMERIA, rid)) n.relation = Math.min(n.relation, W(world).atWarRelation);
}

function callToArms(state, world, war, ally, enemy) {
  war.called = true;
  state.warDecisions.push({ id: state.nextWarDecisionId++, kind: 'call', war: war.id, realm: ally, enemy, day: state.day });
}

// Each foreign realm at war keeps an army or two in the field.
function raiseForWar(state, world, war) {
  const ai = W(world).ai;
  for (const side of [0, 1]) {
    for (const rid of war.sides[side]) {
      if (rid === TEMERIA || !state.realms[rid] || state.realms[rid].fallen) continue;
      const people = Object.values(state.realms[rid].settlements).reduce((a, s) => a + s.population, 0);
      const want = people >= ai.bigRealm ? ai.maxArmies : 1;
      const have = state.armies.filter((a) => a.side === rid);
      for (const a of have) if (a.order === 'muster') a.order = 'siege';
      if (have.length >= want) continue;
      const foes = war.sides[1 - side];
      raiseRealmArmy(state, world, rid, foes);
    }
  }
}

export function raiseRealmArmy(state, world, rid, foes, order = 'siege') {
  const ai = W(world).ai;
  const realm = state.realms[rid];
  const levy = {};
  let n = 0;
  let people = 0;
  const muster = W(world).raise.muster;
  const standing = Math.round(realm.army ?? 0);
  let levied;
  if (muster) {
    // Since M21 a realm musters by the same rules as the crown: a share of
    // each place's people, more from the cities, half a call at first and
    // all of it when it already has an army in the field.
    const call = state.armies.some((a) => a.side === rid) ? ai.muster.desperate * 0.5 : ai.muster.call;
    levied = 0;
    for (const [id, s] of Object.entries(realm.settlements)) {
      if (ownerOf(state, world, id) !== rid) continue;
      people += s.population;
      levied += Math.floor(s.population * (muster.share[world.byId[id].type] ?? 0) * call);
    }
  } else {
    for (const [id, s] of Object.entries(realm.settlements)) {
      if (ownerOf(state, world, id) !== rid) continue;
      people += s.population;
      const k = Math.floor(s.garrison * ai.armyShare);
      if (k > 0) {
        levy[id] = k;
        s.garrison -= k;
        n += k;
      }
    }
    // The standing army marches first (M18): paid, drilled men, better than
    // the levy, which stays a cheaper and weaker fallback.
    levied = n + Math.round(people * ai.levyPerPeople * (state.armies.some((a) => a.side === rid) ? 0.5 : 1));
  }
  const total = levied + standing;
  if (total < W(world).minArmy * 2) {
    for (const [id, k] of Object.entries(levy)) realm.settlements[id].garrison += k;
    return null;
  }
  // Muster at the realm's own place nearest the enemy.
  const foePlaces = foes.flatMap((f) => placesHeldBy(state, world, f));
  let best = null;
  for (const id of placesHeldBy(state, world, rid)) {
    const p = world.byId[id];
    for (const f of foePlaces) {
      const d = Math.hypot(world.byId[f].x - p.x, world.byId[f].y - p.y);
      if (!best || d < best.d) best = { id, d };
    }
  }
  if (!best) return null;
  const count = state.armies.filter((a) => a.side === rid).length;
  realm.army = 0;
  // Its standing men as men-at-arms, its levies as militia and bowmen, in
  // companies (M22 C), by the same formula as the crown's.
  const a = newArmy(state, world, rid, best.id, total, levy, {
    order, target: null, stance: (ai.aggression[rid] ?? 0.3) >= 0.5 ? 'bold' : 'cautious',
    name: `The ${count ? 'second ' : ''}army of ${sideName(world, rid)}`,
    bands: realmCompanies(world, rid, standing, levied),
  });
  a.standing = standing;
  return a;
}

// ---- The crown declares war ----

export function declareCost(state, world, rid) {
  const d = W(world).declare;
  if (claimsOnTemeria(state, world, rid)) return 0;
  return Math.round(d.authorityBase + Math.max(0, state.neighbours[rid].relation) * d.authorityPerRelation);
}

// Temerian towns a realm holds give the crown a just cause against it.
function claimsOnTemeria(state, world, rid) {
  return Object.keys(state.settlements).filter((id) => state.settlements[id].occupier === rid).length;
}

export function canDeclare(state, world, rid) {
  if (!state.neighbours[rid] || !state.realms[rid]) return { ok: false, reason: 'Unknown realm.' };
  if (W(world).noWar.includes(rid)) return { ok: false, reason: 'No army can fight the dryads in their own forest.' };
  if (hostile(state, TEMERIA, rid)) return { ok: false, reason: 'We are already at war with them.' };
  const truce = truceUntil(state, TEMERIA, rid);
  if (truce > state.day) return { ok: false, reason: `A truce holds for ${Math.ceil((truce - state.day) / 30)} more months.` };
  const cost = declareCost(state, world, rid);
  if (state.authority < cost) return { ok: false, reason: `Needs ${cost} Authority: the lords would not follow.` };
  return { ok: true, cost };
}

export function declareWar(state, world, rng, rid, { cost = declareCost(state, world, rid), cause = 'declared' } = {}) {
  const d = W(world).declare;
  state.authority = clamp(state.authority - cost, 0, 100);
  const traits = (hid) => world.houses.houses[hid].traits;
  for (const hid of Object.keys(state.houses ?? {})) {
    if (traits(hid).includes('warlike')) state.houses[hid].favour += d.warlikeFavour;
    if (traits(hid).includes('cautious')) state.houses[hid].grievance += d.cautiousGrievance;
  }
  if (state.opinion?.burghers !== undefined) state.opinion.burghers = clamp(state.opinion.burghers + d.burghers, 0, 100);
  state.neighbours[rid].stance = 'cold';
  state.neighbours[rid].stanceSince = state.day;
  say(state, cost
    ? `The crown declares war on ${sideName(world, rid)}. The lords ask what cause there is; ${cost} Authority is spent quieting them.`
    : `The crown declares war on ${sideName(world, rid)} to win back what is ours.`);
  return startWar(state, world, rng, TEMERIA, rid, cause);
}

// ---- The month ----

export function monthlyWar(state, world, rng) {
  if (!state.wars) return;
  // A war whose every foe has fallen is over (M19); what was taken stays.
  for (const war of [...state.wars]) {
    if (war.sides.some((side) => !side.length)) {
      state.wars = state.wars.filter((w) => w !== war);
      settleOwnership(state, world);
    }
  }
  aiDeclarations(state, world, rng);
  rivalries(state, world, rng);
  for (const war of [...state.wars]) {
    raiseForWar(state, world, war);
    if (war.sides.flat().includes(TEMERIA)) offers(state, world, war);
    else foreignPeace(state, world, war);
    allyCalls(state, world, war, rng);
  }
  state.tributes = (state.tributes ?? []).filter((t) => t.until > state.day);
  // A long war wears on the burghers whose trade it stops.
  if (atWar(state, TEMERIA) && state.opinion?.burghers !== undefined) {
    state.opinion.burghers = clamp(state.opinion.burghers + W(world).weariness.burghers, 0, 100);
  }
}

// Months the crown has been at war without a break, for the weariness it breeds.
export function warMonths(state) {
  const ours = warsOf(state, TEMERIA);
  if (!ours.length) return 0;
  return (state.day - Math.min(...ours.map((w) => w.since))) / 30;
}

// How much a realm wants war with Temeria: bad blood, towns of theirs we
// hold, and the greed of its rulers, which grows as Temeria looks weak and
// shrinks as Temeria looks strong or warm. Below zero, they are content.
export function hostilityTo(state, world, rid) {
  const ai = W(world).ai;
  const weak = state.authority < ai.weakAuthority || Object.values(state.houses ?? {}).some((h) => h.rebel);
  const rel = state.neighbours[rid].relation;
  const odds = clamp(realmPotential(state, world, rid) / Math.max(1, soldiersOf(state, world, TEMERIA) * 0.3), 0, 1.5);
  // Working gold mines whet the appetite of the greedy.
  const greed = (ai.greed[rid] ?? 0) * odds * (weak ? 2 : 1) + (ai.greed[rid] ? goldGreed(state, world) : 0);
  return Math.max(0, ai.hostileBelow - rel) / 40 + (claimsAgainstTemeria(state, world, rid) * ai.claimHostility) / 40
    + (weak ? ai.weakBonus / 40 : 0) + greed - Math.max(0, rel) / 50;
}

function aiDeclarations(state, world, rng) {
  // Since M18 rulers choose their wars (strategy.js): a realm set on
  // expansion musters against the holder of its war aim. Only the musters
  // are resolved here.
  if (world.strategy) return resolveMusters(state, world, rng);
  const ai = W(world).ai;
  const ours = soldiersOf(state, world, TEMERIA);
  for (const rid of Object.keys(state.realms)) {
    if (W(world).noWar.includes(rid) || !state.neighbours[rid] || hostile(state, rid, TEMERIA) || state.realms[rid].fallen) continue;
    if (truceUntil(state, rid, TEMERIA) > state.day || state.musters.some((m) => m.realm === rid)) continue;
    const hostilityLevel = hostilityTo(state, world, rid);
    if (hostilityLevel <= 0) continue;
    // A pact holds them back; only an opportunist breaks it, and seldom.
    const pact = keptPact(state, rid, TEMERIA);
    if (pact && !(hasTrait(world, rid, 'opportunist') && rng.chance(0.15))) continue;
    if (realmPotential(state, world, rid) < ours * 0.13) continue;
    const chance = ai.declareChance * (ai.aggression[rid] ?? 0.3) * Math.min(1.5, hostilityLevel) * (atWar(state, TEMERIA) ? ai.atWarOpportunism : 1);
    if (!rng.chance(chance)) continue;
    const army = raiseRealmArmy(state, world, rid, [TEMERIA], 'muster');
    if (!army) continue;
    if (pact) endTreaty(state, world, pact, { broken: true, by: rid, why: 'and gathers an army' });
    state.musters.push({ realm: rid, army: army.id, day: state.day + ai.musterDays });
    // So great a gathering cannot be hidden; those who watch them know
    // where and how many.
    const at = world.byId[army.at];
    const nearBorder = Object.keys(state.settlements).some((id) => Math.hypot(world.byId[id].x - at.x, world.byId[id].y - at.y) < 160);
    say(state, informed(state, world, rid) || nearBorder
      ? `War drums in ${sideName(world, rid)}: ${Math.round(army.soldiers)} men gather at ${at.name}, and they are not gathering for a parade.`
      : `War drums in ${sideName(world, rid)}: travellers speak of soldiers on every road and talk of war with Temeria.`);
  }
  for (const m of [...state.musters]) {
    if (m.day > state.day) continue;
    state.musters = state.musters.filter((x) => x !== m);
    const army = state.armies.find((a) => a.id === m.army);
    if (hostilityTo(state, world, m.realm) > 0) {
      const war = startWar(state, world, rng, m.realm, TEMERIA, 'invasion');
      const price = Math.round(400 + realmPotential(state, world, m.realm) * 0.3);
      state.warDecisions.push({ id: state.nextWarDecisionId++, kind: 'declared', war: war.id, realm: m.realm, price, day: state.day });
    } else if (army) {
      disbandArmy(state, world, army, true);
      if (informed(state, world, m.realm)) abroad(state, `The host gathered in ${sideName(world, m.realm)} disperses. Whatever they meant, they thought better of it.`);
    }
  }
}

// A muster's day has come: war on the holder of the aim, if the aim is
// still worth it; otherwise the host goes home. A show of force always does.
function resolveMusters(state, world, rng) {
  for (const m of [...state.musters]) {
    if (m.day > state.day) continue;
    state.musters = state.musters.filter((x) => x !== m);
    const army = state.armies.find((a) => a.id === m.army);
    const against = m.against ?? TEMERIA;
    const realm = state.realms[m.realm];
    const still = !m.show && army && realm?.posture?.kind === 'expand' && m.aim && ownerOf(state, world, m.aim) === against
      && !hostile(state, m.realm, against) && truceUntil(state, m.realm, against) <= state.day;
    if (!still) {
      if (army) disbandArmy(state, world, army, true);
      if (realm) realm.aim = null;
      if (against === TEMERIA) say(state, `The host gathered in ${sideName(world, m.realm)} on our border disperses.`);
      else if (informed(state, world, m.realm)) abroad(state, `The host gathered in ${sideName(world, m.realm)} disperses. Whatever they meant, they thought better of it.`);
      continue;
    }
    const pact = keptPact(state, m.realm, against);
    if (pact) endTreaty(state, world, pact, { broken: true, by: m.realm, why: 'and marches to war' });
    const war = startWar(state, world, rng, m.realm, against, m.reason ?? 'none');
    war.aims = { [m.realm]: m.aim };
    war.reason = m.reason ?? 'none';
    // A war without a reason costs the aggressor trust in every court.
    if (war.reason === 'none' && state.diplomacy) {
      for (const p of [TEMERIA, ...Object.keys(state.realms)]) {
        if (p === m.realm || p === against) continue;
        changeTrust(state, world, p, m.realm, world.diplomacy.trust.noCause);
      }
    }
    if (against === TEMERIA) {
      const price = Math.round(400 + realmPotential(state, world, m.realm) * 0.3);
      state.warDecisions.push({ id: state.nextWarDecisionId++, kind: 'declared', war: war.id, realm: m.realm, price, day: state.day });
    }
  }
}

// A pact that forbids war between two parties.
function keptPact(state, a, b) {
  if (!state.diplomacy) return null;
  return treatiesOf(state, a).find((t) => partnerOf(t, a) === b && ['nonaggression', 'defensive', 'alliance', 'protectorate'].includes(t.kind)) ?? null;
}

function rivalries(state, world, rng) {
  // Since M18 rivalries only colour hostility and affinity: no dice.
  if (world.strategy) return;
  for (const r of W(world).rivalries) {
    if (!state.realms[r.a] || !state.realms[r.b] || hostile(state, r.a, r.b) || truceUntil(state, r.a, r.b) > state.day) continue;
    if (!rng.chance(r.chance)) continue;
    const [att, def] = rng.chance(0.5) ? [r.a, r.b] : [r.b, r.a];
    // Bound by a pact, they keep the peace, unless the attacker is an
    // opportunist who decides it no longer pays.
    const pact = keptPact(state, att, def);
    if (pact) {
      if (!hasTrait(world, att, 'opportunist') || !rng.chance(0.3)) continue;
      endTreaty(state, world, pact, { broken: true, by: att, why: 'and marches to war' });
    }
    startWar(state, world, rng, att, def, 'rivalry');
  }
}

function allyCalls(state, world, war, rng) {
  if (!state.diplomacy) return;
  crownCall(state, world, war);
  // A side losing its war calls on its treaty partners once more (M18).
  if (world.strategy && !war.recalled && rng && months(state, war) >= 2) {
    for (const side of [0, 1]) {
      if (warScore(state, world, war, side) <= -20) {
        war.recalled = true;
        treatyCalls(state, world, rng, war);
      }
    }
  }
}

// ---- Peace ----

function months(state, war) {
  return (state.day - war.since) / 30;
}

// What the crown can offer the other side of a war it leads, and whether
// they would take it. Each term has a price to them; a side presses on until
// its weariness and its losses outweigh the price.
export function peaceTerms(state, world, war) {
  const p = W(world).peace;
  const me = sideIndex(war, TEMERIA);
  const them = 1 - me;
  const heldMe = heldValue(state, world, war, me);
  const heldThem = heldValue(state, world, war, them);
  const pressure = exhaustion(state, world, war, them) + warScore(state, world, war, me);
  const lump = Math.round(200 + 15 * Math.max(0, warScore(state, world, war, them)) + heldThem * 20);
  const monthly = Math.round(30 + heldMe * 2 + Math.max(0, warScore(state, world, war, me)));
  const ready = months(state, war) >= p.minMonths;
  const list = [
    { key: 'white', cost: heldThem * 1.5 - heldMe },
    { key: 'keep', cost: heldMe * 1.5 - heldThem },
    { key: 'tribute', cost: heldMe * 1.5 - heldThem + p.tributeCost + monthly / 4, monthly },
    { key: 'pay', cost: heldThem * 1.5 - heldMe - lump / 25, lump },
  ];
  for (const t of list) t.accept = ready && pressure - t.cost >= p.acceptMargin;
  return { list, ready, them: war.sides[them][0], heldMe, heldThem };
}

export function canMakePeace(state, world, warId, key) {
  const war = state.wars.find((w) => w.id === warId);
  if (!war || sideIndex(war, TEMERIA) < 0) return { ok: false, reason: 'No such war.' };
  if (war.sides[sideIndex(war, TEMERIA)][0] !== TEMERIA) return { ok: false, reason: 'Our ally leads this war; we can only withdraw.' };
  const terms = peaceTerms(state, world, war);
  const t = terms.list.find((x) => x.key === key);
  if (!t) return { ok: false, reason: 'Unknown terms.' };
  if (!terms.ready) return { ok: false, reason: `Too soon: no one makes peace in the first ${W(world).peace.minMonths} months.` };
  if (!t.accept) return { ok: false, reason: 'They would refuse.' };
  if (t.lump && state.treasury - t.lump < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, terms: t };
}

export function offerPeace(state, world, warId, key) {
  const war = state.wars.find((w) => w.id === warId);
  const { list, them } = peaceTerms(state, world, war);
  const t = list.find((x) => x.key === key);
  const p = W(world).peace;
  applyPeace(state, world, war, {
    towns: key === 'white' || key === 'pay' ? 'white' : 'keep',
    tribute: key === 'tribute' ? { from: them, to: TEMERIA, monthly: t.monthly, until: state.day + p.tributeMonths * 30 } : null,
    lump: key === 'pay' ? { from: TEMERIA, to: them, coin: t.lump } : null,
  });
}

// Settle a war: towns handed back or kept, tribute, a truce, and everyone
// home.
export function applyPeace(state, world, war, { towns, prize = null, tribute = null, lump = null, keep = [] }) {
  const p = W(world).peace;
  if (towns === 'white' || towns === 'prize') {
    // `keep`: war aims their takers hold, which stay with them (M18).
    const kept = towns === 'prize' ? prizeOf(state, world, war, prize) : null;
    for (const t of war.taken) if (t.id !== kept && !keep.includes(t.id) && ownerOf(state, world, t.id) !== t.from) setOwner(state, world, t.id, t.from);
  }
  // A capital goes home at the peace (M18), unless its taker holds every
  // town the realm had left (M19): then the realm is swallowed whole.
  if (world.strategy) {
    for (const t of war.taken) {
      const capital = t.from === TEMERIA ? world.kingdom.capital === t.id : world.realms?.realms[t.from]?.capital === t.id;
      if (!capital || ownerOf(state, world, t.id) === t.from) continue;
      if (t.from !== TEMERIA && whollyTaken(state, world, t.from)) continue;
      setOwner(state, world, t.id, t.from);
    }
  }
  // A town an ally retook goes home to its own realm, not to the ally (M19).
  for (const t of war.taken) {
    const home = originOf(world, t.id);
    const owner = ownerOf(state, world, t.id);
    if (owner !== home && sideIndex(war, owner) >= 0 && sideIndex(war, owner) === sideIndex(war, home)) setOwner(state, world, t.id, home);
  }
  // No victor keeps more than it can hold down (M19): its war aim first,
  // then the richest towns, up to a share of what its own towns are worth;
  // the rest go home.
  if (world.conquest) digestible(state, world, war);
  if (tribute) state.tributes.push(tribute);
  if (lump) pay(state, lump.from, lump.to, lump.coin);
  // Prisoners held a year or more go home at the peace (M19).
  if (state.captives) state.captives = state.captives.filter((c) => !(war.sides.flat().includes(c.side) && war.sides.flat().includes(c.by) && state.day - c.day >= 365));
  state.wars = state.wars.filter((w) => w !== war);
  // Men paid off at the peace find new masters (M21: the free companies).
  state.warsEnded = [...(state.warsEnded ?? []).filter((d) => state.day - d < 1500), state.day];
  for (const a of war.sides[0]) for (const b of war.sides[1]) setTruce(state, a, b, state.day + p.truceDays);
  for (const rid of war.sides.flat()) {
    if (rid !== TEMERIA && state.neighbours[rid] && war.sides.flat().includes(TEMERIA)) {
      state.neighbours[rid].relation = Math.max(state.neighbours[rid].relation, p.relationAfter);
    }
  }
  // Foreign hosts go home; the crown's armies stand fast until told otherwise.
  for (const a of [...state.armies]) {
    if (atWar(state, a.side) || !war.sides.flat().includes(a.side)) continue;
    if (a.side !== TEMERIA) disbandArmy(state, world, a, true);
  }
  const names = war.sides.map((s) => s.map((r) => sideName(world, r)).join(' and '));
  let text = `Peace between ${names[0]} and ${names[1]}.`;
  if (towns === 'white' && war.taken.length) text += ' Every town taken is handed back.';
  if (towns === 'prize') {
    const kept = war.taken.filter((t) => ownerOf(state, world, t.id) === t.to && t.to !== t.from);
    if (kept.length) text += ` ${sideName(world, prize)} keeps ${kept.map((t) => world.byId[t.id].name).join(', ')}; every other town taken is handed back.`;
  }
  if (towns === 'keep') {
    const kept = war.taken.filter((t) => ownerOf(state, world, t.id) === t.to).map((t) => `${world.byId[t.id].name} to ${sideName(world, t.to)}`);
    if (kept.length) text += ` Each keeps what it holds: ${kept.join(', ')}.`;
  }
  if (tribute) text += ` ${sideName(world, tribute.from)} pays ${sideName(world, tribute.to)} ${tribute.monthly} crowns a month for ${p.tributeMonths} months.`;
  if (lump) text += ` ${sideName(world, lump.from)} pays ${lump.coin} crowns.`;
  const changed = [...new Set(war.taken.map((t) => t.id))].filter((id) => ownerOf(state, world, id) !== originOf(world, id)).map((id) => ({ id, to: ownerOf(state, world, id) }));
  state.warHistory.push({ sides: war.sides, since: war.since, until: state.day, towns, taken: war.taken.length, aims: war.aims ?? null, reason: war.reason ?? war.cause, changed });
  if (state.warHistory.length > 20) state.warHistory.shift();
  // What each side keeps changes realm for good (M19).
  settleOwnership(state, world);
  if (war.sides.flat().includes(TEMERIA)) {
    const me = sideIndex(war, TEMERIA);
    const gained = (towns === 'keep' ? heldValue(state, world, war, me) - heldValue(state, world, war, 1 - me) : 0) + (tribute?.to === TEMERIA ? 10 : 0) - (tribute?.from === TEMERIA || lump?.from === TEMERIA ? 10 : 0);
    state.authority = clamp(state.authority + Math.sign(gained) * 5, 0, 100);
    say(state, text);
  } else if (war.sides.flat().some((r) => informed(state, world, r))) abroad(state, text);
}

// The best town a side took in a war and still holds. A great city is too
// much to ask in a peace unless the war was a rout.
function digestible(state, world, war) {
  const c = world.conquest.peace;
  const takers = new Set(war.taken.map((t) => ownerOf(state, world, t.id)).filter((o) => o && war.sides.flat().includes(o)));
  for (const taker of takers) {
    const own = taker === TEMERIA
      ? Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier)
      : (world.foreignByRealm[taker] ?? []).filter((id) => ownerOf(state, world, id) === taker);
    let room = Math.max(c.keepMin, own.reduce((a, id) => a + valueOf(state, world, id), 0) * c.keepShare);
    const held = war.taken.filter((t) => ownerOf(state, world, t.id) === taker && t.from !== taker);
    const aim = war.aims?.[taker];
    held.sort((x, y) => (y.id === aim) - (x.id === aim) || valueOf(state, world, y.id) - valueOf(state, world, x.id));
    // A realm swallowed whole is the exception: its taker keeps it all.
    const whole = (rid) => rid !== TEMERIA && whollyTaken(state, world, rid);
    for (const t of held) {
      const v = valueOf(state, world, t.id);
      if (whole(t.from) || v <= room) room -= v;
      else setOwner(state, world, t.id, t.from);
    }
  }
}

// Whether a realm holds none of the towns it still counted as its own.
function whollyTaken(state, world, rid) {
  return (world.foreignByRealm[rid] ?? []).every((id) => ownerOf(state, world, id) !== rid);
}

function prizeOf(state, world, war, side) {
  let best = null;
  const rout = warScore(state, world, war, sideIndex(war, side)) >= W(world).peace.cityPrizeAt;
  for (const t of war.taken) {
    if (t.to !== side || ownerOf(state, world, t.id) !== side) continue;
    if (!rout && (world.byId[t.id].type === 'city' || valueOf(state, world, t.id) > W(world).values.city)) continue;
    if (!best || valueOf(state, world, t.id) > valueOf(state, world, best)) best = t.id;
  }
  return best;
}

function pay(state, from, to, coin) {
  if (from === TEMERIA) state.treasury -= coin;
  else if (state.realms[from]) state.realms[from].treasury -= coin;
  // Coin won in peace terms shows on the ledger as war's takings (M21).
  if (to === TEMERIA) windfall(state, 'reparations', coin);
  else if (state.realms[to]) state.realms[to].treasury += coin;
}

// The foreign side of a war with Temeria sues for peace when tired, or
// demands terms when winning.
function offers(state, world, war) {
  const p = W(world).peace;
  const me = sideIndex(war, TEMERIA);
  if (war.sides[me][0] !== TEMERIA) return;
  if (months(state, war) < p.minMonths || state.day - war.lastOffer < 90) return;
  if (state.warDecisions.some((d) => d.war === war.id)) return;
  const them = 1 - me;
  const score = warScore(state, world, war, them);
  const tired = exhaustion(state, world, war, them);
  let terms = null;
  if (score >= p.aiDemandsAt) {
    // A victor keeps one prize, the best town it took, and hands back the rest.
    terms = { towns: score >= p.prizeAt ? 'prize' : 'white', prize: war.sides[them][0], tribute: score >= p.tributeAt ? { from: TEMERIA, to: war.sides[them][0], monthly: Math.round(30 + score) } : null };
  } else if (tired >= p.aiSeeksAt) {
    terms = { towns: heldValue(state, world, war, me) > 15 ? 'keep' : 'white', tribute: null };
  }
  if (!terms) return;
  war.lastOffer = state.day;
  if (terms.tribute) terms.tribute.until = state.day + p.tributeMonths * 30;
  state.warDecisions.push({ id: state.nextWarDecisionId++, kind: 'offer', war: war.id, realm: war.sides[them][0], terms, day: state.day });
}

function foreignPeace(state, world, war) {
  const p = W(world).peace;
  const m = months(state, war);
  if (m < p.minMonths) return;
  if (world.strategy) return foreignPeaceM18(state, world, war, m);
  const tired = Math.max(exhaustion(state, world, war, 0), exhaustion(state, world, war, 1));
  if (tired < p.foreignEndsAt && m < p.foreignMaxMonths) return;
  const score = warScore(state, world, war, 0);
  applyPeace(state, world, war, Math.abs(score) >= p.prizeAt ? { towns: 'prize', prize: war.sides[score > 0 ? 0 : 1][0] } : { towns: 'white' });
}

// Since M18 a foreign war ends when one side is spent, when the aggressor
// holds its aim and the defender has had enough, or sooner when either side
// is in debt. A side holding its aim keeps it; a modest lead settles as each
// keeps what it holds; a rout takes a prize as before.
function foreignPeaceM18(state, world, war, m) {
  const p = W(world).peace;
  const c = world.strategy.war;
  const tired = Math.max(exhaustion(state, world, war, 0), exhaustion(state, world, war, 1));
  const held = Object.entries(war.aims ?? {}).filter(([side, town]) => ownerOf(state, world, town) === side);
  const aimDone = held.some(([side]) => m >= c.aimMonths && exhaustion(state, world, war, 1 - sideIndex(war, side)) >= c.aimHeldPeace);
  const debt = c.debtPeace && war.sides.flat().some((r) => (state.realms[r]?.treasury ?? 0) < 0);
  if (!aimDone && tired < p.foreignEndsAt - (debt ? 20 : 0) && m < p.foreignMaxMonths) return;
  const score = warScore(state, world, war, 0);
  const keep = held.map(([, town]) => town);
  if (Math.abs(score) >= p.prizeAt) applyPeace(state, world, war, { towns: 'prize', prize: war.sides[score > 0 ? 0 : 1][0], keep });
  else if (Math.abs(score) >= c.keepAt) applyPeace(state, world, war, { towns: 'keep' });
  else applyPeace(state, world, war, { towns: 'white', keep });
}

// The crown leaves a friend's war: it hands back what it took and makes its
// own truce.
export function withdraw(state, world, warId) {
  const war = state.wars.find((w) => w.id === warId);
  const me = sideIndex(war, TEMERIA);
  for (const t of war.taken) if (t.to === TEMERIA && ownerOf(state, world, t.id) === TEMERIA) setOwner(state, world, t.id, t.from);
  war.taken = war.taken.filter((t) => t.to !== TEMERIA);
  war.sides[me] = war.sides[me].filter((r) => r !== TEMERIA);
  for (const r of war.sides[1 - me]) setTruce(state, TEMERIA, r, state.day + W(world).peace.truceDays);
  const leader = war.sides[me][0];
  if (state.neighbours[leader]) state.neighbours[leader].relation = clamp(state.neighbours[leader].relation - 15, -100, 100);
  say(state, `The crown leaves ${sideName(world, leader)} to fight on alone.`);
}

// ---- Decisions brought to the crown ----

export function warDecisionText(state, world, d) {
  const war = state.wars.find((w) => w.id === d.war);
  const realm = sideName(world, d.realm);
  if (d.kind === 'declared') {
    return {
      kicker: 'War', title: `${realm} declares war`,
      text: `Heralds from ${realm} read out their grievances at the gate of Vizima, and their army is already on the march. We may fight, or buy them off before blood is spilled.`,
      choices: ['To arms', `Buy them off (${d.price} crowns)`],
    };
  }
  if (d.kind === 'terms') {
    const a = state.armies.find((x) => x.id === d.army);
    return {
      kicker: 'A siege', title: `${world.byId[d.town].name} offers terms`,
      text: `Starving, the garrison of ${world.byId[d.town].name} offers to march out with the honours of war and leave the town intact.${a?.siege ? ` Our camp has lost ${Math.round(a.siege.sick)} men to sickness in ${a.siege.days} days.` : ''} Refuse, and we starve them to the last or storm what is left.`,
      choices: ['Accept their terms', 'Refuse'],
    };
  }
  if (d.kind === 'call') {
    return {
      kicker: `An envoy from ${realm}`, title: 'A friend calls us to arms',
      text: `${sideName(world, d.enemy)} and ${realm} are at war. Their envoy reminds us of our treaty and asks whether Temerian banners will march with theirs. To refuse is to break the treaty.`,
      choices: ['Join the war', 'Stay out of it'],
    };
  }
  const t = d.terms;
  let text = `${realm} offers peace. `;
  if (t.towns === 'white') text += 'Every town taken is to be handed back.';
  else if (t.towns === 'prize') {
    const kept = war && prizeOf(state, world, war, t.prize);
    text += kept ? `They keep ${world.byId[kept].name}; every other town taken is handed back.` : 'Every town taken is to be handed back.';
  }
  else {
    const kept = (war?.taken ?? []).filter((x) => ownerOf(state, world, x.id) === x.to).map((x) => `${world.byId[x.id].name} (${sideName(world, x.to)})`);
    text += kept.length ? `Each side keeps what it holds: ${kept.join(', ')}.` : 'Each side keeps what it holds.';
  }
  if (t.tribute) text += ` Temeria is to pay ${t.tribute.monthly} crowns a month for ${W(world).peace.tributeMonths} months.`;
  return { kicker: `An envoy from ${realm}`, title: t.tribute ? 'Terms from the victor' : 'An offer of peace', text, choices: ['Accept', 'Fight on'] };
}

export function resolveWarDecision(state, world, id, choice, ignored = false) {
  const i = state.warDecisions.findIndex((d) => d.id === id);
  if (i < 0) return false;
  const d = state.warDecisions[i];
  state.warDecisions.splice(i, 1);
  const war = state.wars.find((w) => w.id === d.war);
  const realm = sideName(world, d.realm);
  if (!war) return true;
  if (d.kind === 'terms') {
    answerTerms(state, world, null, d, choice === 0);
    return true;
  }
  if (d.kind === 'declared') {
    if (choice === 1 && state.treasury - d.price >= -creditLimit(state, world)) {
      applyPeace(state, world, war, { towns: 'white', lump: { from: TEMERIA, to: d.realm, coin: d.price } });
    } else say(state, ignored ? `${realm} is at war with us, and Vizima has said nothing. The realm takes up arms.` : `The crown will meet ${realm} in the field.`);
  } else if (d.kind === 'call') {
    if (choice === 0) {
      war.sides[sideIndex(war, d.realm)].push(TEMERIA);
      hostility(state, world, d.enemy);
      state.neighbours[d.realm].relation = clamp(state.neighbours[d.realm].relation + 10, -100, 100);
      if (state.diplomacy) changeTrust(state, world, d.realm, TEMERIA, 5);
      say(state, `Temeria joins ${realm} in its war against ${sideName(world, d.enemy)}.`);
    } else {
      state.neighbours[d.realm].relation = clamp(state.neighbours[d.realm].relation + W(world).callRelation, -100, 100);
      say(state, `${ignored ? 'No answer came from Vizima' : 'The crown declines'}. ${realm} will remember who stood by it.`);
      const t = state.diplomacy && treatyBetween(state, TEMERIA, d.realm);
      const binding = t && (crownBound(state, d.realm, false) || crownBound(state, d.realm, true));
      if (binding) endTreaty(state, world, binding, { broken: true, by: TEMERIA, why: 'by refusing the call to arms' });
    }
  } else if (d.kind === 'offer') {
    if (choice === 0) {
      if (ignored) say(state, `No answer came from Vizima, so ${realm}'s terms were taken.`);
      applyPeace(state, world, war, d.terms);
    }
    else say(state, `The crown refuses ${realm}'s terms. The war goes on.`);
  }
  return true;
}

export function stepWarDecisionsDay(state, world) {
  const wait = W(world).peace.offerDefaultDays;
  for (const d of [...(state.warDecisions ?? [])]) {
    if (!state.wars.some((w) => w.id === d.war)) {
      state.warDecisions = state.warDecisions.filter((x) => x !== d);
      continue;
    }
    // Left unanswered: fight when attacked, take an offered peace, stay out
    // of a friend's war.
    if (state.day - d.day >= wait) resolveWarDecision(state, world, d.id, d.kind === 'call' ? 1 : 0, true);
  }
}

export { crownArmies };

// Revolts, exiles and the league start wars through the same door (M19).
setWarHook(startWar);
