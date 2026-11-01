// Works (M20). The crown does not build: every place starts with the works
// its land gives it (a mill on the river, boats on the lake, a quarry in the
// hills, the market and smithy in the town square), and those works are
// fixed. What changes is how well they stand. Raids, armies, sieges, sacks,
// storms, fire and flood knock them about, and every works wears a little
// with use, faster when the crown cannot pay its upkeep. A works yields by
// the lower of its condition and its staffing, so the crown's levers are
// repairs (rebuild, patch, or leave it) and, from Part C, where its hands go.
import { noteUsed, underPrice } from './market.js';
import { addDispatch, clamp } from './realm.js';
import { dateOf, MONTHS } from './calendar.js';
import { bookEffect } from './book.js';
import { TEMERIA, placeOf, ownerOf } from './conflict.js';

const C = (world) => world.works;
const say = (state, text) => addDispatch(state, text, 'realm');
const round = Math.round;

// ---- The spaces of the land ----

// Each settlement's spaces as the data gives them, with the works each holds
// at the start. Built once per world from data/spaces.json.
export function buildSpaces(spacesData, settlements, foreign, borderland) {
  const out = {};
  const rules = spacesData ?? {};
  const all = [...settlements, ...foreign];
  for (const st of all) {
    const list = rules.settlements?.[st.id] ?? [];
    const o = rules.overrides?.[st.id] ?? {};
    out[st.id] = list.map((sp) => {
      const def = rules.defaults?.[sp.kind] ?? {};
      let works = o[sp.kind] !== undefined ? o[sp.kind] : def[st.type] ?? def.any ?? [];
      works = Array.isArray(works) ? [...works] : works ? [works] : [];
      if (sp.kind === 'square' && o.squareAdd) for (const b of o.squareAdd) if (!works.includes(b)) works.push(b);
      if (sp.kind === 'defences' && o.defences === undefined && borderland?.[st.id] && !works.includes('watchtower')) works.push('watchtower');
      return { kind: sp.kind, name: sp.name, works };
    });
  }
  return out;
}

// The works a place has at the start, and the condition of those that do
// not start whole (old gold workings, the border places of the last war).
export function startingWorks(world, id, realm = TEMERIA) {
  const spaces = world.spaces?.[id] ?? [];
  const start = world.spacesData?.start ?? {};
  const buildings = [];
  const cond = {};
  const worn = {};
  for (const sp of spaces) {
    for (const b of sp.works) {
      if (!world.buildings[b] || buildings.includes(b)) continue;
      buildings.push(b);
      if (sp.kind === 'seam' && start.seam !== undefined) {
        cond[b] = start.seam;
        worn[b] = { why: start.why?.seam ?? 'Abandoned', day: 0 };
      } else if (start.realms?.[realm] !== undefined) {
        cond[b] = start.realms[realm];
        worn[b] = { why: start.why?.war ?? 'Worn', day: 0 };
      }
    }
  }
  return { buildings, cond, worn };
}

// Which space a works stands in, for the card: by the static layout, or by
// what kind of space would hold it.
export function spaceKindOf(world, b) {
  for (const [kind, k] of Object.entries(world.spacesData?.kinds ?? {})) {
    if (Array.isArray(k.works) && k.works.includes(b) && kind !== 'seam') return kind;
  }
  return 'square';
}

// A place's spaces with what stands in each: kind, name, and for each works
// its condition, why it is worn and any repair under way.
export function spacesOf(state, world, id) {
  const s = placeOf(state, world, id);
  const layout = world.spaces?.[id] ?? [];
  if (!s) return [];
  const placed = new Set();
  const out = layout.map((sp) => {
    const works = sp.works.filter((b) => s.buildings.includes(b)).map((b) => {
      placed.add(b);
      return worksView(s, b);
    });
    return { kind: sp.kind, name: sp.name, works };
  }).filter((sp) => sp.works.length || sp.kind === 'square' || sp.kind === 'defences');
  // Hidden seams show only once found.
  const known = out.filter((sp) => sp.kind !== 'seam' || seamKnown(state, world, id));
  // Anything else the place holds (carried over from an old save, or won in
  // a deal) goes where its kind belongs.
  for (const b of s.buildings) {
    if (placed.has(b) || !world.buildings[b]) continue;
    const kind = spaceKindOf(world, b);
    let sp = known.find((x) => x.kind === kind);
    if (!sp) known.push((sp = { kind, name: world.spacesData?.kinds?.[kind]?.name ?? kind, works: [] }));
    sp.works.push(worksView(s, b));
  }
  return known;
}

