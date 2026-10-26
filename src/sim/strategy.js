// Rulers who govern (M18). Once a month every foreign realm takes stock:
// how threatened it is, what opportunity lies before it, and how full its
// purse is, each 0 to 100 with its reasons kept for display. From these it
// chooses a posture (Grow, Arm, Expand, Consolidate or Scheme) and acts on
// it: the size of its standing army, what it builds, the war it chooses and
// how it probes a neighbour too strong to attack. Works for any party with a
// realm in data/realms.json and a ruler in data/diplomacy.json.
import { addDispatch, clamp } from './realm.js';
import { informed } from './realms.js';
import { realmPotential, raiseRealmArmy } from './war.js';
import { TEMERIA, hostile, atWar, warsOf, sideIndex, warScore, ownerOf, originOf, valueOf, sideName, placesHeldBy, leviedMap } from './conflict.js';
import {
  D, parties, rulerShort, hasTrait, agendaOf, trustIn, changeTrust, remember, powerOf, treatiesOf, treatyBetween, partnerOf, bindingTreaty, endTreaty,
} from './diplomacy.js';

export const ST = (world) => world.strategy;
const abroad = (state, text) => addDispatch(state, text, 'abroad');
const PEACE_PACTS = ['nonaggression', 'defensive', 'alliance', 'protectorate'];

// ---- Who is near whom ----

const nearCache = new WeakMap();
// Parties with a town within reach of one of this realm's towns (Temeria
// included), worked out once per world.
export function neighboursOf(world, rid) {
  let all = nearCache.get(world);
  if (!all) {
    all = {};
    const reach = world.war?.ai.reach ?? 260;
    const townsOf = (p) => (p === TEMERIA ? world.geography.settlements.map((s) => s.id) : world.foreignByRealm[p] ?? []);
    const ids = [TEMERIA, ...Object.keys(world.foreignByRealm)];
    for (const a of ids) {
      all[a] = ids.filter((b) => b !== a && townsOf(a).some((x) => townsOf(b).some((y) => Math.hypot(world.byId[x].x - world.byId[y].x, world.byId[x].y - world.byId[y].y) <= reach)));
    }
    nearCache.set(world, all);
  }
  return all[rid] ?? [];
}

// Strength in the field: what a realm can raise plus what it already has out.
export function strengthOf(state, world, pid) {
  if (pid === TEMERIA) return powerOf(state, world, TEMERIA);
  let n = realmPotential(state, world, pid);
  for (const a of state.armies ?? []) if (a.side === pid) n += a.soldiers;
  return Math.max(1, n);
}

// The crown's strength as a neighbour sees it at its own border: garrisons,
// companies and armies within reach of its towns, and the allies bound to
// defend Temeria.
export function deterrence(state, world, rid) {
  const c = ST(world).deterrence;
  const theirs = (world.foreignByRealm[rid] ?? []).map((id) => world.byId[id]);
  const near = (p) => theirs.some((t) => Math.hypot(t.x - p.x, t.y - p.y) <= c.near);
  let v = 0;
  for (const [id, s] of Object.entries(state.settlements)) if (!s.occupier && near(world.byId[id])) v += s.garrison * c.garrison;
  for (const co of state.forces?.companies ?? []) if (!co.army && world.byId[co.station] && near(world.byId[co.station])) v += co.men * c.companies;
  for (const a of state.armies ?? []) if (a.side === TEMERIA && near(world.byId[a.at])) v += a.soldiers * c.armies;
  // The rest of the crown's strength could march to the border in time.
  v += powerOf(state, world, TEMERIA) * c.whole;
  for (const p of parties(world)) {
    if (p === rid || !state.realms?.[p]) continue;
    if (bindingTreaty(state, p, TEMERIA, false)) v += strengthOf(state, world, p) * c.allies;
  }
  return Math.max(1, v);
}

// The strength a realm must overcome to take something from `pid`.
function guardOf(state, world, rid, pid) {
  return pid === TEMERIA ? deterrence(state, world, rid) : strengthOf(state, world, pid);
}

function bound(state, a, b) {
  return treatiesOf(state, a).find((t) => partnerOf(t, a) === b && PEACE_PACTS.includes(t.kind)) ?? null;
}

