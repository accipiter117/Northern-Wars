// Northern Wars v2: the war table, one turn a month. Wires the engine to
// the table and the panels; saves after every act.
import { loadTable } from '../engine/load.js';
import {
  createGame, endTurn, moveArmy, recruit, declareWar, atWar, reachable, controller, cityYields, realmYields,
  authority, riots, dateOf, monthName, nameOf, strength, dilemmaView, answerDilemma, serialize, deserialize, movePoints,
  companyCost, chapterNow, goalContext, realmBonus, sail, fleetReach, finishBattle, battleRound, battleAuto, battleRetreat,
  termsOpen, offerTerms, storm, stormOdds, answerStoryCard,
} from '../engine/game.js';
import { placeCompany, oddsNow } from '../engine/battle.js';
import { opinionOf, opinionParts, treatiesOf, treatyAnswer, propose, answerOffer, warScore } from '../engine/diplomacy.js';
import { netOf, setTarget, spyOp } from '../engine/spies.js';
import { storyCard, storySoFar, rulerOf } from '../engine/story.js';
import { repair, repairCost, setFocus, annex, worksOf, condOf } from '../engine/cities.js';
import { goalsOf, goalStatus, unlockName, companyTypes, companyDef, buildable, raise } from '../engine/goals.js';
import { sealRoutes, seal, sendEnvoy, doFavour, questText, leader, typeOf, judge, vassalsOf } from '../engine/minors.js';
import { createTable } from './table.js';
import { mayBuildFleet, buildFleet, fleetsAt, commanderOf, commanderDef, assignCommander, recallCommander, isCoastal } from '../engine/forces.js';
import { createBackdrop } from './backdrop.js';
import { lawDef, lawBar, enact, repeal, enacted, lawSlots, patronOf, rulingFaith, faithName, missionReach, missionCost, sendMission, faithShares } from '../engine/laws.js';
import { createCamera } from '../../../src/render/camera.js';
import { createAudio } from '../../../src/ui/audio.js';
import { loadPrefs, savePrefs } from '../../../src/ui/hints.js';

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
    if (text) return deserialize(text, table);
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
    } else if (sel?.fleet) {
      const f = (app.state.fleets ?? []).find((x) => x.id === sel.fleet);
      const ours = f && f.owner === app.state.player;
      app.selected = { fleet: sel.fleet, carry: sel.carry ?? null, region: f?.region, reach: ours ? fleetReach(app.state, table, sel.fleet) : {} };
      showFleet(f);
    } else if (sel?.region) {
      app.selected = { region: sel.region };
      showRegion(sel.region);
    } else {
      app.selected = null;
      closeSheet();
    }
    view.draw();
  },
  sail(fleetId, armyId, region) {
    const r = sail(app.state, table, fleetId, armyId, region, { interactive: true });
    if (r.error) toast(r.error);
    else if (r.sunk) toast('Our ships were sunk.');
    if (r.battle === 'pending') {
      sound('horn');
      save();
      refresh();
      return showBattle();
    }
    save();
    app.select(null);
    refresh();
    if (r.landed || r.sailed) toast(app.state.log.at(-1)?.text ?? 'The fleet sails.');
  },
  march(armyId, region) {
    const r = moveArmy(app.state, table, armyId, region, { interactive: true });
    if (r.error) toast(r.error);
    if (r.battle === 'pending') {
      sound('horn');
      save();
      refresh();
      return showBattle();
    }
    save();
    app.select({ army: armyId });
    if (!app.state.armies.some((a) => a.id === armyId)) app.select(null);
    refresh();
  },
};

// The real-time game's painted map and its road life under the table; the
// plain wooden table if it cannot be drawn (or with ?plain).
let backdrop = null;
const cam = createCamera(table.world);
if (!new URLSearchParams(location.search).has('plain')) {
  try {
    const layoutCfg = await (await fetch('../data/layout.json')).json();
    backdrop = createBackdrop($('map'), table.world, cam, layoutCfg);
  } catch (e) {
    console.warn('The painted map could not be drawn; using the plain table.', e);
    backdrop = null;
  }
}
const view = createTable($('table'), app, backdrop ? { cam, backdrop } : {});
// Sound and music, as in the real-time game (and with its settings).
const prefs = loadPrefs();
const audio = createAudio(prefs, { save: savePrefs, base: '../' });
const sound = (k) => { try { audio.play(k); } catch { /* sound is a nicety */ } };

// Offline play and updates: the same service worker as the real-time game,
// which keeps v2's files too. A new version takes over at once; a page that
// has only just opened switches to it, one in use offers it on the Menu.
if ('serviceWorker' in navigator && (!navigator.webdriver || new URLSearchParams(location.search).has('sw'))) {
  const opened = Date.now();
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return;
    if (Date.now() - opened < 15000) location.reload();
    else app.updateReady = true;
  });
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => { /* offline play is a nicety */ });
}

window.northernWarsV2 = { app, view, get backdrop() { return backdrop; }, get state() { return app.state; } };

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
  // Once the game is over the button shows the ending again.
  $('end').disabled = false;
  $('end').textContent = s.over ? 'The end' : 'End turn';
  view.draw();
}
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---- Sheets ----
function openSheet(title, html) {
  $('sheet').classList.remove('battle');
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('hint').hidden = true;
}
function closeSheet() { $('sheet').hidden = true; }
$('sheet-close').addEventListener('click', () => {
  // A battle cannot be walked away from: it is fought out.
  if (app.state.battle) { battleAuto(app.state, table); return showBattle(); }
  app.selected = null;
  closeSheet();
  view.draw();
});

function yieldsHtml(y) {
  const cell = (label, v) => `<div>${label}<b>${Math.round(v)}</b></div>`;
  return `<div class="yields">${cell('Food', y.food)}${cell('Production', y.production)}${cell('Crowns', y.crowns)}${cell('Faith', y.faith)}${cell('Renown', y.renown)}</div>`;
}

