// Plays whole v2 reigns with the AI as Temeria's steward, and prints how
// each ends: node tools/v2play.mjs [seeds] [idle]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTable } from '../v2/src/engine/load.js';
import { createGame, endTurn, stewardTurn, answerStoryCard, dateOf, controller } from '../v2/src/engine/game.js';
import { answerDilemma } from '../v2/src/engine/game.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const table = await loadTable(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
const seeds = Number(process.argv[2] ?? 8);
const idle = process.argv[3] === 'idle';
const tally = {};
for (let seed = 1; seed <= seeds; seed++) {
  const s = createGame(table, { seed });
  while (!s.over) {
    if (!idle) stewardTurn(s, table);
    if (s.dilemma) answerDilemma(s, table, 0);
    endTurn(s, table);
    if (s.story.choice) answerStoryCard(s, table, 0);
    s.story.told = null;
  }
  const d = dateOf(table, s.turn);
  const e = s.over.ending;
  const t = s.realms.temeria;
  const own = Object.values(s.cities).filter((c) => c.owner === 'temeria').length;
  tally[e.title] = (tally[e.title] ?? 0) + 1;
  console.log(`${String(seed).padStart(2)} ${d.year}-${String(d.month).padStart(2)} ${e.title.padEnd(26)} fate: ${e.fate.key.padEnd(7)} Temeria: ${own} cities, ${t.goals.length} goals, ${Math.round(t.treasury)} crowns, love ${Math.round(t.love)} | capitals ${['vizima', 'tretogor', 'ard_carraigh', 'vengerberg'].map((id) => controller(s, id).slice(0, 4)).join(' ')}`);
}
console.log(tally);
