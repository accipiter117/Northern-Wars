// Dilemmas and demands for change (M28). A dilemma follows from what the
// crown has done: the laws in its Book, the faiths it feeds, its lords, the
// season and the mood of the realm. A demand asks the crown to sign (or
// strike out) a law by a deadline; a promise kept is remembered kindly, a
// promise broken bitterly.
import { nudge } from './meters.js';
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';
import { nonhumanShare, shiftFaith } from './culture.js';
import { signed } from './book.js';
import { dateOf } from './calendar.js';
import { atWar, TEMERIA } from './conflict.js';
import { houseDef } from './lords.js';
import { changeTrust, rulerShort } from './diplomacy.js';
import { sideName } from './conflict.js';

const D = (world) => world.dilemmas;
const say = (state, text) => addDispatch(state, text, 'faith');

export function dilemmasOf(state) {
  state.dilemmas ??= { open: [], later: [], seen: {}, nextId: 1, last: -Infinity, lastDemand: -Infinity, promises: [], silenced: {} };
  return state.dilemmas;
}

// ---- Conditions ----

function pathOf(world, key) {
  const [ch, p] = key.split('.');
  return world.book?.chapters?.[ch]?.paths?.[p] ?? null;
}

function onPath(state, world, key) {
  const p = pathOf(world, key);
  return !!p && p.laws.some((l) => signed(state, l.id));
}

const inRange = (v, r) => !r || ((v ?? 0) >= r[0] && (v ?? 0) <= r[1]);

function holds(state, world, when = {}) {
  if (when.laws && !when.laws.every((id) => signed(state, id))) return false;
  if (when.notLaws && when.notLaws.some((id) => signed(state, id))) return false;
  if (when.path && !onPath(state, world, when.path)) return false;
  if (when.notPath && onPath(state, world, when.notPath)) return false;
  for (const [f, lvl] of Object.entries(when.faith ?? {})) if (faithLevelOf(state, world, f) < lvl) return false;
  if (!inRange(state.love, when.love) || !inRange(state.fear, when.fear) || !inRange(state.unrest, when.unrest)) return false;
  if (when.season && !when.season.includes(dateOf(state.day).season)) return false;
  if (when.war !== undefined && !!atWar(state, TEMERIA) !== when.war) return false;
  if (when.treasury !== undefined && state.treasury < when.treasury) return false;
  // The Nilfgaard clock's stage (M30 D).
  if (when.clock && !when.clock.includes(state.nilfgaard?.stage)) return false;
  if (when.anyOf && !when.anyOf.some((w) => holds(state, world, w))) return false;
  return true;
}

function faithLevelOf(state, world, f) {
  const d = state.faiths?.devotion?.[f] ?? 0;
  return (world.devotion?.levels ?? []).filter((at) => d >= at).length;
}

function placeFits(state, world, p, id) {
  const s = state.settlements[id];
  if (!s || s.occupier) return false;
  if (p.types && !p.types.includes(world.byId[id].type)) return false;
  for (const [f, v] of Object.entries(p.minFaith ?? {})) if ((s.faith?.[f] ?? 0) < v) return false;
  for (const [g, v] of Object.entries(p.minPeople ?? {})) if ((s.population?.[g] ?? 0) < v) return false;
  if (p.minNonhuman !== undefined && nonhumanShare(s) < p.minNonhuman) return false;
  return true;
}

function pickPlace(state, world, rng, p) {
  const list = world.geography.settlements.map((st) => st.id).filter((id) => placeFits(state, world, p, id));
  if (!list.length) return null;
  const w = list.map((id) => Math.sqrt(totalPopulation(state.settlements[id])) + 1);
  let roll = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) if ((roll -= w[i]) < 0) return list[i];
  return list[list.length - 1];
}

function pickLord(state, world, rng) {
  const list = Object.keys(state.houses ?? {}).filter((id) => !state.houses[id].rebel && houseDef(state, world, id));
  if (!list.length) return null;
  return list[Math.floor(rng.next() * list.length)];
}

// ---- The month's draw ----