function worksView(s, b) {
  return { b, cond: condOf(s, b), why: s.worn?.[b]?.why ?? null, repair: s.repair?.[b] ?? null, patched: !!s.patched?.[b], staff: staffOf(s, b) };
}

function seamKnown(state, world, id) {
  const deps = Object.entries(world.gold?.deposits ?? {}).filter(([, d]) => d.settlement === id);
  if (!deps.length) return true;
  return deps.some(([dep]) => state.gold?.deposits[dep]?.known);
}

// ---- Condition and output ----

export function condOf(s, b) {
  return s.cond?.[b] ?? 100;
}

// Staffing, 0 to 100: how well manned a works is. Every works is fully
// manned until the crown's hands are reckoned (Part C).
export function staffOf(s, b) {
  return s.staff?.[b] ?? 100;
}

// How much of its worth a works yields: the lower of its condition and its
// staffing. A works being rebuilt yields nothing while the masons are in.
export function worksFactor(s, b) {
  if (s.repair?.[b]?.kind === 'rebuild') return 0;
  const cond = condOf(s, b);
  const staff = staffOf(s, b);
  // Hands beyond what a works needs (M21 C) work it harder: up to half as
  // many again, for up to a quarter more, as far as its condition allows.
  const extra = staff > 100 ? Math.min(staff - 100, 50) / 100 * OVERSTAFF * (cond / 100) : 0;
  return Math.min(cond, staff) / 100 + extra;
}
const OVERSTAFF = 0.5;

// What a works costs to keep (M24 C): it follows the hands, so a works
// half manned costs half, down to a small floor for the watchmen and the
// roof. A works being mended costs nothing beyond its repair: the masons'
// bill is the whole of it. The crown's works cost `upkeepScale` times their
// old upkeep (its ledger was calibrated for a realm that built a few at a
// time); foreign realms pay the plain rate.
export function upkeepFactor(world, s, b, crown = true) {
  const c = C(world);
  if (s.repair?.[b]) return 0;
  return Math.max(c?.upkeepFloor ?? 0.3, worksFactor(s, b)) * (crown ? c?.upkeepScale ?? 1 : 1);
}

// ---- Damage ----

const monthName = (state) => MONTHS[dateOf(state.day).month - 1].name;

// Knocks a works down by `amount`, recording why; a crown works worn below
// the line asks the crown what to do about it.
export function damageWorks(state, world, id, b, amount, why) {
  const s = placeOf(state, world, id);
  if (!s || !s.buildings.includes(b) || amount <= 0) return 0;
  const before = condOf(s, b);
  const after = clamp(before - amount, 0, 100);
  if (after === before) return 0;
  (s.cond ??= {})[b] = after;
  if (why) (s.worn ??= {})[b] = { why: `${why} in ${monthName(state)}`, day: state.day };
  // A patch rarely survives a second blow.
  if (s.patched?.[b] && after < before) delete s.patched[b];
  if (s.repair?.[b]?.kind === 'patch') delete s.repair[b];
  askAbout(state, world, id, b);
  return before - after;
}

// Damage to `count` works of a place, chosen at random among those matching
// `pick`, each by an amount drawn from [lo, hi].
export function damagePlace(state, world, rng, id, { count = 1, amount = [10, 25], why, pick = null }) {
  const s = placeOf(state, world, id);
  if (!s) return [];
  const list = s.buildings.filter((b) => world.buildings[b] && (!pick || pick(b)) && condOf(s, b) > 0);
  const hit = [];
  for (let i = 0; i < count && list.length; i++) {
    const b = list.splice(Math.floor(rng.next() * list.length), 1)[0];
    damageWorks(state, world, id, b, amount[0] + rng.next() * (amount[1] - amount[0]), why);
    hit.push(b);
  }
  return hit;
}

