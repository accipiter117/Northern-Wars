// Long-run balance: plays a reign for many years with a choice of crowns and
// prints how the realm stands each decade, to catch anything that runs away.
// Usage: node tools/longrun.mjs [years] [idle|steward|spendthrift|tyrant] [seeds]
//   e.g. node tools/longrun.mjs 30 steward 1,2,3
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadWorld, createState, step, applyAction, canBuild, canDecree, totalPopulation, ledgerNet, realmFaith,
  threatLevel, patrolCapacity, holdingsOf, warsOf, peaceTerms, crownArmies, canOpenRoute, routeValue,
} from '../src/sim/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [years = 30, mode = 'steward', seedList = '1,2,3'] = process.argv.slice(2);
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));

const act = (s, a) => {
  const out = applyAction(s, world, a);
  return out.error ? s : out.state;
};

// Answers every waiting decision: the steward takes the first (usually the
// generous) choice when it can afford it, otherwise the default.
function answer(s, generous) {
  for (const [list, type] of [['events', 'event'], ['demands', 'demand'], ['envoys', 'envoy'], ['petitions', 'petition']]) {
    for (const p of [...s[list]]) {
      const choice = generous && s.treasury > 1500 ? 0 : -1;
      if (choice >= 0) s = act(s, { type, id: p.id, choice });
    }
  }
  return s;
}

// A sensible crown at war: one army to hold the capital, peace on the best
// terms the enemy will take, and no part in other people's wars.
function warPolicy(s) {
  for (const d of [...s.warDecisions]) {
    const choice = d.kind === 'call' ? 1 : 0;
    s = act(s, { type: 'warDecision', id: d.id, choice });
  }
  const wars = warsOf(s, 'temeria');
  if (wars.length && !crownArmies(s).length) {
    s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: true, companies: 0, marshal: 'vestibor', stance: 'cautious' });
  }
  for (const w of wars) {
    for (const key of ['tribute', 'keep', 'white']) {
      const t = peaceTerms(s, world, w).list.find((x) => x.key === key);
      if (t.accept) { s = act(s, { type: 'peace', war: w.id, terms: key }); break; }
    }
  }
  if (!warsOf(s, 'temeria').length) for (const a of crownArmies(s)) s = act(s, { type: 'disband', army: a.id });
  return s;
}

const BUILD_ORDER = ['fields', 'mill', 'granary', 'goldmine', 'market', 'harbour', 'brewery', 'tannery', 'inn', 'walls', 'workshop', 'guildhall', 'shrine', 'hospice', 'lumber', 'quarry', 'mine'];

function steward(s, month, spend) {
  s = answer(s, true);
  s = warPolicy(s);
  // Open the most lucrative trade route the crown can, before building.
  if (month % 6 === 1 && s.treasury > 900) {
    const ends = world.geography.settlements.filter((x) => x.type === 'town' || x.type === 'city').map((x) => x.id);
    let best = null;
    for (const a of ends) for (const b of ends) {
      if (a >= b || !canOpenRoute(s, world, a, b).ok) continue;
      const v = routeValue(s, world, { from: a, to: b }).value;
      if (!best || v > best.v) best = { a, b, v };
    }
    if (best) s = act(s, { type: 'route', from: best.a, to: best.b });
  }
  for (let i = 0; i < (spend ? 3 : 1); i++) {
    let built = false;
    for (const b of BUILD_ORDER) {
      for (const st of world.geography.settlements) {
        const c = canBuild(s, world, st.id, b);
        if (c.ok && (spend || (!c.borrow && s.treasury > 1200))) { s = act(s, { type: 'build', settlement: st.id, building: b }); built = true; break; }
      }
      if (built) break;
    }
  }
  if (month === 2) {
    s = act(s, { type: 'law', law: 'bounties', option: 'witchers' });
  }
  if (month === 6 && canDecree(s, world, 'nonhumans', 'charter').ok) s = act(s, { type: 'law', law: 'nonhumans', option: 'charter' });
  // Patrol the most dangerous roads while soldiers allow.
  if (month % 12 === 3) {
    const worst = Object.keys(s.settlements)
      .map((id) => ({ id, t: Math.max(threatLevel(s, world, id, 'bandits'), threatLevel(s, world, id, 'monsters')) }))
      .sort((a, b) => b.t - a.t);
    for (const { id } of worst.slice(0, 4)) {
      if (s.patrols.length >= patrolCapacity(s, world)) break;
      const near = world.adjacency[id][0]?.to;
      if (near) s = act(s, { type: 'patrol', from: id, to: near });
    }
  }
  // Keep the lords sweet.
  for (const id of Object.keys(s.houses)) {
    if (s.houses[id].loyalty < 35) s = act(s, { type: 'house', house: id, kind: 'honours' });
  }
  return s;
}

