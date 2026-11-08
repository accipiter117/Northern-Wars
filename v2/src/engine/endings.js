// Endings and victories (v2 step 9): domination and faith end the game at
// once; otherwise the lore decides at the end of 1272, and the player's own
// fate is told beside it.
import { nameOf, controller } from './core.js';
import { faithShares, patronOf } from './laws.js';

const E = (table) => table.data.endings;

const capitals = (table) => Object.values(table.board.regions).filter((r) => r.capital && ['great', 'middle'].includes(table.tiers[r.realm])).map((r) => r.id);

// Domination or faith, checked every month. Returns an ending or null.
export function suddenEnding(state, table) {
  const e = E(table);
  const caps = capitals(table);
  for (const p of table.data.game.powers) {
    if (!state.realms[p]) continue;
    const held = caps.filter((id) => controller(state, id) === p).length;
    if (held >= Math.ceil(caps.length * e.domination.share)) return ending(state, table, 'domination', p);
  }
  // Faith: a patron faith rules enough of the cities; the power of that faith
  // with the most Devotion wins.
  if (table.data.laws) {
    const need = table.data.laws.faiths.victory.share;
    for (const [f, share] of Object.entries(faithShares(state))) {
      if (share < need) continue;
      const p = table.data.game.powers.filter((q) => state.realms[q] && patronOf(table, q) === f)
        .sort((a, b) => state.realms[b].devotion - state.realms[a].devotion)[0];
      if (p) return ending(state, table, 'faith', p);
    }
    return null;
  }
  for (const p of table.data.game.powers) {
    const d = state.realms[p]?.devotion ?? 0;
    if (d < e.faith.devotion) continue;
    if (table.data.game.powers.every((q) => q === p || (state.realms[q]?.devotion ?? 0) * e.faith.lead <= d)) return ending(state, table, 'faith', p);
  }
  return null;
}

// The lore's ending, at the end of the last month.
export function loreEnding(state, table) {
  const e = E(table);
  const held = (p) => e.northCapitals.filter((id) => controller(state, id) === p).length;
  if (held('nilfgaard') >= e.empire.capitals) return ending(state, table, 'empire', 'nilfgaard');
  const king = ['temeria', 'redania', 'kaedwen', 'aedirn'].find((p) => held(p) >= e.oneKing.capitals);
  if (king) return ending(state, table, 'oneKing', king);
  return ending(state, table, 'holds', null);
}

function ending(state, table, kind, winner) {
  const e = E(table);
  const t = e.texts[kind];
  const name = winner ? nameOf(table, winner) : '';
  const fill = (s) => s.replaceAll('{name}', name ? name[0].toUpperCase() + name.slice(1) : '').replaceAll('{faith}', e.faiths[winner] ?? '');
  return { kind, winner, title: fill(t.title), text: fill(t.text), fate: fateOf(state, table, kind, winner) };
}

// The player's own fate.
function fateOf(state, table, kind, winner) {
  const f = E(table).fate;
  const me = state.player;
  if (winner === me) return { key: 'won', text: f.won };
  const cap = Object.values(table.board.regions).find((r) => r.realm === me && r.capital)?.id;
  if (cap && controller(state, cap) !== me) return { key: 'fallen', text: f.fallen };
  if (kind === 'empire' || (kind === 'domination' && winner === 'nilfgaard')) return { key: 'vassal', text: f.vassal };
  return { key: 'free', text: f.free };
}
