// Labour (M20 C). Every settlement has hands: a working share of its people.
// Villages within a day's walk by road lend theirs to the nearest town or
// city, so a town's works are staffed by its hinterland (a district). The
// crown decides where the kingdom's hands go by kind of work, not place by
// place: fields, woods, mines, pastures, fishing, crafts, repairs and
// levies. Each kind's hands spread over the matching works in proportion to
// what each needs; a works can be pinned to be manned first. The seasons
// decide what is worth doing (fields from spring to the end of harvest,
// fishing closed by winter storms, pastures busiest at the shearing), and
// three royal calls move hands for a while: the harvest muster, the winter
// turn and the raising of the levies. Woods hands cut the fuel that keeps
// the hearths lit through winter.
import { addDispatch, clamp } from './realm.js';
import { dateOf, MONTHS } from './calendar.js';
import { totalPopulation } from './state.js';
import { leviedMap } from './conflict.js';
import { bookEffect } from './book.js';
import { faithEffect } from './faiths.js';
import { condOf } from './works.js';

const L = (world) => world.labour;
// Works can take up to half as many hands again as they need (M21 C).
const MAX_STAFF = 1.5;
const say = (state, text) => addDispatch(state, text, 'realm');
export const KINDS = ['fields', 'woods', 'mines', 'pastures', 'fishing', 'crafts', 'repairs', 'levies'];

export function defaultLabour(world) {
  const l = L(world);
  if (!l) return null;
  const pop = 0;
  return {
    split: { ...l.split },
    calls: {},
    winterTurn: true,
    pins: {},
    focus: {},
    closed: 0,
    fuel: pop,
    short: 0,
    report: null,
  };
}

// ---- Districts: which town's works a village's hands go to ----

const districtCache = new WeakMap();

// Each Temerian settlement's district head: itself for a town, city, castle
// or temple; for a village, the nearest town or city by road within a day's
// walk, if any.
export function districtOf(world) {
  const cached = districtCache.get(world);
  if (cached && cached.version === world.landsVersion) return cached.map;
  const map = {};
  const reach = L(world)?.lendReach ?? 75;
  for (const st of world.geography.settlements) {
    if (st.type !== 'village') { map[st.id] = st.id; continue; }
    // Dijkstra over Temeria's roads, out to a day's walk.
    const dist = { [st.id]: 0 };
    const open = [st.id];
    let best = null;
    while (open.length) {
      open.sort((a, b) => dist[a] - dist[b]);
      const at = open.shift();
      const there = world.byId[at];
      if (at !== st.id && (there.type === 'town' || there.type === 'city')) { best = at; break; }
      for (const e of world.adjacency[at] ?? []) {
        const d = dist[at] + e.d;
        if (d > reach || (dist[e.to] !== undefined && dist[e.to] <= d)) continue;
        dist[e.to] = d;
        open.push(e.to);
      }
    }
    map[st.id] = best ?? st.id;
  }
  districtCache.set(world, { version: world.landsVersion, map });
  return map;
}

// ---- Hands and needs ----

// A place's hands, less the men away with the army.
export function handsOf(state, world, id, levied = leviedMap(state)) {
  const s = state.settlements[id];
  if (!s || s.occupier) return 0;
  return Math.max(0, totalPopulation(s) * L(world).handsShare - (levied[id] ?? 0));
}

// Which kind of work a works belongs to, if it needs hands at all.
const kindCache = new WeakMap();
export function kindOfWorks(world, b) {
  let map = kindCache.get(world);
  if (!map) {
    map = {};
    for (const [k, def] of Object.entries(L(world)?.kinds ?? {})) for (const w of def.works ?? []) map[w] = k;
    kindCache.set(world, map);
  }
  return map[b] ?? null;
}

// The hands a works needs this month: none for the fields in winter, more
// for the pastures at the shearing, none on the water while it is closed.
export function needOf(state, world, id, b, month = dateOf(state.day).month) {
  const l = L(world);
  const kind = kindOfWorks(world, b);
  if (!kind) return 0;
  const k = l.kinds[kind];
  if (k.months && !k.months.includes(month)) return 0;
  if (kind === 'fishing' && (state.labour?.closed ?? 0) > state.day) return 0;
  const base = kind === 'crafts' ? l.need.craft : l.need[b] ?? l.need.craft;
  const peak = k.peak?.includes(month) ? 1.6 : 1;
  return base * (l.placeScale[world.byId[id].type] ?? 1) * peak;
}