// A city's faiths, strongest first, and whether its owner's patron rules.
function faithLine(id) {
  const mix = app.state.faiths?.[id];
  if (!mix || !table.data.laws) return '';
  const list = Object.entries(mix).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 3).map(([f, v]) => `${faithName(table, f)} ${Math.round(v)}`).join(', ');
  const owner = app.state.cities[id].owner;
  const odd = rulingFaith(app.state, id) !== patronOf(table, owner) ? ` Its faith is not its crown's: restless.` : '';
  return `<p class="sub">Faiths (in every hundred): ${esc(list)}.${esc(odd)}</p>`;
}

function showRegion(id) {
  const s = app.state;
  const r = table.board.regions[id];
  const c = s.cities[id];
  const ctl = controller(s, id);
  const ours = c.owner === s.player && !c.holder;
  const kind = r.capital ? `capital of ${nameOf(table, r.realm)}` : `${r.type} of ${nameOf(table, r.realm)}`;
  const owner = c.owner !== r.realm ? ` Now ${nameOf(table, c.owner)}'s.` : '';
  const held = c.holder ? `<p class="sub">Held by ${esc(nameOf(table, c.holder))}.</p>` : '';
  const siege = c.siege ? `<p class="sub">Besieged by ${esc(nameOf(table, c.siege.by))}, ${c.siege.turns} month${c.siege.turns > 1 ? 's' : ''}.</p>` : '';
  const settling = c.integration !== undefined ? `<p class="sub">Settling under its new crown: ${Math.round(c.integration)} of 100. It yields more as it settles.</p>` : '';
  const crossings = table.board.adj[id].filter((l) => l.crossing).map((l) => `the ${l.rivers.join(' and ')} (${l.crossing})`);
  const works = worksOf(table, id).map((b) => {
    const cond = condOf(s, id, b);
    return `${table.world.buildings[b]?.name ?? b}${cond < 100 ? ` (${Math.round(cond)}%)` : ''}`;
  }).join(', ');
  const built = Object.entries(s.built).filter(([, b]) => b.region === id).map(([bid]) => (table.data.uniques.buildings[bid] ?? table.data.uniques.wonders[bid]).name);
  const g = table.data.game;
  let acts = '';
  if (ours) {
    const realm = s.realms[s.player];
    const rate = g.crownsPerProduction;
    const crowns = !!app.payCrowns;
    const price = (n) => (crowns ? `${n * rate} crowns` : `${n} production`);
    const can = (n) => (crowns ? realm.treasury >= n * rate : realm.production >= n);
    acts += `<h3>This month's focus</h3><div class="seg wrap">${g.cities.focus.kinds.map((k) => `<button type="button" class="act" data-focus="${k}" aria-pressed="${(c.focus ?? 'balanced') === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`;
    acts += `<h3>Pay with</h3><div class="seg"><button type="button" class="act" data-pay="production" aria-pressed="${!crowns}">Production (${Math.floor(realm.production)})</button><button type="button" class="act" data-pay="crowns" aria-pressed="${crowns}">Crowns (${Math.floor(realm.treasury)})</button></div>${crowns ? `<p class="sub">Crowns buy at ${rate} for each point of production.</p>` : ''}`;
    const cost = repairCost(s, table, id);
    if (cost) acts += `<div class="row"><span>War has worn its works. Mend them all for ${price(cost)}.</span><button type="button" class="act" data-repair ${can(cost) ? '' : 'disabled'}>Repair</button></div>`;
    for (const b of buildable(s, table, s.player).filter((x) => x.def.at === id)) {
      acts += `<div class="row"><span>${b.wonder ? 'Wonder' : 'Raise'}: <b>${esc(b.def.name)}</b>, ${price(b.def.cost)}. ${esc(b.def.blurb)}</span><button type="button" class="act" data-raise="${b.id}" ${can(b.def.cost) ? '' : 'disabled'}>Raise</button></div>`;
    }
    if (mayBuildFleet(s, table, s.player, id)) {
      const fc = table.data.forces.fleet.cost;
      acts += `<div class="row"><span>A port: build a fleet for ${price(fc)}. Fleets carry armies by sea.</span><button type="button" class="act" data-fleet ${can(fc) ? '' : 'disabled'}>Build</button></div>`;
    }
    acts += `<h3>Raise a company</h3><div class="seg wrap">${companyTypes(s, table, s.player).map((k) => {
      const cost2 = companyCost(s, table, s.player, k);
      return `<button type="button" class="act" data-recruit="${k}" ${can(cost2) ? '' : 'disabled'}>${esc(companyDef(table, k).name)} (${crowns ? cost2 * rate : cost2})</button>`;
    }).join('')}</div>`;
  }
  if (!ours && mayBuildFleet(s, table, s.player, id)) {
    const fc = table.data.forces.fleet.cost;
    acts += `<div class="row"><span>Our vassal's port: build a fleet here for ${fc} production. Fleets carry armies by sea.</span><button type="button" class="act" data-fleet ${s.realms[s.player].production >= fc ? '' : 'disabled'}>Build</button></div>`;
  }
  const mix = s.faiths?.[id];
  if (mix && table.data.laws) {
    const p = patronOf(table, s.player);
    if (missionReach(s, table, s.player).has(id) && (mix[p] ?? 0) < 99) {
      const mc = missionCost(table, realmBonus(s, table, s.player));
      acts += `<div class="row"><span>Send missionaries of ${esc(faithName(table, p))}: ${mc} Devotion for ${table.data.laws.faiths.missions.share} more in every hundred souls.</span><button type="button" class="act" data-mission ${s.realms[s.player].devotion >= mc && c.mission !== s.turn ? '' : 'disabled'}>Send</button></div>`;
    }
  }
  if (c.holder === s.player) acts += `<div class="row"><span>We hold it. Keep it, and it becomes ours, sullen at first.</span><button type="button" class="act" data-annex>Keep it</button></div>`;
  if (c.siege?.by === s.player) {
    const odds = Math.round((stormOdds(s, table, s.player, id) ?? 0) * 100);
    acts += `<h3>The siege</h3><p class="sub">Its stores last about ${Math.max(0, Math.floor(c.store / Math.max(0.1, (c.pop / 1000) * g.eat)))} more months. Starve it out, storm the walls, or offer terms; march away to lift the siege.</p>
      <div class="seg wrap"><button type="button" class="act war" data-storm>Storm the walls (${odds}% to win)</button>${termsOpen(s, table, s.player, id) ? '<button type="button" class="act" data-terms>Offer terms</button>' : ''}</div>`;
  }
  openSheet(r.name, `
    <p class="sub">${esc(kind[0].toUpperCase() + kind.slice(1))}.${esc(owner)} ${Math.round(c.pop).toLocaleString('en-GB')} people.${ctl !== s.player && atWar(s, s.player, ctl) ? ' At war with us.' : ''}</p>
    ${held}${siege}${settling}
    ${yieldsHtml(cityYields(s, table, id))}
    <p class="sub">Works: ${esc(works || 'none')}.${built.length ? ` Raised here: ${esc(built.join(', '))}.` : ''}</p>
    ${crossings.length ? `<p class="sub">Crossing: ${esc(crossings.join(', '))}.</p>` : ''}
    ${faithLine(id)}
    ${acts}`);
  const act = (sel, fn) => { for (const b of document.querySelectorAll(sel)) b.addEventListener('click', () => { const out = fn(b); if (out?.error) toast(out.error); save(); refresh(); showRegion(id); }); };
  act('[data-recruit]', (b) => recruit(s, table, s.player, id, b.dataset.recruit, { crowns: !!app.payCrowns }));
  act('[data-pay]', (b) => { app.payCrowns = b.dataset.pay === 'crowns'; });
  act('[data-focus]', (b) => setFocus(s, table, s.player, id, b.dataset.focus));
  act('[data-repair]', () => repair(s, table, s.player, id, { crowns: !!app.payCrowns }));
  act('[data-raise]', (b) => raise(s, table, s.player, b.dataset.raise, { crowns: !!app.payCrowns }));
  act('[data-annex]', () => annex(s, table, s.player, id));
  act('[data-fleet]', () => buildFleet(s, table, s.player, id, { crowns: !!app.payCrowns }));
  act('[data-terms]', () => offerTerms(s, table, s.player, id));
  act('[data-mission]', () => sendMission(s, table, s.player, id, realmBonus(s, table, s.player)));
  for (const el of document.querySelectorAll('[data-storm]')) el.addEventListener('click', () => {
    const out = storm(s, table, s.player, id, { interactive: true });
    if (out.error) return toast(out.error);
    save();
    refresh();
    showBattle();
  });
}

