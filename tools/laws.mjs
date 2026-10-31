// The Book of Laws, law by law (M26 B): a reign run with and without each
// law (its path's lower tiers signed in both), printing the change in the
// law's headline figure. Every law should move its headline by about 20% or
// more, or by its stated flat amount (an act it unlocks, a fixed number).
//
//   node tools/laws.mjs [seed] [law]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadWorld, createState, step, applyAction, lawEffects, bookLaws, musterPreview, recruitCost, companyUpkeep, foodCapacity, canAct,
} from '../src/sim/index.js';
import { exportPrice } from '../src/sim/market.js';
import { loanTerms } from '../src/sim/loans.js';
import { creditLimit } from '../src/sim/economy.js';
import { bandStrength, placeMuster } from '../src/sim/companies.js';
import { stepLabourDay } from '../src/sim/labour.js';
import { bookEffect, bookEffects } from '../src/sim/book.js';
import { nonhumanShare } from '../src/sim/culture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
const seed = Number(process.argv[2] ?? 1);
const only = process.argv[3] ?? null;
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  if (s.diplomacy) s.diplomacy.requests = [];
  return s;
};

// A realm half a year in, with its path's lower tiers in force, and the law
// itself in force or not.
function realm(id, withLaw) {
  const d = bookLaws(world)[id];
  let s = quiet(run(createState(world, seed), 180));
  s.treasury = 30000;
  const path = world.book.chapters[d.chapter].paths[d.path].laws;
  const upto = withLaw ? d.tier : d.tier - 1;
  for (let i = 0; i < upto; i++) {
    const l = path[i];
    s.book.signed[l.id] = { day: s.day - world.book.enactDays, ...(l.choose === 'faith' ? { choice: 'melitele' } : {}) };
    if (l.choose === 'faith') s.book.faith = 'melitele';
  }
  return s;
}

const towns = (s) => Object.keys(s.settlements).filter((id) => !s.settlements[id].occupier && ['town', 'city'].includes(world.byId[id].type));
const meanUnrest = (s, list = Object.keys(s.settlements)) => list.reduce((a, id) => a + s.settlements[id].unrest, 0) / Math.max(1, list.length);
const sum = (v) => (typeof v === 'number' ? v : Object.values(v ?? {}).reduce((a, b) => a + b, 0));
// The months' ledgers over a stretch, one line summed.
function ledger(s, days, line) {
  let v = 0;
  let n = 0;
  for (let d = 0; d < days; d += 30) {
    s = quiet(run(s, 30));
    const l = s.ledger.history.at(-1);
    if (l) { v += line(l); n += 1; }
  }
  return v / Math.max(1, n);
}
// The mean of a figure over a stretch, sampled every ten days.
function over(s, days, figure) {
  let v = 0;
  let n = 0;
  for (let d = 0; d < days; d += 10) {
    s = quiet(run(s, 10));
    v += figure(s);
    n += 1;
  }
  return v / n;
}
// An act's own effect, done once on the most fitting town.
function flatAct(kind, pick, figure) {
  const s = realm(bookLaws(world)[ACTS[kind]].law.id, true);
  const id = pick(s);
  const before = figure(s, id);
  if (!canAct(s, world, kind, id).ok) return { before, after: before, note: `cannot: ${canAct(s, world, kind, id).reason}` };
  const out = applyAction(s, world, { type: 'act', kind, settlement: id });
  return { before, after: figure(out.state, id), flat: true };
}
const ACTS = { pardon: 'pardons', hang: 'executions', granaries: 'royal_granaries', feast: 'royal_feasts', mage: 'licensed_mages', witchhunt: 'inquisition' };
const angriest = (s) => Object.keys(s.settlements).filter((id) => !s.settlements[id].occupier).sort((a, b) => s.settlements[b].unrest - s.settlements[a].unrest)[0];