// The hands a place's own ground needs to bring in its harvest.
export function farmNeed(world, id, month) {
  const l = L(world);
  if (!l.kinds.fields.months.includes(month)) return 0;
  return l.need.farm[world.byId[id].type] ?? 0;
}

// ---- The split, as it stands today ----

// The crown's split, moved by any royal call in force and by the season.
export function splitNow(state, world) {
  const l = L(world);
  const lab = state.labour;
  const out = { ...lab.split };
  const month = dateOf(state.day).month;
  // The winter turn: at first frost the field hands go elsewhere until spring.
  const frost = l.calls.winter;
  const wintry = month >= frost.frost || month < frost.spring;
  if (lab.winterTurn && wintry) {
    const moved = out.fields;
    out.fields = 0;
    for (const [k, share] of Object.entries(frost.to)) out[k] += moved * share;
  }
  const scaleRest = (fixed, value) => {
    const rest = KINDS.filter((k) => k !== fixed).reduce((a, k) => a + out[k], 0);
    const f = rest > 0 ? (100 - value) / rest : 0;
    for (const k of KINDS) out[k] = k === fixed ? value : out[k] * f;
  };
  if ((lab.calls.harvest?.until ?? 0) > state.day) scaleRest('fields', Math.max(out.fields, l.calls.harvest.fields));
  if ((lab.calls.levy?.until ?? 0) > state.day) scaleRest('levies', Math.max(out.levies, l.calls.levy.levies));
  return out;
}

// ---- The day ----

