// Spies over the long run (M31 D): the great powers' networks every five
// years, their operations on each other and on Temeria, how many were found
// out, and the agents the crown's watch took.
//
//   node tools/spies.mjs [years] [seeds] [spymaster]   e.g. node tools/spies.mjs 30 1,2,3 yes
import { nodeWorld } from '../test/helpers.js';
import { createState, step } from '../src/sim/index.js';

const years = Number(process.argv[2] ?? 30);
const seeds = (process.argv[3] ?? '1,2,3').split(',').map(Number);
const withMaster = (process.argv[4] ?? 'no') === 'yes';
const world = await nodeWorld();
const OWNERS = ['nilfgaard', 'redania', 'aedirn', 'kaedwen'];
const NORTH = ['temeria', 'redania', 'kaedwen', 'aedirn', 'cintra', 'kovir'];
const avg = (row, keys) => Math.round(keys.filter((k) => row?.[k] !== undefined).reduce((a, k) => a + row[k], 0) / Math.max(1, keys.filter((k) => row?.[k] !== undefined).length));

for (const seed of seeds) {
  let s = createState(world, seed);
  if (withMaster) s.spycraft.spymaster = { id: 1, name: 'Test', from: 'a test', trait: 'loyal', skill: 55, since: s.day };
  console.log(`seed ${seed}${withMaster ? ' (with a loyal spymaster of skill 55)' : ''}: war on the clock from month ${Math.round((s.nilfgaard.warDay - s.day) / 30)}`);
  const caughtByYear = [];
  let lastCaught = 0;
  for (let m = 1; m <= years * 12; m++) {
    s = step(s, 30, world, { ambient: false });
    if (m % 12 === 0) { caughtByYear.push((s.spycraft.caught ?? 0) - lastCaught); lastCaught = s.spycraft.caught ?? 0; }
    if (m % 60 === 0) {
      const n = s.spycraft.nets;
      const line = OWNERS.filter((o) => n[o]).map((o) => `${o.slice(0, 4)} ${avg(n[o], NORTH.filter((r) => r !== o))}`).join(', ');
      console.log(`  year ${m / 12}: clock ${s.nilfgaard?.stage}; networks in the North's courts (mean): ${line}; the Empire in Cintra ${Math.round(n.nilfgaard?.cintra ?? 0)}, in Temeria ${Math.round(n.nilfgaard?.temeria ?? 0)}`);
    }
  }
  const log = s.spycraft.aiLog ?? {};
  console.log(`  operations on each other: ${Object.entries(log).map(([o, l]) => `${o} ${l.done} done (${['bribe', 'stir', 'sabotage', 'assassinate'].map((k) => l[k] ?? 0).join('/')}), ${l.exposed} found out`).join('; ') || 'none'}`);
  console.log(`  agents the crown's watch took: ${s.spycraft.caught ?? 0} (by year ${caughtByYear.join(' ')}); clues kept ${(s.spycraft.clues ?? []).length}`);
}
