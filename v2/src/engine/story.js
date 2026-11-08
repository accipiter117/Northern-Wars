// The story (v2 step 8): the Dawn, the three Northern Wars and their lore
// events, each fired only when the power driving it has earned it, and
// some foiled when the player sees them coming. Pure: effects go through
// small hooks the game passes in, so this module needs nothing of game.js.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, atWar, makeWar, controller, clamp, authority, isPower } from './core.js';
import { warScore, opinionOf } from './diplomacy.js';

const S = (table) => table.data.story;
const chapters = (table) => table.data.goals.chapters;

export function newStory() {
  // fired: every event settled (happened or made moot); happened: those that took place, with their month.
  return { chapter: 'dawn', fired: [], happened: [], flags: [], choice: null, rulers: {}, aggressive: [] };
}

export const chapterIndex = (table, id) => chapters(table).findIndex((c) => c.id === id);
export const storyChapter = (state, table) => {
  const i = Math.max(0, chapterIndex(table, state.story?.chapter ?? 'dawn'));
  return { ...chapters(table)[i], index: i };
};

export const hasFlag = (state, f) => state.story.flags.includes(f);
const later = (d, [y, m]) => d.year > y || (d.year === y && d.month >= m);

// Does one requirement hold?
function holds(state, table, key, v, date, rng) {
  switch (key.replace(/\d+$/, '')) {
    case 'date': return later(date, v);
    case 'before': return !later(date, v);
    case 'chapter': return state.story.chapter === v;
    case 'flag': return hasFlag(state, v);
    case 'noFlag': return !hasFlag(state, v);
    case 'goal': return state.realms[v[0]]?.goals?.includes(v[1]) ?? false;
    case 'controls': return controller(state, v[1]) === v[0];
    case 'net': return (state.spies?.[v[0]]?.nets[v[1]] ?? 0) >= v[2];
    case 'netBelow': return (state.spies?.[v[0]]?.nets[v[1]] ?? 0) < v[2];
    case 'authorityBelow': return !!state.realms[v[0]] && authority(state.realms[v[0]]) < v[1];
    case 'companies': return state.armies.filter((a) => a.owner === v[0]).reduce((n, a) => n + a.companies.length, 0) >= v[1];
    case 'atWar': return atWar(state, v[0], v[1]);
    case 'scoreAgainst': {
      let net = 0;
      for (const p of Object.keys(state.realms)) {
        if (p === v[0]) continue;
        const s = warScore(state, p, v[0]);
        net += s.mine - s.theirs;
      }
      return net >= v[1];
    }
    case 'chance': return rng.chance(v);
    default: return false;
  }
}

export function requirementsMet(state, table, ev, date, rng) {
  // Cheap, certain things first; the dice last.
  const entries = Object.entries(ev.requires ?? {}).sort(([a], [b]) => (a === 'chance') - (b === 'chance'));
  return entries.every(([k, v]) => holds(state, table, k, v, date, rng));
}

const setsFlags = (ev) => [ev.id, ...(ev.effects ?? []).filter((e) => e.flag).map((e) => e.flag)];

// Apply effects. `hooks` comes from game.js: declareWar, peace, annexRealm.
export function applyEffects(state, table, effects, hooks) {
  for (const e of effects ?? []) {
    const [k] = Object.keys(e);
    const v = e[k];
    if (k === 'chapter') setChapter(state, table, v);
    else if (k === 'flag') { if (!hasFlag(state, v)) state.story.flags.push(v); }
    else if (k === 'war') {
      const [a, b] = v;
      if (!state.realms[a] || !state.realms[b] || state.minors[b]?.suzerain === a) continue;
      hooks.declareWar(a, b);
    } else if (k === 'peace') {
      const [a, b] = v;
      const foes = b === 'all' ? Object.keys(state.realms).filter((r) => atWar(state, a, r)) : [b];
      for (const f of foes) if (atWar(state, a, f)) hooks.peace(a, f);
    } else if (k === 'join') {
      const [list, foe, below] = v;
      for (const r of list) {
        if (r === state.player || !state.realms[r] || atWar(state, r, foe)) continue;
        if (opinionOf(state, r, foe) < below) hooks.declareWar(r, foe);
      }
    } else if (k === 'annex') hooks.annexRealm(v[0], v[1]);
    else if (k === 'mood') {
      const r = state.realms[v[0]];
      if (r) for (const [m, n] of Object.entries(v[1])) r[m] = clamp(r[m] + n, 0, 100);
    } else if (k === 'ruler') state.story.rulers[v[0]] = v[1];
    else if (k === 'net') {
      const sp = state.spies?.[v[0]];
      if (sp) sp.nets[v[1]] = clamp((sp.nets[v[1]] ?? 0) + v[2], 0, 100);
    } else if (k === 'spyTarget') { if (state.spies?.[v[0]] && v[0] !== state.player) state.spies[v[0]].target = v[1]; }
    else if (k === 'damage') hooks.damage(v[0], v[1]);
    else if (k === 'treasury') { if (state.realms[v[0]]) state.realms[v[0]].treasury += v[1]; }
    else if (k === 'aggressive') { if (!state.story.aggressive.includes(v)) state.story.aggressive.push(v); }
    else if (k === 'grievance') {
      const [victims, target, n] = v;
      for (const r of victims) {
        const g = (state.diplomacy.grievances[r] ??= {});
        g[target] = (g[target] ?? 0) + n;
      }
    }
  }
}