// Works out in the fields and the woods: what a raiding band reaches first.
const OUTSIDE = new Set(['fields', 'stud', 'pasture', 'lumber', 'charcoal', 'lodge', 'peat', 'herbalists', 'quarry', 'mine', 'silvermine', 'goldmine', 'mill', 'fishery', 'tannery', 'saltpans']);
export const outside = (b) => OUTSIDE.has(b);

// ---- Repair decisions ----

function works(state) {
  state.works ??= { decisions: [], nextId: 1 };
  state.works.order ??= { ...DEFAULT_ORDER };
  state.works.pending ??= [];
  return state.works;
}

// The crown's standing order for repairs (M28 A): mend the cheap ones
// without asking and gather the dear ones into one card a month, or mend
// everything, patch everything, or ask each time as before.
export const REPAIR_MODES = ['cheap', 'rebuild', 'patch', 'ask'];
const DEFAULT_ORDER = { mode: 'cheap', limit: 400 };

export function repairOrder(state) {
  return state.works?.order ?? DEFAULT_ORDER;
}

export function setRepairOrder(state, mode, limit = null) {
  const w = works(state);
  if (!REPAIR_MODES.includes(mode)) return false;
  w.order = { mode, limit: limit ?? w.order.limit ?? DEFAULT_ORDER.limit };
  // Asking again: what waited goes back to the inbox one by one.
  if (mode === 'ask') {
    for (const p of w.pending) if (!w.decisions.some((d) => d.town === p.town && d.works === p.works)) w.decisions.push({ id: w.nextId++, kind: 'repair', town: p.town, works: p.works, day: state.day });
    w.pending = [];
  }
  return true;
}

// What matters most is mended first: food, then fuel, then walls.
const URGENT = { fields: 0, fishery: 0, mill: 0, granary: 0, pasture: 1, lumber: 1, charcoal: 1, peat: 1, walls: 2 };

// Once a month: start what the order allows, and gather the rest.
function runRepairOrder(state, world) {
  const w = works(state);
  const { mode, limit } = w.order;
  if (mode === 'ask') return;
  // Old one-by-one questions join the order.
  for (const d of w.decisions.filter((x) => x.kind === 'repair')) if (!w.pending.some((p) => p.town === d.town && p.works === d.works)) w.pending.push({ town: d.town, works: d.works });
  w.decisions = w.decisions.filter((x) => x.kind !== 'repair');
  const live = (p) => {
    const t = state.settlements[p.town];
    return t && !t.occupier && t.buildings.includes(p.works) && !t.repair?.[p.works] && condOf(t, p.works) < C(world).decideBelow;
  };
  w.pending = w.pending.filter(live).sort((a, b) => (URGENT[a.works] ?? 3) - (URGENT[b.works] ?? 3) || condOf(state.settlements[a.town], a.works) - condOf(state.settlements[b.town], b.works));
  let mended = 0;
  let spent = 0;
  const dear = [];
  for (const p of [...w.pending]) {
    const kind = mode === 'patch' ? 'patch' : 'rebuild';
    const o = repairOptions(state, world, p.town, p.works)[kind];
    if (mode === 'cheap' && o.coin > limit) {
      dear.push(p);
      continue;
    }
    // Never into debt without the crown's word.
    if (state.treasury - o.coin < 0) break;
    const c = canRepairWorks(state, world, p.town, p.works, kind);
    if (!c.ok) continue;
    startRepair(state, world, p.town, p.works, kind, { quiet: true });
    mended += 1;
    spent += o.coin;
    w.pending = w.pending.filter((q) => q !== p);
  }
  if (mended) say(state, `Repairs this month: ${mended} works sent masons or carpenters, ${spent} crowns, under the crown's standing order.`);
  // The dear ones wait for one card a month.
  if (dear.length) {
    const open = w.decisions.find((d) => d.kind === 'batch');
    if (open) {
      for (const p of dear) if (!open.items.some((q) => q.town === p.town && q.works === p.works)) open.items.push({ town: p.town, works: p.works });
    } else w.decisions.push({ id: w.nextId++, kind: 'batch', items: dear.map((p) => ({ town: p.town, works: p.works })), day: state.day });
    w.pending = w.pending.filter((p) => !dear.includes(p));
  }
}