function rivals(world, a, b) {
  return (world.war?.rivalries ?? []).some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

// Is the crown weak or distracted, as a neighbour reckons it?
export function crownWeak(state, world) {
  const pb = ST(world).pactBreak;
  const rebel = Object.values(state.houses ?? {}).some((h) => h.rebel);
  const levied = Object.values(leviedMap(state)).reduce((a, b) => a + b, 0);
  const garrisons = Object.values(state.settlements).reduce((a, s) => a + s.garrison, 0);
  const stripped = levied > 0 && levied / Math.max(1, levied + garrisons) >= pb.strippedShare;
  return { weak: state.authority < pb.weakAuthority || atWar(state, TEMERIA) || rebel || stripped, very: state.authority < pb.weakAuthority / pb.veryWeakFactor || (atWar(state, TEMERIA) && rebel), rebel, stripped };
}

// ---- The assessment ----

const part = (list, text, value, extra = {}) => { if (Math.round(value)) list.push({ text, value: Math.round(value), ...extra }); };

export function assess(state, world, rid) {
  const c = ST(world);
  const realm = state.realms[rid];
  const me = strengthOf(state, world, rid);
  const near = neighboursOf(world, rid).filter((p) => p === TEMERIA || state.realms?.[p]);
  const name = (p) => sideName(world, p);

  // Threat.
  const threat = [];
  const t = c.threat;
  for (const w of warsOf(state, rid)) {
    const side = sideIndex(w, rid);
    const foe = w.sides[1 - side][0];
    part(threat, `At war with ${name(foe)}`, t.war);
    const score = warScore(state, world, w, side);
    if (score < 0) part(threat, `The war goes badly`, Math.min(t.warLosing, -score * 0.4));
  }
  let strongest = null;
  for (const p of near) {
    if (hostile(state, p, rid)) continue;
    const ratio = strengthOf(state, world, p) / me;
    const enemy = p === TEMERIA ? (state.neighbours[rid]?.relation ?? 0) <= t.hostileRelation
      : rivals(world, p, rid) || trustIn(state, world, rid, p) < 30;
    if (enemy && !bound(state, rid, p)) part(threat, `${name(p)} is hostile and ${ratio > 1 ? 'strong' : 'close'}`, t.hostile * clamp(ratio, 0.3, 3));
    if (ratio >= t.strongerAt && !bound(state, rid, p) && (!strongest || ratio > strongest.ratio)) strongest = { p, ratio };
  }
  if (strongest) part(threat, `${name(strongest.p)} has grown strong on its border`, t.stronger);
  if ((state.musters ?? []).some((m) => (m.against ?? TEMERIA) === rid)) part(threat, 'An army masses on its border', t.muster);
  const camps = (state.threats?.list ?? []).filter((x) => x.abroad === rid).length;
  if (camps) part(threat, `Camps and lairs on its land (${camps})`, Math.min(t.campMax, camps * t.camp));

  // Opportunity, against each neighbour; the best is the realm's target.
  const o = c.opportunity;
  const zeal = hasTrait(world, rid, 'zealous') ? c.traits.zealous.agendaPull : 1;
  const ag = agendaOf(world, rid);
  let best = null;
  let vsTemeria = null;
  for (const p of near) {
    if (p !== TEMERIA && !state.realms?.[p]) continue;
    const parts = [];
    const guard = guardOf(state, world, rid, p);
    const ratio = me / guard;
    const distracted = atWar(state, p) || (p === TEMERIA && crownWeak(state, world).weak);
    if (ratio >= o.weakAt) part(parts, `${name(p)} is weaker${p === TEMERIA ? ' at our border' : ''}`, Math.min(o.weakMax, (ratio - 1) * o.weak) * (distracted ? o.distracted : 1));
    else if (distracted) part(parts, `${name(p)} is distracted`, 6);
    const theirs = p === TEMERIA ? Object.keys(state.settlements).filter((id) => ownerOf(state, world, id) === TEMERIA) : placesHeldBy(state, world, p);
    let aimTown = null;
    if (ag?.kind === 'town' && ownerOf(state, world, ag.town) === p) {
      part(parts, `${name(p)} holds ${world.byId[ag.town].name}, which ${rulerShort(world, rid)} wants`, o.agendaTown * zeal);
      aimTown = ag.town;
    }
    const lost = theirs.filter((id) => originOf(world, id) === rid);
    if (lost.length) {
      part(parts, `${name(p)} holds towns taken from it (${lost.length})`, Math.min(o.lostMax, lost.length * o.lostTown));
      aimTown ??= lost.sort((a, b) => valueOf(state, world, b) - valueOf(state, world, a))[0];
    }
    // A thinly held border town within reach.
    const mine = (world.foreignByRealm[rid] ?? []).filter((id) => ownerOf(state, world, id) === rid).map((id) => world.byId[id]);
    let thin = null;
    for (const id of theirs) {
      const pl = world.byId[id];
      if (!pl || id === world.kingdom.capital || world.realms?.realms[p]?.capital === id) continue;
      const d = Math.min(...mine.map((m) => Math.hypot(m.x - pl.x, m.y - pl.y)));
      if (!(d <= (world.war?.ai.reach ?? 260))) continue;
      const g = p === TEMERIA ? state.settlements[id]?.garrison ?? 0 : state.realms[p]?.settlements[id]?.garrison ?? state.realms[originOf(world, id)]?.settlements[id]?.garrison ?? 0;
      const score = valueOf(state, world, id) / (d + 100) / (1 + g / 100);
      if (g < me * o.thinAt && (!thin || score > thin.score)) thin = { id, score };
    }
    if (thin && ratio >= 1) part(parts, `${world.byId[thin.id].name} is thinly held`, o.thinBorder);
    aimTown ??= thin?.id ?? null;
    // Bad blood with the crown counts as reason enough.
    if (p === TEMERIA) {
      const rel = state.neighbours[rid]?.relation ?? 0;
      if (rel < t.hostileRelation) part(parts, 'Old grievances against Temeria', Math.min(20, (t.hostileRelation - rel) * 0.6));
    }
    let sum = parts.reduce((a, x) => a + x.value, 0);
    if (p === TEMERIA) vsTemeria = { value: sum, ratio, parts };
    if (bound(state, rid, p)) sum *= o.allyCut;
    if (!aimTown) sum *= 0.5;
    if (!best || sum > best.value) best = { against: p, value: sum, parts, aim: aimTown, ratio };
  }

  // Purse.
  const income = Math.max(1, realm.income ?? 1);
  const months = realm.treasury / income;
  const purse = [];
  let purseValue;
  if (realm.treasury < 0) {
    part(purse, `In debt by ${Math.round(-realm.treasury)} crowns`, -40);
    purseValue = c.purse.debt;
  } else {
    part(purse, `${Math.floor(months)} months of income in hand`, months);
    purseValue = clamp((months / c.purse.monthsFull) * 100, 0, 100);
  }
  const sum = (l) => clamp(l.reduce((a, x) => a + x.value, 0), 0, 100);
  return {
    threat: { value: sum(threat), parts: threat.sort((a, b) => b.value - a.value) },
    opportunity: { value: clamp(best?.value ?? 0, 0, 100), parts: (best?.parts ?? []).sort((a, b) => b.value - a.value), against: best?.against ?? null, aim: best?.aim ?? null, ratio: best?.ratio ?? 0 },
    purse: { value: purseValue, parts: purse, months, debt: realm.treasury < 0 },
    vsTemeria,
  };
}

// ---- Choosing a posture ----

function traitBonus(world, rid, posture) {
  let v = 0;
  for (const tr of D(world).rulers[rid]?.traits ?? []) v += ST(world).traits[tr]?.[posture] ?? 0;
  return v;
}

export function postureScores(state, world, rid, a) {
  const c = ST(world).choose;
  const strong = a.opportunity.ratio >= 1.3;
  const aggression = world.war?.ai.aggression[rid] ?? 0.3;
  const greed = world.war?.ai.greed[rid] ?? 0;
  const afterWar = (state.warHistory ?? []).some((w) => w.sides.flat().includes(rid) && state.day - w.until < c.afterWarDays);
  const T = a.threat.value;
  const O = a.opportunity.value;
  const P = a.purse.value;
  return {
    grow: c.growBase + (P - 50) * c.growPurse - T * c.growThreat - O * c.growOpportunity + traitBonus(world, rid, 'grow'),
    arm: c.armBase + T * c.armThreat + traitBonus(world, rid, 'arm'),
    expand: c.expandBase + O * c.expandOpportunity * (strong ? 1 : 0.3) + traitBonus(world, rid, 'expand') + aggression * ST(world).aggressionExpand,
    consolidate: c.consolidateBase - P * c.consolidatePurse + (afterWar ? c.afterWar : 0) + traitBonus(world, rid, 'consolidate'),
    scheme: c.schemeBase + O * c.schemeOpportunity * (strong ? 0.4 : 1) + traitBonus(world, rid, 'scheme') + greed * ST(world).greedScheme,
  };
}

// The reasons shown for a posture: what drove it, in plain words.
function postureReasons(kind, a) {
  if (kind === 'arm') return a.threat.parts.slice(0, 2);
  if (kind === 'expand' || kind === 'scheme') return a.opportunity.parts.slice(0, 2);
  if (kind === 'consolidate') return a.purse.debt ? a.purse.parts.slice(0, 1) : [{ text: 'Recovering its strength', value: 0 }, ...a.purse.parts.slice(0, 1)];
  return [{ text: a.threat.value < 15 ? 'Its borders are quiet' : 'Its borders are quiet enough', value: 0 }, ...a.purse.parts.slice(0, 1)];
}

export function choosePosture(state, world, rid, a) {
  const realm = state.realms[rid];
  const c = ST(world).choose;
  const cur = realm.posture;
  const forced = a.purse.debt ? 'consolidate' : null;
  const held = cur && (state.day - cur.since) / 30 < c.minMonths && a.threat.value - cur.threat < c.threatJump;
  if (!forced && held) return cur;
  const scores = postureScores(state, world, rid, a);
  let kind = forced ?? Object.entries(scores).sort((x, y) => y[1] - x[1])[0][0];
  // An honourable ruler does not scheme: they wait, or grow.
  if (kind === 'scheme' && hasTrait(world, rid, 'honourable')) kind = 'grow';
  if (cur && cur.kind === kind) {
    Object.assign(cur, { threat: a.threat.value, opportunity: a.opportunity.value, purse: a.purse.value, against: a.opportunity.against, reasons: postureReasons(kind, a) });
    return cur;
  }
  return {
    kind, since: state.day, threat: a.threat.value, opportunity: a.opportunity.value, purse: a.purse.value,
    against: kind === 'expand' || kind === 'scheme' ? a.opportunity.against : null, reasons: postureReasons(kind, a),
  };
}

// ---- The standing army ----

export function armyUpkeep(world, realm) {
  const c = ST(world).army;
  const smithy = Object.values(realm.settlements).some((s) => s.buildings.includes('smithy'));
  return c.upkeep * (smithy ? c.smithyUpkeep : 1);
}

export function armyTarget(state, world, rid) {
  const realm = state.realms[rid];
  const c = ST(world).army;
  const p = ST(world).postures[realm.posture?.kind ?? 'grow'];
  // What is left of income after the garrisons are paid funds the army.
  const pay = Object.values(realm.settlements).reduce((x, t) => x + t.garrison, 0) * world.realms.economy.garrisonPayMonth;
  const income = Math.max(0, (realm.income ?? 0) - pay);
  let target = (p.army * income) / armyUpkeep(world, realm);
  // Arming or bent on war, a ruler spends a hoard on soldiers over two years.
  if (['arm', 'expand'].includes(realm.posture?.kind)) {
    const spare = Math.max(0, realm.treasury - income * 6);
    target += spare / (c.hoardYears * 12 * armyUpkeep(world, realm) + c.recruitCost);
  }
  return Math.round(target);
}

function recruit(state, world, rid) {
  const realm = state.realms[rid];
  const c = ST(world).army;
  const target = armyTarget(state, world, rid);
  realm.army ??= 0;
  if (realm.army > target) {
    realm.army = Math.max(target, Math.floor(realm.army * 0.9));
    return;
  }
  const want = Math.min(target - realm.army, Math.max(c.recruitMin, Math.round(target * c.recruitRate)));
  // Recruits are paid for from what lies beyond a reserve of three months.
  const afford = Math.floor(Math.max(0, realm.treasury - (realm.income ?? 0) * c.reserveMonths) / c.recruitCost);
  const n = Math.max(0, Math.min(want, afford));
  if (!n) return;
  realm.treasury -= n * c.recruitCost;
  realm.army += n;
  // The men come from the realm's own people, the largest towns first.
  const towns = Object.entries(realm.settlements).filter(([id]) => ownerOf(state, world, id) === rid).sort((x, y) => y[1].population - x[1].population);
  if (towns[0]) towns[0][1].population = Math.max(0, towns[0][1].population - n);
}

// ---- War aims ----

export function pactAllows(state, world, rid, against, rng) {
  const pact = bound(state, rid, against);
  if (!pact) return { ok: true, pact: null };
  if (hasTrait(world, rid, 'honourable')) return { ok: false, pact };
  if (against === TEMERIA) {
    const w = crownWeak(state, world);
    const ambitious = hasTrait(world, rid, 'ambitious') || hasTrait(world, rid, 'opportunist');
    if (hasTrait(world, rid, 'cautious') && !ambitious) return { ok: w.very && rng.chance(ST(world).pactBreak.chance), pact };
    return { ok: ambitious && w.weak && rng.chance(ST(world).pactBreak.chance), pact };
  }
  return { ok: hasTrait(world, rid, 'opportunist') && rng.chance(ST(world).war.pactBreak), pact };
}

// The reason a realm gives for its war, from the M17 list.
export function warReasonOf(state, world, rid, against, aim) {
  if (aim && (originOf(world, aim) === rid || agendaOf(world, rid)?.town === aim)) return 'claim';
  if ((state.diplomacy?.broken ?? []).some((b) => b.by === against && b.with === rid && state.day - b.day < 1095)) return 'broken';
  for (const t of treatiesOf(state, rid)) {
    if (['defensive', 'alliance'].includes(t.kind) && hostile(state, partnerOf(t, rid), against)) return 'ally';
  }
  return 'none';
}

function planWar(state, world, rng, rid, a) {
  const realm = state.realms[rid];
  const against = a.opportunity.against;
  const aim = a.opportunity.aim;
  if (!against || !aim || atWar(state, rid) || (state.musters ?? []).some((m) => m.realm === rid)) return;
  if ((world.war?.noWar ?? []).includes(rid) || (world.war?.noWar ?? []).includes(against)) return;
  if ((state.truces?.[[rid, against].sort().join('|')] ?? 0) > state.day) return;
  const allow = pactAllows(state, world, rid, against, rng);
  if (!allow.ok) return;
  const army = raiseRealmArmy(state, world, rid, [against], 'muster');
  if (!army) return;
  const reason = warReasonOf(state, world, rid, against, aim);
  state.musters.push({ realm: rid, against, army: army.id, day: state.day + ST(world).war.musterDays, aim, reason, pact: allow.pact?.id ?? null });
  realm.aim = { town: aim, against, since: state.day, reason };
  const at = world.byId[army.at];
  if (against === TEMERIA) {
    const nearBorder = Object.keys(state.settlements).some((id) => Math.hypot(world.byId[id].x - at.x, world.byId[id].y - at.y) < 160);
    addDispatch(state, informed(state, world, rid) || nearBorder
      ? `War drums in ${sideName(world, rid)}: ${Math.round(army.soldiers)} men gather at ${at.name}, and they are not gathering for a parade.`
      : `War drums in ${sideName(world, rid)}: travellers speak of soldiers on every road and talk of war with Temeria.`, 'military');
  } else if (informed(state, world, rid) || informed(state, world, against)) {
    abroad(state, `${sideName(world, rid)} gathers an army at ${at.name}. Word is it means to take ${world.byId[aim].name} from ${sideName(world, against)}.`);
  }
}

// ---- Probes: testing a neighbour too strong to attack ----

function probe(state, world, rng, rid, a) {
  const c = ST(world).probes;
  const realm = state.realms[rid];
  const against = a.opportunity.against;
  if (!against || hostile(state, rid, against)) return;
  if ((realm.lastProbe ?? -Infinity) + c.cooldown > state.day || !rng.chance(c.chance)) return;
  const options = [];
  if (against === TEMERIA) {
    options.push(['raiders', c.weights.raiders], ['demand', c.weights.demand], ['muster', c.weights.muster], ['denounce', c.weights.denounce]);
    if (!state.diplomacy.tolls[rid]) options.push(['tolls', c.weights.tolls * (hasTrait(world, rid, 'greedy') ? 2 : 1)]);
    if (treatyBetween(state, rid, TEMERIA, 'nonaggression')) options.push(['renegotiate', c.weights.renegotiate]);
  } else options.push(['denounce', 1]);
  let roll = rng.next() * options.reduce((x, o) => x + o[1], 0);
  const kind = (options.find((o) => (roll -= o[1]) < 0) ?? options[0])[0];
  realm.lastProbe = state.day;
  realm.probes = (realm.probes ?? 0) + (against === TEMERIA ? 1 : 0);
  (state.diplomacy.probes ??= []).push({ realm: rid, against, kind, day: state.day });
  if (state.diplomacy.probes.length > 60) state.diplomacy.probes.shift();
  const name = rulerShort(world, rid);
  if (kind === 'raiders') {
    state.diplomacy.sponsor = state.diplomacy.sponsor ?? {};
    state.diplomacy.sponsor[rid] = state.day + c.raiderDays;
    if (informed(state, world, rid)) addDispatch(state, `Word from ${sideName(world, rid)}: ${name} turns a blind eye to the raiders who cross into Temeria, and some say pays them.`, 'abroad');
  } else if (kind === 'tolls') {
    state.diplomacy.tolls[rid] = true;
    addDispatch(state, `${sideName(world, rid)} lays new tolls on Temerian caravans at its border.`, 'abroad');
  } else if (kind === 'demand') {
    const ag = agendaOf(world, rid);
    const items = ag?.kind === 'town' && ownerOf(state, world, ag.town) === TEMERIA ? [{ kind: 'town', from: 'us', town: ag.town }]
      : [{ kind: 'coin', from: 'us', amount: Math.round((200 + strengthOf(state, world, rid) * 0.15) / 50) * 50 }];
    if (!state.diplomacy.requests.some((q) => q.realm === rid)) state.diplomacy.requests.push({ id: state.diplomacy.nextId++, realm: rid, kind: 'demand', items, day: state.day });
  } else if (kind === 'muster') {
    // A show of force: men on the border, sent home again after a while.
    const army = raiseRealmArmy(state, world, rid, [TEMERIA], 'muster');
    if (army) {
      state.musters.push({ realm: rid, against: TEMERIA, army: army.id, day: state.day + c.showDays, show: true });
      addDispatch(state, `${sideName(world, rid)} masses ${Math.round(army.soldiers)} men at ${world.byId[army.at].name}, on our border.`, 'military');
    }
  } else if (kind === 'denounce') {
    for (const p of parties(world)) {
      if (p === rid) continue;
      if (against === TEMERIA) remember(state, world, p, `${sideName(world, rid)}'s slanders against us`, c.slander, { fade: 540 });
      else changeTrust(state, world, p, against, -3);
    }
    if (against === TEMERIA) addDispatch(state, `${name} denounces Temeria before the courts of the North.`, 'abroad');
  } else if (kind === 'renegotiate') {
    if (!state.diplomacy.requests.some((q) => q.realm === rid)) {
      state.diplomacy.requests.push({ id: state.diplomacy.nextId++, realm: rid, kind: 'renegotiate', items: [{ kind: 'monthly', from: 'us', amount: c.renegotiate, months: 24 }], day: state.day });
    }
  }
}

// ---- The month ----

export function monthlyStrategy(state, world, rng) {
  if (!ST(world)) return;
  for (const rid of Object.keys(state.realms)) {
    if (!D(world)?.rulers[rid]) continue;
    const realm = state.realms[rid];
    const a = assess(state, world, rid);
    realm.posture = choosePosture(state, world, rid, a);
    realm.assessment = { threat: a.threat.value, opportunity: a.opportunity.value, purse: a.purse.value, against: a.opportunity.against, aim: a.opportunity.aim };
    recruit(state, world, rid);
    // An aim lapses once taken, given up, or the war over.
    if (realm.aim && !atWar(state, rid) && !(state.musters ?? []).some((m) => m.realm === rid)) realm.aim = null;
    const kind = realm.posture.kind;
    if (kind === 'expand') planWar(state, world, rng, rid, a);
    else if (kind === 'scheme') probe(state, world, rng, rid, a);
    // Wherever a ruler sees an opening against the crown but is held back,
    // by its strength or by a pact, it probes instead of invading.
    const vt = a.vsTemeria;
    const heldBack = vt && (vt.ratio < 1.3 || bound(state, rid, TEMERIA));
    if (vt && heldBack && vt.value >= ST(world).probes.at && !hasTrait(world, rid, 'honourable') && !(kind === 'scheme' && a.opportunity.against === TEMERIA)) {
      probe(state, world, rng, rid, { opportunity: { against: TEMERIA } });
    }
  }
}

// What an embassy learns: posture and its main reason. What a spy learns:
// the war aim and any muster planned. Otherwise, vague talk.
export function intentions(state, world, rid) {
  const realm = state.realms?.[rid];
  if (!realm?.posture || !ST(world)) return null;
  const p = realm.posture;
  const def = ST(world).postures[p.kind];
  const embassy = !!state.embassies?.[rid] || !!treatyBetween(state, TEMERIA, rid, 'alliance');
  const spy = (state.spies?.[rid] ?? 0) > state.day;
  const realmName = sideName(world, rid);
  const out = { posture: null, aim: null, vague: ST(world).intel.vague[p.kind] };
  if (embassy || spy) {
    const why = p.reasons?.[0]?.text;
    out.posture = `${realmName} ${def.verb}${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ''}.`;
  }
  if (spy) {
    const aim = realm.aim ?? (p.kind === 'expand' && realm.assessment?.aim ? { town: realm.assessment.aim, against: realm.assessment.against } : null);
    const muster = (state.musters ?? []).find((m) => m.realm === rid && !m.show);
    if (aim) out.aim = `${rulerShort(world, rid)} means to take ${world.byId[aim.town].name}${aim.against !== TEMERIA ? ` from ${sideName(world, aim.against)}` : ' from us'}${muster ? `; an army gathers at ${world.byId[state.armies.find((x) => x.id === muster.army)?.at]?.name ?? 'the border'}` : ''}.`;
    else out.aim = `${rulerShort(world, rid)} has no war in mind for now.`;
  }
  return out;
}

// ---- Upgrading a version 14 save ----

export function upgradeStrategy(state, world) {
  const c = ST(world).army;
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    realm.army = 0;
    realm.aim = null;
    realm.debtMonths = realm.treasury < 0 ? 1 : 0;
    // A rough month's income until the first ledger of the new rules.
    const e = world.realms.economy;
    realm.income = Math.round(Object.values(realm.settlements).reduce((a, s) => a + s.population * e.taxPerPersonMonth * (0.6 + 0.008 * s.prosperity), 0));
    if (!D(world)?.rulers[rid]) continue;
    const a = assess(state, world, rid);
    realm.posture = choosePosture(state, world, rid, a);
    // Part of a hoard is spent on a standing army at once.
    const spend = Math.max(0, realm.treasury - realm.income * 12) * 0.5;
    const men = Math.min(armyTarget(state, world, rid) * 2, Math.floor(spend / c.recruitCost));
    realm.army = Math.max(0, men);
    realm.treasury -= realm.army * c.recruitCost;
  }
  for (const w of state.wars ?? []) {
    const att = w.sides[0][0];
    const taken = w.taken.filter((t) => t.to === att && ownerOf(state, world, t.id) === att).sort((x, y) => valueOf(state, world, y.id) - valueOf(state, world, x.id));
    if (taken.length) w.aims = { [att]: taken[0].id };
  }
}

export { endTreaty };