export function monthlyDilemmas(state, world, rng) {
  const cfg = D(world);
  if (!cfg) return;
  const d = dilemmasOf(state);
  settlePromises(state, world);
  // Follow-ups whose time has come.
  for (const l of [...d.later]) {
    if (l.day > state.day) continue;
    d.later = d.later.filter((x) => x !== l);
    open(state, world, l.dilemma, l.place, l.house);
  }
  if (state.day - d.lastDemand >= cfg.demands.gapDays && !d.open.some((x) => x.demand) && !d.promises.length && rng.chance(cfg.demands.chance)) drawDemand(state, world, rng);
  if (state.day - d.last < cfg.gapDays || d.open.filter((x) => !x.demand).length >= 2 || !rng.chance(cfg.chance)) return;
  const options = [];
  for (const [id, x] of Object.entries(cfg.dilemmas)) {
    if (x.followup) continue;
    const seen = d.seen[id];
    if (seen !== undefined && (!x.repeatable || state.day - seen < cfg.repeatDays)) continue;
    if (d.open.some((o) => o.dilemma === id)) continue;
    if (!holds(state, world, x.when)) continue;
    let w = x.weight ?? 1;
    const recent = (x.when?.laws ?? []).some((lid) => state.day - (state.book?.signed?.[lid]?.day ?? -Infinity) <= cfg.recentLawDays);
    if (recent) w *= cfg.recentWeight;
    options.push({ id, w });
  }
  if (!options.length) return;
  let roll = rng.next() * options.reduce((a, o) => a + o.w, 0);
  for (const o of options) {
    if ((roll -= o.w) < 0 || o === options[options.length - 1]) {
      const def = cfg.dilemmas[o.id];
      const place = def.place ? pickPlace(state, world, rng, def.place) : null;
      if (def.place && !place) return;
      const house = def.lord ? pickLord(state, world, rng) : null;
      if (def.lord && !house) return;
      open(state, world, o.id, place, house);
      return;
    }
  }
}

function open(state, world, id, place, house) {
  const d = dilemmasOf(state);
  // A dilemma brought by a foreign court (an imperial envoy, M30 D) moves
  // the crown's standing with that court.
  const from = D(world).dilemmas[id]?.realm;
  const realm = from && state.realms?.[from] && !state.realms[from].fallen ? from : undefined;
  d.open.push({ id: d.nextId++, dilemma: id, place, house, day: state.day, ...(realm ? { realm } : {}) });
  d.seen[id] = state.day;
  d.last = state.day;
}

function drawDemand(state, world, rng) {
  const cfg = D(world).demands;
  const d = dilemmasOf(state);
  const options = Object.entries(cfg.list).filter(([id, x]) => {
    if ((d.silenced[x.group] ?? -Infinity) > state.day) return false;
    if (d.seen[`demand:${id}`] !== undefined && state.day - d.seen[`demand:${id}`] < D(world).repeatDays) return false;
    const act = x.act ?? 'sign';
    if (act === 'sign' ? signed(state, x.law) : !signed(state, x.law)) return false;
    return holds(state, world, x.when);
  });
  if (!options.length) return;
  const [id] = options[Math.floor(rng.next() * options.length)];
  d.open.push({ id: d.nextId++, demand: id, day: state.day });
  d.seen[`demand:${id}`] = state.day;
  d.lastDemand = state.day;
}

// ---- Words ----

const GROUP_NAMES = { nobles: 'the lords', burghers: 'the burghers', peasants: 'the peasants', eternal_fire: 'the Eternal Fire', melitele: "Melitele's faithful", old_ways: 'the Old Ways', dwarf: 'the dwarves', elf: 'the elves', halfling: 'the halflings' };
const FAITH_NAMES = { eternal_fire: 'the Fire', melitele: 'Melitele', old_ways: 'the Old Ways' };
const sign = (v) => (v > 0 ? `+${v}` : `${v}`);

