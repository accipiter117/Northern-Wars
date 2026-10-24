import { canDecree, reactions, enactment, opinionTargets } from '../sim/index.js';
import { escapeHtml, describeLevel } from './format.js';

const MOOD_WORDS = ['Hostile', 'Resentful', 'Indifferent', 'Content', 'Devoted'];

// The Laws screen: how each group regards the crown, then every law by
// category. Tapping a law opens its options with their price and who each
// would please or anger.
export function lawsHtml(world, state, openLaw) {
  const back = '<div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>';
  const cats = Object.entries(world.laws.categories).map(([cat, title]) => {
    const rows = Object.entries(world.laws.laws)
      .filter(([, law]) => law.category === cat)
      .map(([id, law]) => lawHtml(world, state, id, law, id === openLaw)).join('');
    return `<div data-part="cat-${cat}"><h3>${escapeHtml(title)}</h3>${rows}</div>`;
  }).join('');
  return `
    <div data-part="head">
      <h2>Laws and edicts</h2>
      ${back}
      <p class="sub">Each decree costs Authority (you have ${Math.floor(state.authority)}) and takes a month to take hold.</p>
    </div>
    <div data-part="estates">${estatesHtml(world, state)}</div>
    ${cats}
  `;
}

function estatesHtml(world, state) {
  const target = opinionTargets(state, world);
  const rows = Object.entries(world.groups.groups).map(([g, info]) => {
    const v = state.opinion[g];
    const gap = target[g] - v;
    const trend = gap > 2 ? ' <span class="up" aria-label="warming">&#9650;</span>' : gap < -2 ? ' <span class="down" aria-label="cooling">&#9660;</span>' : '';
    return `<div class="gauge-row"><div class="lbl"><span>${escapeHtml(info.name)}</span><span>${describeLevel(v, MOOD_WORDS)}${trend}</span></div>
      <div class="gauge mood"><span style="width:${Math.round(v)}%"></span></div></div>`;
  }).join('');
  return `<h3>The realm's mood</h3>${rows}`;
}

function lawHtml(world, state, id, law, open) {
  const l = state.laws[id];
  const now = law.options[l.option];
  const s = enactment(state, world, id);
  const taking = s < 1 ? `<span class="taking">Taking hold, ${Math.round(s * 100)}%</span>` : '';
  let body = '';
  if (open) {
    body = Object.entries(law.options).map(([oid, opt]) => {
      if (oid === l.option) return `<div class="law-option current"><span class="build-name">${escapeHtml(opt.name)} (in force)</span><span class="build-blurb">${escapeHtml(opt.blurb)}</span></div>`;
      const check = canDecree(state, world, id, oid);
      const r = reactions(state, world, id, oid);
      const names = (gs) => gs.map((g) => world.groups.groups[g].name).join(', ');
      const mood = [r.pleased.length ? `Pleases ${names(r.pleased)}.` : '', r.angered.length ? `Angers ${names(r.angered)}.` : ''].filter(Boolean).join(' ');
      const cost = `${law.authority} Authority${law.coin ? `, ${law.coin} crowns` : ''}.`;
      return `<button type="button" class="build law-option" data-decree="${id}:${oid}" ${check.ok ? '' : 'disabled'}>
        <span class="build-name">${escapeHtml(opt.name)}</span>
        <span class="build-blurb">${escapeHtml(opt.blurb)}</span>
        ${mood ? `<span class="build-cost">${escapeHtml(mood)}</span>` : ''}
        <span class="build-cost">${check.ok ? `Costs ${cost}` : escapeHtml(check.reason)}</span>
      </button>`;
    }).join('');
  }
  return `<div class="law${open ? ' open' : ''}">
    <button type="button" class="law-head" data-law="${id}" aria-expanded="${open}">
      <span class="build-name">${escapeHtml(law.name)}</span>
      <span class="law-now">${escapeHtml(now.name)} ${taking}</span>
    </button>
    ${open ? `<div class="law-options">${body}</div>` : ''}
  </div>`;
}