// Works out who works where today, and stores each works' staffing (0 to
// 100) on its place, each place's farm staffing, the repair crews and a
// report by kind for the Labour screen.
export function stepLabourDay(state, world) {
  const l = L(world);
  if (!l || !state.labour) return;
  const month = dateOf(state.day).month;
  const split = splitNow(state, world);
  const district = districtOf(world);
  const levied = leviedMap(state);
  const groups = {};
  for (const id of Object.keys(state.settlements)) {
    const s = state.settlements[id];
    if (s.occupier) continue;
    const head = state.settlements[district[id]] && !state.settlements[district[id]].occupier ? district[id] : id;
    (groups[head] ??= []).push(id);
  }
  const report = {};
  for (const k of KINDS) report[k] = { hands: 0, need: 0, staffed: 0 };
  const pins = state.labour.pins ?? {};
  // At a harvest muster the fields take more hands than they strictly need,
  // and bring the harvest in fuller.
  const muster = (state.labour.calls.harvest?.until ?? 0) > state.day;
  // First each district mans its own works, kind by kind.
  const districts = [];
  for (const [head, members] of Object.entries(groups)) {
    const hands = members.reduce((a, id) => a + handsOf(state, world, id, levied), 0);
    const shares = focusedSplit(world, split, state.labour.focus?.[head]);
    const byKind = {};
    for (const id of members) {
      const s = state.settlements[id];
      for (const b of s.buildings) {
        const kind = kindOfWorks(world, b);
        if (!kind) continue;
        const need = s.repair?.[b]?.kind === 'rebuild' ? 0 : needOf(state, world, id, b, month);
        (byKind[kind] ??= []).push({ id, b, need, pinned: pins[id]?.includes(b) });
      }
      (byKind.fields ??= []).push({ id, b: null, need: farmNeed(world, id, month) });
    }
    const d = { byKind, own: {}, need: {}, got: {} };
    for (const kind of KINDS) {
      d.own[kind] = (hands * shares[kind]) / 100;
      report[kind].hands += d.own[kind];
      d.need[kind] = (byKind[kind] ?? []).reduce((a, w) => a + w.need, 0);
      d.got[kind] = Math.min(d.own[kind], d.need[kind]);
    }
    districts.push(d);
  }
  // Then hands to spare go where they are short (field hands out to the
  // villages at harvest), losing some on the road.
  for (const kind of KINDS) {
    if (kind === 'repairs' || kind === 'levies') continue;
    const spare = districts.reduce((a, d) => a + Math.max(0, d.own[kind] - d.got[kind]), 0) * l.spread;
    const short = districts.reduce((a, d) => a + Math.max(0, d.need[kind] - d.got[kind]), 0);
    const f = short > 0 ? Math.min(1, spare / short) : 0;
    let used = 0;
    const leftover = districts.map((d) => Math.max(0, d.own[kind] - d.got[kind]));
    for (const d of districts) {
      const gap = Math.max(0, d.need[kind] - d.got[kind]);
      d.got[kind] += gap * f;
      used += gap * f;
    }
    // What no other district needed works its own district's works harder
    // (M21 C), up to half as many hands again as they need.
    const keep = spare > 0 ? Math.max(0, 1 - used / spare) : 1;
    let extra = 0;
    districts.forEach((d, i) => {
      const more = Math.min(leftover[i] * keep, d.need[kind] * (MAX_STAFF - 1));
      d.got[kind] += more;
      extra += more;
    });
    report[kind].idle = Math.max(0, spare / l.spread - used / l.spread - extra);
  }
  // Each works takes its share of what its district has: pinned works first.
  for (const d of districts) {
    for (const kind of KINDS) {
      const list = d.byKind[kind] ?? [];
      if (!list.length) continue;
      report[kind].need += d.need[kind];
      let left = d.got[kind];
      for (const w of list) {
        if (!w.pinned || w.need <= 0) continue;
        w.got = Math.min(w.need, left);
        left -= w.got;
      }
      const rest = list.filter((w) => w.got === undefined).reduce((a, w) => a + w.need, 0);
      const ratio = rest > 0 ? left / rest : 0;
      for (const w of list) {
        if (w.got === undefined) w.got = w.need * Math.min(MAX_STAFF, ratio);
        report[kind].staffed += Math.min(w.need, w.got);
        const s = state.settlements[w.id];
        // Out of season a works keeps its people but has nothing to do.
        const pct = w.need > 0 ? clamp((100 * w.got) / w.need, 0, 100 * MAX_STAFF) : 100;
        if (w.b === null) s.farmStaff = pct;
        else (s.staff ??= {})[w.b] = pct;
      }
    }
  }
  // Debtors' labour (M26) makes more crews of the same hands.
  state.labour.crews = Math.max(1, Math.floor((report.repairs.hands / l.crew) * Math.max(0, 1 + bookEffect(state, world, 'repairHands'))));
  // Under the winter turn (M24 C) the hands the woods, mines and workshops
  // cannot take sit at their own hearths spinning, mending and carting:
  // winter work, a little coin rather than idleness.
  const wintry = state.labour.winterTurn && (month >= l.calls.winter.frost || month < l.calls.winter.spring);
  if (wintry) {
    for (const k of KINDS) {
      if (k === 'fields' || !report[k].idle) continue;
      report[k].home = report[k].idle;
      report[k].idle = 0;
    }
  }
  state.labour.report = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { hands: Math.round(v.hands), need: Math.round(v.need), staffed: Math.round(v.staffed), idle: Math.round(v.idle ?? 0), ...(v.home ? { home: Math.round(v.home) } : {}) }]));
}

// How a place's harvest stands to its hands: a floor from the old and the
// young, the rest as the fields are manned; a muster adds a little.
export function farmFactor(world, s) {
  const l = L(world);
  if (!l) return 1;
  // Hands beyond what the fields need (a muster, a focus on food) bring the
  // harvest in fuller, each counting half (M21 C).
  const staff = s.farmStaff ?? 100;
  return l.farmFloor + (1 - l.farmFloor) * ((Math.min(staff, 100) + Math.max(0, staff - 100) / 2) / 100);
}

// How much the garrisons swell or shrink with the levies' share.
export function levyFactor(state, world) {
  const l = L(world);
  if (!l || !state.labour) return 1;
  const share = splitNow(state, world).levies;
  return clamp(0.7 + 0.3 * (share / l.split.levies), 0.5, l.levyGarrison * 2);
}

// ---- The month ----