// One short line of what a choice does, shown before the crown chooses.
export function effectLine(fx = {}, { lord = null, realm = null } = {}) {
  const out = [];
  if (fx.coin) out.push(fx.coin > 0 ? `+${fx.coin} crowns` : `${fx.coin} crowns`);
  if (fx.love) out.push(`Love ${sign(fx.love)}`);
  if (fx.fear) out.push(`Fear ${sign(fx.fear)}`);
  if (fx.unrest) out.push(`Unrest ${sign(fx.unrest)}`);
  if (fx.townUnrest) out.push(`unrest there ${sign(fx.townUnrest)}`);
  if (fx.prosperity) out.push(`prosperity there ${sign(fx.prosperity)}`);
  if (fx.loyalty) out.push(`${lord ?? 'the lord'}'s loyalty ${sign(fx.loyalty)}`);
  for (const [f, v] of Object.entries(fx.devotion ?? {})) if (v) out.push(`${FAITH_NAMES[f] ?? f} ${sign(v)}`);
  for (const [g, v] of Object.entries(fx.opinion ?? {})) if (v) out.push(`${GROUP_NAMES[g] ?? g} ${v > 0 ? 'pleased' : 'angered'}`);
  if (fx.sympathy) out.push(`Scoia'tael sympathy ${sign(fx.sympathy)}`);
  if (fx.relation) out.push(`${realm ?? 'their'} relations ${sign(fx.relation)}`);
  if (fx.trust) out.push(`${realm ?? 'their'} trust ${sign(fx.trust)}`);
  return out.join(', ') || 'Nothing more';
}

function fill(text, world, state, o) {
  const place = o.place ? world.byId[o.place]?.name ?? o.place : 'the realm';
  const lord = o.house ? houseDef(state, world, o.house)?.lord ?? 'the lord' : 'the lord';
  const realm = o.realm ? sideName(world, o.realm) : '';
  const ruler = o.realm ? rulerShort(world, o.realm) : '';
  return text.replaceAll('{place}', place).replaceAll('{lord}', lord).replaceAll('{realm}', realm).replaceAll('{ruler}', ruler);
}

export function dilemmaText(state, world, o) {
  const cfg = D(world);
  if (o.demand) {
    const x = cfg.demands.list[o.demand];
    const act = x.act ?? 'sign';
    const law = lawName(world, x.law);
    const days = cfg.demands.deadline;
    const k = cfg.demands;
    const choices = [
      { label: `Promise to ${act === 'sign' ? 'sign' : 'strike out'} ${law} within ${days} days`, hint: `Kept: Love +${k.keep.love}, Unrest ${k.keep.unrest}, ${GROUP_NAMES[x.group]} pleased. Broken: Love ${k.broken.love}, Unrest +${k.broken.unrest}` },
      { label: 'Refuse', hint: `Unrest +${k.refuse.unrest}, ${GROUP_NAMES[x.group]} angered` },
      { label: 'Crush the agitators', hint: `Fear +${k.crush.fear}, Love ${k.crush.love}, ${GROUP_NAMES[x.group]} silenced for a year` },
    ];
    return { kicker: `A demand from ${GROUP_NAMES[x.group] ?? x.group}`, title: x.title, text: x.text, choices, place: null, fallback: 1 };
  }
  if (o.realmRequest) {
    // A petty king's short request (M29 A), not worth an audience.
    const r = cfg.realmRequests[o.realmRequest];
    return {
      kicker: `A request from ${sideName(world, o.realm)}`,
      title: fill(r.title, world, state, o),
      text: fill(r.text, world, state, o),
      choices: r.choices.map((c) => ({ label: fill(c.label, world, state, o), hint: effectLine(c.fx, { realm: sideName(world, o.realm) }) })),
      place: null,
      fallback: r.default ?? 0,
      realm: o.realm,
    };
  }
  const x = cfg.dilemmas[o.dilemma];
  const lord = o.house ? houseDef(state, world, o.house)?.lord : null;
  return {
    kicker: o.place ? `A matter at ${world.byId[o.place]?.name ?? o.place}` : 'A matter for the crown',
    title: fill(x.title, world, state, o),
    text: fill(x.text, world, state, o),
    choices: x.choices.map((c) => ({ label: fill(c.label, world, state, o), hint: effectLine(c.fx, { lord }) })),
    place: o.place,
    fallback: x.default ?? 0,
  };
}

function lawName(world, id) {
  for (const ch of Object.values(world.book?.chapters ?? {})) for (const p of Object.values(ch.paths)) for (const l of p.laws) if (l.id === id) return l.name;
  return id;
}

// ---- Answers ----