function askAbout(state, world, id, b) {
  const s = state.settlements[id];
  if (!s || s.occupier || !C(world)) return;
  if (condOf(s, b) >= C(world).decideBelow || s.repair?.[b]) return;
  // Once left, the crown is asked again only after it has fallen much further.
  if (s.left?.[b] !== undefined && condOf(s, b) > s.left[b] - (C(world).askAgain ?? 25)) return;
  const w = works(state);
  if (w.decisions.some((d) => d.town === id && d.works === b)) return;
  if (w.decisions.some((d) => d.kind === 'batch' && d.items.some((q) => q.town === id && q.works === b))) return;
  // Under a standing order it waits for the month's round, not the inbox.
  if (w.order.mode !== 'ask') {
    if (!w.pending.some((p) => p.town === id && p.works === b)) w.pending.push({ town: id, works: b });
    return;
  }
  w.decisions.push({ id: w.nextId++, kind: 'repair', town: id, works: b, day: state.day });
}

// What each of the three answers would cost and bring.
export function repairOptions(state, world, id, b) {
  const s = state.settlements[id];
  const cfg = C(world);
  const def = world.buildings[b];
  const cond = condOf(s, b);
  const missing = (100 - cond) / 100;
  const coinBase = def.cost.coin ?? 0;
  const mats = {};
  for (const k of ['timber', 'stone', 'iron']) if (def.cost[k]) mats[k] = round(def.cost[k] * missing * cfg.rebuild.materials);
  // Materials the realm lacks are bought in, dearer.
  const stock = { timber: 0, stone: 0, iron: 0 };
  for (const t of Object.values(state.settlements)) if (!t.occupier) for (const k of Object.keys(stock)) stock[k] += t.stock[k];
  let bought = 0;
  // What the stores lack is bought in at the market's price (M21).
  for (const [k, v] of Object.entries(mats)) bought += Math.max(0, v - stock[k]) * underPrice(state, world, k) * cfg.rebuild.buyFactor;
  const rebuild = {
    coin: round(coinBase * missing * cfg.rebuild.coin + bought),
    materials: mats,
    days: Math.max(cfg.rebuild.minDays, round(def.days * missing * cfg.rebuild.days)),
    hands: cfg.rebuild.hands,
    to: 100,
  };
  const to = round(cond + (100 - cond) * cfg.patch.share);
  const patch = {
    coin: round(coinBase * missing * cfg.patch.coin),
    materials: {},
    days: Math.max(cfg.patch.minDays, round(def.days * missing * cfg.patch.days)),
    hands: cfg.patch.hands,
    to,
  };
  return { cond, rebuild, patch, leave: { unrest: cfg.leave.unrest } };
}

export function canRepairWorks(state, world, id, b, kind) {
  const s = state.settlements[id];
  if (!C(world)) return { ok: false, reason: 'No repairs in this world.' };
  if (!s || !s.buildings.includes(b)) return { ok: false, reason: 'Nothing of that kind stands there.' };
  if (s.occupier) return { ok: false, reason: 'The town is under an enemy flag.' };
  if (s.smoulder && s.smoulder > state.day) return { ok: false, reason: 'The ruins are still smouldering.' };
  if (s.repair?.[b]) return { ok: false, reason: 'Already being mended.' };
  if (condOf(s, b) >= 100) return { ok: false, reason: 'It stands whole.' };
  if (kind !== 'rebuild' && kind !== 'patch') return { ok: false, reason: 'Unknown repair.' };
  const o = repairOptions(state, world, id, b)[kind];
  if (kind === 'patch' && o.to <= condOf(s, b) + 1) return { ok: false, reason: 'Too little left to patch.' };
  const limit = world.economy.debt.creditLimit;
  if (state.treasury - o.coin < -limit) return { ok: false, reason: 'The treasury cannot bear it.' };
  return { ok: true, ...o, borrow: state.treasury - o.coin < 0 };
}