// Fuel cut and burned; storms closing the water; the calls running out.
export function monthlyLabour(state, world, rng) {
  const l = L(world);
  if (!l || !state.labour) return;
  const lab = state.labour;
  const date = dateOf(state.day);
  const month = date.month;
  // Winter storms and ice close the water for a few weeks.
  const fc = l.fishingClosed;
  if (fc.months.includes(month) && rng.chance(fc.chance)) {
    lab.closed = state.day + Math.round(fc.days[0] + rng.next() * (fc.days[1] - fc.days[0]));
    if (Object.values(state.settlements).some((s) => s.buildings.some((b) => kindOfWorks(world, b) === 'fishing'))) say(state, 'Ice and storms close the water. The boats stay drawn up for a few weeks.');
  }
  // Fuel: cut by the woods hands, burned by every hearth from November to March.
  const made = fuelMade(state, world);
  const people = Object.values(state.settlements).reduce((a, s) => a + (s.occupier ? 0 : totalPopulation(s)), 0);
  const burn = (people / 100) * (l.fuel.burn[String(month)] ?? 0);
  const cap = (people / 100) * l.fuel.capMonths;
  lab.fuel = Math.min(cap, lab.fuel + made);
  lab.made = Math.round(made);
  lab.burned = Math.round(Math.min(lab.fuel, burn));
  const short = burn > 0 ? Math.max(0, (burn - lab.fuel) / burn) : 0;
  lab.fuel = Math.max(0, lab.fuel - burn);
  lab.short = short;
  if (short > 0.05) coldMonth(state, world, short);
  for (const k of Object.keys(lab.calls)) if (lab.calls[k].until <= state.day) delete lab.calls[k];
}

// What the woods hands cut this month: the fuel works by their staffing and
// condition, and firewood gathered by the rest.
export function fuelMade(state, world) {
  const l = L(world);
  const per = l.fuel.perWorkerMonth;
  let v = 0;
  let workers = 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    for (const b of s.buildings) {
      if (kindOfWorks(world, b) !== 'woods' || !per[b]) continue;
      const w = (needOf(state, world, id, b) * (s.staff?.[b] ?? 100)) / 100;
      workers += w;
      v += w * per[b] * (condOf(s, b) / 100);
    }
  }
  const woods = state.labour.report?.woods?.hands ?? 0;
  v += Math.max(0, woods - workers) * per.gather;
  // The Old Ways (M26 C): more from the woods.
  return v * Math.max(0, 1 + faithEffect(state, world, 'woods'));
}

// Cold hearths: sickness and deaths in the poorest places, anger everywhere.
function coldMonth(state, world, short) {
  const c = L(world).fuel.short;
  const ids = Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier)
    .sort((a, b) => state.settlements[a].prosperity - state.settlements[b].prosperity);
  const poorest = new Set(ids.slice(0, Math.ceil(ids.length * c.poorest)));
  let dead = 0;
  for (const id of ids) {
    const s = state.settlements[id];
    s.unrest = clamp(s.unrest + c.unrest * short, 0, 100);
    if (!poorest.has(id)) continue;
    for (const k of Object.keys(s.population)) {
      const n = Math.round(s.population[k] * c.sickness * short * 10);
      s.population[k] = Math.max(0, s.population[k] - n);
      dead += n;
    }
  }
  say(state, `The woodpiles are empty${short > 0.5 ? ' across the realm' : ' in many places'}. Hearths go cold in ${MONTHS[dateOf(state.day).month - 1].name}${dead ? `, and ${dead} of the poorest are dead of cold and fever` : ''}.`);
}

// ---- The crown's orders ----

export function canSetSplit(state, world, split) {
  const l = L(world);
  if (!l || !state.labour) return { ok: false, reason: 'No labour in this world.' };
  for (const k of KINDS) {
    const v = split[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < l.minShare || v > l.maxShare) return { ok: false, reason: `Each kind of work takes between ${l.minShare} and ${l.maxShare} in a hundred.` };
  }
  const sum = KINDS.reduce((a, k) => a + split[k], 0);
  if (Math.abs(sum - 100) > 0.5) return { ok: false, reason: 'The shares must make a hundred.' };
  return { ok: true };
}

export function setSplit(state, world, split) {
  state.labour.split = Object.fromEntries(KINDS.map((k) => [k, split[k]]));
}