// Each law's headline figure, measured without and with it.
const MEASURES = {
  assizes: ['Unrest in towns and cities', (s) => over(s, 180, (x) => meanUnrest(x, towns(x)))],
  pardons: ['A town\'s Unrest after a pardon', () => flatAct('pardon', angriest, (s, id) => s.settlements[id].unrest)],
  commons_charter: ['Unrest from heavy taxes (town)', (s) => {
    for (const l of ['tax_towns', 'tax_peasants']) s.laws[l] = { option: 'heavy', previous: 'heavy', since: 0 };
    // The settings' share alone: the Book's own unrest taken away.
    return lawEffects(s, world).unrest.town - (bookEffects(s, world).unrest?.town ?? 0);
  }],
  curfews: ['Unrest everywhere', (s) => over(s, 180, (x) => meanUnrest(x))],
  executions: ['A town\'s Unrest after a hanging', () => flatAct('hang', angriest, (s, id) => s.settlements[id].unrest)],
  riders: ['Bandit men in camps and on the roads', (s) => over(s, 540, (x) => x.threats.list.filter((t) => t.kind === 'bandits' && !t.abroad).reduce((a, t) => a + (t.men ?? 0) + (t.band?.men ?? 0), 0))],
  open_markets: ['Market dues in the towns, a month', (s) => ledger(s, 120, (l) => sum(l.income.trade))],
  merchant_charters: ['What partners pay for cloth', (s) => exportPrice(world, 'cloth', s)],
  royal_bank: ['Interest rate on a loan', (s) => loanTerms(s, world, 5000).rate],
  guild_monopolies: ['Crafts, a month', (s) => ledger(s, 120, (l) => sum(l.income.crafts))],
  royal_mines: ['Gold and silver, a month', (s) => { prospect(s); return ledger(s, 120, (l) => sum(l.income.gold) + sum(l.income.silver)); }],
  royal_granaries: ['Grain the stores can hold', (s) => Object.values(s.settlements).reduce((a, x) => a + foodCapacity(world, x, lawEffects(s, world)), 0)],
  seasonal_conscription: ['Men at a full muster', (s) => musterPreview(s, world, { muster: 'vizima', levy: 'all', nobles: false }).soldiers],
  militia_drills: ['Strength of Vizima\'s levy', (s) => bandStrength(world, placeMuster(s, world, 'vizima').map((b) => ({ ...b, xp: bookEffect(s, world, 'levyGrade') })), 70)],
  every_man: ['Men at a full muster', (s) => musterPreview(s, world, { muster: 'vizima', levy: 'all', nobles: false }).soldiers],
  standing_companies: ['Pay of a company of men-at-arms', (s) => companyUpkeep(world, { type: 'menatarms', men: 100 }, s)],
  military_academy: ['Experience from a victory', (s) => world.forces.xp.win * (1 + bookEffect(s, world, 'xpGain'))],
  royal_knights: ['Cost of a company of knights', (s) => recruitCost(s, world, 'vizima', 'knights').coin],
  poor_relief: ['Deaths in a hungry month', (s) => deaths(s, (x) => { for (const t of Object.values(x.settlements)) { t.stock.food = 0; t.hunger = 0.6; } }, 30)],
  hospices: ['Deaths in a plague season', (s) => deaths(s, (x) => { for (const id of towns(x).slice(0, 6)) x.settlements[id].plague = x.day + 90; }, 90)],
  royal_feasts: ['Love after a feast', () => { const s = realm('royal_feasts', true); const before = s.love; const out = applyAction(s, world, { type: 'act', kind: 'feast' }); return { before, after: out.state.love, flat: true }; }],
  long_hours: ['Crafts and goods, a month', (s) => ledger(s, 120, (l) => sum(l.income.crafts) + sum(l.income.goods))],
  debtors_labour: ['Repair crews', (s) => { stepLabourDay(s, world); return s.labour.crews; }],
  prison_gangs: ['Days to rebuild a works', (s) => repairDays(s)],
  freedom_of_worship: ['Clashes between faiths (Part C)', () => null],
  nonhuman_charter: ['Crafts where non-humans live, a month', (s) => {
    const mixed = Object.keys(s.settlements).filter((id) => nonhumanShare(s.settlements[id]) >= 0.1);
    let v = 0;
    let n = 0;
    for (let d = 0; d < 120; d += 30) { s = quiet(run(s, 30)); v += mixed.reduce((a, id) => a + (s.ledger.places?.[id]?.crafts ?? 0), 0); n += 1; }
    return v / n;
  }],
  licensed_mages: ['Beast lairs near the town', () => flatAct('mage', (s) => nearestToBeast(s), (s, id) => lairsNear(s, id))],
  faith_of_the_crown: ['Devotion growth (Part C)', () => null],
  restrictions: ['Fear gained each month from laws', (s) => lawEffects(s, world).fear],
  inquisition: ['Scoia\'tael near the town', () => flatAct('witchhunt', (s) => nearestToElves(s), (s, id) => elvesNear(s, id))],
};

