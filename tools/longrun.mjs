// Long-run balance: plays a reign for many years with a choice of crowns and
// prints how the realm stands each decade, to catch anything that runs away.
// Usage: node tools/longrun.mjs [years] [idle|steward|spendthrift|tyrant] [seeds] [ledger]
//   e.g. node tools/longrun.mjs 30 steward 1,2,3
// With `ledger` it also prints each year's ledger, line by line, averaged
// over the year (the last twelve months).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, createState, step, totalPopulation, ledgerNet, realmFaith, holdingsOf } from '../src/sim/index.js';
import { makeCrowns } from './crowns.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [years = 30, mode = 'steward', seedList = '1,2,3', showLedger] = process.argv.slice(2);
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));

const { answer, steward, tyrant } = makeCrowns(world);

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

// The year's ledger, averaged per month, as `line value` pairs.
function ledgerLine(s, label) {
  const h = s.ledger.history;
  const sum = {};
  const add = (k, v) => { if (v) sum[k] = (sum[k] ?? 0) + v / h.length; };
  for (const m of h) {
    for (const [k, v] of Object.entries(m.income)) {
      if (typeof v === 'number') add(`+${k}`, v);
      else for (const x of Object.values(v)) add(`+${k}`, x);
    }
    for (const [k, v] of Object.entries(m.expenses)) if (k !== 'construction' && k !== 'decrees') add(`-${k}`, v);
  }
  const net = h.reduce((a, m) => a + ledgerNet(m).net, 0) / h.length;
  const inc = h.reduce((a, m) => a + ledgerNet(m).in, 0) / h.length;
  console.log(`  ${label} in ${Math.round(inc)} net ${Math.round(net)}: ${Object.entries(sum).map(([k, v]) => `${k} ${Math.round(v)}`).join(' ')}`);
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
    if (showLedger && (m + 1) % 12 === 0) ledgerLine(s, `y${(m + 1) / 12}`);
    if ((m + 1) % 120 === 0) report(s, `year ${(m + 1) / 12}`, totals);
  }
}
