import {
  realmFaith, tensionWeight, totalPopulation, faithLevel, faithRest, canFaithAct, churchLand, powerReadyAt,
} from '../sim/index.js';
import { orderAttr } from './card.js';
import { form } from './memory.js';
import { cooling } from './cooldown.js';
import { number, escapeHtml, describeLevel } from './format.js';

export const FAITH_COLOURS = { eternal_fire: '#c0582c', melitele: '#d9c27a', old_ways: '#5f7d4c', great_sun: '#e8b84a', kreve: '#7d8aa0', lebioda: '#c9b8e0', freya: '#4f9db0' };
export const PEOPLE_COLOURS = { human: '#c9b48a', dwarf: '#9a6a3a', elf: '#6f9a5a', halfling: '#d28c4a' };
export const TENSION_WORDS = ['Calm', 'Uneasy', 'Strained', 'Bitter', 'Boiling'];
const SYMPATHY_WORDS = ['Scarcely a whisper', 'Muttering', 'Open sympathy', 'Many in the woods', 'A rising'];

// Powers that have come ready since `since` (the day the Faith page was last
// opened): the Court tab carries a badge for them (M26 D).
export function freshPowers(state, world, since = 0) {
  let n = 0;
  for (const [f, faith] of Object.entries(world.devotion?.faiths ?? {})) {
    for (const kind of Object.keys(faith.powers ?? {})) {
      const at = powerReadyAt(state, world, kind, f);
      if (at !== null && at > since && at <= state.day) n++;
    }
  }
  return n;
}

export function mixHtml(values, names, colours, fmt, total, nameKey = 'name') {
  const entries = Object.entries(values).filter(([, v]) => v > 0);
  const bar = entries.map(([k, v]) => `<span style="width:${(v / total) * 100}%;background:${colours[k]}"></span>`).join('');
  const legend = entries.map(([k, v]) =>
    `<li><i style="background:${colours[k]}"></i>${escapeHtml(names[k]?.[nameKey] ?? k)}<b>${fmt(v)}</b></li>`).join('');
  return `<div class="mix">${bar}</div><ul class="legend">${legend}</ul>`;
}

export function gaugeHtml(label, value, word, bad) {
  return `<div class="gauge-row"><div class="lbl"><span>${label}</span><span>${word}</span></div>
    <div class="gauge${bad ? ' bad' : ''}"><span style="width:${Math.round(value)}%"></span></div></div>`;
}

export function faithHtml(app) {
  const { world, state, lookups } = app;
  const faith = realmFaith(state);
  const peoples = { human: 0, dwarf: 0, elf: 0, halfling: 0 };
  let pop = 0;
  for (const s of Object.values(state.settlements)) {
    pop += totalPopulation(s);
    for (const p of Object.keys(peoples)) peoples[p] += s.population[p];
  }
  const tense = Object.entries(state.settlements)
    .filter(([, s]) => tensionWeight(world, s) > 0)
    .sort((a, b) => b[1].tension - a[1].tension)
    .slice(0, 5)
    .map(([id, s]) => `<button type="button" class="row realm-row" data-place="${id}" data-go="town:${id}">
      <span class="row-main"><span class="row-name">${escapeHtml(world.byId[id].name)}${s.troubled > 0 ? ' <span class="down">(riot-struck)</span>' : ''}</span></span>
      <span class="row-end">${describeLevel(s.tension, TENSION_WORDS)}</span></button>`).join('');
  const petitions = state.petitions.length;
  return `
    ${world.devotion ? faithsSheet(app) : ''}
    <div data-part="petitions">${petitions ? `<button type="button" class="act wide" data-tab-go="court:inbox"><span class="act-label">Petitions waiting: ${petitions}</span><span class="act-sub">Answer them under Decisions</span></button>` : ''}</div>
    <div data-part="faith"><h3>Faith across the realm</h3>${mixHtml(faith, lookups.faiths, FAITH_COLOURS, (v) => `${Math.round(v)}%`, 100, 'short')}</div>
    <div data-part="peoples"><h3>The peoples</h3>${mixHtml(peoples, lookups.peoples, PEOPLE_COLOURS, (v) => number(v), pop)}</div>
    <div data-part="sympathy"><h3>The Scoia'tael</h3>
      ${gaugeHtml('Sympathy among the elves', state.sympathy, describeLevel(state.sympathy, SYMPATHY_WORDS), true)}
      <p class="sub">Grows when the elves are wronged. Above three in five, commandos strike on the roads near the forests.</p></div>
    ${cultHtml(app)}
    <div data-part="tense"><h3>Where tempers run high</h3><div class="rows">${tense || '<p class="sub">Nowhere yet.</p>'}</div></div>
  `;
}