function showArmy(a) {
  if (!a) return closeSheet();
  const s = app.state;
  const ours = a.owner === s.player;
  const r = table.board.regions[a.region];
  const reach = app.selected?.reach ?? {};
  openSheet(`${ours ? 'Our' : nameOf(table, a.owner) + '’s'} army at ${r.name}`, `
    <p class="sub">${a.companies.length} companies, strength ${strength(table, a).toFixed(1)}.${a.hungry ? ' Out of supply: losing men.' : ''}</p>
    ${a.companies.map((c) => { const d = companyDef(table, c.type); return `<div class="row"><span>${esc(d.name)}${d.ability ? `<br><small class="sub">${esc(d.ability)}</small>` : ''}</span><span>${c.str}%</span></div>`; }).join('')}
    ${ours ? `<p class="sub">${a.points} marches left this month. ${Object.keys(reach).length ? 'Drag the piece, or tap a lit place, to march.' : 'Nowhere it can reach this month.'}</p>` : ''}
    ${commandHtml(a)}`);
  for (const b of document.querySelectorAll('[data-command]')) b.addEventListener('click', () => { const out = assignCommander(s, table, b.dataset.command, a.id); if (out.error) toast(out.error); save(); app.select({ army: a.id }); });
  for (const b of document.querySelectorAll('[data-recall]')) b.addEventListener('click', () => { recallCommander(s, b.dataset.recall); save(); app.select({ army: a.id }); });
  for (const b of document.querySelectorAll('[data-embark]')) b.addEventListener('click', () => app.select({ fleet: Number(b.dataset.embark), carry: a.id }));
}

// The army's commander, those who could take it, and a ship to board.
function commandHtml(a) {
  const s = app.state;
  if (!s.commanders) return '';
  const cid = commanderOf(s, a.id);
  let html = '';
  if (cid) {
    const d = commanderDef(table, cid);
    html += `<h3>Commander</h3><div class="row"><span><b>${esc(d.name)}</b><br><small class="sub">${esc(d.text)}</small></span>${a.owner === s.player ? `<button type="button" class="act" data-recall="${cid}">To court</button>` : ''}</div>`;
  }
  if (a.owner !== s.player) return html;
  const free = Object.entries(s.commanders).filter(([id, c]) => c.owner === s.player && id !== cid && !c.wounded
    && (!c.army || s.armies.find((x) => x.id === c.army)?.region === a.region));
  if (free.length) html += `<h3>${cid ? 'Or give command to' : 'Give command to'}</h3><div class="seg wrap">${free.map(([id]) => `<button type="button" class="act" data-command="${id}">${esc(commanderDef(table, id).name)}</button>`).join('')}</div>`;
  const ships = fleetsAt(s, a.region, s.player);
  if (ships.length && a.points > 0) html += `<h3>By sea</h3><div class="row"><span>Our fleet lies here. Board it and sail to a port it can reach.</span><button type="button" class="act" data-embark="${ships[0].id}">Embark</button></div>`;
  return html;
}

