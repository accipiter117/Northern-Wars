// Northern Wars v2: the war table, one turn a month. Wires the engine to
// the table and the panels; saves after every act.
import { loadTable } from '../engine/load.js';
import {
  createGame, endTurn, moveArmy, recruit, declareWar, atWar, reachable, controller, cityYields, realmYields,
  authority, riots, dateOf, monthName, nameOf, strength, dilemmaView, answerDilemma, serialize, deserialize, movePoints,
} from '../engine/game.js';
import { createTable } from './table.js';

const SAVE_KEY = 'northern-wars.v2.save';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const table = await loadTable(async (p) => {
  const res = await fetch(`../${p}`);
  if (!res.ok) throw new Error(`Could not load ${p}`);
  return res.json();
});

function load() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) return deserialize(text);
  } catch { /* a missing or unreadable save starts a new game */ }
  return createGame(table, { seed: (Date.now() & 0xffff) || 1 });
}

const app = {
  table,
  state: load(),
  selected: null,
  select(sel) {
    if (sel?.army) {
      const a = app.state.armies.find((x) => x.id === sel.army);
      app.selected = { army: sel.army, region: a?.region, reach: a && a.owner === app.state.player ? reachable(app.state, table, a) : {} };
      showArmy(a);
    } else if (sel?.region) {
      app.selected = { region: sel.region };
      showRegion(sel.region);
    } else {
      app.selected = null;
      closeSheet();
    }
    view.draw();
  },
  march(armyId, region) {
    const r = moveArmy(app.state, table, armyId, region);
    if (r.error) toast(r.error);
    else if (r.battle) toast(app.state.log.at(-1)?.text ?? 'Battle.');
    save();
    app.select({ army: armyId });
    if (!app.state.armies.some((a) => a.id === armyId)) app.select(null);
    refresh();
  },
};

const view = createTable($('table'), app);
window.northernWarsV2 = { app, view, get state() { return app.state; } };

function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(app.state)); } catch { /* storage full or blocked: play on */ }
}

// ---- The top bar ----
function refresh() {
  const s = app.state;
  const d = dateOf(table, s.turn);
  $('date').textContent = `${monthName(d.month)} ${d.year}`;
  $('turn').textContent = `Turn ${s.turn + 1}${movePoints(table, s) < table.data.board.moves.points ? ' · winter' : ''}`;
  const r = s.realms[s.player];
  const y = realmYields(s, table, s.player);
  const stat = (icon, v, low = false, title = '') => `<span class="stat${low ? ' low' : ''}" title="${esc(title)}"><i>${icon}</i>${v}</span>`;
  $('stats').innerHTML = [
    stat('👑', `${Math.floor(r.treasury)} (${signed(y.crowns - y.upkeep)})`, r.treasury < 0, 'Crowns, and this month\'s change'),
    stat('⚒', `${Math.floor(r.production)} (+${y.production})`, false, 'Production in hand, and this month\'s'),
    stat('✦', Math.floor(r.devotion), false, 'Devotion'),
    stat('❦', Math.floor(r.renown), false, 'Renown'),
    stat('♥', Math.round(r.love), r.love < 30, 'Love'),
    stat('⚔', Math.round(r.fear), false, 'Fear'),
    stat('🔥', Math.round(r.unrest), r.unrest > 60, 'Unrest'),
  ].join('');
  $('end').disabled = !!s.over;
  $('end').textContent = s.over ? 'The end' : 'End turn';
  view.draw();
}
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---- Sheets ----
function openSheet(title, html) {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('hint').hidden = true;
}
function closeSheet() { $('sheet').hidden = true; }
$('sheet-close').addEventListener('click', () => { app.selected = null; closeSheet(); view.draw(); });

function yieldsHtml(y) {
  const cell = (label, v) => `<div>${label}<b>${Math.round(v)}</b></div>`;
  return `<div class="yields">${cell('Food', y.food)}${cell('Production', y.production)}${cell('Crowns', y.crowns)}${cell('Faith', y.faith)}${cell('Renown', y.renown)}</div>`;
}

function showRegion(id) {
  const s = app.state;
  const r = table.board.regions[id];
  const c = s.cities[id];
  const ctl = controller(s, id);
  const ours = c.owner === s.player && !c.holder;
  const kind = r.capital ? `capital of ${nameOf(table, r.realm)}` : `${r.type} of ${nameOf(table, r.realm)}`;
  const held = c.holder ? `<p class="sub">Held by ${esc(nameOf(table, c.holder))}.</p>` : '';
  const siege = c.siege ? `<p class="sub">Besieged by ${esc(nameOf(table, c.siege.by))}, ${c.siege.turns} month${c.siege.turns > 1 ? 's' : ''}.</p>` : '';
  const crossings = table.board.adj[id].filter((l) => l.crossing).map((l) => `the ${l.rivers.join(' and ')} (${l.crossing})`);
  const works = [...new Set(table.works[id])].map((b) => table.world.buildings[b]?.name ?? b).join(', ');
  const comps = table.data.game.companies;
  const recruitRow = ours ? `<h3>Raise a company</h3><div class="seg">${Object.entries(comps).map(([k, v]) =>
    `<button type="button" class="act" data-recruit="${k}" ${s.realms[s.player].production < v.cost ? 'disabled' : ''}>${esc(v.name)} (${v.cost})</button>`).join('')}</div>` : '';
  openSheet(r.name, `
    <p class="sub">${esc(kind[0].toUpperCase() + kind.slice(1))}. ${Math.round(c.pop).toLocaleString('en-GB')} people.${ctl !== s.player && atWar(s, s.player, ctl) ? ' At war with us.' : ''}</p>
    ${held}${siege}
    ${yieldsHtml(cityYields(s, table, id))}
    <p class="sub">Works: ${esc(works || 'none')}.</p>
    ${crossings.length ? `<p class="sub">Crossing: ${esc(crossings.join(', '))}.</p>` : ''}
    ${recruitRow}`);
  for (const b of document.querySelectorAll('[data-recruit]')) {
    b.addEventListener('click', () => {
      const out = recruit(s, table, s.player, id, b.dataset.recruit);
      if (out.error) toast(out.error);
      save();
      refresh();
      showRegion(id);
    });
  }
}

