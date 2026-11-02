// The Dawn of the Reign (M33 A): five places, each with short chains of
// quests that teach one system the game already has (repairs and labour,
// trade, the Book of Laws, faith, the military). The places start run
// down; a place whose chains are done returns to full prosperity, and all
// five together finish the Dawn (Part B counts it as the first step of
// Foltest's path).
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { windfall } from './economy.js';
import { condOf, worksFactor, damageWorks } from './works.js';
import { signed } from './book.js';
import { dilemmasOf, openDilemma } from './dilemmas.js';
import { questThreat } from './threats.js';
import { makeRng } from './rng.js';

const D = (world) => world.dawn;
const say = (state, text) => addDispatch(state, text, 'realm');

export function dawnOf(state) {
  return state.dawn ?? null;
}

// A new reign begins in the Dawn: the places run down, every chain's first
// step under way.
export function newDawn(state, world) {
  const d = D(world);
  if (!d) return;
  const rng = makeRng((state.seed ?? 1) * 7919 + 33);
  state.dawn = { start: state.day, places: {}, done: null };
  for (const [id, p] of Object.entries(d.places)) {
    const s = state.settlements[id];
    if (s) s.prosperity = clamp(s.prosperity - d.startDrop, 0, 100);
    const place = (state.dawn.places[id] = { chains: {}, done: null });
    for (const cid of Object.keys(p.chains)) {
      place.chains[cid] = { step: 0, began: state.day, done: null };
      begin(state, world, rng, id, cid);
    }
  }
}

// An existing reign from before M33 skips the Dawn.
export function skippedDawn(state) {
  return { start: state.day, places: {}, done: state.day, skipped: true };
}

function stepDef(world, id, cid, i) {
  return D(world).places[id]?.chains[cid]?.steps[i] ?? null;
}

function begin(state, world, rng, id, cid) {
  const c = state.dawn.places[id].chains[cid];
  const st = stepDef(world, id, cid, c.step);
  c.began = state.day;
  delete c.since;
  delete c.threat;
  // A step may wait a while before it comes (the court is not flooded on
  // the first day).
  if (st?.after && !c.waited) {
    c.wait = state.day + st.after;
    return;
  }
  delete c.waited;
  const setup = st?.setup;
  if (!setup) return;
  if (setup.damage) {
    const t = state.settlements[setup.damage.town];
    if (t?.buildings.includes(setup.damage.works)) {
      const now = condOf(t, setup.damage.works);
      if (now > setup.damage.to) damageWorks(state, world, setup.damage.town, setup.damage.works, now - setup.damage.to, 'Let go for years');
    }
  }
  if (setup.threat) {
    const t = questThreat(state, world, rng, setup.threat.town, setup.threat);
    if (t) c.threat = t.id;
  }
  if (setup.dilemma) {
    openDilemma(state, world, setup.dilemma.id, setup.dilemma.town);
    c.opened = state.day;
  }
}

// Whether a step is done, today.
function holds(state, world, c, st) {
  const t = st.done;
  const s = t.town ? state.settlements[t.town] : null;
  switch (t.type) {
    case 'repair': return !!s && s.buildings.includes(t.works) && condOf(s, t.works) >= D(world).repairedAt && !s.repair?.[t.works];
    case 'threat': return c.threat === undefined || !state.threats.list.some((x) => x.id === c.threat);
    case 'manned': return !!s && s.buildings.includes(t.works) && worksFactor(s, t.works) >= t.at;
    case 'calm': {
      if (!s || s.tension > t.below) { delete c.since; return false; }
      c.since ??= state.day;
      return state.day - c.since >= t.days;
    }
    case 'deal': return !!state.market?.deals?.[t.realm];
    case 'dilemma': return c.opened !== undefined && !dilemmasOf(state).open.some((o) => o.dilemma === t.id);
    case 'law': return t.laws.some((l) => signed(state, l));
    case 'endow': return (state.faiths?.endowed?.[t.town]?.[t.faith] ?? -Infinity) >= c.began;
    case 'company': return (state.forces?.companies ?? []).some((x) => x.station === t.town && !x.army && x.order?.kind !== 'move');
    case 'defence': return !!s && s.garrison + (state.forces?.companies ?? []).filter((x) => x.station === t.town).reduce((a, x) => a + x.men, 0) >= t.min;
    case 'unrest': return !!s && s.unrest <= t.below;
    default: return false;
  }
}

function reward(state, world, id, r = {}) {
  if (r.coin) windfall(state, 'quests', r.coin);
  if (r.love) nudge(state, world, 'love', r.love, 'The Dawn');
  if (r.fear) nudge(state, world, 'fear', r.fear, 'The Dawn');
  const s = state.settlements[id];
  if (s && r.prosperity) s.prosperity = clamp(s.prosperity + r.prosperity, 0, 100);
}