// ---- The faiths' powers (M26 D) ----

// Each faith's Devotion as a bar with its level marks, then the chosen
// faith on one screen: its perks (the next one greyed), its powers and the
// acts that develop it, each with its ring while it rests.
function faithsSheet(app) {
  const { world, state, memory } = app;
  const cfg = world.devotion;
  const f = form(memory, 'faiths', { faith: 'melitele' });
  if (!cfg.faiths[f.faith]) f.faith = Object.keys(cfg.faiths)[0];
  const bars = Object.entries(cfg.faiths).map(([id, fa]) => {
    const d = state.faiths?.devotion?.[id] ?? 0;
    const lv = faithLevel(state, world, id);
    const marks = cfg.levels.map((at) => `<b style="left:${at}%"></b>`).join('');
    return `<button type="button" class="faith-bar${id === f.faith ? ' on' : ''}" data-set="faith:${id}" data-faith="${id}" aria-pressed="${id === f.faith}">
      <span>${escapeHtml(fa.name)}</span><span class="fb-track"><i style="width:${Math.round(d)}%;background:${FAITH_COLOURS[id]}"></i>${marks}</span><small>${Math.round(d)} · L${lv}</small></button>`;
  }).join('');
  return `<div data-part="faiths" data-form="faiths"><h3>The faiths</h3>
    <p class="sub">Devotion grows from how many follow a faith and how fervent they are; at 20, 40, 60, 80 and 100 it brings a perk, and at level 3 a power.</p>
    <div class="faith-bars">${bars}</div>
    ${oneFaith(app, f.faith)}</div>`;
}

function oneFaith(app, id) {
  const { world, state } = app;
  const cfg = world.devotion;
  const fa = cfg.faiths[id];
  const lv = faithLevel(state, world, id);
  const perks = fa.perks.map((p) => `<li class="${p.level <= lv ? 'has' : p.level === lv + 1 ? 'next' : 'later'}" data-perk="${p.level}"><b>${p.level}</b><span>${escapeHtml(p.text)}</span></li>`).join('');
  const powers = Object.entries(fa.powers ?? {}).map(([k, pw]) => actButton(app, k, id, pw.name, pw.text, pw.cooldown, pw.coin)).join('');
  const a = cfg.acts;
  const acts = [
    actButton(app, 'endow', id, a.endow.name, a.endow.text, a.endow.cooldown, a.endow.coin),
    actButton(app, 'preachers', id, a.preachers.name, a.preachers.text, a.preachers.cooldown, a.preachers.coin),
    actButton(app, 'festival', id, `Keep ${fa.festival.name}`, a.festival.text, 0, a.festival.coin),
    actButton(app, 'pilgrimage', id, `Pilgrimage to ${fa.holy.name}`, a.pilgrimage.text, a.pilgrimage.cooldown, a.pilgrimage.coin),
    landHtml(app, id),
  ].join('');
  return `<div data-part="faith-${id}">
    <h4>${escapeHtml(fa.name)}: level ${lv} of 5</h4>
    <ul class="perks">${perks}</ul>${fa.suffer ? `<p class="sub">${escapeHtml(fa.suffer)}</p>` : ''}
    <h4>Its powers</h4><div class="build-list">${powers}</div>
    <h4>To strengthen it</h4><div class="build-list">${acts}</div></div>`;
}

// The town an act would be done in: where the faith is strongest (a temple,
// a power), or second strongest (preachers, to spread it), or where the
// trouble is (a purge, a druids' circle, a healers' march).
function townFor(app, kind, id) {
  const { world, state } = app;
  const towns = Object.keys(state.settlements).filter((x) => !state.settlements[x].occupier);
  if (['purge', 'circle', 'healers'].includes(kind)) return towns.find((x) => canFaithAct(state, world, kind, id, x).ok) ?? null;
  // Imperial order (M32 A): the most troubled town.
  if (kind === 'order') return [...towns].sort((a, b) => state.settlements[b].unrest - state.settlements[a].unrest)[0] ?? null;
  const big = towns.filter((x) => ['town', 'city'].includes(world.byId[x].type)).sort((a, b) => (state.settlements[b].faith?.[id] ?? 0) - (state.settlements[a].faith?.[id] ?? 0));
  return kind === 'preachers' ? big[1] ?? big[0] : big[0];
}

