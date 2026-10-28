import { canDecree, reactions, enactment, opinionTargets } from '../sim/index.js';
import { escapeHtml, describeLevel } from './format.js';
import { icon } from './icons.js';
import { chips, orderAttr } from './card.js';
import { isOpen } from './memory.js';

const MOOD_WORDS = ['Hostile', 'Resentful', 'Indifferent', 'Content', 'Devoted'];

// The Laws screen: how each group regards the crown as a row of chips, then
// one compact row per law showing what is in force. Tapping a law opens its
// options with their price and who each would please or anger; tapping an
// option decrees it.
export function lawsHtml(app) {
  const { world, state, memory } = app;
  const route = 'tab:court';
  // Taxes by estate are set in the Treasury (M21).
  const cats = Object.entries(world.laws.categories).filter(([cat]) => cat !== 'taxes').map(([cat, title]) => {
    const rows = Object.entries(world.laws.laws)
      .filter(([, law]) => law.category === cat)
      .map(([id, law]) => lawHtml(world, state, id, law, isOpen(memory, route, `law:${id}`))).join('');
    return `<div data-part="cat-${cat}"><h3>${escapeHtml(title)}</h3><div class="rows">${rows}</div></div>`;
  }).join('');
  return `
    <div data-part="estates"><p class="status"><span>Each decree costs Authority (you have ${Math.floor(state.authority)}) and takes a month to take hold.</span></p>${estatesHtml(world, state)}</div>
    ${cats}
  `;
}

function estatesHtml(world, state) {
  const target = opinionTargets(state, world);
  return chips(Object.entries(world.groups.groups).map(([g, info]) => {
    const v = state.opinion[g];
    const gap = target[g] - v;
    const trend = gap > 2 ? ' <small class="up">▲</small>' : gap < -2 ? ' <small class="down">▼</small>' : '';
    return { label: info.name, value: `${describeLevel(v, MOOD_WORDS)}${trend}`, tone: v < 30 ? 'bad' : v >= 60 ? 'good' : '' };
  }));
}

function lawHtml(world, state, id, law, open) {
  const l = state.laws[id];
  const now = law.options[l.option];
  const s = enactment(state, world, id);
  const taking = s < 1 ? ` <span class="taking">Taking hold, ${Math.round(s * 100)}%</span>` : '';
  const head = `<button type="button" class="row${open ? ' open' : ''}" data-law="${id}" data-expand="law:${id}" aria-expanded="${open}">
    ${icon('scroll')}<span class="row-main"><span class="row-name">${escapeHtml(law.name)}</span><span class="row-sub law-now">${escapeHtml(now.name)}${taking}</span></span>${icon(open ? 'up' : 'down')}</button>`;
  if (!open) return head;
  const names = (gs) => gs.map((g) => world.groups.groups[g].name).join(', ');
  const options = Object.entries(law.options).map(([oid, opt]) => {
    if (oid === l.option) {
      return `<div class="law-option current"><span class="build-name">${escapeHtml(opt.name)} (in force)</span><span class="build-blurb">${escapeHtml(opt.blurb)}</span></div>`;
    }
    const check = canDecree(state, world, id, oid);
    const r = reactions(state, world, id, oid);
    const mood = [r.pleased.length ? `<span class="mood-good">Pleases ${escapeHtml(names(r.pleased))}.</span>` : '', r.angered.length ? `<span class="mood-bad">Angers ${escapeHtml(names(r.angered))}.</span>` : ''].filter(Boolean).join(' ');
    const cost = `${law.authority} Authority${law.coin ? `, ${law.coin} crowns` : ''}`;
    return `<button type="button" class="build law-option" data-decree="${id}:${oid}" ${orderAttr({ type: 'law', law: id, option: oid })} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">Decree: ${escapeHtml(opt.name)}</span>
      <span class="build-blurb">${escapeHtml(opt.blurb)}</span>
      ${mood ? `<span class="build-cost">${mood}</span>` : ''}
      <span class="build-cost">${check.ok ? `Costs ${cost}.` : escapeHtml(check.reason)}</span>
    </button>`;
  }).join('');
  return `${head}<div class="row-detail law-options">${options}</div>`;
}
