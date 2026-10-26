// How the foreign realms govern over a long reign (M18): per realm per
// decade, posture shares, treasury against income, the standing army,
// buildings raised, wars with their aims and outcomes, towns held, pacts
// signed and broken, and probes against Temeria; then the M18 targets.
// Usage: node tools/realms.mjs [years] [steward|idle] [seeds] [quiet]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, createState, step, ownerOf } from '../src/sim/index.js';
import { makeCrowns } from './crowns.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const years = Number(args[0] ?? 30);
const crown = args[1] ?? 'steward';
const seeds = (args[2] ?? '1,2,3,4').split(',').map(Number);
const quiet = args[3] === 'quiet';
const world = await loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
const crowns = makeCrowns(world);
const BASIC = new Set(['fields', 'mill', 'granary', 'walls', 'shrine', 'lumber', 'quarry', 'mine']);
const realms = Object.keys(world.realms.realms);
const pct = (n, d) => `${Math.round((100 * n) / Math.max(1, d))}%`;

const totals = { conquest: [], maxMonths: 0, changedBy30: 0, probesPerDecade: [], invasions: [], idleLost: 0, signBreakPerDecade: [], maxFloorRun: 0, newKinds: new Set() };

for (const seed of seeds) {
  let s = createState(world, seed);
  const start = Object.fromEntries(realms.map((r) => [r, (world.foreignByRealm[r] ?? []).length]));
  const crownStart = Object.keys(s.settlements).length;
  const posture = {};
  const floorRun = {};
  const maxFloor = {};
  let seen = new Map(s.diplomacy.treaties.map((t) => [t.id, t]));
  let signs = 0;
  let breaks = 0;
  let kinds = {};
  const wars = new Map();
  const invaded = new Set();
  let probes0 = 0;
  for (let m = 0; m < years * 12; m++) {
    s = step(s, 30, world, { ambient: false });
    if (crown === 'steward') s = crowns.steward(s, m, false);
    else s = crowns.answer(s, false);
    for (const r of realms) {
      const k = s.realms[r].posture?.kind ?? 'none';
      ((posture[r] ??= {})[k] = (posture[r][k] ?? 0) + 1);
      if (s.realms[r].treasury <= world.realms.economy.debtFloor + 1) floorRun[r] = (floorRun[r] ?? 0) + 1;
      else floorRun[r] = 0;
      maxFloor[r] = Math.max(maxFloor[r] ?? 0, floorRun[r]);
    }
    // Pacts between foreign realms: signed, and broken before their time.
    const now = new Map(s.diplomacy.treaties.map((t) => [t.id, t]));
    for (const [id, t] of now) if (!seen.has(id) && t.a !== 'temeria' && t.b !== 'temeria') { signs++; kinds[t.kind] = (kinds[t.kind] ?? 0) + 1; }
    for (const [id, t] of seen) if (!now.has(id) && t.a !== 'temeria' && t.b !== 'temeria' && t.until > s.day) breaks++;
    seen = now;
    for (const w of s.wars) {
      if (!wars.has(w.id)) wars.set(w.id, { sides: w.sides.map((x) => [...x]), aim: w.aims ? Object.values(w.aims)[0] : null, reason: w.reason ?? w.cause, since: s.day });
      if (w.sides[1][0] === 'temeria') invaded.add(w.id);
    }
    if (m % 120 === 119) {
      const decade = (m + 1) / 120;
      const probes = realms.reduce((a, r) => a + (s.realms[r].probes ?? 0), 0);
      totals.probesPerDecade.push(probes - probes0);
      probes0 = probes;
      totals.signBreakPerDecade.push(signs + breaks);
      if (!quiet) {
        console.log(`--- seed ${seed}, decade ${decade} (${crown}): foreign pacts signed ${signs} (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}), broken ${breaks}; probes on Temeria ${totals.probesPerDecade.at(-1)}`);
        for (const r of realms) {
          const x = s.realms[r];
          const shares = Object.entries(posture[r]).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, 120)}`).join(', ');
          const months = x.treasury / Math.max(1, x.income);
          const built = Object.values(x.settlements).flatMap((t) => t.buildings);
          const fresh = built.filter((b) => !BASIC.has(b));
          const held = (world.foreignByRealm[r] ?? []).filter((id) => ownerOf(s, world, id) === r).length + Object.keys(s.settlements).filter((id) => s.settlements[id].occupier === r).length;
          console.log(`  ${r.padEnd(9)} ${shares.padEnd(52)} treasury ${String(Math.round(x.treasury)).padStart(7)} (${months.toFixed(1)} months) army ${String(x.army ?? 0).padStart(5)} buildings ${built.length} (${fresh.length} beyond the basics: ${[...new Set(fresh)].slice(0, 6).join(' ')}) towns ${held}/${start[r]}${maxFloor[r] ? ` floor ${maxFloor[r]}m` : ''}`);
        }
      }
      for (const r of realms) {
        // A realm with almost nothing left (no towns, a few crowns of income)
        // makes the months meaningless; it is left out of the measure.
        if (s.realms[r].income >= 20) totals.maxMonths = Math.max(totals.maxMonths, s.realms[r].treasury / s.realms[r].income);
        for (const b of Object.values(s.realms[r].settlements).flatMap((t) => t.buildings)) if (!BASIC.has(b)) totals.newKinds.add(b);
      }
      for (const r of Object.keys(posture)) posture[r] = {};
      signs = 0;
      breaks = 0;
      kinds = {};
    }
  }
  const changed = s.warHistory.some((w) => (w.changed ?? []).some((c) => c.to !== 'temeria' && world.realmOf[c.id] && c.to !== world.realmOf[c.id]))
    || realms.some((r) => (world.foreignByRealm[r] ?? []).some((id) => ownerOf(s, world, id) !== r && ownerOf(s, world, id) !== 'temeria'));
  if (changed) totals.changedBy30++;
  // Conquest (M19): towns that changed realm for good, realms fallen, risings, a league.
  const lands = Object.values(s.lands ?? {});
  totals.conquest.push({
    ours: lands.filter((l) => l.realm === 'temeria').length,
    lost: Object.keys(s.lands ?? {}).filter((id) => !world.homeOf[id] && s.lands[id].realm !== 'temeria').length,
    abroad: Object.keys(s.lands ?? {}).filter((id) => world.homeOf[id] && s.lands[id].realm !== 'temeria').length,
    fallen: realms.filter((r) => s.realms[r].fallen).length,
    risings: s.chronicle.filter((c) => /rises( against|!)/.test(c.text)).length,
    league: s.chronicle.some((c) => /swear a league/.test(c.text)),
  });
  totals.invasions.push(invaded.size);
  if (Object.keys(s.settlements).filter((id) => !s.settlements[id].occupier).length < crownStart) totals.idleLost++;
  totals.maxFloorRun = Math.max(totals.maxFloorRun, ...Object.values(maxFloor));
  if (!quiet) {
    console.log(`  wars with aims (seed ${seed}):`);
    for (const h of s.warHistory) {
      const aim = h.aims ? Object.entries(h.aims).map(([side, town]) => `${side} wants ${world.byId[town]?.name}`).join('; ') : 'no aim';
      const outcome = (h.changed ?? []).length ? h.changed.map((c) => `${world.byId[c.id].name} to ${c.to}`).join(', ') : 'nothing changed hands';
      console.log(`    ${h.sides.map((x) => x.join('+')).join(' v ')}: ${aim}; reason ${h.reason ?? '?'}; ${outcome}`);
    }
  }
}

const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
console.log(`=== ${crown}, ${seeds.length} seeds, ${years} years`);
console.log(`highest treasury at a decade mark: ${totals.maxMonths.toFixed(1)} months of income (target 24 or fewer; realms earning under 20 a month left out)`);
console.log(`towns changed hands between foreign realms: ${totals.changedBy30} of ${seeds.length} seeds (target 3 of 4)`);
console.log(`probes on Temeria per decade: ${avg(totals.probesPerDecade).toFixed(1)} (lowest ${Math.min(...totals.probesPerDecade)}; target 1 or more for the steward)`);
console.log(`invasions of Temeria per reign: ${totals.invasions.join(', ')} (steward target 1 or fewer)`);
if (crown === 'idle') console.log(`reigns in which the crown lost towns: ${totals.idleLost} of ${seeds.length}`);
console.log(`foreign pact signings plus breaks per decade: ${avg(totals.signBreakPerDecade).toFixed(1)} (highest ${Math.max(...totals.signBreakPerDecade)}; target 10 or fewer)`);
console.log(`longest run at the debt floor: ${totals.maxFloorRun} months (target 24 or fewer)`);
console.log(`conquest at year ${years} (per seed): ${totals.conquest.map((c) => `ours ${c.ours}, lost ${c.lost}, between foreign realms ${c.abroad}, realms fallen ${c.fallen}, risings ${c.risings}${c.league ? ', a league' : ''}`).join(' | ')}`);
console.log(`buildings beyond the basics raised abroad: ${[...totals.newKinds].sort().join(', ')}`);