export function startRepair(state, world, id, b, kind, { quiet = false } = {}) {
  const s = state.settlements[id];
  const o = repairOptions(state, world, id, b)[kind];
  state.treasury -= o.coin;
  state.ledger.construction += o.coin;
  // Materials from the realm's stocks, home first.
  for (const [k, v] of Object.entries(o.materials)) {
    let left = v;
    noteUsed(state, world, k, v);
    const own = Math.min(s.stock[k], left);
    s.stock[k] -= own;
    left -= own;
    for (const t of Object.values(state.settlements)) {
      if (left <= 0) break;
      if (t.occupier) continue;
      const take = Math.min(t.stock[k], left);
      t.stock[k] -= take;
      left -= take;
    }
  }
  (s.repair ??= {})[b] = { kind, days: o.days, daysLeft: o.days, to: o.to, hands: o.hands, since: state.day, ...(quiet ? { quiet: true } : {}) };
  if (s.left) delete s.left[b];
  resolveAbout(state, id, b);
  if (quiet) return;
  const name = world.buildings[b].name.toLowerCase();
  say(state, kind === 'rebuild'
    ? `Masons go to rebuild the ${name} at ${world.byId[id].name}: ${o.coin} crowns, about ${o.days} days.`
    : `Carpenters patch up the ${name} at ${world.byId[id].name}: ${o.coin} crowns, about ${o.days} days.`);
}

// Leave it: nothing spent, the output lost, and the people remember.
export function leaveWorks(state, world, id, b) {
  const s = state.settlements[id];
  const cfg = C(world);
  if (!s) return;
  s.unrest = clamp(s.unrest + cfg.leave.unrest, 0, 100);
  s.grudge = (s.grudge ?? 0) + cfg.leave.grudge;
  (s.left ??= {})[b] = condOf(s, b);
  resolveAbout(state, id, b);
}

function resolveAbout(state, id, b) {
  const w = works(state);
  w.decisions = w.decisions.filter((d) => !(d.town === id && d.works === b));
  w.pending = w.pending.filter((p) => !(p.town === id && p.works === b));
  for (const d of w.decisions) if (d.kind === 'batch') d.items = d.items.filter((q) => !(q.town === id && q.works === b));
  w.decisions = w.decisions.filter((d) => d.kind !== 'batch' || d.items.length);
}

export function resolveWorksDecision(state, world, id, choice) {
  const d = works(state).decisions.find((x) => x.id === id);
  if (!d) return { error: 'That matter is settled.' };
  if (d.kind === 'batch') return resolveBatch(state, world, d, choice);
  const kind = ['rebuild', 'patch', 'leave'][choice];
  if (!kind) return { error: 'Unknown choice.' };
  if (kind === 'leave') {
    leaveWorks(state, world, d.town, d.works);
    return {};
  }
  const c = canRepairWorks(state, world, d.town, d.works, kind);
  if (!c.ok) return { error: c.reason };
  startRepair(state, world, d.town, d.works, kind);
  return {};
}

// The month's dear repairs, answered together.
function batchCost(state, world, d, kind) {
  return d.items.reduce((a, q) => a + (state.settlements[q.town] ? repairOptions(state, world, q.town, q.works)[kind].coin : 0), 0);
}

function resolveBatch(state, world, d, choice) {
  const kind = ['rebuild', 'patch', 'leave'][choice];
  if (!kind) return { error: 'Unknown choice.' };
  const items = [...d.items];
  if (kind === 'leave') {
    for (const q of items) if (state.settlements[q.town]) leaveWorks(state, world, q.town, q.works);
    works(state).decisions = works(state).decisions.filter((x) => x !== d);
    return {};
  }
  let done = 0;
  for (const q of items) {
    if (!state.settlements[q.town]) continue;
    const c = canRepairWorks(state, world, q.town, q.works, kind);
    if (!c.ok || state.treasury - c.coin < 0) continue;
    startRepair(state, world, q.town, q.works, kind, { quiet: true });
    done += 1;
  }
  if (!done) return { error: 'The treasury cannot bear any of them now.' };
  const w = works(state);
  const left = w.decisions.find((x) => x === d);
  // What the treasury could not bear waits for next month's round.
  if (left) {
    for (const q of left.items) if (!w.pending.some((p) => p.town === q.town && p.works === q.works)) w.pending.push({ town: q.town, works: q.works });
    w.decisions = w.decisions.filter((x) => x !== d);
  }
  say(state, `${done} of the dear repairs begun: ${kind === 'rebuild' ? 'masons' : 'carpenters'} are on their way.`);
  return {};
}