function apply(state, world, fx, o, why) {
  if (fx.coin) {
    state.treasury += fx.coin;
    if (fx.coin < 0) state.ledger.decrees = (state.ledger.decrees ?? 0) - fx.coin;
  }
  if (fx.love) nudge(state, world, 'love', fx.love, why);
  if (fx.fear) nudge(state, world, 'fear', fx.fear, why);
  if (fx.unrest) nudge(state, world, 'unrest', fx.unrest, why);
  const s = o.place ? state.settlements[o.place] : null;
  if (s) {
    if (fx.townUnrest) s.unrest = clamp(s.unrest + fx.townUnrest, 0, 100);
    if (fx.prosperity) s.prosperity = clamp(s.prosperity + fx.prosperity, 0, 100);
    if (fx.faith) shiftFaith(s, fx.faith);
  }
  if (state.opinion) for (const [g, v] of Object.entries(fx.opinion ?? {})) if (state.opinion[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
  if (state.faiths?.devotion) for (const [f, v] of Object.entries(fx.devotion ?? {})) if (state.faiths.devotion[f] !== undefined) state.faiths.devotion[f] = clamp(state.faiths.devotion[f] + v, 0, 100);
  if (fx.sympathy && state.sympathy !== undefined) state.sympathy = clamp(state.sympathy + fx.sympathy, 0, 100);
  if (fx.loyalty && o.house && state.houses?.[o.house]) state.houses[o.house].loyalty = clamp(state.houses[o.house].loyalty + fx.loyalty, 0, 100);
  if (o.realm && state.neighbours?.[o.realm]) {
    if (fx.relation) state.neighbours[o.realm].relation = clamp(state.neighbours[o.realm].relation + fx.relation, -100, 100);
    if (fx.trust) changeTrust(state, world, o.realm, TEMERIA, fx.trust);
  }
}

export function resolveDilemma(state, world, id, choice, ignored = false) {
  const d = dilemmasOf(state);
  const o = d.open.find((x) => x.id === id);
  if (!o) return false;
  const cfg = D(world);
  if (o.demand) return resolveDemandForChange(state, world, o, choice, ignored);
  const x = o.realmRequest ? cfg.realmRequests[o.realmRequest] : cfg.dilemmas[o.dilemma];
  const c = x.choices[choice];
  if (!c) return false;
  if (!ignored && (c.fx?.coin ?? 0) < 0 && state.treasury + c.fx.coin < -(world.economy.debt?.creditLimit ?? 0)) return false;
  d.open = d.open.filter((q) => q !== o);
  apply(state, world, c.fx ?? {}, o, x.title.replace(/\{[a-z]+\}/g, '').trim());
  if (o.realmRequest) {
    const t = dilemmaText(state, world, o);
    say(state, ignored ? `${t.title}: Vizima sent no answer, so it was taken as "${t.choices[choice].label.toLowerCase()}".` : `${t.title}: the crown chose to ${fill(c.label, world, state, o).replace(/\.$/, '').toLowerCase()}.`);
    return true;
  }
  if (c.next && cfg.dilemmas[c.next.id]) d.later.push({ dilemma: c.next.id, day: state.day + c.next.days, place: o.place, house: o.house });
  const t = dilemmaText(state, world, o);
  say(state, ignored ? `${t.title}: Vizima sent no answer, so it was taken as "${c.label.toLowerCase()}".` : `${t.title}: the crown chose to ${fill(c.label, world, state, o).replace(/\.$/, '').toLowerCase()}.`);
  return true;
}

function groupOpinion(state, group, v) {
  if (state.opinion?.[group] !== undefined) state.opinion[group] = clamp(state.opinion[group] + v, 0, 100);
}

function resolveDemandForChange(state, world, o, choice, ignored) {
  const d = dilemmasOf(state);
  const cfg = D(world).demands;
  const x = cfg.list[o.demand];
  if (![0, 1, 2].includes(choice)) return false;
  d.open = d.open.filter((q) => q !== o);
  const who = GROUP_NAMES[x.group] ?? x.group;
  if (choice === 0) {
    d.promises.push({ demand: o.demand, law: x.law, act: x.act ?? 'sign', group: x.group, until: state.day + cfg.deadline, day: state.day });
    say(state, `${x.title}: the crown promised. ${who[0].toUpperCase()}${who.slice(1)} will wait ${cfg.deadline} days and no more.`);
  } else if (choice === 1) {
    nudge(state, world, 'unrest', cfg.refuse.unrest, 'Demands refused');
    groupOpinion(state, x.group, cfg.refuse.opinion);
    say(state, ignored ? `${x.title}: Vizima sent no answer, and ${who} take it as a refusal.` : `${x.title}: the crown refused.`);
  } else {
    nudge(state, world, 'fear', cfg.crush.fear, 'Agitators crushed');
    nudge(state, world, 'love', cfg.crush.love, 'Agitators crushed');
    groupOpinion(state, x.group, cfg.crush.opinion);
    d.silenced[x.group] = state.day + cfg.silenceDays;
    say(state, `${x.title}: the crown's men broke up the meetings and took the ringleaders. ${who[0].toUpperCase()}${who.slice(1)} are quiet, for now.`);
  }
  return true;
}

// Promises kept or broken, checked as the month turns and whenever a law is
// signed or struck out.
export function settlePromises(state, world) {
  const cfg = D(world)?.demands;
  if (!cfg) return;
  const d = dilemmasOf(state);
  for (const p of [...d.promises]) {
    const done = p.act === 'sign' ? signed(state, p.law) : !signed(state, p.law);
    const who = GROUP_NAMES[p.group] ?? p.group;
    if (done) {
      nudge(state, world, 'love', cfg.keep.love, 'Promises kept');
      nudge(state, world, 'unrest', cfg.keep.unrest, 'Promises kept');
      groupOpinion(state, p.group, cfg.keep.opinion);
      d.promises = d.promises.filter((q) => q !== p);
      say(state, `The crown kept its word to ${who}: ${lawName(world, p.law)} is ${p.act === 'sign' ? 'signed' : 'struck out'}.`);
    } else if (state.day > p.until) {
      nudge(state, world, 'love', cfg.broken.love, 'Promises broken');
      nudge(state, world, 'unrest', cfg.broken.unrest, 'Promises broken');
      groupOpinion(state, p.group, cfg.broken.opinion);
      d.promises = d.promises.filter((q) => q !== p);
      say(state, `The crown broke its word to ${who}. ${lawName(world, p.law)} was promised and never ${p.act === 'sign' ? 'signed' : 'struck out'}. They will not forget it.`);
    }
  }
}

// The promise a law carries, for the Book's ribbon.
export function promiseOn(state, lawId) {
  return state.dilemmas?.promises?.find((p) => p.law === lawId) ?? null;
}

// Unanswered, a dilemma takes its default.
export function stepDilemmasDay(state, world) {
  const cfg = D(world);
  if (!cfg || !state.dilemmas) return;
  for (const o of [...state.dilemmas.open]) {
    if (state.day - o.day < cfg.defaultDays) continue;
    const fb = o.demand ? 1 : o.realmRequest ? (cfg.realmRequests?.[o.realmRequest]?.default ?? 0) : (cfg.dilemmas[o.dilemma]?.default ?? 0);
    if (!resolveDilemma(state, world, o.id, fb, true)) state.dilemmas.open = state.dilemmas.open.filter((x) => x !== o);
  }
  if (state.dilemmas.promises.length) settlePromises(state, world);
}

// A petty king's request reaches the crown as a short dilemma (M29 A): one
// fitting his realm, not asked of us in the last two years.
export function openRealmRequest(state, world, rng, pid) {
  const cfg = D(world);
  if (!cfg?.realmRequests) return null;
  const d = dilemmasOf(state);
  if (d.open.some((o) => o.realm === pid)) return null;
  const fits = Object.entries(cfg.realmRequests).filter(([id, r]) => (!r.realms || r.realms.includes(pid))
    && (d.seen[`realm:${pid}:${id}`] === undefined || state.day - d.seen[`realm:${pid}:${id}`] >= cfg.repeatDays));
  if (!fits.length) return null;
  const [id] = fits[Math.floor(rng.next() * fits.length)];
  const o = { id: d.nextId++, realmRequest: id, realm: pid, day: state.day };
  d.open.push(o);
  d.seen[`realm:${pid}:${id}`] = state.day;
  return o;
}