function tyrant(s, month) {
  s = answer(s, false);
  const laws = [['taxation', 'heavy'], ['noble_privilege', 'taxed'], ['public_order', 'martial'], ['patronage', 'eternal_fire'], ['nonhumans', 'expulsion'], ['court', 'frugal']];
  const [law, option] = laws[month % laws.length];
  s = act(s, { type: 'law', law, option });
  for (const id of Object.keys(s.houses)) if (month % 12 === 0) s = act(s, { type: 'house', house: id, kind: 'fine' });
  return s;
}

function report(s, label, totals) {
  const pop = Object.values(s.settlements).reduce((a, st) => a + totalPopulation(st), 0);
  const f = realmFaith(s);
  const loyalty = Object.values(s.houses).reduce((a, h) => a + h.loyalty, 0) / Object.keys(s.houses).length;
  const lands = Object.keys(s.houses).map((id) => holdingsOf(s, id).length).join('/');
  const last = s.ledger.history.at(-1);
  console.log(`${label.padEnd(10)} pop ${String(pop).padStart(6)} treasury ${String(Math.round(s.treasury)).padStart(7)} net ${String(last ? ledgerNet(last).net : 0).padStart(5)}`
    + ` auth ${s.authority.toFixed(0).padStart(3)} stab ${s.stability.toFixed(0)} loyalty ${loyalty.toFixed(0)} lands ${lands} sympathy ${s.sympathy.toFixed(0)}`
    + ` routes ${s.routes.length} gold ${Math.round(last?.income.gold ?? 0)} wars ${totals.wars} lost ${Object.values(s.settlements).filter((x) => x.occupier).length}`
    + ` faith F/M/O ${f.eternal_fire.toFixed(0)}/${f.melitele.toFixed(0)}/${f.old_ways.toFixed(0)} built ${totals.built} riots ${totals.riots} raids ${totals.raids} rebellions ${totals.rebels} deposed ${s.depositions.length}`);
}

for (const seed of seedList.split(',').map(Number)) {
  let s = createState(world, seed);
  const totals = { built: 0, riots: 0, raids: 0, rebels: 0, wars: 0 };
  let seenDay = s.day;
  console.log(`--- ${mode}, seed ${seed}`);
  report(s, 'start', totals);
  for (let m = 0; m < years * 12; m++) {
    if (mode === 'steward') s = steward(s, m, false);
    if (mode === 'spendthrift') s = steward(s, m, true);
    if (mode === 'tyrant') s = tyrant(s, m);
    if (mode === 'idle') s = answer(s, false);
    s = step(s, 30, world, { ambient: false });
    // Count by date: the chronicle is capped, so its length stops growing.
    for (const d of s.chronicle.filter((x) => x.day > seenDay)) {
      if (/is finished/.test(d.text)) totals.built++;
      if (/^(Riot|Pogrom)/.test(d.text)) totals.riots++;
      if (/^(Bandits fell|Something came|Scoia'tael on the road)/.test(d.text)) totals.raids++;
      if (/risen in rebellion|joins the rising/.test(d.text)) totals.rebels++;
      if (/^(Temeria is at war with|.* is at war with Temeria)/.test(d.text)) totals.wars++;
    }
    seenDay = s.day;
    if ((m + 1) % 120 === 0) report(s, `year ${(m + 1) / 12}`, totals);
  }
}