export function worksDecisionText(state, world, d) {
  if (d.kind === 'batch') {
    const lines = d.items.filter((q) => state.settlements[q.town]).map((q) => {
      const o = repairOptions(state, world, q.town, q.works);
      return `${world.buildings[q.works]?.name ?? q.works} at ${world.byId[q.town].name} (${round(o.cond)} in a hundred): ${o.rebuild.coin} crowns`;
    });
    return {
      kicker: 'The dear repairs',
      title: `${lines.length} costly repair${lines.length === 1 ? '' : 's'} wait on the crown`,
      text: `${lines.join('; ')}. The cheaper ones are mended under the standing order without asking.`,
      choices: [
        `Rebuild them all: about ${batchCost(state, world, d, 'rebuild')} crowns (as many as the treasury bears)`,
        `Patch them all: about ${batchCost(state, world, d, 'patch')} crowns`,
        'Leave them all: costs nothing, the towns go without',
      ],
    };
  }
  const s = state.settlements[d.town];
  const name = world.buildings[d.works]?.name ?? d.works;
  const o = repairOptions(state, world, d.town, d.works);
  const why = s?.worn?.[d.works]?.why;
  const mats = (m) => Object.entries(m).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ');
  return {
    kicker: `Repairs at ${world.byId[d.town].name}`,
    title: `The ${name.toLowerCase()} is at ${round(o.cond)} in a hundred`,
    text: `${why ? `${why}. ` : ''}It yields only as well as it stands. Rebuilding makes it whole but stops it while the masons work; a patch is cheaper and quicker, but may give way again under strain such as a hard winter. Left alone, the place goes without, its unrest rises by ${o.leave.unrest}, and its people remember.`,
    choices: [
      `Rebuild it: ${o.rebuild.coin} crowns${mats(o.rebuild.materials) ? ` and ${mats(o.rebuild.materials)}` : ''}, ${o.rebuild.days} days, ${o.rebuild.hands} hands; whole again`,
      `Patch it up: ${o.patch.coin} crowns, ${o.patch.days} days, ${o.patch.hands} hands; back to about ${o.patch.to}`,
      'Leave it: costs nothing',
    ],
  };
}

// ---- Day and month ----

// Repairs under way: a few crews at once, the rest waiting their turn.
export function stepWorksDay(state, world) {
  const cfg = C(world);
  if (!cfg) return;
  let crews = repairCrews(state, world);
  for (const [id, s] of Object.entries(state.settlements)) {
    if (!s.repair || s.occupier) continue;
    for (const [b, r] of Object.entries(s.repair)) {
      if (crews <= 0) break;
      crews -= 1;
      // Prison gangs (M26) mend twice as fast.
      r.daysLeft -= 1 + bookEffect(state, world, 'repairSpeed');
      if (r.daysLeft > 0) continue;
      s.cond[b] = Math.max(condOf(s, b), r.to);
      if (r.kind === 'patch') (s.patched ??= {})[b] = true;
      else {
        if (s.patched) delete s.patched[b];
        if (s.worn) delete s.worn[b];
      }
      delete s.repair[b];
      if (r.to >= 100 && s.cond) delete s.cond[b];
      if (state.reign) state.reign.built += 1;
      if (!r.quiet) say(state, `The ${world.buildings[b].name.toLowerCase()} at ${world.byId[id].name} is ${r.kind === 'rebuild' ? 'whole again' : 'patched up and working'}.`);
    }
  }
  // Repair questions the crown never answered: the works is left. The
  // month's dear repairs, unanswered, are mended as far as the coin goes.
  const w = works(state);
  for (const d of [...w.decisions]) {
    if (state.day - d.day < cfg.decisionDays) continue;
    if (d.kind === 'batch') {
      if (resolveBatch(state, world, d, 0).error) {
        for (const q of d.items) if (!w.pending.some((p) => p.town === q.town && p.works === q.works)) w.pending.push({ town: q.town, works: q.works });
        w.decisions = w.decisions.filter((x) => x !== d);
      }
    } else leaveWorks(state, world, d.town, d.works);
  }
}

