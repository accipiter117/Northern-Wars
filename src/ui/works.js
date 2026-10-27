// A place's works (M20): its spaces, each tagged by the land it stands on,
// what stands in each, how well it stands, and the crown's three answers to
// damage (rebuild, patch, or leave it), with what each costs and brings.
import { spacesOf, repairOptions, canRepairWorks, worksSummary } from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr } from './card.js';
import { isOpen } from './memory.js';

export function condWord(c) {
  return c >= 90 ? 'Sound' : c >= 70 ? 'Worn' : c >= 45 ? 'Damaged' : c >= 20 ? 'Badly damaged' : 'In ruins';
}

// The land a place stands on, as a line of tags.
export function landTags(world, state, id) {
  const sp = spacesOf(state, world, id).filter((x) => x.kind !== 'square' && x.kind !== 'defences');
  return sp.map((x) => `<span class="tag" data-land="${x.kind}">${escapeHtml(cap1(x.name))}</span>`).join('');
}

// One works as a row: name, condition bar and why; tapping opens its repairs.
function worksRow(app, id, w) {
  const { world, state, memory } = app;
  const def = world.buildings[w.b];
  const key = `w:${w.b}`;
  const open = isOpen(memory, `town:${id}`, key);
  const c = Math.round(w.cond);
  const status = w.repair
    ? `${w.repair.kind === 'rebuild' ? 'Rebuilding' : 'Patching'}: ${w.repair.daysLeft} days`
    : `${condWord(c)}${w.patched ? ', patched' : ''}`;
  const staffed = w.staff < 100 ? ` · ${Math.round(w.staff)}% manned` : '';
  const row = `<button type="button" class="row works-row${open ? ' open' : ''}" data-expand="${key}" data-works="${w.b}" aria-expanded="${open}">
    <span class="row-main"><span class="row-name">${escapeHtml(def.name)}</span><span class="row-sub">${escapeHtml(status)}${staffed}</span></span>
    <span class="row-end"><span class="cond${c < 45 ? ' bad' : c < 70 ? ' warn' : ''}" role="img" aria-label="Condition ${c}"><i style="width:${c}%"></i></span>${c}</span></button>`;
  if (!open) return row;
  let detail = `<p>${escapeHtml(def.blurb)}</p>`;
  if (w.why) detail += `<p class="sub">${escapeHtml(w.why)}.</p>`;
  if (w.repair) {
    const done = 1 - w.repair.daysLeft / Math.max(1, w.repair.days);
    detail += `<div class="gauge-row"><div class="lbl"><span>${w.repair.kind === 'rebuild' ? 'Masons at work' : 'Carpenters at work'}</span><span>${w.repair.daysLeft} days</span></div><div class="gauge"><span style="width:${Math.round(done * 100)}%"></span></div></div>`;
  } else if (c < 100 && !state.settlements[id].occupier) {
    detail += repairButtons(world, state, id, w.b);
  }
  return `${row}<div class="row-detail">${detail}</div>`;
}

function mats(m) {
  return Object.entries(m).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ');
}

// Rebuild and patch, each with its cost, time, hands and outcome.
export function repairButtons(world, state, id, b) {
  const o = repairOptions(state, world, id, b);
  const rb = canRepairWorks(state, world, id, b, 'rebuild');
  const pt = canRepairWorks(state, world, id, b, 'patch');
  const line = (c, why) => (c.ok ? why : escapeHtml(c.reason));
  return `<div class="build-list" data-part="repair">
    <button type="button" class="build" data-repair="rebuild" ${orderAttr({ type: 'repair', settlement: id, building: b, kind: 'rebuild' })} ${rb.ok ? '' : 'disabled'}>
      <span class="build-name">Rebuild it</span><span class="build-blurb">Whole again. It yields nothing while the masons work.</span>
      <span class="build-cost">${line(rb, `${number(o.rebuild.coin)} crowns${mats(o.rebuild.materials) ? `, ${mats(o.rebuild.materials)}` : ''}; ${o.rebuild.days} days; ${o.rebuild.hands} hands${rb.borrow ? '; borrowed' : ''}`)}</span></button>
    <button type="button" class="build" data-repair="patch" ${orderAttr({ type: 'repair', settlement: id, building: b, kind: 'patch' })} ${pt.ok ? '' : 'disabled'}>
      <span class="build-name">Patch it up</span><span class="build-blurb">Back to about ${o.patch.to}, and working throughout. It may give way again under strain.</span>
      <span class="build-cost">${line(pt, `${number(o.patch.coin)} crowns; ${o.patch.days} days; ${o.patch.hands} hands`)}</span></button>
    <p class="sub">Or leave it: nothing spent, the place goes without, and its people remember.</p>
  </div>`;
}

// The Works tab: every space and what stands in it.
export function worksTabHtml(app, id) {
  const { world, state } = app;
  const s = state.settlements[id];
  const spaces = spacesOf(state, world, id);
  const sum = worksSummary(s);
  const head = `<p class="sub">The land gives this place its works; the crown keeps them standing. ${sum.n} works, ${sum.worn ? `${sum.worn} worn or worse` : 'all in good repair'}.${s.occupier ? ' The enemy holds it: its works serve them now.' : ''}</p>`;
  const blocks = spaces.map((sp) => {
    const kind = world.spacesData?.kinds?.[sp.kind]?.name ?? sp.kind;
    const rows = sp.works.map((w) => worksRow(app, id, w)).join('');
    return `<div class="space" data-space="${sp.kind}"><h4><span class="space-dot" aria-hidden="true"></span>${escapeHtml(cap1(sp.name))} <small>${escapeHtml(kind)}</small></h4>
      ${rows ? `<div class="rows">${rows}</div>` : '<p class="sub">Nothing stands here.</p>'}</div>`;
  }).join('');
  return `<div data-part="spaces">${head}<div class="tags">${landTags(world, state, id)}</div>${blocks}</div>`;
}

// For the overview: the place's works at a glance, as pips.
export function worksPipsHtml(world, state, id) {
  const spaces = spacesOf(state, world, id);
  const pips = spaces.flatMap((sp) => sp.works.map((w) => {
    const c = w.cond;
    const cls = w.repair ? 'repairing' : c < 45 ? 'damaged' : c < 70 ? 'worn' : w.staff < 60 ? 'short' : 'ok';
    return `<span class="pip ${cls}" title="${escapeHtml(`${world.buildings[w.b].name}: ${Math.round(c)}`)}"></span>`;
  })).join('');
  const names = spaces.flatMap((sp) => sp.works.map((w) => `<span class="fig">${escapeHtml(world.buildings[w.b].name)}${w.cond < 70 ? ` <small class="down">${Math.round(w.cond)}</small>` : ''}</span>`)).join('');
  return `<h3>Works <span class="pips" aria-hidden="true">${pips}</span></h3>${names ? `<div class="figs">${names}</div>` : '<p class="sub">No works here.</p>'}<button type="button" class="act" data-tsub="works"><span class="act-label">See the works</span></button>`;
}

const cap1 = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
