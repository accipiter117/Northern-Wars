// The audit (M34): run a reign with the steward crown and print every line
// the realm keeps (income and expenses, resources, goods, labour, gold),
// with how often each changed anything. A line that is always 0 either
// should produce or should stay hidden until it does.
//
//   node tools/audit.mjs [years] [seed]     e.g. node tools/audit.mjs 10 1
import { nodeWorld } from '../test/helpers.js';
import { createState, step, monthlyOutput } from '../src/sim/index.js';
import { makeCrowns } from './crowns.mjs';

// What each kind of works should fill, as audit lines (M34 E). Works with
// none of these (walls, granaries, bathhouses) serve some other way and are
// not counted as producers.
export function worksLines(world, b) {
  const d = world.buildings[b];
  const fx = d.effects ?? {};
  const lines = [];
  if (fx.craft) lines.push(`income.crafts.${b}`);
  if (fx.foodYield) lines.push('output.grain');
  if (fx.goodsYield || d.orProduces) lines.push('output.materials', 'output.iron');
  if (fx.gold) lines.push('income.gold');
  if (fx.silver) lines.push('income.silver');
  if (fx.customs) lines.push('income.customs');
  const make = world.industry?.makers?.[b] ?? world.industry?.workers?.[b];
  if (make) lines.push(`income.goods.${make.good}`);
  if (b === 'quarter') lines.push('income.rents');
  if (b === 'hostel') lines.push('income.donations');
  if (b === 'tollbridge') lines.push('income.tolls');
  return lines;
}

const years = Number(process.argv[2] ?? 1);
const seed = Number(process.argv[3] ?? 1);
const world = await nodeWorld();
const crowns = makeCrowns(world);

export function audit(world, years, seed, crown = crowns.steward) {
  let s = createState(world, seed);
  const lines = {};
  const add = (key, v) => {
    const l = (lines[key] ??= { total: 0, months: 0 });
    l.total += v;
    if (Math.abs(v) >= 1) l.months += 1;
  };
  const flat = (prefix, o) => {
    for (const [k, v] of Object.entries(o ?? {})) {
      if (typeof v === 'number') add(`${prefix}.${k}`, v);
      else if (v && typeof v === 'object') flat(`${prefix}.${k}`, v);
    }
  };
  const labour = {};
  // Months each kind of works stood somewhere in the crown's own towns.
  const standing = {};
  let seen = null;
  for (let m = 0; m < years * 12; m++) {
    s = crown(s, m, true);
    s = step(s, 30, world, { ambient: false });
    const l = s.ledger.history.at(-1);
    if (l && l !== seen) {
      seen = l;
      flat('income', l.income);
      flat('expenses', l.expenses);
    }
    flat('output', monthlyOutput(s, world));
    for (const [k, r] of Object.entries(s.labour?.report ?? {})) {
      const x = (labour[k] ??= { hands: 0, need: 0, staffed: 0, idle: 0 });
      for (const f of Object.keys(x)) x[f] += (r[f] ?? 0) / (years * 12);
    }
    const stock = { food: 0, timber: 0, stone: 0, iron: 0 };
    const kinds = new Set();
    for (const t of Object.values(s.settlements)) {
      if (t.occupier) continue;
      for (const g of Object.keys(stock)) stock[g] += t.stock[g] ?? 0;
      for (const b of t.buildings) kinds.add(b);
    }
    for (const b of kinds) standing[b] = (standing[b] ?? 0) + 1;
    for (const [g, v] of Object.entries(stock)) {
      const x = (lines[`stock.${g}`] ??= { min: Infinity, max: -Infinity, last: 0 });
      x.min = Math.min(x.min, v);
      x.max = Math.max(x.max, v);
      x.last = v;
    }
  }
  return { s, lines, labour, standing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { s, lines, labour, standing } = audit(world, years, seed);
  console.log(`${years} year(s), seed ${seed}, the steward crown. Treasury ${Math.round(s.treasury)}.`);
  console.log('\nLine                                total      months that changed anything');
  for (const [k, l] of Object.entries(lines).sort()) {
    if (k.startsWith('stock.')) console.log(`${k.padEnd(34)} min ${Math.round(l.min)}, max ${Math.round(l.max)}, last ${Math.round(l.last)}`);
    else console.log(`${k.padEnd(34)} ${String(Math.round(l.total)).padStart(9)}  ${l.months}${l.months === 0 ? '   <- always 0' : ''}`);
  }
  console.log('\nLabour (a month on average)         hands     need    staffed   idle');
  for (const [k, x] of Object.entries(labour)) console.log(`${k.padEnd(34)} ${String(Math.round(x.hands)).padStart(6)} ${String(Math.round(x.need)).padStart(8)} ${String(Math.round(x.staffed)).padStart(9)} ${String(Math.round(x.idle)).padStart(6)}`);
  console.log('\nWorks that stood but filled none of their lines:');
  const idle = Object.keys(standing).filter((b) => worksLines(world, b).length && !worksLines(world, b).some((k) => (lines[k]?.total ?? 0) > 0));
  console.log(idle.length ? idle.join(', ') : 'none');
  const gold = Object.entries(s.gold?.deposits ?? {}).map(([id, d]) => `${id} ${d.known ? 'known' : 'hidden'}, ${Math.round(d.remaining)} left`).join('; ');
  console.log(`\nGold: ${gold}`);
}
