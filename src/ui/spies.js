// The Spies screen (M31 A), under the Court: the crown's networks by realm
// and what each depth opens, the monthly budget, the spymaster's office,
// and the foreign networks known to work in Temeria.
import {
  ourDepth, spyUnlocked, settlesAt, spyExpense, foreignAtHome, spyTargets, canAppoint, formatDate, sideName,
} from '../sim/index.js';
import { cardHead, orderAttr } from './card.js';
import { escapeHtml, number } from './format.js';
import { gaugeHtml } from './faith.js';

const BAND_WORDS = { faint: 'A few paid ears', some: 'A working network', strong: 'A strong network', deep: 'Deep in every office' };

export function spiesHtml(app) {
  const { world, state } = app;
  const c = world.spies;
  const sc = state.spycraft;
  if (!c || !sc) return '<div data-part="spies"><p class="sub">The crown keeps no spies.</p></div>';
  const ours = spyTargets(state, world, 'temeria');
  const working = ours.filter((r) => spyUnlocked(world, ourDepth(state, r), 'armies')).length;
  const sm = sc.spymaster;
  const status = sm
    ? `<span>${escapeHtml(sm.name)} runs the crown's agents. Networks grow with the spymaster's skill and the silver spent, and slowly where courts are closed.</span>`
    : '<span>The spymaster\'s office stands empty. Without one the crown\'s networks grow slowly and no one counts the foreign agents in Vizima.</span>';
  return `${cardHead({
    status,
    chips: [
      { icon: 'coin', label: 'Spies', value: `${number(spyExpense(state, world))} a month` },
      { icon: 'target', label: 'Networks working', value: `${working} of ${ours.length}` },
    ],
  })}
  ${budgetHtml(world, sc)}
  ${sm ? spymasterHtml(world, state, sm) : candidatesHtml(world, state, sc)}
  ${networksHtml(world, state, ours)}
  ${foreignHtml(world, state, sc)}`;
}

function budgetHtml(world, sc) {
  const steps = world.spies.budgetSteps.map((b) => {
    const on = b === sc.budget;
    return `<button type="button" class="chip${on ? ' on' : ''}" data-spy-budget="${b}" aria-pressed="${on}" ${on ? '' : orderAttr({ type: 'spyBudget', amount: b })}>${b ? number(b) : 'Nothing'}</button>`;
  }).join('');
  return `<div data-part="spy-budget"><h3>Silver for the networks, each month</h3><div class="chips presets">${steps}</div>
    <p class="sub">Bribes, safe houses and couriers. At ${number(world.spies.budgetFull)} a month the networks grow at full pace; with nothing they wither.</p></div>`;
}

function spymasterHtml(world, state, sm) {
  const t = world.spies.spymaster.traits[sm.trait];
  return `<div data-part="spymaster"><h3>The spymaster</h3>
    <div class="row realm-row short"><span class="row-main"><span class="row-name">${escapeHtml(sm.name)}</span>
    <span class="row-sub">${escapeHtml(sm.from)}. ${escapeHtml(t.name)}: ${escapeHtml(t.line)} In office since ${formatDate(sm.since)}; ${number(world.spies.spymaster.wage)} crowns a month.</span></span>
    <span class="row-end">Skill ${Math.round(sm.skill)}</span></div>
    <button type="button" class="build" data-spymaster="dismiss" ${orderAttr({ type: 'spymaster', dismiss: true }, `Dismiss ${sm.name}? The networks will grow slowly until a new spymaster is named.`)}>
      <span class="build-name">Dismiss the spymaster</span><span class="build-cost">New candidates come forward at once.</span></button></div>`;
}

function candidatesHtml(world, state, sc) {
  const m = world.spies.spymaster;
  const rows = sc.candidates.map((x) => {
    const t = m.traits[x.trait];
    const check = canAppoint(state, world, x.id);
    return `<button type="button" class="build" data-candidate="${x.id}" ${orderAttr({ type: 'spymaster', id: x.id })} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(x.name)} (skill ${Math.round(x.skill)})</span>
      <span class="build-cost">${escapeHtml(x.from)}. ${escapeHtml(t.name)}: ${escapeHtml(t.line)}</span></button>`;
  }).join('');
  return `<div data-part="spymaster"><h3>Name a spymaster</h3><div class="build-list">${rows || '<p class="sub">No one suitable has come forward.</p>'}</div>
    <p class="sub">${number(m.wage)} crowns a month. Fresh candidates come forward every ${Math.round(m.refreshDays / 30)} months.</p></div>`;
}

// What the next depth opens, in a few words.
function nextUnlock(world, depth) {
  return world.spies.unlocks.find((u) => depth < u.at) ?? null;
}

function networksHtml(world, state, ours) {
  const rows = ours
    .map((rid) => ({ rid, d: ourDepth(state, rid) }))
    .sort((a, b) => b.d - a.d)
    .map(({ rid, d }) => {
      const open = world.spies.unlocks.filter((u) => d >= u.at);
      const next = nextUnlock(world, d);
      const goal = Math.round(settlesAt(state, world, 'temeria', rid));
      const word = goal > d + 1 ? `growing towards ${goal}` : goal < d - 1 ? `fading towards ${goal}` : 'holding';
      const sub = `${open.length ? `Opens: ${open.map((u) => u.short).join(', ')}. ` : ''}${next ? `At ${next.at}: ${next.short}.` : ''}`;
      return `<div class="spy-net" data-net="${rid}">${gaugeHtml(escapeHtml(sideName(world, rid)), d, `${Math.round(d)}, ${word}`, false)}<p class="sub" title="${escapeHtml(open.map((u) => u.text).join('. '))}">${escapeHtml(sub)}</p></div>`;
    }).join('');
  const key = world.spies.unlocks.map((u) => `<li><b>${u.at}</b> ${escapeHtml(u.text)}</li>`).join('');
  return `<div data-part="networks"><h3>Our networks abroad</h3>${rows}
    <details class="spy-key" data-part="spy-key"><summary>What each depth opens</summary><ul>${key}</ul></details></div>`;
}

function foreignHtml(world, state, sc) {
  const known = foreignAtHome(state, world);
  const rows = known.map((f) => `<div class="row realm-row short" data-foreign="${f.owner}"><span class="row-main"><span class="row-name">${escapeHtml(f.name)}</span>
    <span class="row-sub">${f.depth !== null ? `${f.depth} deep, read from their own letters.` : 'As far as our spymaster can tell.'}</span></span>
    <span class="row-end">${BAND_WORDS[f.band]}</span></div>`).join('');
  const empty = sc.spymaster ? 'No foreign network is known to work in Temeria.' : 'Name a spymaster to learn who spies on Temeria.';
  return `<div data-part="foreign-spies"><h3>Foreign agents in Temeria</h3>${rows || `<p class="sub">${empty}</p>`}</div>`;
}