function showArmy(a) {
  if (!a) return closeSheet();
  const s = app.state;
  const comps = table.data.game.companies;
  const ours = a.owner === s.player;
  const r = table.board.regions[a.region];
  const reach = app.selected?.reach ?? {};
  openSheet(`${ours ? 'Our' : nameOf(table, a.owner) + '’s'} army at ${r.name}`, `
    <p class="sub">${a.companies.length} companies, strength ${strength(table, a).toFixed(1)}.${a.hungry ? ' Out of supply: losing men.' : ''}</p>
    ${a.companies.map((c) => `<div class="row"><span>${esc(comps[c.type].name)}</span><span>${c.str}%</span></div>`).join('')}
    ${ours ? `<p class="sub">${a.points} of ${movePoints(table, s)} marches left this month. ${Object.keys(reach).length ? 'Drag the piece, or tap a lit place, to march.' : 'Nowhere it can reach this month.'}</p>` : ''}`);
}

function showRealm() {
  const s = app.state;
  const r = s.realms[s.player];
  const y = realmYields(s, table, s.player);
  const g = table.data.game;
  openSheet(nameOf(table, s.player), `
    <p class="sub">${esc(g.rulers[s.player] ?? '')}. Authority ${Math.round(authority(r))}${riots(s, table, s.player) ? ': the towns riot, and production is halved' : ''}.</p>
    ${yieldsHtml(y)}
    <p class="sub">Armies cost ${y.upkeep} crowns a month. The people eat ${y.eat} food.</p>
    <h3>Taxes</h3>
    <div class="seg">${Object.keys(g.tax).map((k) => `<button type="button" class="act" data-tax="${k}" aria-pressed="${r.tax === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <p class="sub">Heavy taxes fill the treasury and cost Love; light ones win it back.</p>`);
  for (const b of document.querySelectorAll('[data-tax]')) {
    b.addEventListener('click', () => { r.tax = b.dataset.tax; save(); refresh(); showRealm(); });
  }
}

function showWar() {
  const s = app.state;
  const rows = Object.keys(s.realms).filter((rid) => rid !== s.player).map((rid) => {
    const war = atWar(s, s.player, rid);
    return `<div class="row"><span>${esc(nameOf(table, rid))}${war ? ' <b style="color:#f0a08a">at war</b>' : ''}</span>${war ? '' : `<button type="button" class="act war" data-war="${rid}">Declare war</button>`}</div>`;
  }).join('');
  openSheet('War and peace', `<p class="sub">Your armies may only march into the lands of a realm you are at war with. Treaties and peace come with diplomacy (step 7).</p>${rows}`);
  for (const b of document.querySelectorAll('[data-war]')) {
    b.addEventListener('click', () => { declareWar(s, table, s.player, b.dataset.war); save(); refresh(); showWar(); });
  }
}

function showLog() {
  const s = app.state;
  const lines = s.log.slice().reverse().map((l) => {
    const d = dateOf(table, l.turn);
    return `<p><span class="t">${monthName(d.month).slice(0, 3)} ${d.year}</span>${esc(l.text)}</p>`;
  }).join('');
  openSheet('Reports', `<div class="log">${lines || '<p class="sub">Nothing yet.</p>'}</div>`);
}

function showMenu() {
  openSheet('Menu', `
    <p class="sub">This is the turn-based Northern Wars, being built in steps. The board and turns are in; battles, goals, the smaller kingdoms, diplomacy and the wars' story come next.</p>
    <div class="row"><span>Start a new game as Temeria</span><button type="button" class="act" id="new-game">New game</button></div>
    <div class="row"><span>The real-time game</span><a class="act" style="display:inline-grid;place-items:center;text-decoration:none" href="../">Open</a></div>`);
  $('new-game').addEventListener('click', () => {
    app.state = createGame(table, { seed: (Date.now() & 0xffff) || 1 });
    save();
    app.select(null);
    refresh();
    toast('A new reign begins in March 1262.');
  });
}

function showDilemma() {
  const d = dilemmaView(app.state, table);
  if (!d) return;
  openSheet(d.title, `<div class="dilemma"><p>${esc(d.text)}</p>${d.choices.map((c, i) => `<button type="button" class="act" data-answer="${i}">${esc(c)}</button>`).join('')}</div>`);
  for (const b of document.querySelectorAll('[data-answer]')) {
    b.addEventListener('click', () => { answerDilemma(app.state, table, Number(b.dataset.answer)); save(); closeSheet(); refresh(); });
  }
}

for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => ({ realm: showRealm, war: showWar, log: showLog, menu: showMenu })[b.dataset.open]());
}

let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

$('end').addEventListener('click', () => {
  const before = app.state.log.length;
  const turn = app.state.turn;
  endTurn(app.state, table);
  save();
  app.select(null);
  refresh();
  const news = app.state.log.filter((l) => l.turn === turn).slice(-Math.max(0, app.state.log.length - before));
  if (app.state.dilemma) showDilemma();
  else if (news.length) toast(news.slice(-2).map((l) => l.text).join(' '));
});

refresh();
$('loading').hidden = true;
if (app.state.dilemma) showDilemma();
