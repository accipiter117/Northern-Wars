// The wider North over the long run (M30 F): who holds Cintra and the
// Yaruga crossings, Kovir's purse and wars, Meve's wars, Angren's towns,
// Skellige's raids and the spheres of vassals, every five years.
//
//   node tools/widernorth.mjs [years] [seeds]     e.g. node tools/widernorth.mjs 30 1,2,3
import { nodeWorld } from '../test/helpers.js';
import { createState, step, suzerainOf } from '../src/sim/index.js';
import { ownerOf } from '../src/sim/conflict.js';

const years = Number(process.argv[2] ?? 30);
const seeds = (process.argv[3] ?? '1,2,3').split(',').map(Number);
const world = await nodeWorld();
const ANGREN = (world.base?.foreign ?? world.foreign).filter((t) => t.realm === 'angren').map((t) => t.id);
const short = (r) => (r ?? '-').slice(0, 4);

for (const seed of seeds) {
  let s = createState(world, seed);
  const started = {};
  const joined = {};
  const seen = new Set();
  let raids = 0;
  let angrenMoves = 0;
  let prevAngren = ANGREN.map((id) => ownerOf(s, world, id)).join();
  let prevSpheres = null;
  let shifts = 0;
  const yearRaids = [];
  let thisYear = 0;
  const startDay = s.day;
  console.log(`seed ${seed}: the clock presses from month ${Math.round((s.nilfgaard.pressureDay - startDay) / 30)}, war from month ${Math.round((s.nilfgaard.warDay - startDay) / 30)}`);
  for (let m = 1; m <= years * 12; m++) {
    const before = s.seas?.nextId ?? 1;
    s = step(s, 30, world, { ambient: false });
    const sent = (s.seas?.nextId ?? 1) - before;
    raids += sent;
    thisYear += sent;
    for (const w of s.wars ?? []) {
      const k = `w${w.id ?? w.start}`;
      if (!seen.has(k)) { seen.add(k); started[w.sides[0][0]] = (started[w.sides[0][0]] ?? 0) + 1; }
      for (const side of w.sides) for (const r of side) if (!seen.has(`${k}${r}`)) { seen.add(`${k}${r}`); joined[r] = (joined[r] ?? 0) + 1; }
    }
    const a = ANGREN.map((id) => ownerOf(s, world, id)).join();
    if (a !== prevAngren) { angrenMoves++; prevAngren = a; }
    const spheres = Object.keys(s.realms).map((r) => suzerainOf(s, r) ?? '').join();
    if (prevSpheres && spheres !== prevSpheres) shifts++;
    prevSpheres = spheres;
    if (m % 12 === 0) { yearRaids.push(thisYear); thisYear = 0; }
    if (m % 60 === 0) {
      const vassals = {};
      for (const r of Object.keys(s.realms)) { const l = suzerainOf(s, r); if (l) (vassals[l] ??= []).push(r); }
      console.log(`  year ${m / 12}: clock ${s.nilfgaard?.stage}; Cintra ${short(ownerOf(s, world, 'cintra_city'))}, Sodden ${short(ownerOf(s, world, 'sodden_keep'))}, Brugge ${short(ownerOf(s, world, 'brugge_city'))}, Mayena ${short(ownerOf(s, world, 'mayena'))}; Empire holds ${Object.keys(s.realms.nilfgaard?.settlements ?? {}).filter((id) => ownerOf(s, world, id) === 'nilfgaard').length + Object.keys(s.lands ?? {}).filter((id) => s.lands[id].realm === 'nilfgaard').length} towns, army ${Math.round(s.realms.nilfgaard?.army ?? 0)}; Kovir ${Math.round(s.realms.kovir.treasury)}; Angren free ${ANGREN.filter((id) => ownerOf(s, world, id) === 'angren').length}/${ANGREN.length}; vassals ${Object.entries(vassals).map(([l, v]) => `${short(l)}:${v.map(short).join('+')}`).join(' ')}`);
    }
  }
  console.log(`  wars started ${JSON.stringify(started)}; wars fought ${JSON.stringify(joined)}`);
  console.log(`  Skellige raids ${raids} (by year ${yearRaids.join(' ')}); Angren's towns changed hands ${angrenMoves} times; spheres shifted ${shifts} times`);
}