// Move `step` hands in a hundred to one kind of work, taken evenly from the
// others that can spare them.
export function shiftSplit(split, kind, step) {
  const out = { ...split };
  const others = KINDS.filter((k) => k !== kind && (step > 0 ? out[k] > 0 : true));
  const give = step > 0 ? Math.min(step, others.reduce((a, k) => a + out[k], 0)) : Math.max(step, -out[kind]);
  out[kind] += give;
  let left = give;
  const pool = others.reduce((a, k) => a + out[k], 0);
  for (const k of others) {
    const take = step > 0 ? (left * out[k]) / Math.max(1, pool) : give / others.length;
    out[k] -= take;
  }
  // Round to whole hands in a hundred, keeping the sum.
  for (const k of KINDS) out[k] = Math.max(0, Math.round(out[k]));
  const drift = 100 - KINDS.reduce((a, k) => a + out[k], 0);
  const fix = KINDS.filter((k) => k !== kind).sort((a, b) => out[b] - out[a])[0];
  out[fix] += drift;
  return out;
}

// A district's split under its town's focus (M21 C): the focus's kinds of
// work take boost times their share, the rest give way in proportion.
export function focusedSplit(world, split, focus) {
  const opt = focus && L(world).focus?.options[focus];
  if (!opt) return split;
  const out = { ...split };
  const boosted = opt.kinds.reduce((a, k) => a + out[k] * L(world).focus.boost, 0);
  const restBefore = KINDS.filter((k) => !opt.kinds.includes(k)).reduce((a, k) => a + out[k], 0);
  const f = restBefore > 0 ? Math.max(0, 100 - boosted) / restBefore : 0;
  for (const k of KINDS) out[k] = opt.kinds.includes(k) ? out[k] * L(world).focus.boost : out[k] * f;
  return out;
}

// ---- Presets and focus (M21 C) ----

export function canPreset(state, world, id) {
  const p = L(world)?.presets?.[id];
  if (!p || id === 'note') return { ok: false, reason: 'Unknown setting.' };
  return canSetSplit(state, world, p.split);
}

export function applyPreset(state, world, id) {
  setSplit(state, world, L(world).presets[id].split);
}

// The town whose district a place works for.
export function districtHead(world, id) {
  return districtOf(world)[id] ?? id;
}

export function canFocus(state, world, id, focus) {
  const l = L(world);
  if (!l?.focus) return { ok: false, reason: 'No focus in this world.' };
  const s = state.settlements[id];
  const type = world.byId[id]?.type;
  if (!s || s.occupier) return { ok: false, reason: 'Only a place the crown holds.' };
  if (type !== 'town' && type !== 'city') return { ok: false, reason: 'A focus is set on a town or city, for it and the villages round it.' };
  if (focus !== null && !l.focus.options[focus]) return { ok: false, reason: 'Unknown focus.' };
  return { ok: true };
}

export function setFocus(state, world, id, focus) {
  state.labour.focus ??= {};
  if (focus) state.labour.focus[id] = focus;
  else delete state.labour.focus[id];
}

// What the realm (or one district) would make a month after a change to
// its hands, against now: `change` is { split } or { focus: { id, focus } }.
// Worked on a light copy of the state, so nothing is touched.
export function labourPreview(state, world, change, output) {
  const copy = {
    ...state,
    labour: { ...state.labour, split: change.split ?? state.labour.split, focus: { ...(state.labour.focus ?? {}) } },
    settlements: Object.fromEntries(Object.entries(state.settlements).map(([id, s]) => [id, { ...s, staff: { ...(s.staff ?? {}) } }])),
  };
  if (change.focus) {
    if (change.focus.focus) copy.labour.focus[change.focus.id] = change.focus.focus;
    else delete copy.labour.focus[change.focus.id];
  }
  stepLabourDay(copy, world);
  const ids = change.focus ? Object.keys(state.settlements).filter((id) => districtHead(world, id) === change.focus.id) : null;
  const before = output(state, world, ids);
  const after = output(copy, world, ids);
  const diff = {};
  for (const k of Object.keys(after)) diff[k] = Math.round(after[k] - before[k]);
  return diff;
}