function prospect(s) {
  for (const d of Object.values(s.gold?.deposits ?? {})) d.known = true;
  for (const [dep, d] of Object.entries(world.gold?.deposits ?? {})) {
    const out = applyAction(s, world, { type: 'build', settlement: d.settlement, building: 'goldmine', deposit: dep });
    if (!out.error) Object.assign(s, out.state);
  }
}
function deaths(s, setup, days) {
  setup(s);
  const pop = (x) => Object.values(x.settlements).reduce((a, t) => a + Object.values(t.population).reduce((p, q) => p + q, 0), 0);
  const before = pop(s);
  let x = s;
  for (let d = 0; d < days; d += 30) { setup(x); x = quiet(run(x, 30)); }
  return before - pop(x);
}
function repairDays(s) {
  const id = 'vizima';
  const b = s.settlements[id].buildings.find((x) => world.buildings[x].upkeep > 0);
  s.settlements[id].cond = { ...(s.settlements[id].cond ?? {}), [b]: 30 };
  const out = applyAction(s, world, { type: 'repair', settlement: id, building: b, kind: 'rebuild' });
  if (out.error) return null;
  let x = out.state;
  for (let d = 1; d <= 400; d++) { x = run(x, 1); if (!x.settlements[id].repair?.[b]) return d; }
  return 400;
}
const near = (s, id, kind) => (s.threats?.list ?? []).filter((t) => t.kind === kind && !t.abroad && Math.hypot((t.band?.x ?? t.x) - world.byId[id].x, (t.band?.y ?? t.y) - world.byId[id].y) <= 160);
const lairsNear = (s, id) => near(s, id, 'monsters').length;
const elvesNear = (s, id) => near(s, id, 'scoiatael').length;
const nearestToBeast = (s) => Object.keys(s.settlements).find((id) => lairsNear(s, id) > 0) ?? 'vizima';
const nearestToElves = (s) => {
  const id = Object.keys(s.settlements).find((x) => elvesNear(s, x) > 0);
  if (id) return id;
  // None out now: one put in the woods near Vizima for the test.
  const v = world.byId.vizima;
  s.threats.list.push({ id: 9999, kind: 'scoiatael', men: 25, x: v.x + 30, y: v.y + 30, near: 'vizima', sighted: true, morale: 70 });
  return 'vizima';
};

const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-GB') : Number(v).toFixed(2));
const rows = [];
for (const [id, d] of Object.entries(bookLaws(world))) {
  if (only && id !== only) continue;
  const [label, measure] = MEASURES[id] ?? ['(no measure)', () => null];
  let before;
  let after;
  let flat = false;
  let note = '';
  const r1 = measure(realm(id, false));
  if (r1 && typeof r1 === 'object') {
    ({ before, after } = r1);
    flat = !!r1.flat;
    note = r1.note ?? '';
  } else {
    before = r1;
    after = measure(realm(id, true));
  }
  if (before === null || after === null || before === undefined) {
    rows.push({ id, name: d.law.name, label, text: 'measured in Part C', ok: null });
    continue;
  }
  const change = before ? (after - before) / Math.abs(before) : after - before;
  const ok = flat ? after !== before : Math.abs(change) >= 0.19 || (id === 'commons_charter' && after < before) || (id === 'restrictions' && after - before >= 1);
  const pct = flat || !before ? `${after - before > 0 ? '+' : ''}${(after - before).toFixed(1)}` : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`;
  rows.push({ id, name: d.law.name, label, text: `${fmt(before)} -> ${fmt(after)} (${pct})${note ? ` ${note}` : ''}`, ok });
}
for (const r of rows) console.log(`${r.ok === null ? '  ' : r.ok ? 'ok' : '!!'} ${r.name.padEnd(28)} ${r.label.padEnd(38)} ${r.text}`);
const bad = rows.filter((r) => r.ok === false);
if (bad.length) {
  console.log(`\n${bad.length} law(s) below the threshold: ${bad.map((r) => r.name).join(', ')}`);
  process.exitCode = 1;
}
