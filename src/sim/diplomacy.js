// The rulers of the North as people the crown deals with: what each thinks
// of Temeria and why (mood, the relation number broken into its reasons),
// whether they believe our word (trust, a lasting memory per ruler), and the
// treaties that bind realms to one another. Deals and audiences build on
// this (deals.js, audiences.js).
import { addDispatch, clamp } from './realm.js';
import { mahakamGrudge } from './gold.js';
import { realmFaith } from './culture.js';
import { informed } from './realms.js';
import { foreignTrade } from './neighbours.js';
import { TEMERIA, hostile, placesHeldBy, originOf, ownerOf, truceUntil, sideName } from './conflict.js';
import { realmPotential, soldiersOf } from './war.js';

export const D = (world) => world.diplomacy;
const abroad = (state, text) => addDispatch(state, text, 'abroad');

// ---- Rulers ----

// Everyone the crown can hold an audience with: today the realms with a
// ruler in data/diplomacy.json, later lands beyond or powers without land.
// A realm that has lost every town (M19) has no court to visit: its ruler
// is a claimant in exile.
export function parties(world) {
  return Object.keys(D(world)?.rulers ?? {}).filter((p) => !world.realms?.realms[p] || (world.foreignByRealm[p] ?? []).length);
}

export function rulerOf(world, pid) {
  return D(world)?.rulers[pid] ?? null;
}

// "King Henselt", "Queen Calanthe", "The Sodden lords".
export function rulerName(world, pid) {
  const r = rulerOf(world, pid);
  if (!r) return sideName(world, pid);
  return r.title ? `${r.title} ${r.name}` : r.name;
}

// Plain name for lines like "Henselt refuses".
export function rulerShort(world, pid) {
  return rulerOf(world, pid)?.name ?? sideName(world, pid);
}

export function hasTrait(world, pid, trait) {
  return !!rulerOf(world, pid)?.traits.includes(trait);
}

// A trait's multiplier for some quantity, 1 when no trait touches it.
export function traitMult(world, pid, key) {
  let m = 1;
  for (const t of rulerOf(world, pid)?.traits ?? []) {
    const v = D(world).traits[t]?.[key];
    if (typeof v === 'number') m *= v;
  }
  return m;
}

export function traitSum(world, pid, key) {
  let n = 0;
  for (const t of rulerOf(world, pid)?.traits ?? []) n += D(world).traits[t]?.[key] ?? 0;
  return n;
}

export function agendaOf(world, pid) {
  return rulerOf(world, pid)?.agenda ?? null;
}

// The agenda in a few plain words, with its town or faith named.
export function agendaText(world, pid, key = 'name') {
  const a = agendaOf(world, pid);
  if (!a) return '';
  return D(world).agendas[a.kind][key]
    .replace('{town}', a.town ? world.byId[a.town]?.name ?? a.town : '')
    .replace('{faith}', a.faith ? D(world).faithNames[a.faith] ?? a.faith : '');
}

// ---- State ----

export function defaultDiplomacy() {
  return {
    trust: {}, memory: {}, treaties: [], deals: [], requests: [], cooldowns: {}, sight: {}, tolls: {}, restrain: {},
    broken: [], refused: {}, log: [], nextId: 1,
  };
}

const S = (state) => state.diplomacy;

// How far `a` believes `b`'s word, 0 to 100.
export function trustIn(state, world, a, b) {
  return S(state)?.trust[a]?.[b] ?? D(world).trust.start;
}

export function changeTrust(state, world, a, b, delta) {
  if (!S(state) || a === b) return;
  const t = (S(state).trust[a] ??= {});
  t[b] = clamp((t[b] ?? D(world).trust.start) + delta, 0, 100);
}

// Trust drifts very slowly back towards the middle: old wrongs are not
// forgotten in a season, but neither are they for ever.
export function monthlyTrust(state, world) {
  const c = D(world).trust;
  for (const row of Object.values(S(state).trust)) {
    for (const [b, v] of Object.entries(row)) row[b] = v + (c.start - v) * c.drift;
  }
}