export function rewardLine(r = {}) {
  return [r.coin ? `${r.coin} crowns` : '', r.love ? `Love +${r.love}` : '', r.fear ? `Fear +${r.fear}` : '', r.prosperity ? `prosperity +${r.prosperity}` : ''].filter(Boolean).join(', ');
}

export function stepDawnDay(state, world) {
  const dawn = state.dawn;
  if (!dawn || dawn.done !== null || !D(world)) return;
  let rng = null;
  for (const [id, place] of Object.entries(dawn.places)) {
    if (place.done !== null) continue;
    const pdef = D(world).places[id];
    for (const [cid, c] of Object.entries(place.chains)) {
      if (c.done !== null) continue;
      if (c.wait !== undefined) {
        if (state.day < c.wait) continue;
        delete c.wait;
        c.waited = true;
        rng ??= makeRng((state.seed ?? 1) * 7919 + state.day);
        begin(state, world, rng, id, cid);
        continue;
      }
      const st = stepDef(world, id, cid, c.step);
      if (!st || !holds(state, world, c, st)) continue;
      const chain = pdef.chains[cid];
      if (c.step + 1 < chain.steps.length) {
        c.step += 1;
        rng ??= makeRng((state.seed ?? 1) * 7919 + state.day);
        begin(state, world, rng, id, cid);
        say(state, `${world.byId[id].name}: ${chain.name}, one step on. ${stepDef(world, id, cid, c.step).text}`);
        continue;
      }
      c.done = state.day;
      reward(state, world, id, chain.reward);
      say(state, `${world.byId[id].name}: ${chain.name}, done. ${rewardLine(chain.reward) ? `The crown has ${rewardLine(chain.reward)}.` : ''}`);
    }
    if (Object.values(place.chains).every((c) => c.done !== null)) {
      place.done = state.day;
      const s = state.settlements[id];
      const d = D(world);
      const full = Math.min(d.fullCap, (world.settlementData[id]?.prosperity ?? s?.prosperity ?? 50) + d.fullBonus);
      if (s) s.prosperity = Math.max(s.prosperity, full);
      say(state, `${world.byId[id].name} is in order again. Its markets are full and its people talk of the king with something like warmth.`);
    }
  }
  if (Object.values(dawn.places).every((p) => p.done !== null)) {
    dawn.done = state.day;
    say(state, 'The five places are in order. The Dawn of the reign is over; what comes next is the North\'s to decide, and Nilfgaard\'s.');
  }
}

// Progress for the Dawn screen: every place, chain and step.
export function dawnView(state, world) {
  const dawn = state.dawn;
  if (!dawn || !D(world)) return null;
  const places = Object.entries(D(world).places).map(([id, p]) => {
    const st = dawn.places[id];
    const chains = Object.entries(p.chains).map(([cid, ch]) => {
      const c = st?.chains[cid];
      const step = c ? Math.min(c.step, ch.steps.length - 1) : 0;
      return {
        id: cid, name: ch.name, reward: ch.reward, steps: ch.steps.length, step,
        done: dawn.skipped ? true : c?.done != null, text: ch.steps[step].text, where: ch.steps[step].where,
        progress: progressOf(state, world, c, ch.steps[step]),
      };
    });
    return { id, teaches: p.teaches, line: p.line, chains, done: dawn.skipped || st?.done != null, count: chains.filter((c) => c.done).length };
  });
  return { places, done: dawn.done !== null, skipped: !!dawn.skipped, finished: places.filter((p) => p.done).length };
}

// A few words of how far a step has got.
function progressOf(state, world, c, st) {
  if (!c || c.done != null) return '';
  const t = st.done;
  const s = t.town ? state.settlements[t.town] : null;
  if (t.type === 'repair' && s) return s.repair?.[t.works] ? 'Masons at work.' : `Condition ${Math.round(condOf(s, t.works))} of ${D(world).repairedAt}.`;
  if (t.type === 'calm' && s) return s.tension > t.below ? `Tension ${Math.round(s.tension)}; it must be ${t.below} or less.` : `Calm for ${state.day - (c.since ?? state.day)} of ${t.days} days.`;
  if (t.type === 'manned' && s) return `Manned ${Math.round(worksFactor(s, t.works) * 100)}% of ${Math.round(t.at * 100)}%.`;
  if (t.type === 'defence' && s) return `${s.garrison + (state.forces?.companies ?? []).filter((x) => x.station === t.town).reduce((a, x) => a + x.men, 0)} men of ${t.min}.`;
  if (c.wait !== undefined) return 'Not yet.';
  if (t.type === 'threat') return state.threats.list.some((x) => x.id === c.threat) ? 'Still there.' : '';
  return '';
}

// What to do next, for the advice line and the Realm overview: the first
// unfinished step, Vizima first.
export function dawnNext(state, world) {
  const v = dawnView(state, world);
  if (!v || v.done) return null;
  for (const p of v.places) for (const c of p.chains) if (!c.done) return { place: p.id, chain: c.id, text: c.text, where: c.where, name: c.name };
  return null;
}