function showFleet(f) {
  if (!f) return closeSheet();
  const s = app.state;
  const ours = f.owner === s.player;
  const r = table.board.regions[f.region];
  const carry = app.selected?.carry ? s.armies.find((a) => a.id === app.selected.carry) : null;
  const n = Object.keys(app.selected?.reach ?? {}).length;
  openSheet(`${ours ? 'Our' : `${nameOf(table, f.owner)}\u2019s`} fleet at ${r.name}`, `
    <p class="sub">${ours ? `${f.points} sea marches left this month. ${carry ? `Carrying our army of ${carry.companies.length} companies: tap a lit port to land it.` : n ? 'Tap a lit port to sail there.' : 'No port within reach this month.'}` : 'A fleet of another crown.'}</p>
    ${ours && !carry ? s.armies.filter((a) => a.owner === s.player && a.region === f.region && a.points > 0).map((a) => `<div class="row"><span>Our army of ${a.companies.length} companies is in port.</span><button type="button" class="act" data-carry="${a.id}">Embark it</button></div>`).join('') : ''}`);
  for (const b of document.querySelectorAll('[data-carry]')) b.addEventListener('click', () => app.select({ fleet: f.id, carry: Number(b.dataset.carry) }));
}

function showGoals() {
  const s = app.state;
  const ch = chapterNow(s, table);
  const realm = s.realms[s.player];
  const ctx = goalContext(s);
  const chapters = table.data.goals.chapters;
  const trees = table.data.goals.trees;
  const label = { companies: 'companies', unit: 'companies of that kind', treasury: 'crowns', devotion: 'Devotion', renown: 'renown', love: 'Love', authority: 'Authority', control: 'places held', garrison: 'places garrisoned', regions: 'regions', pop: 'people', vassals: 'vassals', envoys: 'envoys', built: 'raised', capitals: 'capitals' };
  const html = chapters.slice(0, ch.index + 1).reverse().map((chap) => {
    const goals = goalsOf(table, s.player).filter((g) => g.chapter === chap.id);
    return `<h3>${esc(chap.name)}${chap.id === ch.id ? ' (now)' : ''}</h3>${Object.entries(trees).map(([tree, name]) => {
      const list = goals.filter((g) => g.tree === tree).map((g) => {
        const done = realm.goals.includes(g.id);
        const st = done ? null : goalStatus(s, table, s.player, g, ctx);
        const prog = st ? st.needs.map((n) => `${n.have} of ${n.want} ${label[n.key] ?? n.key}`).join('; ') : 'Done';
        return `<div class="row"><span>${done ? '✓' : '○'} <b>${esc(g.name)}</b><br><small class="sub">${esc(g.text)} ${esc(prog)}. ${esc(unlockName(table, g.unlock))}</small></span></div>`;
      }).join('');
      return list ? `<p class="sub"><i>${esc(name)}</i></p>${list}` : '';
    }).join('')}`;
  }).join('');
  const b = realmBonus(s, table, s.player);
  const extras = ['crowns', 'production', 'faith', 'renown'].filter((k) => b[k]).map((k) => `+${b[k]} ${k}`).join(', ');
  const story = storySoFar(s, table).reverse().map((e) => { const d = dateOf(table, e.turn); return `<p><span class="t">${monthName(d.month).slice(0, 3)} ${d.year}</span><b>${esc(e.title)}</b>. ${esc(e.text)}</p>`; }).join('');
  openSheet('Goals and the story', `<p class="sub">Now: <b>${esc(ch.name)}</b>. Goals take the place of learning: meet them to unlock units, buildings, wonders and yields. Earlier chapters' goals stay open.${extras ? ` Goals, wonders and vassals give us ${esc(extras)} a month.` : ''}</p>${html}
    <h3>The story so far</h3><div class="log">${story || '<p class="sub">The Dawn of the Reign: the North is at peace, for now. The Emperor is massing his legions.</p>'}</div>`);
}

