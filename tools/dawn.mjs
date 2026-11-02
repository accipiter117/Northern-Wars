// The Dawn and the Road to War over a long reign (M33 D): a steward crown
// that finishes Foltest's path at a set month (fast, middling, slow), and
// when the First Northern War begins, how large the Emperor's host is by
// then, and how many of the North's crowns rally.
//
//   node tools/dawn.mjs [years] [seeds]     e.g. node tools/dawn.mjs 30 3
import { nodeWorld } from '../test/helpers.js';
import { createState, step, dateOf } from '../src/sim/index.js';
import { makeCrowns } from './crowns.mjs';
import { makeTreaty } from '../src/sim/diplomacy.js';

const world = await nodeWorld();
const crowns = makeCrowns(world);
export const SPEEDS = { fast: 12, middling: 24, slow: 48 };

// Foltest's path, finished by force at month `at`: the Dawn's places in
// order, Sodden, Brugge and Mahakam under the crown, a pact with Cintra.
function finishPath(s) {
  for (const p of Object.values(s.dawn.places)) { for (const c of Object.values(p.chains)) c.done ??= s.day; p.done ??= s.day; }
  s.dawn.done ??= s.day;
  for (const r of ['sodden', 'brugge', 'mahakam']) if (s.realms[r] && !s.realms[r].fallen) s.realms[r].suzerain = 'temeria';
  if (s.realms.cintra && !s.realms.cintra.fallen && !(s.diplomacy.treaties ?? []).some((t) => [t.a, t.b].includes('cintra') && [t.a, t.b].includes('temeria'))) makeTreaty(s, world, 'nonaggression', 'temeria', 'cintra');
}

const host = (s) => Math.round((s.realms.nilfgaard?.army ?? 0) + (s.armies ?? []).filter((a) => a.side === 'nilfgaard').reduce((t, a) => t + a.soldiers, 0));

export function run(world, at, years, seed) {
  let s = createState(world, seed);
  const out = { warMonth: null, warYear: null, host: null, boxesAtWar: null, rallied: 0, aside: 0, temeria: null };
  for (let m = 0; m < years * 12; m++) {
    if (m >= at) finishPath(s);
    s = crowns.steward(s, m, true);
    s = step(s, 30, world, { ambient: false });
    if (out.warMonth === null && s.road?.began != null) {
      out.warMonth = m + 1;
      out.warYear = dateOf(s.road.began).year;
      out.host = host(s);
    }
  }
  const calls = Object.entries(s.road?.calls ?? {}).filter(([r]) => r !== 'temeria');
  out.rallied = calls.filter(([, c]) => c.joined != null).length;
  out.aside = calls.filter(([, c]) => c.aside != null).length;
  out.temeria = s.road?.calls?.temeria ? (s.road.calls.temeria.joined != null ? 'joined' : 'aside') : null;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const years = Number(process.argv[2] ?? 30);
  const seeds = Number(process.argv[3] ?? 3);
  console.log(`${years} years, seeds 1 to ${seeds}. Path finished at month: fast 12, middling 24, slow 48.`);
  console.log('speed     seed  war (month, year)  imperial host  crowns rallied/aside  Temeria');
  for (const [name, at] of Object.entries(SPEEDS)) {
    for (let seed = 1; seed <= seeds; seed++) {
      const r = run(world, at, years, seed);
      console.log(`${name.padEnd(9)} ${String(seed).padStart(4)}  ${r.warMonth === null ? 'none'.padEnd(17) : `${r.warMonth}, ${r.warYear}`.padEnd(17)}  ${String(r.host ?? '-').padStart(13)}  ${`${r.rallied}/${r.aside}`.padStart(20)}  ${r.temeria ?? '-'}`);
    }
  }
}
