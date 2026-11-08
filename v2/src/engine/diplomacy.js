// Diplomacy between the great powers (v2 step 7): each ruler's opinion of
// the others, moved by its lore agenda, treaties and grievances; treaties
// (alliance, open borders, trade); war scores and peace; and the AI's own
// diplomacy, including offers to the player.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, pair, atWar, makeWar, makePeace, clamp, isPower } from './core.js';
import { vassalsOf, envoysPlaced } from './minors.js';

const D = (table) => table.data.diplomacy;
const powersOf = (state, table) => table.data.game.powers.filter((p) => state.realms[p]);

export function newDiplomacy(state, table) {
  const opinion = {};
  for (const a of table.data.game.powers) {
    opinion[a] = {};
    for (const b of table.data.game.powers) if (a !== b) opinion[a][b] = D(table).start[a]?.[b] ?? 0;
  }
  return { opinion, grievances: {}, treaties: [], score: {}, warSince: {}, offers: [] };
}

export const opinionOf = (state, a, b) => Math.round(state.diplomacy?.opinion[a]?.[b] ?? 0);

export const hasTreaty = (state, kind, a, b) => state.diplomacy.treaties.some((t) => t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
export const treatiesOf = (state, a) => state.diplomacy.treaties.filter((t) => t.a === a || t.b === a);

// Armies of `a` may cross `b`'s land in peace.
export const mayCross = (state, a, b) => !!state.diplomacy && (hasTreaty(state, 'alliance', a, b) || hasTreaty(state, 'openBorders', a, b));
export const allied = (state, a, b) => !!state.diplomacy && hasTreaty(state, 'alliance', a, b);

const companies = (state, rid) => state.armies.filter((a) => a.owner === rid).reduce((n, a) => n + a.companies.length, 0);

// What a ruler's agenda makes of another power, with the reason.
export function agendaView(state, table, v, t) {
  const ag = D(table).agendas[v];
  if (!ag) return { n: 0, why: '' };
  switch (ag.kind) {
    case 'southCrowns': {
      const held = vassalsOf(state, t).filter((m) => ag.minors.includes(m)).length;
      return held ? { n: -15 * held, why: 'holds southern crowns we would protect' } : { n: 5, why: 'leaves the southern crowns to us' };
    }
    case 'envoys':
      return envoysPlaced(state, t) > envoysPlaced(state, v) ? { n: -10, why: 'has more envoys abroad than we do' } : { n: 5, why: 'knows less than we do' };
    case 'strength':
      return companies(state, t) >= companies(state, v) * 0.8 ? { n: 10, why: 'keeps a strong army' } : { n: -10, why: 'keeps a weak army' };
    case 'valley': {
      const near = state.armies.some((a) => a.owner === t && state.cities[a.region].owner !== t
        && table.board.adj[a.region].some((l) => state.cities[l.a === a.region ? l.b : l.a].owner === v));
      return near ? { n: -15, why: 'has armies on our borders' } : { n: 5, why: 'keeps its armies away from us' };
    }
    case 'disunity': {
      const n = state.diplomacy.treaties.filter((x) => x.kind === 'alliance' && (x.a === t || x.b === t)).length;
      return n ? { n: -10 * n, why: 'stands allied with other northern crowns' } : { n: 0, why: '' };
    }
    default: return { n: 0, why: '' };
  }
}

// Where an opinion is heading, and why: for the card.
export function opinionParts(state, table, v, t) {
  const d = D(table);
  const parts = [{ n: d.start[v]?.[t] ?? 0, why: 'old feeling' }];
  const ag = agendaView(state, table, v, t);
  if (ag.n) parts.push(ag);
  for (const tr of treatiesOf(state, v).filter((x) => x.a === t || x.b === t)) parts.push({ n: d.treaties[tr.kind].opinion, why: d.treaties[tr.kind].name.toLowerCase() });
  const g = state.diplomacy.grievances[v]?.[t] ?? 0;
  if (g) parts.push({ n: -Math.round(g), why: 'grievances' });
  if (atWar(state, v, t)) parts.push({ n: -d.atWar, why: 'at war' });
  return parts;
}

function grieve(state, v, t, n) {
  const g = (state.diplomacy.grievances[v] ??= {});
  g[t] = (g[t] ?? 0) + n;
}

// ---- War, its score, and peace ----

export function onWar(state, table, a, b) {
  if (!state.diplomacy) return;
  const d = D(table).grievance;
  if (isPower(table, b)) grieve(state, b, a, d.war);
  for (const p of powersOf(state, table)) if (p !== a && p !== b) grieve(state, p, a, d.warmonger);
  // Treaties between them are torn up.
  state.diplomacy.treaties = state.diplomacy.treaties.filter((t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)));
  state.diplomacy.warSince[pair(a, b)] = state.turn;
  // The victim's allies come to its aid.
  for (const t of treatiesOf(state, b).filter((x) => x.kind === 'alliance')) {
    const ally = t.a === b ? t.b : t.a;
    if (ally !== a && makeWar(state, ally, a)) say(state, `${nameOf(table, ally)} honours its alliance with ${nameOf(table, b)} and declares war on ${nameOf(table, a)}.`);
  }
}