// How many repairs can go forward at once.
export function repairCrews(state, world) {
  // The Repairs share of the kingdom's hands, a crew at a time (M20 C).
  return state.labour?.crews ?? C(world)?.crews ?? 4;
}

// What the state of its works does to a place's mood: ruins it has to live
// with, and grudges from the times the crown left them so.
export function worksUnrest(world, s) {
  const cfg = C(world);
  if (!cfg) return 0;
  let ruined = 0;
  for (const b of s.buildings) if (condOf(s, b) < 25) ruined += 1;
  return Math.min(cfg.ruinUnrest * 2, ruined * cfg.ruinUnrest * 0.5) + (s.grudge ?? 0) * cfg.grudgeUnrest;
}

// The month's wear and weather, at home and abroad, and foreign rulers'
// own repairs.
export function monthlyWorks(state, world, rng) {
  const cfg = C(world);
  if (!cfg) return;
  const date = dateOf(state.day);
  const month = date.month;
  const places = [
    ...Object.entries(state.settlements).map(([id, s]) => ({ id, s, poor: !!state.unpaid })),
    ...Object.values(state.realms ?? {}).flatMap((r) => Object.entries(r.settlements).map(([id, s]) => ({ id, s, poor: r.treasury < 0 }))),
  ];
  for (const { id, s, poor } of places) {
    if (!s.buildings?.length) continue;
    s.grudge = (s.grudge ?? 0) * cfg.grudgeDecay;
    if (s.grudge < 0.1) delete s.grudge;
    // Everything wears with use, faster when no one pays to keep it.
    for (const b of s.buildings) {
      if (s.repair?.[b]) continue;
      const loss = cfg.wear + (poor ? cfg.unpaidWear : 0);
      const before = condOf(s, b);
      (s.cond ??= {})[b] = clamp(before - loss, 0, 100);
      if (before >= cfg.decideBelow && s.cond[b] < cfg.decideBelow) {
        (s.worn ??= {})[b] = { why: poor ? 'Gone to rack and ruin for want of upkeep' : 'Worn out with use', day: state.day };
        if (state.settlements[id]) askAbout(state, world, id, b);
      } else if (s.left?.[b] !== undefined && state.settlements[id]) askAbout(state, world, id, b);
    }
    // Winter storms on the water.
    if (cfg.storm.months.includes(month)) {
      for (const b of s.buildings) if (cfg.storm.works.includes(b) && rng.chance(cfg.storm.chance)) damageWorks(state, world, id, b, draw(rng, cfg.storm.amount), 'Battered by winter storms');
    }
    // Spring floods on the rivers.
    if (cfg.flood.months.includes(month) && (world.spaces?.[id] ?? []).some((sp) => sp.kind === 'river')) {
      for (const b of s.buildings) if (cfg.flood.works.includes(b) && rng.chance(cfg.flood.chance)) damageWorks(state, world, id, b, draw(rng, cfg.flood.amount), 'Swept by the spring flood');
    }
    // Fire in a crowded town square.
    const type = world.byId[id]?.type;
    if ((type === 'town' || type === 'city') && rng.chance(cfg.fire.chance)) {
      const square = (world.spaces?.[id] ?? []).find((sp) => sp.kind === 'square');
      damagePlace(state, world, rng, id, { count: 1, amount: cfg.fire.amount, why: 'Gutted by fire', pick: (b) => square?.works.includes(b) });
    }
    // A patch gives way under the strain of a hard winter.
    if (date.season === 'winter' && s.patched) {
      for (const b of Object.keys(s.patched)) {
        if (rng.chance(cfg.patch.failChance / 3)) {
          damageWorks(state, world, id, b, draw(rng, cfg.patch.failLoss), 'The patch gave way in the cold');
          if (state.settlements[id]) say(state, `The patched ${world.buildings[b].name.toLowerCase()} at ${world.byId[id].name} has given way again.`);
        }
      }
    }
  }
  abroadRepairs(state, world);
  runRepairOrder(state, world);
}