// ---- Memories ----

// A ruler remembers what Temeria did: a gift, a deal honoured, a pact
// broken. Each memory moves their mood and fades over its time.
export function remember(state, world, pid, text, value, { fade = D(world).memory.fade, cause = null } = {}) {
  if (!S(state)) return;
  const list = (S(state).memory[pid] ??= []);
  list.push({ text, value, day: state.day, fade, cause });
  if (list.length > D(world).memory.max) list.splice(0, list.length - D(world).memory.max);
}

export function memoryValue(m, day) {
  return m.value * Math.max(0, 1 - (day - m.day) / m.fade);
}

function pruneMemories(state) {
  for (const [pid, list] of Object.entries(S(state).memory)) {
    S(state).memory[pid] = list.filter((m) => Math.abs(memoryValue(m, state.day)) >= 0.5);
  }
}

// The wrong a ruler names when refusing on trust: the latest one with a cause.
export function grievance(state, world, pid) {
  const list = S(state)?.memory[pid] ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].value < 0 && list[i].cause) return list[i].cause;
  const b = [...(S(state)?.broken ?? [])].reverse().find((x) => x.by === TEMERIA);
  return b ? `we broke our ${D(world).treaties[b.kind].name.toLowerCase()}` : null;
}

// ---- Power and danger ----

// Soldiers a side can bring to bear, on one scale for the crown and a realm.
export function powerOf(state, world, pid) {
  if (pid === TEMERIA) return Math.max(1, soldiersOf(state, world, TEMERIA) * 0.3);
  return Math.max(1, realmPotential(state, world, pid));
}

// How much a ruler fears the crown's strength: 0 (none) to 3.
export function fearOf(state, world, pid) {
  return clamp(powerOf(state, world, TEMERIA) / powerOf(state, world, pid), 0, 3);
}