export function canCall(state, world, call) {
  const l = L(world);
  if (!l || !state.labour) return { ok: false, reason: 'No labour in this world.' };
  const c = l.calls[call];
  if (!c) return { ok: false, reason: 'Unknown call.' };
  if (call === 'winter') return { ok: true, standing: true };
  if ((state.labour.calls[call]?.until ?? 0) > state.day) return { ok: false, reason: 'Already called.' };
  const month = dateOf(state.day).month;
  if (c.months && !c.months.includes(month)) return { ok: false, reason: `Only from ${MONTHS[c.months[0] - 1].name} to ${MONTHS[c.months.at(-1) - 1].name}.` };
  if (c.coin && state.treasury - c.coin < -world.economy.debt.creditLimit) return { ok: false, reason: 'The treasury cannot bear it.' };
  return { ok: true };
}

export function makeCall(state, world, call) {
  const l = L(world);
  const c = l.calls[call];
  if (call === 'winter') {
    state.labour.winterTurn = !state.labour.winterTurn;
    say(state, state.labour.winterTurn ? 'By the crown\'s order, at first frost the field hands will go to the woods, the turf cuts, the boats and the workshops until spring.' : 'The winter turn is called off: the field hands will sit out the winter.');
    return;
  }
  state.labour.calls[call] = { since: state.day, until: state.day + c.days };
  if (c.coin) {
    state.treasury -= c.coin;
    state.ledger.decrees = (state.ledger.decrees ?? 0) + c.coin;
  }
  if (c.unrest) for (const s of Object.values(state.settlements)) if (!s.occupier) s.unrest = clamp(s.unrest + c.unrest, 0, 100);
  say(state, call === 'harvest'
    ? 'The harvest muster is called: every hand to the fields for six weeks. The mines and workshops fall quiet.'
    : `The levies are raised: ${c.days} days under arms, ${c.coin} crowns for their keep.`);
}

// Pin a works to be manned first, or unpin it.
export function canPin(state, world, id, b) {
  const s = state.settlements[id];
  if (!s || !s.buildings.includes(b)) return { ok: false, reason: 'Nothing of that kind stands there.' };
  if (!kindOfWorks(world, b)) return { ok: false, reason: 'It needs no hands.' };
  return { ok: true };
}

export function togglePin(state, world, id, b) {
  const pins = (state.labour.pins ??= {});
  const list = pins[id] ?? [];
  pins[id] = list.includes(b) ? list.filter((x) => x !== b) : [...list, b];
  if (!pins[id].length) delete pins[id];
}

// ---- What the crown is told ----

// The grain the realm will hold at first frost against what winter will
// eat, with days to frost: for the Labour screen and the top bar.
export function winterOutlook(state, world, { foodYield, foodNeed, foodCapacity }) {
  const l = L(world);
  const frost = l.calls.winter.frost;
  let day = state.day;
  let stock = 0;
  for (const s of Object.values(state.settlements)) if (!s.occupier) stock += s.stock.food;
  let grown = 0;
  let eaten = 0;
  // Day by day to first frost, at this month's rates.
  let d = 0;
  for (; d < 400; d++) {
    const date = dateOf(day + d);
    if (date.month === frost && date.day === 1 && d > 0) break;
    for (const [id, s] of Object.entries(state.settlements)) {
      if (s.occupier) continue;
      grown += foodYield(world, id, s, date.month);
      eaten += foodNeed(world, s, date.season);
    }
  }
  // No more than the realm's stores can hold.
  const room = foodCapacity ? Object.values(state.settlements).reduce((a, s) => a + (s.occupier ? 0 : foodCapacity(world, s)), 0) : Infinity;
  const atFrost = Math.max(0, Math.min(room, stock + grown - eaten));
  // What the hungry months (November to February) will eat.
  let winter = 0;
  for (const m of [11, 12, 1, 2]) for (const s of Object.values(state.settlements)) if (!s.occupier) winter += foodNeed(world, s, m === 11 ? 'autumn' : 'winter') * MONTHS[m - 1].days;
  // Fuel by first frost: what is in store, and what the woods hands cut by
  // then at this month's rate (none is burned before November).
  const people = Object.values(state.settlements).reduce((a, s) => a + (s.occupier ? 0 : totalPopulation(s)), 0);
  const fuelAtFrost = Math.min((people / 100) * l.fuel.capMonths, state.labour.fuel + fuelMade(state, world) * (d / 30.4));
  return {
    days: d, atFrost: Math.round(atFrost), winter: Math.round(winter), short: atFrost < winter,
    fuel: Math.round(state.labour.fuel), fuelAtFrost: Math.round(fuelAtFrost), fuelNeed: Math.round(fuelNeed(state, world)),
  };
}