// Foreign rulers mend what they can afford, the worst first.
function abroadRepairs(state, world) {
  const a = C(world).abroad;
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    if (realm.fallen) continue;
    const list = [];
    for (const [id, s] of Object.entries(realm.settlements)) {
      if (ownerOf(state, world, id) !== rid) continue;
      for (const b of s.buildings) if (condOf(s, b) < a.repairBelow) list.push({ s, b, c: condOf(s, b) });
    }
    list.sort((x, y) => x.c - y.c);
    let budget = Math.max(0, realm.treasury - (realm.income ?? 0) * 2) * a.costShare;
    for (const { s, b, c } of list) {
      const gain = Math.min(100 - c, a.perMonth);
      const cost = (world.buildings[b].cost.coin ?? 0) * (gain / 100) * C(world).rebuild.coin;
      if (cost > budget) break;
      budget -= cost;
      realm.treasury -= cost;
      s.cond[b] = c + gain;
      if (s.cond[b] >= 100) delete s.cond[b];
    }
  }
}

function draw(rng, [lo, hi]) {
  return lo + rng.next() * (hi - lo);
}

// The whole realm's works at a glance: how many stand, how many are worn,
// and the realm's mean condition, for the cards and the tools.
export function worksSummary(s) {
  let n = 0;
  let sum = 0;
  let worn = 0;
  let ruined = 0;
  for (const b of s.buildings) {
    const c = condOf(s, b);
    n += 1;
    sum += c;
    if (c < 70) worn += 1;
    if (c < 25) ruined += 1;
  }
  return { n, mean: n ? sum / n : 100, worn, ruined };
}

export function defaultWorks() {
  return { decisions: [], nextId: 1, order: { ...DEFAULT_ORDER }, pending: [] };
}

// ---- Old saves ----

// v17 (M20): every place gets its spaces and their works. What a place had
// built under the old rules fills the space of its kind (a pasture on open
// ground takes the place of the fields), civic buildings join the town
// square, anything half built is finished, and what a sack burned (M19)
// stands again as a ruin to be mended. Occupied towns are worn.
export function upgradeWorks(state, world) {
  if (!world.spaces) return state;
  const fix = (id, s, realm) => {
    if (!s || !Array.isArray(s.buildings)) return;
    const had = [...s.buildings];
    if (s.construction?.building) had.push(s.construction.building);
    s.construction = null;
    const start = startingWorks(world, id, realm);
    const spaces = world.spaces[id] ?? [];
    const out = [...start.buildings];
    for (const b of had) {
      if (!world.buildings[b] || out.includes(b)) continue;
      const kind = spaceKindOf(world, b);
      const sp = spaces.find((x) => x.kind === kind && kind !== 'square' && kind !== 'defences');
      // It takes the place of whatever the land would have put there.
      const replaced = sp?.works.find((w) => out.includes(w) && !had.includes(w));
      if (replaced) out.splice(out.indexOf(replaced), 1, b);
      else out.push(b);
    }
    s.buildings = out;
    s.cond = { ...start.cond, ...(s.cond ?? {}) };
    s.worn = { ...start.worn, ...(s.worn ?? {}) };
    for (const b of s.damaged ?? []) {
      if (!s.buildings.includes(b)) s.buildings.push(b);
      s.cond[b] = 15;
      s.worn[b] = { why: 'Burned in the sack', day: state.day };
    }
    delete s.damaged;
    if (s.occupier || s.owner) for (const b of s.buildings) if ((s.cond[b] ?? 100) > 75) { s.cond[b] = 75; s.worn[b] = { why: 'Worn under occupation', day: state.day }; }
    if (!Object.keys(s.cond).length) delete s.cond;
    if (!Object.keys(s.worn).length) delete s.worn;
  };
  for (const [id, s] of Object.entries(state.settlements)) fix(id, s, TEMERIA);
  for (const [rid, realm] of Object.entries(state.realms ?? {})) for (const [id, s] of Object.entries(realm.settlements)) fix(id, s, rid);
  state.works = defaultWorks();
  return state;
}