function rivals(world, a, b) {
  return (world.war?.rivalries ?? []).some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

// The danger a party faces from others, against its own strength: wars it
// is fighting count in full, old rivals who could strike count half.
export function dangerTo(state, world, pid) {
  let threat = 0;
  for (const other of [TEMERIA, ...Object.keys(state.realms ?? {})]) {
    if (other === pid) continue;
    let h = 0;
    if (hostile(state, other, pid)) h = 1;
    else if (rivals(world, other, pid) && truceUntil(state, other, pid) <= state.day && !treatyBetween(state, other, pid, 'nonaggression')) h = 0.5;
    if (h) threat += powerOf(state, world, other) * h;
  }
  return clamp(threat / powerOf(state, world, pid), 0, 3);
}

// ---- Treaties ----

export function treatyDef(world, kind) {
  return D(world).treaties[kind];
}

export function treatiesOf(state, pid) {
  return (S(state)?.treaties ?? []).filter((t) => t.a === pid || t.b === pid);
}

export function treatyBetween(state, a, b, kind = null) {
  return (S(state)?.treaties ?? []).find((t) => ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && (!kind || t.kind === kind)) ?? null;
}

export function partnerOf(t, pid) {
  return t.a === pid ? t.b : t.a;
}

function informedOf(state, world, ...pids) {
  return pids.some((p) => p === TEMERIA || informed(state, world, p));
}

// A protectorate's protector is always `a`.
export function makeTreaty(state, world, kind, a, b, { years = null, terms = {} } = {}) {
  const def = treatyDef(world, kind);
  const existing = treatyBetween(state, a, b, kind);
  if (existing) S(state).treaties = S(state).treaties.filter((t) => t !== existing);
  const t = { id: S(state).nextId++, kind, a, b, since: state.day, until: state.day + Math.round((years ?? def.years) * 365), terms };
  S(state).treaties.push(t);
  if (kind === 'protectorate' && terms.monthly) {
    state.tributes.push({ from: b, to: a, monthly: terms.monthly, until: t.until, treaty: t.id });
  }
  logPact(state, 'made', t);
  const text = `${sideName(world, a)} and ${sideName(world, b)} sign a ${def.name.toLowerCase()}${kind === 'protectorate' ? `: ${sideName(world, b)} is under ${sideName(world, a)}'s protection` : ''}.`;
  if (a === TEMERIA || b === TEMERIA) {
    addDispatch(state, text, 'abroad');
    const other = a === TEMERIA ? b : a;
    remember(state, world, other, `Our ${def.name.toLowerCase()}`, 3);
  } else if (informedOf(state, world, a, b)) abroad(state, text);
  return t;
}

function logPact(state, what, t, by = null) {
  S(state).log.push({ what, kind: t.kind, a: t.a, b: t.b, by, day: state.day });
  if (S(state).log.length > 40) S(state).log.shift();
}

// A treaty ends: run its course (both sides trust each other more), or
// broken by one side (the other trusts the breaker much less, and every
// other ruler a little less, the honourable most).
export function endTreaty(state, world, t, { broken = false, by = null, why = '' } = {}) {
  const def = treatyDef(world, t.kind);
  S(state).treaties = S(state).treaties.filter((x) => x !== t);
  state.tributes = (state.tributes ?? []).filter((x) => x.treaty !== t.id);
  logPact(state, broken ? 'broken' : 'ended', t, by);
  const name = def.name.toLowerCase();
  if (!broken) {
    changeTrust(state, world, t.a, t.b, D(world).trust.treatyKept);
    changeTrust(state, world, t.b, t.a, D(world).trust.treatyKept);
    if (t.a === TEMERIA || t.b === TEMERIA) {
      const other = partnerOf(t, TEMERIA);
      remember(state, world, other, `We kept our ${name} to its end`, 6);
      addDispatch(state, `Our ${name} with ${sideName(world, other)} runs its course, kept by both.`, 'abroad');
    }
    return;
  }
  const victim = partnerOf(t, by);
  changeTrust(state, world, victim, by, -def.breakTrust);
  for (const p of [TEMERIA, ...parties(world)]) {
    if (p === by || p === victim) continue;
    changeTrust(state, world, p, by, -def.breakAll * traitMult(world, p, 'breakAll'));
  }
  S(state).broken.push({ by, with: victim, kind: t.kind, day: state.day });
  if (S(state).broken.length > 30) S(state).broken.shift();
  if (by === TEMERIA) {
    remember(state, world, victim, `We broke our ${name}`, -Math.round(def.breakTrust / 2), { fade: 1440, cause: `we broke our ${name}` });
    addDispatch(state, `Temeria breaks its ${name} with ${sideName(world, victim)}${why ? ` ${why}` : ''}. Every court in the North takes note.`, 'abroad');
  } else if (victim === TEMERIA) {
    addDispatch(state, `${sideName(world, by)} breaks its ${name} with us${why ? ` ${why}` : ''}.`, 'abroad');
  } else if (informedOf(state, world, by, victim)) {
    abroad(state, `${sideName(world, by)} breaks its ${name} with ${sideName(world, victim)}${why ? ` ${why}` : ''}.`);
  }
}

// Does `partner` owe `victim` its swords in this war? Defensive pacts and
// alliances bind when the victim is attacked; alliances also when it
// attacks; a protector must defend its protectorate.
export function bindingTreaty(state, partner, victim, attacking) {
  for (const t of treatiesOf(state, partner)) {
    if (partnerOf(t, partner) !== victim) continue;
    if (t.kind === 'alliance') return t;
    if (!attacking && t.kind === 'defensive') return t;
    if (!attacking && t.kind === 'protectorate' && t.a === partner) return t;
  }
  return null;
}

// Who can see whose land: an alliance shares everything, as does a promise
// to share intelligence.
export function sharesSight(state, pid) {
  const s = S(state);
  if (!s) return false;
  if ((s.sight[pid]?.theirs ?? 0) > state.day) return true;
  return !!treatyBetween(state, TEMERIA, pid, 'alliance');
}

export function tradeBonus(state, world, pid) {
  let m = 1;
  if (treatyBetween(state, TEMERIA, pid, 'trade')) m += D(world).treaties.trade.tradeBonus;
  if (S(state)?.tolls[pid]) m -= D(world).tolls.trade;
  return m;
}

// Set by audiences.js: whether two foreign realms would sign this pact
// again. Kept on the function itself, which is hoisted, so the import cycle
// between the two modules cannot catch it uninitialised.
export function setRenewable(fn) {
  setRenewable.fn = fn;
}

export function monthlyTreaties(state, world) {
  for (const t of [...S(state).treaties]) {
    if (t.until <= state.day) {
      // Between foreign realms a pact both still value simply runs on
      // (M18): renewal, not a new signing.
      if (world.strategy && t.a !== TEMERIA && t.b !== TEMERIA && setRenewable.fn?.(state, world, t)) {
        t.until += Math.round(treatyDef(world, t.kind).years * 365);
        continue;
      }
      endTreaty(state, world, t);
      continue;
    }
    // A year kept builds a little trust each way.
    if ((state.day - t.since) % 365 < 31 && state.day - t.since >= 365) {
      changeTrust(state, world, t.a, t.b, D(world).trust.treatyYear);
      changeTrust(state, world, t.b, t.a, D(world).trust.treatyYear);
    }
  }
}

// ---- Mood: the relation and its reasons ----

// Every reason a ruler has for feeling as it does about Temeria, with its
// weight. The relation drifts towards their sum.
export function moodReasons(state, world, rid) {
  const r = world.neighbours.realms[rid];
  const out = [];
  if (!r) return out;
  const add = (key, text, value) => { if (Math.round(value)) out.push({ key, text, value: Math.round(value) }); };
  if (world.war && hostile(state, TEMERIA, rid)) {
    add('war', 'At war with us', world.war.atWarRelation);
    return out;
  }
  add('base', 'Their old view of Temeria', r.relation);
  const st = world.neighbours.stances[state.neighbours[rid].stance];
  add('stance', `Our ${st.name.toLowerCase()} stance`, st.relation);
  const zeal = traitMult(world, rid, 'cares');
  for (const [key, v] of Object.entries(r.cares)) {
    const [law, option] = key.split(':');
    if (state.laws[law]?.option === option) add(`law:${law}`, `Our law: ${world.laws.laws[law].options[option].name.toLowerCase()}`, v * zeal);
  }
  if (rid === 'mahakam') add('gold', 'Our gold mines near their mountains', mahakamGrudge(state, world));
  if (world.war && state.wars) {
    const held = placesHeldBy(state, world, TEMERIA).filter((pid) => originOf(world, pid) === rid).length;
    add('claims', `Towns of theirs we hold (${held})`, world.war.claimRelation * held);
  }
  if (!S(state) || !D(world)) return out;
  const m = D(world).mood;
  // Their agenda.
  const ag = agendaOf(world, rid);
  if (ag?.kind === 'town' && ag.town && ownerOf(state, world, ag.town) === TEMERIA) add('agenda', `We hold ${world.byId[ag.town].name}, which they want`, m.agendaTownHeld);
  if (ag?.kind === 'faith') {
    const ours = state.laws.patronage?.option === ag.faith || (realmFaith(state)[ag.faith] ?? 0) > 0.45;
    if (ours) add('agenda', `We honour ${D(world).faithNames[ag.faith]}`, m.agendaFaith * zeal);
  }
  if (ag?.kind === 'scoiatael') {
    if (state.laws.nonhumans?.option === 'expulsion' || (state.sympathy ?? 0) < 15) add('agenda', "We are hard on the Scoia'tael", m.scoiataelLaw);
    else if ((state.sympathy ?? 0) > 50) add('agenda', "The Scoia'tael find friends in Temeria", m.scoiataelSympathy);
  }
  // What their posture makes of us (M18).
  const posture = state.realms?.[rid]?.posture;
  const ml = world.strategy?.moodLines;
  if (posture && ml) {
    const aim = state.realms[rid].aim;
    if (aim?.against === TEMERIA || (posture.kind === 'expand' && posture.against === TEMERIA)) {
      const town = aim?.town ?? state.realms[rid].assessment?.aim;
      add('posture', town ? `Their eyes are on ${world.byId[town].name}` : 'They look for a war with us', ml.aimOurs);
    } else if (posture.kind === 'scheme' && posture.against === TEMERIA) add('posture', 'They scheme against us', ml.schemeUs);
    else if (posture.kind === 'arm' && (posture.reasons ?? []).some((r) => r.text.startsWith('Temeria'))) add('posture', 'They fear our strength', ml.fearUs);
    else if (posture.kind === 'grow' && ag?.kind === 'trade') add('posture', 'Busy with trade, they welcome ours', ml.growTrade);
  }
  // Fear of our conquests (M19), apart from mood and trust: it sours them,
  // and binds the North against us.
  const dread = state.conquest?.fear?.[rid]?.temeria ?? 0;
  if (dread >= 1 && world.conquest) add('fear', dread >= 50 ? 'They dread our conquests' : 'They fear our conquests', -dread * world.conquest.fear.mood);
  if (state.conquest?.league?.members.includes(rid)) add('league', 'Sworn to the league against us', -10);
  // Treaties in force.
  for (const t of treatiesOf(state, rid)) {
    if (partnerOf(t, rid) === TEMERIA) add(`treaty:${t.kind}`, `Our ${treatyDef(world, t.kind).name.toLowerCase()}`, treatyDef(world, t.kind).mood);
  }
  // Trade between us.
  const by = foreignTrade(state, world).by[rid] ?? 0;
  if (by > 0) add('trade', 'Trade between us', Math.min(m.tradeMax, by * m.tradePer));
  if (S(state).tolls[rid]) add('tolls', 'Their tolls on our caravans sour things', m.tolls);
  // Our armies near their towns, unless they let us pass.
  if (!treatyBetween(state, TEMERIA, rid, 'access') && !treatyBetween(state, TEMERIA, rid, 'alliance')) {
    const near = (state.armies ?? []).some((a) => a.side === TEMERIA && (world.foreignByRealm[rid] ?? []).some((id) => {
      const p = world.byId[a.at];
      return Math.hypot(p.x - world.byId[id].x, p.y - world.byId[id].y) < m.armyRange;
    }));
    if (near) add('armies', 'Our armies near their border', ag?.kind === 'borders' ? m.armiesNearBorders : m.armiesNear);
  }
  // Wars fought between us within living memory.
  const wars = (state.warHistory ?? []).filter((w) => state.day - w.until < m.warYears * 365 && w.sides.flat().includes(rid) && w.sides.flat().includes(TEMERIA)).length;
  if (wars) add('wars', `Wars we fought (${wars})`, Math.max(m.warFoughtMax, wars * m.warFought));
  // What they remember of our dealings, newest last, with like memories together.
  const grouped = {};
  for (const mem of S(state).memory[rid] ?? []) {
    const v = memoryValue(mem, state.day);
    if (Math.abs(v) < 0.5) continue;
    grouped[mem.text] = (grouped[mem.text] ?? 0) + v;
  }
  for (const [text, v] of Object.entries(grouped)) add(`memory:${text}`, text, v);
  return out;
}

export function moodTarget(state, world, rid) {
  return clamp(moodReasons(state, world, rid).reduce((a, x) => a + x.value, 0), -100, 100);
}

const MOODS = [[-60, 'Hostile'], [-25, 'Cold'], [5, 'Wary'], [30, 'Cordial'], [60, 'Warm'], [101, 'Devoted']];
export function moodWord(relation) {
  return MOODS.find(([at]) => relation < at)[1];
}

export function monthlyMemories(state) {
  pruneMemories(state);
}