// The fuel the coming winter will burn.
export function fuelNeed(state, world) {
  const l = L(world);
  const people = Object.values(state.settlements).reduce((a, s) => a + (s.occupier ? 0 : totalPopulation(s)), 0);
  return (people / 100) * Object.values(l.fuel.burn).reduce((a, b) => a + b, 0);
}

// One line of seasonal pressure for the top bar.
// Which preset the hands stand at, if any (M23 B): null means Custom.
export function presetNow(state, world) {
  const now = state.labour?.split;
  if (!now) return null;
  const found = Object.entries(L(world)?.presets ?? {}).find(([id, p]) => id !== 'note' && KINDS.every((k) => (p.split[k] ?? 0) === (now[k] ?? 0)));
  return found ? found[0] : null;
}

// The season's suggestion (M23 B): harvest hands in August, winter hands
// from November, the usual round again after the harvest and in spring.
// Null when the hands already stand where the season wants them.
export function seasonalPrompt(state, world) {
  const prompts = L(world)?.prompts;
  if (!prompts || !state.labour) return null;
  const month = dateOf(state.day).month;
  const now = presetNow(state, world);
  for (const [id, p] of Object.entries(prompts)) {
    if (id === 'note' || !p.months.includes(month) || now === p.preset) continue;
    if (p.from && now !== p.from) continue;
    if (!canPreset(state, world, p.preset).ok) continue;
    return { id, preset: p.preset, text: p.text };
  }
  return null;
}

export function pressureLine(state, world, fns) {
  if (!state.labour || !L(world)) return '';
  // A kind of work under half manned (M24 C) comes before all else: its
  // works stand mostly idle and the crown loses what they would earn.
  const half = halfStaffed(state, world)[0];
  if (half) return `${half.name} under half manned (${Math.round(half.pct * 100)}%): their works stand idle. Tap to move the hands.`;
  // The season's suggestion comes first: it is the thing to do now.
  const prompt = seasonalPrompt(state, world);
  if (prompt) return `${prompt.text} Tap to set them.`;
  const o = winterOutlook(state, world, fns);
  const month = dateOf(state.day).month;
  const wintry = month >= 11 || month <= 2;
  const fuel = o.fuelAtFrost < o.fuelNeed * 0.6 ? ' Fuel will be short.' : '';
  // The one most pressing shortage of hands, if any (M21 C).
  let worst = null;
  for (const k of KINDS) {
    const x = state.labour.report?.[k];
    if (!x || x.need <= 0) continue;
    const pct = x.staffed / x.need;
    if (pct < 0.85 && (!worst || pct < worst.pct)) worst = { pct, name: L(world).kinds[k].name };
  }
  const hands = worst ? ` ${worst.name} short of hands.` : '';
  if (wintry) return `Winter. ${state.labour.short > 0.05 ? 'Hearths are going cold.' : `Fuel for about ${Math.max(0, Math.round((o.fuel / Math.max(1, o.fuelNeed)) * 5))} months.`}${hands}`;
  return `First frost in ${o.days} days. ${o.short ? 'Grain is short for winter.' : 'Grain enough for winter.'}${fuel}${hands}`;
}

// The kinds of work (not the fields, the repairs or the levies) under half
// the hands they need this month, worst first (M24 C).
export function halfStaffed(state, world) {
  const out = [];
  for (const k of KINDS) {
    if (['fields', 'repairs', 'levies'].includes(k)) continue;
    const x = state.labour?.report?.[k];
    if (!x || x.need < 50) continue;
    const pct = x.staffed / x.need;
    if (pct < 0.5) out.push({ kind: k, pct, name: L(world).kinds[k].name });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

// v18: a reign from before Part C gets the default split, with the winter
// turn standing if it is already winter, and a month and a half of fuel.
export function upgradeLabour(state, world) {
  if (!L(world)) return state;
  state.labour = defaultLabour(world);
  state.labour.fuel = startingFuel(state, world);
  return state;
}

export function startingFuel(state, world) {
  const people = Object.values(state.settlements).reduce((a, s) => a + totalPopulation(s), 0);
  return (people / 100) * L(world).fuel.startMonths;
}
