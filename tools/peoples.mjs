// Faiths and peoples over a long reign (M32 E): the tolerant, middle and
// harsh crowns side by side. For each: the crafts, Fear, riots and pogroms,
// the Scoia'tael's recruits and commandos, the cult in hard times and the
// Great Sun's spread with the Empire.
//
//   node tools/peoples.mjs [years] [seeds]     e.g. node tools/peoples.mjs 30 3
import { nodeWorld } from '../test/helpers.js';
import { createState, step, realmFaith } from '../src/sim/index.js';
import { makeCrowns } from './crowns.mjs';
import { plagueActive } from '../src/sim/military.js';

const world = await nodeWorld();
const crowns = makeCrowns(world);
const KINDS = { tolerant: crowns.tolerant, middle: crowns.steward, harsh: crowns.tyrant };

const sumOf = (v) => (typeof v === 'number' ? v : Object.values(v ?? {}).reduce((a, b) => a + b, 0));

export function reign(world, kind, years, seed) {
  const crown = KINDS[kind];
  let s = createState(world, seed);
  const out = { crafts: 0, fear: 0, commandos: new Set(), cultHard: 0, cultEasy: 0, hardMonths: 0, easyMonths: 0, sunStart: realmFaith(s).great_sun ?? 0, sunAtWar: null };
  const months = years * 12;
  for (let m = 0; m < months; m++) {
    s = crown(s, m, true);
    s = step(s, 30, world, { ambient: false });
    const l = s.ledger.history.at(-1);
    out.crafts += sumOf(l?.income?.crafts) / months;
    out.fear += s.fear / months;
    for (const t of s.threats.list) if (t.kind === 'scoiatael' && !t.abroad) out.commandos.add(t.id);
    // The cult in hard months (famine or plague somewhere) and in easy ones.
    const hard = Object.values(s.settlements).some((t) => !t.occupier && ((t.hunger ?? 0) > 0.15 || plagueActive(s, t)));
    const cult = Object.values(s.cult?.towns ?? {}).reduce((a, b) => a + b, 0);
    if (hard) { out.cultHard += cult; out.hardMonths += 1; } else { out.cultEasy += cult; out.easyMonths += 1; }
    if (out.sunAtWar === null && s.nilfgaard?.stage === 'war') out.sunAtWar = realmFaith(s).great_sun ?? 0;
  }
  return {
    crafts: out.crafts,
    fear: out.fear,
    pogroms: s.reign?.pogroms ?? 0,
    riots: s.reign?.riots ?? 0,
    recruits: Object.values(s.scoiatael?.from ?? {}).reduce((a, b) => a + b, 0),
    commandos: out.commandos.size,
    cultHard: out.hardMonths ? out.cultHard / out.hardMonths : 0,
    cultEasy: out.easyMonths ? out.cultEasy / out.easyMonths : 0,
    sunStart: out.sunStart,
    sunEnd: realmFaith(s).great_sun ?? 0,
    stage: s.nilfgaard?.stage ?? 'none',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const years = Number(process.argv[2] ?? 30);
  const seeds = Number(process.argv[3] ?? 3);
  console.log(`${years} years, seeds 1 to ${seeds}, averaged.`);
  console.log('crown     crafts/mo  fear  pogroms  riots  recruits  commandos  cult(hard/easy)  Great Sun % start>end  clock');
  for (const kind of Object.keys(KINDS)) {
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) runs.push(reign(world, kind, years, seed));
    const avg = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
    const f = (v, d = 0) => v.toFixed(d).padStart(8);
    console.log(`${kind.padEnd(9)} ${f(avg('crafts'))} ${f(avg('fear'), 1)} ${f(avg('pogroms'), 1)} ${f(avg('riots'), 1)} ${f(avg('recruits'))} ${f(avg('commandos'), 1)}   ${avg('cultHard').toFixed(0)}/${avg('cultEasy').toFixed(0)}          ${avg('sunStart').toFixed(1)}>${avg('sunEnd').toFixed(1)}      ${runs.map((r) => r.stage).join(',')}`);
  }
}