const scoreOf = (state, a, b) => state.diplomacy?.score[pair(a, b)] ?? {};
export function addScore(state, table, winner, loser, kind) {
  if (!state.diplomacy || !atWar(state, winner, loser)) return;
  const s = (state.diplomacy.score[pair(winner, loser)] ??= {});
  s[winner] = (s[winner] ?? 0) + D(table).score[kind];
  if (kind === 'city' && isPower(table, loser)) grieve(state, loser, winner, D(table).grievance.city);
}

export function warScore(state, a, b) {
  const s = scoreOf(state, a, b);
  return { mine: s[a] ?? 0, theirs: s[b] ?? 0 };
}

// Would `to` take peace with `from`? Yes when its war goes badly, or it has
// dragged on and the hatred is not too deep.
export function peaceAnswer(state, table, from, to) {
  const p = D(table).peace;
  const { mine, theirs } = warScore(state, to, from);
  if (theirs - mine >= p.behind) return { yes: true, why: 'the war goes badly for them' };
  const months = state.turn - (state.diplomacy.warSince[pair(from, to)] ?? state.turn);
  if (months >= p.weary && opinionOf(state, to, from) > p.hate) return { yes: true, why: 'they are weary of the war' };
  if (!isPower(table, to) && months >= 6) return { yes: true, why: 'a small crown cannot fight for ever' };
  return { yes: false, why: theirs - mine > 0 ? 'they think they can still win' : 'the war goes well for them' };
}

export function makePeaceTreaty(state, table, a, b) {
  makePeace(state, a, b);
  // Each side hands back what it holds of the other's; kept cities stay kept.
  for (const c of Object.values(state.cities)) {
    if ((c.owner === a && c.holder === b) || (c.owner === b && c.holder === a)) { c.holder = null; c.siege = null; }
    if (c.siege && (c.siege.by === a || c.siege.by === b) && (c.owner === a || c.owner === b)) c.siege = null;
  }
  if (state.diplomacy) {
    delete state.diplomacy.score[pair(a, b)];
    delete state.diplomacy.warSince[pair(a, b)];
  }
  say(state, `${nameOf(table, a)} and ${nameOf(table, b)} make peace.`);
}

// ---- Treaties ----

export function treatyAnswer(state, table, from, to, kind) {
  if (kind === 'peace') return atWar(state, from, to) ? peaceAnswer(state, table, from, to) : { yes: false, why: 'we are not at war' };
  const t = D(table).treaties[kind];
  if (!t) return { yes: false, why: 'no such treaty' };
  if (atWar(state, from, to)) return { yes: false, why: 'we are at war' };
  if (hasTreaty(state, kind, from, to)) return { yes: false, why: 'it is already signed' };
  const op = opinionOf(state, to, from);
  return op >= t.min ? { yes: true, why: `their opinion of us is ${op}` } : { yes: false, why: `their opinion of us is ${op}; they want ${t.min}` };
}

export function propose(state, table, from, to, kind) {
  const ans = treatyAnswer(state, table, from, to, kind);
  if (!ans.yes) return { error: `${nameOf(table, to)} refuses: ${ans.why}.` };
  sign(state, table, from, to, kind);
  return { ok: true };
}

function sign(state, table, a, b, kind) {
  if (kind === 'peace') return makePeaceTreaty(state, table, a, b);
  state.diplomacy.treaties.push({ kind, a, b, since: state.turn });
  say(state, `${nameOf(table, a)} and ${nameOf(table, b)} sign: ${D(table).treaties[kind].name.toLowerCase()}.`);
}

