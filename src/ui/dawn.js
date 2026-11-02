// The Dawn screen (M33 A): the five places with their quests, what each
// step asks, how far it has got and what it pays, and a tap to where it is
// done. The next thing to do sits at the top.
import { dawnView, dawnNext } from '../sim/dawn.js';
import { rewardLine } from '../sim/dawn.js';
import { escapeHtml } from './format.js';

// Where a step is done: a town card, or a tab and its sub-screen.
export function goAttr(where) {
  if (!where) return '';
  const [a, b] = where.split(':');
  return a === 'town' ? `data-go="town:${b}"` : `data-tab-go="${a}:${b}"`;
}

const TOWN_TABS = { works: 'Works', people: 'People', military: 'Military' };

function goLabel(world, where) {
  const [a, b, c] = where.split(':');
  if (a === 'town') return `Go to ${world.byId[b]?.name ?? b}${c ? ` (${TOWN_TABS[c] ?? c})` : ''}`;
  return { 'military:threats': 'Go to Threats', 'military:forces': 'Go to Forces', 'court:inbox': 'Go to Decisions', 'court:laws': 'Go to the Book of Laws', 'court:faith': 'Go to Faith', 'treasury:trade': 'Go to Trade', 'realm:labour': 'Go to Labour' }[where] ?? 'Go';
}

export function dawnHtml(app) {
  const { state, world } = app;
  const v = dawnView(state, world);
  if (!v) return '<p class="sub">No Dawn in this world.</p>';
  if (v.skipped) return '<div data-part="dawn"><p class="sub">This reign began before the Dawn was written. Its places are in order already.</p></div>';
  const next = dawnNext(state, world);
  const head = v.done
    ? '<p class="sub">All five places are in order. The Dawn of the reign is over.</p>'
    : `<p class="sub">${v.finished} of 5 places in order. Set each in order and it returns to full prosperity; all five end the Dawn.</p>`;
  const nextHtml = next ? `<button type="button" class="act primary wide" data-part="dawn-next" ${goAttr(next.where)}><span class="act-label">Next: ${escapeHtml(next.name)} (${escapeHtml(world.byId[next.place].name)})</span><span class="act-sub">${escapeHtml(next.text)}</span></button>` : '';
  const places = v.places.map((p) => `<div class="dawn-place${p.done ? ' done' : ''}" data-dawn-place="${p.id}">
      <h3>${escapeHtml(world.byId[p.id].name)} <small>${escapeHtml(p.teaches)}${p.done ? ', in order' : `, ${p.count} of ${p.chains.length}`}</small></h3>
      ${p.done ? '' : `<p class="sub">${escapeHtml(p.line)}</p>`}
      <div class="build-list">${p.chains.map((c) => chainHtml(world, c)).join('')}</div></div>`).join('');
  return `<div data-part="dawn">${head}${nextHtml}${places}</div>`;
}

function chainHtml(world, c) {
  const reward = rewardLine(c.reward);
  if (c.done) return `<div class="build dawn-chain done" data-dawn-chain="${c.id}"><span class="build-name">${escapeHtml(c.name)}: done</span><span class="build-cost">${reward ? `Paid ${escapeHtml(reward)}.` : ''}</span></div>`;
  const steps = c.steps > 1 ? ` (step ${c.step + 1} of ${c.steps})` : '';
  return `<button type="button" class="build dawn-chain" data-dawn-chain="${c.id}" ${goAttr(c.where)}>
    <span class="build-name">${escapeHtml(c.name)}${steps}</span>
    <span class="build-cost">${escapeHtml(c.text)}${c.progress ? ` <b>${escapeHtml(c.progress)}</b>` : ''}</span>
    <span class="build-cost">${reward ? `Pays ${escapeHtml(reward)}. ` : ''}${escapeHtml(goLabel(world, c.where))}.</span></button>`;
}
