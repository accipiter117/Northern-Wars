// Runs the realm headless and prints a yearly summary, to judge balance.
// Usage: node tools/balance.mjs [years] [idle|builder|borrower] [seed]
// builder never borrows; borrower builds whenever the bankers allow.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, createState, step, formatDate, totalPopulation, realmStock, applyAction, canBuild, ledgerNet } from '../src/sim/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [years = 10, mode = 'idle', seed = 1] = process.argv.slice(2);
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));

// A plain builder: each month, raise the cheapest useful thing it can afford
// without borrowing, favouring food.
const PREFERENCE = ['fields', 'mill', 'granary', 'market', 'lumber', 'quarry', 'mine', 'shrine', 'workshop', 'walls'];
function builderTurn(state) {
  for (const b of PREFERENCE) {
    for (const s of world.geography.settlements) {
      const c = canBuild(state, world, s.id, b);
      if (c.ok && (mode === 'borrower' || !c.borrow)) return applyAction(state, world, { type: 'build', settlement: s.id, building: b }).state;
    }
  }
  return state;
}

function summary(s) {
  let pop = 0;
  let hungry = 0;
  let unrest = 0;
  let pros = 0;
  const n = Object.keys(s.settlements).length;
  for (const st of Object.values(s.settlements)) {
    pop += totalPopulation(st);
    if (st.hunger > 0.05) hungry++;
    unrest += st.unrest / n;
    pros += st.prosperity / n;
  }
  const stock = realmStock(s);
  const built = Object.values(s.settlements).reduce((a, st) => a + st.buildings.length, 0);
  const last = s.ledger.history.at(-1);
  const net = last ? ledgerNet(last).net : 0;
  return `${formatDate(s.day).padEnd(16)} pop ${String(pop).padStart(6)} food ${String(Math.round(stock.food)).padStart(7)} T/S/I ${Math.round(stock.timber)}/${Math.round(stock.stone)}/${Math.round(stock.iron)}`
    + ` treasury ${String(Math.round(s.treasury)).padStart(6)} net/mo ${String(net).padStart(5)} auth ${s.authority.toFixed(0)} stab ${s.stability.toFixed(0)} pros ${pros.toFixed(0)} unrest ${unrest.toFixed(0)} hungry ${hungry} built ${built}`;
}

let state = createState(world, Number(seed));
console.log(summary(state));
for (let m = 0; m < years * 12; m++) {
  if (mode !== 'idle') state = builderTurn(state);
  if (mode === 'borrower') state = builderTurn(builderTurn(state));
  state = step(state, 30, world, { ambient: false });
  if (process.env.MONTHLY || m % 12 === 11) console.log(summary(state));
}
