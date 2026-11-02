// A town's non-human quarter on its card (M32 B): who lives there, how they
// regard the crown and their neighbours, the pogrom risk and what drives it.
import { quarterOf, dateOf } from '../sim/index.js';
import { escapeHtml, number } from './format.js';

const signed = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
const pct = (r) => (r <= 0 ? 'none this month' : r < 0.01 ? 'under 1% a month' : `${Math.round(r * 100)}% a month`);

const PLURAL = { dwarf: 'dwarves', elf: 'elves', halfling: 'halflings', gnome: 'gnomes' };

function peoplesLine(lookups, q) {
  const names = q.peoples.map((x) => `${number(x.n)} ${lookups?.peoples?.[x.people]?.plural ?? PLURAL[x.people] ?? x.people}`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${list} (${Math.round(q.share * 100)}% of the town)`;
}

export function pogromStain(q) {
  if (!q?.pogrom) return '';
  const d = dateOf(q.pogrom.pogrom);
  return `The pogrom of ${d.season} ${d.year} is remembered: ${number(q.pogrom.dead)} dead, ${number(q.pogrom.lost - q.pogrom.dead)} fled.`;
}

export function quarterHtml(app, id) {
  const { world, state, lookups } = app;
  const q = quarterOf(state, world, id);
  if (!q) return '';
  if (!q.total) return `<div data-part="quarter"><h3>The non-human quarter</h3><p class="sub down">Empty. ${escapeHtml(pogromStain(q))}</p></div>`;
  const factors = q.factors.slice(0, 6).map((f) => `<div><dt>${escapeHtml(f.why)}</dt><dd class="${f.v > 0 ? 'down' : 'up'}">${signed(f.v)}</dd></div>`).join('');
  return `<div data-part="quarter">
    <h3>The non-human quarter</h3>
    <p class="sub">${escapeHtml(peoplesLine(lookups, q))}</p>
    <dl class="ledger quarter-mood">
      <div><dt>Regards the crown</dt><dd>${escapeHtml(q.regardWord)}</dd></div>
      <div><dt>With its neighbours</dt><dd>${escapeHtml(q.neighboursWord)}</dd></div>
      <div data-part="pogrom-risk"><dt>Pogrom risk</dt><dd class="${q.warn ? 'down' : ''}">${pct(q.risk)}</dd></div>
    </dl>
    ${q.warn ? `<p class="sub down" data-part="pogrom-warning">The quarter bars its doors at dusk. Ease what drives it below, or a mob may go through it.</p>` : ''}
    ${q.pogrom ? `<p class="sub">${escapeHtml(pogromStain(q))}</p>` : ''}
    <details class="quarter-why"><summary>What stirs and calms the town</summary><dl class="ledger">${factors}</dl></details>
  </div>`;
}
