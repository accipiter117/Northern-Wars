import { stewardReport, halfStaffed, canDecree, MONTHS } from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr } from './card.js';
import { EXPENSES, INCOME } from './menu.js';

// The Steward's report (M24 C): what came in last month, what went out,
// the net, and the three costs that weighed most, each with the one tap
// that would trim it. Shown at the top of the Decisions inbox and on the
// Treasury.

const signed = (n) => (n < 0 ? `−${number(-n)}` : `+${number(n)}`);
const LABEL = Object.fromEntries([...EXPENSES, ['imports', 'Goods bought abroad']]);
const IN_LABEL = Object.fromEntries(INCOME);

// Where each cost is trimmed: a tab to open, or (the court) the decree itself.
const GO = {
  upkeep: ['realm:labour', 'See which works stand idle'],
  garrisons: ['military:garrisons', 'Lighten the garrisons'],
  companies: ['military:forces', 'Stand down a company'],
  patrols: ['military:forces', 'Call in a patrol'],
  armies: ['military:war', 'Send the levies home'],
  occupation: ['military:garrisons', 'Thin the conquered garrisons'],
  imports: ['treasury:trade', 'Buy less abroad'],
  routes: ['treasury:trade', 'Close a trade route'],
  edicts: ['court:laws', 'Repeal a costly edict'],
  gifts: ['diplomacy:realms', 'Send fewer gifts'],
  embassies: ['diplomacy:intel', 'Recall an embassy'],
  interest: ['treasury:taxes', 'Repay the bankers'],
  loans: ['treasury:taxes', 'See the loans'],
  tribute: ['military:war', 'See the terms'],
  court: ['court:laws', "See the court's laws"],
};

function fixOf(app, c, r) {
  const { state, world } = app;
  if (c.key === 'court' && state.laws.court?.option !== 'frugal' && canDecree(state, world, 'court', 'frugal').ok) {
    const save = Math.round(world.economy.upkeep.courtMonth * 0.3);
    return `<button type="button" class="act" data-fix="court" ${orderAttr({ type: 'law', law: 'court', option: 'frugal' }, 'A frugal court is decreed.')}><span class="act-label">Keep a frugal court</span><span class="act-sub">About ${number(save)} a month less; a little Love lost</span></button>`;
  }
  if (c.key === 'court' && r.hoard > 100) {
    return `<button type="button" class="act" data-fix="court" data-tab-go="treasury:trade"><span class="act-label">Put the hoard to work</span><span class="act-sub">${number(r.hoard)} of it is courtiers drawn by a full treasury</span></button>`;
  }
  if (c.key === 'upkeep' && halfStaffed(state, world).length) {
    const h = halfStaffed(state, world)[0];
    return `<button type="button" class="act" data-fix="upkeep" data-tab-go="realm:labour"><span class="act-label">Man the ${escapeHtml(h.name.toLowerCase())}</span><span class="act-sub">Under half manned: they cost their keep and earn little</span></button>`;
  }
  const go = GO[c.key];
  if (!go) return '';
  return `<button type="button" class="act" data-fix="${c.key}" data-tab-go="${go[0]}"><span class="act-label">${go[1]}</span></button>`;
}

export function stewardHtml(app) {
  const r = stewardReport(app.state, app.world);
  if (!r) return '';
  const half = halfStaffed(app.state, app.world);
  const costs = r.costs.map((c) => `<div class="st-cost" data-cost="${c.key}"><div class="st-line"><span>${escapeHtml(LABEL[c.key] ?? c.key)}</span><span>−${number(c.v)}</span></div>${fixOf(app, c, r)}</div>`).join('');
  const warn = half.length ? `<p class="warn">${escapeHtml(half.map((h) => `${h.name} ${Math.round(h.pct * 100)}% manned`).join(', '))}: works standing idle.</p>` : '';
  return `<div data-part="steward" class="steward">
    <div class="decision-top"><span class="envoy-from">The Steward's report</span><span class="left">${MONTHS[r.month - 1].name} ${r.year}</span></div>
    <div class="st-figs"><div><small>In</small><b>${number(r.in)}</b></div><div><small>Out</small><b>${number(r.out)}</b></div><div class="${r.net < 0 ? 'down' : 'up'}"><small>Net</small><b>${signed(r.net)}</b></div></div>
    ${warn}
    ${r.south ? `<p class="st-south" data-part="south"><b>From the south.</b> ${escapeHtml(r.south)}</p>` : ''}
    ${r.war.length ? `<h4>What fighting brought in</h4><dl class="ledger" data-part="war-takings">${r.war.map((w) => `<div data-take="${w.key}"><dt>${escapeHtml(IN_LABEL[w.key] ?? w.key)}</dt><dd>+${number(w.v)}</dd></div>`).join('')}</dl>` : ''}
    <h4>What cost most</h4>
    ${costs}
    <button type="button" class="act wide" data-tab-go="treasury:ledger"><span class="act-label">The full ledger</span></button>
  </div>`;
}