function showCourts() {
  const s = app.state;
  const cfg = table.data.minors;
  const rows = Object.entries(s.minors).filter(([m]) => s.realms[m]).map(([m, x]) => {
    const t = typeOf(table, m);
    const mine = x.envoys[s.player] ?? 0;
    const lead = leader(s, m);
    const others = Object.entries(x.envoys).filter(([p, n]) => p !== s.player && n > 0).map(([p, n]) => `${nameOf(table, p)} ${n}`).join(', ');
    const routes = sealRoutes(s, table, s.player, m);
    const q = questText(table, m, x.quest);
    const bonus = Object.entries(t.bonus).map(([k, v]) => `+${v} ${k}`).join(', ');
    return `<div class="court">
      <div class="row"><span><b>${esc(nameOf(table, m))}</b>, ${esc(t.name.toLowerCase())} (suzerain gains ${esc(bonus)} a month)<br>
      <small class="sub">${x.suzerain ? `Vassal of ${esc(nameOf(table, x.suzerain))}. ` : ''}${x.rebel ? 'In revolt. ' : ''}Our envoys ${mine}${others ? `; ${esc(others)}` : ''}.${lead === s.player ? ' We lead here.' : ''}</small></span>
      <button type="button" class="act" data-envoy="${m}" ${s.realms[s.player].renown < cfg.envoyCost ? 'disabled' : ''}>Envoy (${cfg.envoyCost})</button></div>
      ${q ? `<div class="row"><small class="sub">It ${esc(q)}.</small>${x.quest.kind === 'gift' ? `<button type="button" class="act" data-favour="${m}">Pay</button>` : ''}</div>` : ''}
      ${routes.length ? `<div class="seg wrap">${routes.map((rt) => `<button type="button" class="act" data-seal="${m}:${rt}">Seal: ${{ protection: 'protection', pressure: `pressure (${cfg.pressure.gift} crowns)`, terms: 'peace terms' }[rt]}</button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  openSheet('The smaller crowns', `<p class="sub">Envoys cost renown. With ${cfg.sealMin} or more at a court, and more than any rival, we may seal it as a vassal: by protection when it is threatened, by pressure when our companies outnumber its own three to one (with a gift), or by peace terms when we hold its capital. Any envoy opens its roads to our armies. Vassals: ${esc(vassalsOf(s, s.player).map((v) => nameOf(table, v)).join(', ') || 'none yet')}.</p>${rows}`);
  const act = (sel, fn) => { for (const b of document.querySelectorAll(sel)) b.addEventListener('click', () => { const out = fn(b.dataset); if (out?.error) toast(out.error); save(); refresh(); showCourts(); }); };
  act('[data-envoy]', (d) => sendEnvoy(s, table, s.player, d.envoy));
  act('[data-favour]', (d) => doFavour(s, table, s.player, d.favour));
  act('[data-seal]', (d) => { const [m, rt] = d.seal.split(':'); return seal(s, table, s.player, m, rt); });
}

function showJudgement() {
  const s = app.state;
  const j = s.judgement;
  if (!j) return;
  const list = table.data.minors.judgements;
  openSheet(`Judgement on ${nameOf(table, j.minor)}`, `<div class="dilemma"><p>The rebel king of ${esc(nameOf(table, j.minor))} kneels before us, his capital taken. What is his fate?</p>${Object.entries(list).map(([k, v]) => `<button type="button" class="act" data-judge="${k}"><b>${esc(v.name)}</b>. ${esc(v.text)}</button>`).join('')}</div>`);
  for (const b of document.querySelectorAll('[data-judge]')) {
    b.addEventListener('click', () => { judge(s, table, j.by, j.minor, b.dataset.judge); save(); closeSheet(); refresh(); });
  }
}

function showRealm() {
  const s = app.state;
  const r = s.realms[s.player];
  const y = realmYields(s, table, s.player);
  const g = table.data.game;
  openSheet(nameOf(table, s.player), `
    <p class="sub">${esc(rulerOf(s, table, s.player))}. Authority ${Math.round(authority(r))}${riots(s, table, s.player) ? ': the towns riot, and production is halved' : ''}.</p>
    ${yieldsHtml(y)}
    <p class="sub">Armies cost ${y.upkeep} crowns a month. The people eat ${y.eat} food.</p>
    <h3>Taxes</h3>
    <div class="seg">${Object.keys(g.tax).map((k) => `<button type="button" class="act" data-tax="${k}" aria-pressed="${r.tax === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <p class="sub">Heavy taxes fill the treasury and cost Love; light ones win it back.</p>
    ${lawsHtml()}`);
  for (const b of document.querySelectorAll('[data-tax]')) {
    b.addEventListener('click', () => { r.tax = b.dataset.tax; save(); refresh(); showRealm(); });
  }
  const act = (sel, fn) => { for (const b of document.querySelectorAll(sel)) b.addEventListener('click', () => { const out = fn(b.dataset); if (out?.error) toast(out.error); save(); refresh(); showRealm(); }); };
  act('[data-enact]', (d) => enact(s, table, s.player, d.enact, chapterNow(s, table).index));
  act('[data-repeal]', (d) => repeal(s, table, s.player, d.repeal));
}

// The Book of Laws and the realm's faith, for the Realm sheet.
function lawsHtml() {
  const L = table.data.laws;
  if (!L) return '';
  const s = app.state;
  const ci = chapterNow(s, table).index;
  const mine = enacted(s, s.player);
  const fx = { crownsPct: 'crowns', productionPct: 'production', faithPct: 'faith' };
  const effect = (k, v) => {
    if (fx[k]) return `${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${fx[k]}`;
    const per = { love: 'Love', fear: 'Fear', unrest: 'Unrest', renown: 'renown' }[k];
    if (per) return `${v > 0 ? '+' : ''}${v} ${per} a month`;
    return { companyCost: `companies cost ${Math.round(v * 100)}%`, upkeep: `upkeep ${Math.round(v * 100)}%`, defend: `walls ${Math.round(v * 100)}%`, integration: `conquests settle +${v} a month`, movePoints: `+${v} march`, missionCost: `missionaries cost ${Math.round(v * 100)}%`, faithUnrest: `unrest from other faiths ${Math.round(v * 100)}%` }[k] ?? k;
  };
  const chapters = Object.values(L.chapters).map((ch) => `<p class="sub"><i>${esc(ch.name)}</i></p>${Object.values(ch.paths).map((p) => p.laws.map((law) => {
    const on = mine.includes(law.id);
    const bar = on ? null : lawBar(s, table, s.player, law.id, ci);
    const all = Object.entries(law.effects).map(([k, v]) => effect(k, v)).join(', ');
    const fxs = all[0].toUpperCase() + all.slice(1);
    return `<div class="row"><span>${on ? '✓' : '○'} <b>${esc(law.name)}</b> <small class="sub">(${esc(p.name)})</small><br><small class="sub">${esc(law.text)} ${esc(fxs)}. ${on ? '' : `${law.cost} crowns, ${law.authority} Authority.${bar ? ` ${bar}` : ''}`}</small></span>${on ? `<button type="button" class="act" data-repeal="${law.id}">Repeal</button>` : `<button type="button" class="act" data-enact="${law.id}" ${bar ? 'disabled' : ''}>Enact</button>`}</div>`;
  }).join('')).join('')}`).join('');
  const p = patronOf(table, s.player);
  const ours = Object.keys(s.cities).filter((id) => s.cities[id].owner === s.player);
  const keep = ours.filter((id) => rulingFaith(s, id) === p).length;
  const share = Math.round((faithShares(s)[p] ?? 0) * 100);
  return `<h3>The Book of Laws (${mine.length} of ${lawSlots(table, ci)})</h3>
    <p class="sub">Each chapter has two rival paths; a law on one closes the other until it is repealed. The book holds more laws as the story goes on. Repealing costs ${L.repeal.love} Love, and the law cannot return for ${L.repeal.cooldown} months.</p>${chapters}
    <h3>Faith</h3>
    <p class="sub">Our faith is ${esc(faithName(table, p))}. It rules ${keep} of our ${ours.length} cities and ${share} in every hundred cities of the North; at ${Math.round(L.faiths.victory.share * 100)} its most devout crown wins. Cities of another faith add unrest. Send missionaries from a city's card to any place within ${L.faiths.missions.reach} marches of our land.</p>`;
}

function showWar() {
  const s = app.state;
  const d = table.data.diplomacy;
  const me = s.player;
  const powers = table.data.game.powers.filter((p) => p !== me && s.realms[p]);
  const offers = s.diplomacy.offers.map((o, i) => `<div class="row"><span>${esc(nameOf(table, o.from))} offers ${o.kind === 'peace' ? 'peace' : esc({ alliance: 'an alliance', openBorders: 'open borders', trade: 'a trade deal' }[o.kind])}.</span><span class="seg"><button type="button" class="act" data-offer="${i}:yes">Accept</button><button type="button" class="act" data-offer="${i}:no">Decline</button></span></div>`).join('');
  const great = powers.map((p) => {
    const op = opinionOf(s, p, me);
    const parts = opinionParts(s, table, p, me).filter((x) => x.n).map((x) => `${x.n > 0 ? '+' : ''}${x.n} ${x.why}`).join(', ');
    const war = atWar(s, me, p);
    const signed = treatiesOf(s, me).filter((t) => t.a === p || t.b === p);
    const score = war ? warScore(s, me, p) : null;
    const buttons = war
      ? (() => { const a = treatyAnswer(s, table, me, p, 'peace'); return `<button type="button" class="act" data-propose="${p}:peace">Propose peace${a.yes ? '' : ' (they refuse)'}</button>`; })()
      : Object.entries(d.treaties).filter(([k]) => !signed.some((t) => t.kind === k)).map(([k, t]) => {
        const a = treatyAnswer(s, table, me, p, k);
        return `<button type="button" class="act" data-propose="${p}:${k}" title="${esc(t.text)}">${esc(t.name)}${a.yes ? '' : ' (no)'}</button>`;
      }).join('') + `<button type="button" class="act war" data-war="${p}">Declare war</button>`;
    return `<div class="court"><div class="row"><span><b>${esc(nameOf(table, p))}</b>, ${esc(rulerOf(s, table, p))}. Opinion of us: <b>${op}</b>${war ? ' <b style="color:#f0a08a">at war</b>' : ''}<br>
      <small class="sub">${esc(d.agendas[p]?.text ?? '')}</small><small class="sub">${esc(parts)}</small>
      ${signed.length ? `<small class="sub">Treaties: ${signed.map((t) => esc(d.treaties[t.kind].name.toLowerCase())).join(', ')}.</small>` : ''}
      ${score ? `<small class="sub">War score: us ${score.mine}, them ${score.theirs}.</small>` : ''}</span></div>
      <div class="seg wrap">${buttons}</div></div>`;
  }).join('');
  const minors = Object.keys(s.realms).filter((r) => r !== me && !table.data.game.powers.includes(r) && Object.values(s.cities).some((c) => c.owner === r)).map((rid) => {
    const war = atWar(s, me, rid);
    return `<div class="row"><span>${esc(nameOf(table, rid))}${war ? ' <b style="color:#f0a08a">at war</b>' : ''}</span>${war ? `<button type="button" class="act" data-propose="${rid}:peace">Propose peace</button>` : `<button type="button" class="act war" data-war="${rid}">Declare war</button>`}</div>`;
  }).join('');
  const sp = s.spies[me];
  const ops = table.data.diplomacy.spies.ops;
  const spies = powers.map((p) => {
    const net = netOf(s, me, p);
    return `<div class="row"><span>${esc(nameOf(table, p))}: network ${net}${sp.target === p ? ' (growing)' : ''}</span><span class="seg wrap">${sp.target === p ? '' : `<button type="button" class="act" data-spy="${p}">Build</button>`}${Object.entries(ops).map(([k, o]) => `<button type="button" class="act" data-op="${p}:${k}" ${net < o.cost ? 'disabled' : ''} title="${esc(o.text)}">${esc(o.name)} (${o.cost})</button>`).join('')}</span></div>`;
  }).join('');
  openSheet('Diplomacy', `
    ${offers ? `<h3>Offers to us</h3>${offers}` : ''}
    <h3>The great powers</h3>${great}
    <h3>Spies</h3><p class="sub">Our network grows in one court at a time; a deep one pays for sabotage, theft and incitement, but spies get caught.</p>${spies}
    <h3>The smaller crowns</h3><p class="sub">Our armies may only march into the lands of a realm we are at war with, an ally, one that opens its borders to us, or a smaller crown that welcomes our envoys.</p>${minors}`);
  const act = (sel, fn) => { for (const b of document.querySelectorAll(sel)) b.addEventListener('click', () => { const out = fn(b.dataset); if (out?.error) toast(out.error); save(); refresh(); showWar(); }); };
  act('[data-offer]', (x) => { const [i, yes] = x.offer.split(':'); return answerOffer(s, table, Number(i), yes === 'yes'); });
  act('[data-propose]', (x) => { const [p, k] = x.propose.split(':'); return propose(s, table, me, p, k); });
  act('[data-war]', (x) => { declareWar(s, table, me, x.war); });
  act('[data-spy]', (x) => setTarget(s, table, me, x.spy));
  act('[data-op]', (x) => { const [p, k] = x.op.split(':'); const out = spyOp(s, table, me, p, k); if (out.caught) toast('Our spies were caught.'); return out; });
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
  const on = (k) => prefs[k] !== false;
  openSheet('Menu', `
    ${app.updateReady ? '<div class="row"><span>A new version is ready.</span><button type="button" class="act" id="menu-update">Restart</button></div>' : ''}
    <div class="row"><span>How to play</span><button type="button" class="act" id="menu-guide">Read</button></div>
    <h3>Your reign</h3>
    <div class="row"><span>Save it to a file, to keep or move to another device</span><button type="button" class="act" id="menu-export">Export</button></div>
    <div class="row"><span>Carry on from a saved file</span><button type="button" class="act" id="menu-import">Import</button></div>
    <input type="file" id="menu-file" accept=".json,application/json" hidden>
    <div class="row"><span>Start a new game as Temeria</span><button type="button" class="act war" id="new-game">New game</button></div>
    <h3>Sound</h3>
    <div class="seg"><button type="button" class="act" id="menu-music" aria-pressed="${on('musicOn')}">Music ${on('musicOn') ? 'on' : 'off'}</button><button type="button" class="act" id="menu-sfx" aria-pressed="${on('sfxOn')}">Sounds ${on('sfxOn') ? 'on' : 'off'}</button></div>
    <h3>The real-time game</h3>
    <div class="row"><span>The North in real time, as it was</span><a class="act" style="display:inline-grid;place-items:center;text-decoration:none" href="../">Open</a></div>`);
  if (app.updateReady) $('menu-update').addEventListener('click', () => location.reload());
  $('menu-guide').addEventListener('click', () => showGuide());
  $('menu-music').addEventListener('click', () => { audio.set('musicOn', !on('musicOn')); showMenu(); });
  $('menu-sfx').addEventListener('click', () => { audio.set('sfxOn', !on('sfxOn')); showMenu(); });
  $('menu-export').addEventListener('click', () => {
    const d = dateOf(table, app.state.turn);
    const blob = new Blob([serialize(app.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `northern-wars-v2-${d.year}-${String(d.month).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Saved to a file.');
  });
  $('menu-import').addEventListener('click', () => $('menu-file').click());
  $('menu-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      app.state = deserialize(await f.text(), table);
      save();
      app.select(null);
      refresh();
      toast('The reign carries on from the file.');
    } catch (err) {
      toast(err.message || 'That file could not be read.');
    }
  });
  $('new-game').addEventListener('click', () => {
    app.state = createGame(table, { seed: (Date.now() & 0xffff) || 1 });
    save();
    app.select(null);
    refresh();
    toast('A new reign begins in March 1262.');
  });
}

// ---- The battle screen (step 6) ----
let picked = null;
function showBattle() {
  const s = app.state;
  const b = s.battle;
  if (!b) return;
  const me = b.sides[0].owner === s.player ? 0 : 1;
  const them = 1 - me;
  const r = table.board.regions[b.region];
  const bcfg = table.data.battle;
  const chip = (side, key) => {
    const c = b.sides[side].comps.find((x) => x.key === key);
    const d = companyDef(table, c.type);
    const mine = side === me;
    return `<button type="button" class="chip${mine ? ' mine' : ''}${picked === key ? ' picked' : ''}" ${mine && !b.over ? `data-chip="${key}"` : 'disabled'} style="--c:${table.colours[b.sides[side].owner]?.[0] ?? '#777'}">${esc(d.name)}<small>${c.str}%</small></button>`;
  };
  const lane = (l) => `<div class="lane" data-lane="${l}"><div class="lane-name">${l[0].toUpperCase() + l.slice(1)}</div>
    <div class="foe">${b.sides[them].lanes[l].map((k) => chip(them, k)).join('') || '<small class="sub">empty</small>'}</div>
    <div class="ours">${b.sides[me].lanes[l].map((k) => chip(me, k)).join('') || '<small class="sub">empty</small>'}</div></div>`;
  const odds = b.over ? null : Math.round(oddsNow(table, b, s.rng) * 100);
  const ourOdds = odds === null ? null : (me === 0 ? odds : 100 - odds);
  const weather = b.weather ? `, in ${bcfg.weather[b.weather].name}` : '';
  const title = b.storm ? `Storming ${r.name}` : `Battle at ${r.name}`;
  const result = b.over ? `<p class="result">${b.over.winner === me ? 'Victory' : 'Defeat'}${b.over.reason === 'rout' ? ': the enemy broke' : b.over.reason === 'retreat' ? ': a retreat' : ''}.</p>` : '';
  openSheet(title, `
    <p class="sub">${esc(nameOf(table, b.sides[0].owner))} against ${esc(nameOf(table, b.sides[1].owner))}, on ${esc(b.terrain)} ground${esc(weather)}${b.fort > 1 ? ', behind walls' : ''}. Round ${b.round} of ${bcfg.rounds}.</p>
    <div class="morale"><span>Our morale ${b.sides[me].morale}</span><span>Theirs ${b.sides[them].morale}</span></div>
    <p class="sub">${b.round === 0 ? 'Tap one of our companies, then a lane, to place it. Horse is strong on open ground and poor in woods and marsh; an empty flank lets the enemy turn it.' : 'Tap a company in reserve, then a lane, to commit it.'}</p>
    <div class="lanes">${['left', 'centre', 'right'].map(lane).join('')}</div>
    <div class="lane reserve" data-lane="reserve"><div class="lane-name">Reserve</div><div class="ours">${b.sides[me].lanes.reserve.map((k) => chip(me, k)).join('') || '<small class="sub">none</small>'}</div></div>
    ${b.log.length ? `<div class="log">${b.log.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
    ${result}
    <div class="seg wrap">${b.over ? '<button type="button" class="act" data-b="done">Done</button>' : `
      <button type="button" class="act" data-b="round">Fight a round</button>
      <button type="button" class="act" data-b="auto">Fight it out (${ourOdds}% to win)</button>
      <button type="button" class="act war" data-b="retreat">Sound the retreat</button>`}</div>`);
  $('sheet').classList.add('battle');
  for (const el of document.querySelectorAll('[data-chip]')) {
    el.addEventListener('click', (e) => { e.stopPropagation(); picked = picked === el.dataset.chip ? null : el.dataset.chip; showBattle(); });
  }
  for (const el of document.querySelectorAll('[data-lane]')) {
    el.addEventListener('click', () => {
      if (!picked) return;
      placeCompany(b, me, picked, el.dataset.lane);
      picked = null;
      save();
      showBattle();
    });
  }
  for (const el of document.querySelectorAll('[data-b]')) {
    el.addEventListener('click', () => {
      const k = el.dataset.b;
      picked = null;
      if (k === 'round') battleRound(s, table);
      if (k === 'auto') battleAuto(s, table);
      if (k === 'retreat') battleRetreat(s, table);
      if (k === 'done') {
        finishBattle(s, table, b);
        $('sheet').classList.remove('battle');
        save();
        app.select(null);
        refresh();
        return;
      }
      save();
      showBattle();
    });
  }
}

// ---- The story (step 8) and the endings (step 9) ----
function showStory() {
  const card = storyCard(app.state, table);
  if (!card) return;
  openSheet(card.title, `<div class="dilemma story"><p>${esc(card.text)}</p>${card.choice
    ? card.options.map((o, i) => `<button type="button" class="act" data-story="${i}">${esc(o)}</button>`).join('')
    : '<button type="button" class="act" data-story="0">Read on</button>'}</div>`);
  for (const b of document.querySelectorAll('[data-story]')) {
    b.addEventListener('click', () => { answerStoryCard(app.state, table, Number(b.dataset.story)); app.state.story.told = null; save(); closeSheet(); refresh(); nextCard(); });
  }
}

function showEnding() {
  const e = app.state.over?.ending;
  if (!e) return;
  const d = dateOf(table, app.state.turn);
  openSheet(e.title, `<div class="dilemma ending"><p>${esc(e.text)}</p><p><b>${esc(e.fate.text)}</b></p>
    <p class="sub">${monthName(d.month)} ${d.year}. ${app.state.realms[app.state.player]?.goals?.length ?? 0} goals met.</p>
    <button type="button" class="act" id="ending-new">Begin a new reign</button>
    <button type="button" class="act" id="ending-look">Look at the North as it stands</button></div>`);
  $('ending-new').addEventListener('click', () => { app.state = createGame(table, { seed: (Date.now() & 0xffff) || 1 }); save(); app.select(null); refresh(); });
  $('ending-look').addEventListener('click', () => closeSheet());
}

// Whatever waits on the player, most pressing first.
function nextCard() {
  const s = app.state;
  if (s.battle) return showBattle();
  if (s.over?.ending) return showEnding();
  if (s.story?.choice || s.story?.told) return showStory();
  if (s.judgement) return showJudgement();
  if (s.dilemma) return showDilemma();
  return null;
}

// ---- How to play (step 10): shown once on a first visit, and from the Menu ----
const GUIDE_KEY = 'northern-wars.v2.guided';
function showGuide() {
  openSheet('How to play', `<div class="guide">
    <p>You are Foltest, King of Temeria, from March 1262. One turn is one month; the Northern Wars come when the Empire is ready.</p>
    <p><b>March.</b> Drag one of your blue pieces: every place it can reach this month lights up. Roads are quick, winter is slow, and the Pontar and the Yaruga can only be crossed at bridges. You may only march into a realm you are at war with (or one that lets you through).</p>
    <p><b>Fight.</b> Marching into an enemy army opens the battle: place your companies in the lanes, or fight it out with the odds shown. Walled cities are besieged: starve them, storm them or offer terms.</p>
    <p><b>Rule.</b> Tap a city to set its focus, mend its works, raise companies and wonders (with production, or crowns). Realm sets taxes.</p>
    <p><b>Grow.</b> Goals take the place of learning: meet them to unlock the Temerian crossbowmen, the royal knights, the Temple of Melitele and more. Courts: send envoys to the smaller crowns and make them your vassals. Diplomacy: treaties, war, peace and spies.</p>
    <p><b>Win.</b> Hold most of the North's capitals, make your faith the North's, or simply see Temeria through to the end of 1272.</p>
    <button type="button" class="act" id="guide-go">To the war table</button></div>`);
  $('guide-go').addEventListener('click', () => closeSheet());
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* storage blocked: the guide shows again next time */ }
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
  b.addEventListener('click', () => ({ realm: showRealm, goals: showGoals, courts: showCourts, war: showWar, log: showLog, menu: showMenu })[b.dataset.open]());
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
  if (app.state.over) return showEnding();
  sound('bell');
  const before = app.state.log.length;
  const turn = app.state.turn;
  endTurn(app.state, table);
  save();
  app.select(null);
  refresh();
  const news = app.state.log.filter((l) => l.turn === turn).slice(-Math.max(0, app.state.log.length - before));
  if (nextCard() === null && news.length) toast(news.slice(-2).map((l) => l.text).join(' '));
});

// The map's life moves on its own, a frame at a time (about 30 a second),
// and rests while the game is out of sight.
const monthDay = () => app.state.turn * 30;
let lastFrame = 0;
function loop(now) {
  if (backdrop && !document.hidden && now - lastFrame >= 33) {
    lastFrame = now;
    backdrop.setDay(monthDay());
    backdrop.follow(app.state, table);
    backdrop.frame(now);
    view.draw();
  }
  requestAnimationFrame(loop);
}
if (backdrop) requestAnimationFrame(loop);

refresh();
$('loading').hidden = true;
let guided = false;
try { guided = !!localStorage.getItem(GUIDE_KEY) || new URLSearchParams(location.search).has('noguide'); } catch { guided = true; }
if (nextCard() === null && !guided) showGuide();
