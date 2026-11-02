// The Dawn screen (M33 A): the five places with their quests, what each
// step asks, how far it has got and what it pays, and a tap to where it is
// done. The next thing to do sits at the top.
import { dawnView, dawnNext } from '../sim/dawn.js';
import { rewardLine } from '../sim/dawn.js';
import { escapeHtml } from './format.js';
import { section } from './card.js';
import { pathsView, rewardText } from '../sim/paths.js';
import { roadView } from '../sim/road.js';
import { formatDate } from '../sim/index.js';

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
  if (v.skipped) return `${roadHtml(app)}<div data-part="dawn"><p class="sub">This reign began before the Dawn was written. Its places are in order already.</p></div>${section(app.memory, 'tab:court', 'paths', 'The five paths', pathsHtml(app))}`;
  const next = dawnNext(state, world);
  const head = v.done
    ? '<p class="sub">All five places are in order. The Dawn of the reign is over.</p>'
    : `<p class="sub">${v.finished} of 5 places in order. Set each in order and it returns to full prosperity; all five end the Dawn.</p>`;
  const nextHtml = next ? `<button type="button" class="act primary wide" data-part="dawn-next" ${goAttr(next.where)}><span class="act-label">Next: ${escapeHtml(next.name)} (${escapeHtml(world.byId[next.place].name)})</span><span class="act-sub">${escapeHtml(next.text)}</span></button>` : '';
  // Each place in a fold, the one with the next step open, so the screen
  // stays short.
  const places = v.places.map((p) => `<div class="dawn-place${p.done ? ' done' : ''}" data-dawn-place="${p.id}">${section(app.memory, 'tab:court', `dawn-${p.id}`,
    `${world.byId[p.id].name}: ${p.teaches}${p.done ? ', in order' : `, ${p.count} of ${p.chains.length}`}`,
    `${p.done ? '' : `<p class="sub">${escapeHtml(p.line)}</p>`}<div class="build-list">${p.chains.map((c) => chainHtml(world, c)).join('')}</div>`,
    { open: next?.place === p.id })}</div>`).join('');
  // The paths in a fold: shut while the Dawn lasts, open after.
  return `${v.done ? roadHtml(app) : ''}<div data-part="dawn">${head}${nextHtml}${places}</div>${section(app.memory, 'tab:court', 'paths', 'The five paths', pathsHtml(app), { open: v.done })}${v.done ? '' : section(app.memory, 'tab:court', 'road', 'The Road to War', roadHtml(app))}`;
}

// The five paths (M33 B): the crown's own, step by step, then the rivals'
// as far as the crown's eyes reach.
function pathsHtml(app) {
  const { state, world } = app;
  const paths = pathsView(state, world);
  if (!paths) return '';
  const mine = paths.find((p) => p.mine);
  const steps = mine.steps.map((st) => st.done
    ? `<div class="build dawn-chain done" data-path-step="${st.id}"><span class="build-name">${escapeHtml(st.name)}: done</span></div>`
    : `<button type="button" class="build dawn-chain${st.next ? '' : ' later'}" data-path-step="${st.id}" ${st.next ? goAttr(st.where) : 'disabled'}><span class="build-name">${escapeHtml(st.name)}</span><span class="build-cost">${escapeHtml(st.text)}${st.reward ? ` Pays ${escapeHtml(rewardText(st.reward))}.` : ''}</span></button>`).join('');
  const rivals = paths.filter((p) => !p.mine).map((p) => `<div class="row-line" data-path="${p.rid}"><b>${escapeHtml(p.ruler)}</b>, ${escapeHtml(p.name)}: ${p.seen ? `${p.step} of ${p.total} steps${p.step ? ` (${escapeHtml(p.steps.filter((s) => s.done).map((s) => s.name).join(', '))})` : ''}` : 'his court keeps its own counsel'}.${p.war ? ` <small>In war: ${escapeHtml(p.war)}</small>` : ''}</div>`).join('');
  return `<div data-part="paths"><h3>Your path: ${escapeHtml(mine.name)} <small>${mine.step} of ${mine.total}</small></h3>
    <div class="build-list">${steps}</div>
    <h3>The other crowns</h3><div class="sub">${rivals}</div></div>`;
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

// The Road to War (M33 C): five boxes, each ticked or with what moves it;
// once the war has begun, who has answered the Call of the North.
function roadHtml(app) {
  const { state, world } = app;
  const r = roadView(state, world);
  if (!r) return '';
  if (r.began !== null) {
    const calls = r.calls.map((c) => `${escapeHtml(world.geography.neighbours[c.rid]?.name ?? c.rid)}: ${c.joined !== null ? 'marching' : c.aside !== null ? 'stands aside' : 'gathering its lords'}`).join('; ');
    return `<div data-part="road"><h3>The Road to War <small>the war began ${escapeHtml(formatDate(r.began))}</small></h3>
      <p class="sub">The First Northern War is under way. The Call of the North: ${calls || 'sent'}.</p></div>`;
  }
  const rows = r.boxes.map((b) => `<div class="road-box${b.done ? ' done' : ''}" data-road-box="${b.id}"><span class="road-tick">${b.done ? '&#10003;' : '&#9675;'}</span><span><b>${escapeHtml(b.name)}</b><br><small>${escapeHtml(b.what)}</small></span></div>`).join('');
  return `<div data-part="road"><h3>The Road to War <small>${r.ticked} of 5</small></h3>
    <p class="sub">The war waits until all five are ticked; then it begins of itself. The longer it waits, the larger the Emperor's host.</p>${rows}</div>`;
}