function setChapter(state, table, id) {
  if (chapterIndex(table, id) <= chapterIndex(table, state.story.chapter)) return;
  state.story.chapter = id;
  say(state, `A new chapter: ${chapters(table)[chapterIndex(table, id)].name}.`);
}

// The month's story: events in order, then the chapter moves on by date if
// the story has lagged.
export function monthlyStory(state, table, date, hooks) {
  const rng = makeRng(state.rng);
  for (const ev of S(table).events) {
    if (state.story.fired.includes(ev.id)) continue;
    if (chapterIndex(table, ev.chapter) > chapterIndex(table, state.story.chapter)) continue;
    if (setsFlags(ev).some((f) => hasFlag(state, f) && f !== ev.id)) { state.story.fired.push(ev.id); continue; }
    if (!requirementsMet(state, table, ev, date, rng)) continue;
    state.story.fired.push(ev.id);
    (state.story.happened ??= []).push({ id: ev.id, turn: state.turn });
    say(state, `${ev.title}. ${ev.text}`);
    applyEffects(state, table, ev.effects, hooks);
    // The player's answer, if the event asks one; or the card, if it is told.
    if (ev.choice && state.realms[state.player]) state.story.choice = { id: ev.id };
    else if (ev.tell) state.story.told = { id: ev.id, turn: state.turn };
  }
  state.rng = rng.seed;
  const now = chapterIndex(table, state.story.chapter);
  const list = chapters(table);
  const [y, m] = list[now].until;
  if (now < list.length - 1 && (date.year > y || (date.year === y && date.month > m))) setChapter(state, table, list[now + 1].id);
}

export function storyCard(state, table) {
  const id = state.story?.choice?.id ?? state.story?.told?.id;
  const ev = id && S(table).events.find((e) => e.id === id);
  if (!ev) return null;
  if (state.story.choice) return { title: ev.choice.title, text: `${ev.text} ${ev.choice.text}`, options: ev.choice.options.map((o) => o.label), choice: true };
  return { title: ev.title, text: ev.text, options: [], choice: false };
}

export function answerStory(state, table, i, hooks) {
  const c = state.story.choice;
  const ev = c && S(table).events.find((e) => e.id === c.id);
  if (!ev) {
    state.story.told = null;
    return { ok: true };
  }
  const opt = ev.choice.options[i] ?? ev.choice.options[0];
  state.story.choice = null;
  say(state, `${nameOf(table, state.player)}: ${opt.label}.`);
  applyEffects(state, table, opt.effects, hooks);
  return { ok: true };
}

export const rulerOf = (state, table, rid) => state.story?.rulers?.[rid] ?? table.data.game.rulers[rid] ?? '';
export const isAggressive = (state, rid) => !!state.story?.aggressive?.includes(rid);
export const powerNames = (table) => table.data.game.powers.filter((p) => isPower(table, p));

// The story so far, oldest first: title, text and when.
export function storySoFar(state, table) {
  return (state.story?.happened ?? []).map((h) => {
    const ev = S(table).events.find((e) => e.id === h.id);
    return ev ? { title: ev.title, text: ev.text, turn: h.turn } : null;
  }).filter(Boolean);
}