export function cancelTreaty(state, table, a, b, kind) {
  const before = state.diplomacy.treaties.length;
  state.diplomacy.treaties = state.diplomacy.treaties.filter((t) => !(t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
  if (state.diplomacy.treaties.length === before) return { error: 'No such treaty.' };
  grieve(state, b, a, 10);
  say(state, `${nameOf(table, a)} ends its ${D(table).treaties[kind].name.toLowerCase()} with ${nameOf(table, b)}.`);
  return { ok: true };
}

// An offer to the player, answered on the Diplomacy sheet.
export function answerOffer(state, table, i, yes) {
  const o = state.diplomacy.offers[i];
  if (!o) return { error: 'No such offer.' };
  state.diplomacy.offers.splice(i, 1);
  if (yes) sign(state, table, o.from, state.player, o.kind);
  else grieve(state, o.from, state.player, 3);
  return { ok: true };
}

// A realm's crowns a month from its trade deals.
export function tradeCrowns(state, table, rid) {
  if (!state.diplomacy) return 0;
  return treatiesOf(state, rid).filter((t) => t.kind === 'trade').length * D(table).treaties.trade.crowns;
}

// ---- The month ----

export function monthlyDiplomacy(state, table) {
  const d = D(table);
  const dip = state.diplomacy;
  for (const [v, row] of Object.entries(dip.grievances)) for (const t of Object.keys(row)) row[t] = Math.max(0, row[t] - d.grievance.fade);
  for (const v of powersOf(state, table)) {
    for (const t of powersOf(state, table)) {
      if (v === t) continue;
      const target = opinionParts(state, table, v, t).reduce((n, p) => n + p.n, 0);
      dip.opinion[v][t] = clamp(dip.opinion[v][t] + (target - dip.opinion[v][t]) * d.pull, -100, 100);
    }
  }
  // Offers not taken up within three months lapse.
  dip.offers = dip.offers.filter((o) => state.turn - o.turn < 3);
}

// The AI's diplomacy: treaties with friends, peace when it suits, war on a
// hated and weaker power, offers to the player.
export function aiDiplomacy(state, table, rid) {
  const d = D(table);
  const rng = makeRng(state.rng);
  for (const other of powersOf(state, table)) {
    if (other === rid) continue;
    if (atWar(state, rid, other)) {
      // Peace, if both would have it.
      if (peaceAnswer(state, table, other, rid).yes) {
        if (other === state.player) offer(state, table, rid, 'peace');
        else if (peaceAnswer(state, table, rid, other).yes) makePeaceTreaty(state, table, rid, other);
      }
      continue;
    }
    for (const kind of ['trade', 'openBorders', 'alliance']) {
      if (hasTreaty(state, kind, rid, other) || opinionOf(state, rid, other) < d.treaties[kind].min || !rng.chance(0.15)) continue;
      if (other === state.player) offer(state, table, rid, kind);
      else if (treatyAnswer(state, table, rid, other, kind).yes) sign(state, table, rid, other, kind);
    }
    // War on a hated and weaker neighbour.
    const w = d.aiWar;
    if (state.turn >= w.after && opinionOf(state, rid, other) < w.hate && companies(state, rid) >= companies(state, other) * w.ratio
      && !allied(state, rid, other) && rng.chance(w.chance)) {
      state.rng = rng.seed;
      return { war: other };
    }
  }
  // Peace with smaller crowns it has fought long enough.
  for (const m of Object.keys(state.realms)) {
    if (isPower(table, m) || !atWar(state, rid, m) || state.minors[m]?.rebel) continue;
    // Both must want it: the small crown, and the power itself (weary, or losing).
    if (peaceAnswer(state, table, rid, m).yes && peaceAnswer(state, table, m, rid).yes && rng.chance(0.2)) makePeaceTreaty(state, table, rid, m);
  }
  state.rng = rng.seed;
  return {};
}

function offer(state, table, from, kind) {
  const dip = state.diplomacy;
  if (dip.offers.some((o) => o.from === from && o.kind === kind)) return;
  dip.offers.push({ from, kind, turn: state.turn });
  say(state, `${nameOf(table, from)} offers us ${{ peace: 'peace', alliance: 'an alliance', openBorders: 'open borders', trade: 'a trade deal' }[kind]}.`);
}