function actButton(app, kind, id, name, text, cooldown, coin) {
  const { world, state } = app;
  const needsTown = ['endow', 'preachers', 'purge', 'circle', 'healers', 'order'].includes(kind);
  const town = needsTown ? townFor(app, kind, id) : null;
  const check = needsTown && !town ? canFaithAct(state, world, kind, id, Object.keys(state.settlements)[0]) : canFaithAct(state, world, kind, id, town);
  const left = faithRest(state, world, kind, id);
  const where = town ? ` at ${world.byId[town].name}` : '';
  const sub = check.ok ? `${coin ? `${number(coin)} crowns. ` : ''}${text}` : check.reason;
  const action = { type: 'faith', kind, faith: id, ...(town ? { settlement: town } : {}) };
  const btn = `<button type="button" class="build" data-faith-act="${kind}" ${orderAttr(action, `${name}${where}?`)} ${check.ok ? '' : 'disabled'}>
    <span class="build-name">${escapeHtml(name)}${escapeHtml(where)}</span><span class="build-cost">${escapeHtml(sub)}</span></button>`;
  return cooling(btn, left, cooldown, check.ok);
}

// Church land: grant one of the realm's best crafts works to the faith, or
// take back a grant.
function landHtml(app, id) {
  const { world, state } = app;
  const a = world.devotion.acts.land;
  const grants = (state.faiths?.lands ?? []).filter((g) => g.faith === id).map((g) => `<button type="button" class="build" data-revoke="${g.town}:${g.works}" ${orderAttr({ type: 'revokeLand', settlement: g.town, works: g.works }, `Take back the ${world.buildings[g.works].name.toLowerCase()} at ${world.byId[g.town].name}?`)}>
    <span class="build-name">Take back the ${escapeHtml(world.buildings[g.works].name.toLowerCase())} at ${escapeHtml(world.byId[g.town].name)}</span><span class="build-cost">Its takings return to the crown; the faith is angered.</span></button>`).join('');
  const towns = Object.keys(state.settlements).filter((x) => !state.settlements[x].occupier && ['town', 'city'].includes(world.byId[x].type))
    .sort((p, q) => (state.settlements[q].faith?.[id] ?? 0) - (state.settlements[p].faith?.[id] ?? 0));
  let offer = '';
  for (const town of towns) {
    const works = state.settlements[town].buildings.find((b) => world.buildings[b].effects.craft && !churchLand(state, town, b));
    if (!works) continue;
    const check = canFaithAct(state, world, 'land', id, town, works);
    offer = `<button type="button" class="build" data-faith-act="land" ${orderAttr({ type: 'faith', kind: 'land', faith: id, settlement: town, works }, `Grant the ${world.buildings[works].name.toLowerCase()} at ${world.byId[town].name} to the faith?`)} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(a.name)}: the ${escapeHtml(world.buildings[works].name.toLowerCase())} at ${escapeHtml(world.byId[town].name)}</span><span class="build-cost">${escapeHtml(check.ok ? a.text : check.reason)}</span></button>`;
    break;
  }
  return `${offer}${grants}`;
}

// Coram Agh Tera (M32 A): where the cult is known to work, and what feeds it.
function cultHtml(app) {
  const { world, state } = app;
  const c = world.devotion?.cult;
  if (!c) return '';
  const seen = Object.entries(state.cult?.towns ?? {}).filter(([, v]) => v >= 15).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const rows = seen.map(([id, v]) => `<button type="button" class="row realm-row" data-cult="${id}" data-go="town:${id}">
      <span class="row-main"><span class="row-name">${escapeHtml(world.byId[id].name)}</span></span>
      <span class="row-end">${v >= 60 ? 'Deep-rooted' : v >= 30 ? 'Spreading' : 'Whispers'}</span></button>`).join('');
  return `<div data-part="cult"><h3>${escapeHtml(c.name)}</h3>${rows ? `<div class="rows">${rows}</div>` : ''}
    <p class="sub">${rows ? 'A cult of the Lion-headed Spider.' : 'No whisper of the Lion-headed Spider in the realm.'} It feeds on hunger, plague and despair, and starves where the people are fed and calm.</p></div>`;
}
