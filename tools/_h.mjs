import { readFile } from 'node:fs/promises';
import { loadTable } from '../v2/src/engine/load.js';
import { createGame, endTurn, stewardTurn, answerStoryCard, answerDilemma } from '../v2/src/engine/game.js';
const table = await loadTable(async (p) => JSON.parse(await readFile(new URL('../' + p, import.meta.url), 'utf8')));
for (const [mode, tax] of [['steward', 'fair'], ['idle', 'fair'], ['idle', 'heavy']]) for (let seed = 1; seed <= 3; seed++) {
  const s = createGame(table, { seed }); s.realms.temeria.tax = tax;
  for (let i = 0; i < 24 && !s.over; i++) {
    if (mode === 'steward') stewardTurn(s, table);
    if (s.dilemma) answerDilemma(s, table, 0);
    endTurn(s, table); if (s.story.choice) answerStoryCard(s, table, 0); s.story.told = null;
  }
  const rises = s.log.filter((l) => /rises against the crown/.test(l.text)).length;
  console.log(mode, tax, seed, Object.entries(s.houses).map(([k, h]) => `${k.slice(0,4)} ${Math.round(h.loyalty)}${h.rebel ? 'R' : ''}`).join(' '), '| rises', rises, '| unrest', Math.round(s.realms.temeria.unrest), 'prod', Math.round(s.realms.temeria.production));
}
