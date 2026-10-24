// Compares every law option against the customary laws over a run of years,
// so no option is a free win. Each row decrees one option on day one (free of
// cost) and reports the difference from doing nothing.
// Usage: node tools/lawbalance.mjs [years] [seed]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, createState, step, totalPopulation, ledgerNet } from '../src/sim/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [years = 5, seed = 1] = process.argv.slice(2).map(Number);
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));

function run(lawId, optionId) {
  let s = createState(world, seed);
  if (lawId) {
    s.laws[lawId] = { option: optionId, previous: s.laws[lawId].option, since: s.day };
  }
  let net = 0;
  let stab = 0;
  const months = years * 12;
  for (let m = 0; m < months; m++) {
    s = step(s, 30, world, { ambient: false });
    const l = s.ledger.history.at(-1);
    if (l) net += ledgerNet(l).net;
    stab += s.stability;
  }
  const pop = Object.values(s.settlements).reduce((a, st) => a + totalPopulation(st), 0);
  const soldiers = Object.values(s.settlements).reduce((a, st) => a + st.garrison, 0);
  return { net: net / months, stab: stab / months, pop, auth: s.authority, soldiers, opinion: s.opinion };
}

const base = run();
const f = (v, d = 0) => (v >= 0 ? '+' : '') + v.toFixed(d);
console.log(`baseline: net ${base.net.toFixed(0)}/mo, stability ${base.stab.toFixed(1)}, pop ${base.pop}, authority ${base.auth.toFixed(0)}, soldiers ${base.soldiers}`);
console.log('law / option'.padEnd(34), 'net/mo  stab   pop    auth  soldiers');
for (const [id, law] of Object.entries(world.laws.laws)) {
  for (const opt of Object.keys(law.options)) {
    if (opt === law.default) continue;
    const r = run(id, opt);
    console.log(`${id}/${opt}`.padEnd(34), f(r.net - base.net).padStart(6), f(r.stab - base.stab, 1).padStart(6), f(r.pop - base.pop).padStart(6), f(r.auth - base.auth).padStart(6), f(r.soldiers - base.soldiers).padStart(8));
  }
}
