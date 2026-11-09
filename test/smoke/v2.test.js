// The v2 war table in the browser (steps 1 and 2): it loads at phone size in
// portrait and landscape with no errors, a piece dragged to a lit region
// marches there, a tap opens a region's card, and End turn moves the month on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT } from '../helpers.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/v2/?noguide`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

test.after(async () => {
  await browser.close();
  server.close();
});

async function open(viewport, query = null) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(query ? base.replace('?noguide', query) : base);
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  return { context, page, errors };
}

test('the war table: drag a piece to march, tap a place, end the turn (portrait)', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  assert.match(await page.textContent('#date'), /March 1262/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-table.png') });

  // Drag Temeria's army at Vizima to a region it can reach.
  const { id, dest, from, to } = await page.evaluate(() => {
    const { app, view } = window.northernWarsV2;
    const a = app.state.armies.find((x) => x.owner === 'temeria' && x.region === 'vizima');
    app.select({ army: a.id });
    const reach = Object.keys(app.selected.reach);
    const target = reach.includes('ellander') ? 'ellander' : reach[0];
    app.select(null);
    return { id: a.id, dest: target, from: view.pieceOf(a.id), to: view.screenOf(target) };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.screenshot({ path: join(OUT, 'v2-portrait-drag.png') });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const region = await page.evaluate((armyId) => window.northernWarsV2.state.armies.find((a) => a.id === armyId).region, id);
  assert.equal(region, dest);

  // A tap on Maribor opens its card, with its yields and a company to raise.
  const m = await page.evaluate(() => window.northernWarsV2.view.screenOf('maribor'));
  await page.evaluate(() => window.northernWarsV2.app.select(null));
  await page.mouse.click(m.x, m.y);
  assert.match(await page.textContent('#sheet'), /Maribor[\s\S]*Food[\s\S]*Production[\s\S]*Raise a company/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-region.png') });

  // End turn: April, and the save remembers it.
  await page.click('#sheet-close');
  await page.click('#end');
  await page.waitForFunction(() => /April 1262/.test(document.getElementById('date').textContent));
  if (await page.isVisible('#sheet')) await page.click('#sheet-close');
  assert.ok(await page.evaluate(() => localStorage.getItem('northern-wars.v2.save').includes('"turn":1')));
  await page.click('[data-open="war"]');
  assert.match(await page.textContent('#sheet'), /The great powers[\s\S]*Redania[\s\S]*Opinion of us[\s\S]*Trade deal[\s\S]*Spies[\s\S]*Declare war/);
  await page.click('[data-propose="redania:trade"]');
  assert.ok(await page.evaluate(() => window.northernWarsV2.state.diplomacy.treaties.some((t) => t.kind === 'trade')));
  await page.screenshot({ path: join(OUT, 'v2-portrait-diplomacy.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('goals, the smaller crowns and a city\'s focus (portrait)', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  await page.click('[data-open="goals"]');
  assert.match(await page.textContent('#sheet'), /The Dawn of the Reign[\s\S]*Muster the crown's host[\s\S]*Unlocks Temerian crossbowmen/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-goals.png') });
  await page.click('#sheet-close');
  // Renown for envoys: three to Brugge, and the seal by pressure.
  await page.evaluate(() => { window.northernWarsV2.state.realms.temeria.renown = 120; });
  await page.click('[data-open="courts"]');
  for (let i = 0; i < 3; i++) await page.click('[data-envoy="brugge"]');
  assert.match(await page.textContent('#sheet'), /Seal: pressure/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-courts.png') });
  await page.click('[data-seal="brugge:pressure"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.minors.brugge.suzerain), 'temeria');
  await page.click('#sheet-close');
  // A city's focus.
  await page.evaluate(() => window.northernWarsV2.app.select({ region: 'maribor' }));
  await page.click('[data-focus="production"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.cities.maribor.focus), 'production');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the battle screen: place companies in lanes, fight a round, fight it out', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  // War with Redania, and a Redanian army just over the Pontar in our reach.
  const target = await page.evaluate(() => {
    const { app } = window.northernWarsV2;
    const s = app.state;
    s.wars.push('redania|temeria');
    const a = s.armies.find((x) => x.owner === 'temeria' && x.region === 'vizima');
    app.select({ army: a.id });
    const t = Object.keys(app.selected.reach).find((id) => s.cities[id].owner === 'redania');
    s.armies.push({ id: 999, owner: 'redania', region: t, companies: [{ type: 'foot', str: 100 }, { type: 'bow', str: 100 }], points: 0 });
    app.select(null);
    app.march(a.id, t);
    return t;
  });
  assert.ok(target);
  await page.waitForSelector('.lanes');
  assert.match(await page.textContent('#sheet'), /Battle at[\s\S]*Left[\s\S]*Centre[\s\S]*Right[\s\S]*Reserve[\s\S]*to win/);
  // Move a company to the right lane.
  const chip = await page.$('[data-chip]');
  await chip.click();
  await page.click('[data-lane="right"]');
  await page.screenshot({ path: join(OUT, 'v2-portrait-battle.png') });
  await page.click('[data-b="round"]');
  assert.match(await page.textContent('#sheet'), /Round 1:/);
  await page.click('[data-b="auto"]');
  await page.waitForSelector('[data-b="done"]');
  assert.match(await page.textContent('#sheet'), /Victory|Defeat/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-battle-over.png') });
  await page.click('[data-b="done"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.battle), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the story: the Call of the North at court, the story so far, and an ending', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  // A save on the eve of the war, with the Call of the North waiting.
  await page.evaluate(() => {
    const s = window.northernWarsV2.state;
    s.story.chapter = 'first';
    s.story.flags.push('first_war');
    s.story.happened.push({ id: 'road_to_war', turn: 12 });
    s.story.fired.push('road_to_war');
    s.story.choice = { id: 'road_to_war' };
    localStorage.setItem('northern-wars.v2.save', JSON.stringify({ format: 'northern-wars-v2', version: s.version, state: s }));
  });
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  assert.match(await page.textContent('#sheet'), /The Call of the North[\s\S]*Answer the call[\s\S]*Stand aside/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-story.png') });
  await page.click('[data-story="0"]');
  assert.ok(await page.evaluate(() => window.northernWarsV2.state.wars.includes('nilfgaard|temeria')));
  await page.click('[data-open="goals"]');
  assert.match(await page.textContent('#sheet'), /Now: The First Northern War[\s\S]*The story so far[\s\S]*The First Northern War/);
  await page.click('#sheet-close');
  // The end.
  await page.evaluate(() => {
    const s = window.northernWarsV2.state;
    s.over = { reason: 'time', ending: { kind: 'holds', winner: null, title: 'The North holds', text: 'The Empire is held at the Yaruga.', fate: { key: 'free', text: 'Temeria endures, its own master.' } } };
    localStorage.setItem('northern-wars.v2.save', JSON.stringify({ format: 'northern-wars-v2', version: s.version, state: s }));
  });
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  assert.match(await page.textContent('#sheet'), /The North holds[\s\S]*Temeria endures[\s\S]*Begin a new reign/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-ending.png') });
  await page.click('#ending-new');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.turn), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a first visit opens How to play; paying with crowns raises a company', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base.replace('?noguide', ''));
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  assert.match(await page.textContent('#sheet'), /How to play[\s\S]*March\.[\s\S]*Fight\.[\s\S]*Win\./);
  await page.screenshot({ path: join(OUT, 'v2-portrait-guide.png') });
  await page.click('#guide-go');
  await page.evaluate(() => window.northernWarsV2.app.select({ region: 'vizima' }));
  await page.click('[data-pay="crowns"]');
  const before = await page.evaluate(() => window.northernWarsV2.state.armies.filter((a) => a.owner === 'temeria').reduce((n, a) => n + a.companies.length, 0));
  await page.click('[data-recruit="foot"]');
  const after = await page.evaluate(() => window.northernWarsV2.state.armies.filter((a) => a.owner === 'temeria').reduce((n, a) => n + a.companies.length, 0));
  assert.equal(after, before + 1);
  assert.ok(await page.evaluate(() => window.northernWarsV2.state.realms.temeria.treasury < 300));
  assert.deepEqual(errors, []);
  await context.close();
});

test('saves to a file and back; the painted map follows a capture; plays offline', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  // Export.
  await page.click('[data-open="menu"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#menu-export')]);
  const path = await download.path();
  const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
  assert.match(text, /"format":"northern-wars-v2"/);
  // Import, after the reign has moved on a month.
  await page.click('#sheet-close');
  await page.click('#end');
  await page.waitForFunction(() => window.northernWarsV2.state.turn === 1);
  if (await page.isVisible('#sheet')) await page.click('#sheet-close');
  await page.click('[data-open="menu"]');
  await page.setInputFiles('#menu-file', path);
  await page.waitForFunction(() => window.northernWarsV2.state.turn === 0);
  // The painted map follows the war: Rinde taken by Temeria is painted Temerian.
  const ok = await page.evaluate(() => {
    const { app, backdrop } = window.northernWarsV2;
    if (!backdrop) return 'no backdrop';
    app.state.cities.rinde.holder = 'temeria';
    backdrop.follow(app.state, app.table);
    return app.table.world.realmOf.rinde === undefined && !!backdrop.shadow.settlements.rinde;
  });
  assert.equal(ok, true);
  await page.evaluate(() => { const { app, backdrop } = window.northernWarsV2; app.state.cities.rinde.holder = null; backdrop.follow(app.state, app.table); });
  assert.deepEqual(errors, []);
  await context.close();
  // Offline: the service worker keeps v2 too.
  const o = await open({ width: 390, height: 844 }, '?sw&noguide');
  await o.page.evaluate(() => navigator.serviceWorker.ready);
  await o.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  await o.page.waitForFunction(async () => {
    const keys = await caches.keys();
    const c = keys.find((k) => k.startsWith('northern-wars-'));
    return c && !!(await (await caches.open(c)).match(new URL('../v2/src/engine/game.js', location.href).href));
  }, null, { timeout: 30000 });
  await o.context.setOffline(true);
  await o.page.reload();
  await o.page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden, null, { timeout: 20000 });
  assert.match(await o.page.textContent('#date'), /1262/);
  await o.context.setOffline(false);
  await o.context.close();
});

test('fleets and commanders: build at a vassal\'s port, sail, and give an army its commander', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  // Natalis takes the army at Vizima, from its card.
  const id = await page.evaluate(() => {
    const { app } = window.northernWarsV2;
    const a = app.state.armies.find((x) => x.owner === 'temeria' && x.region === 'vizima');
    app.select({ army: a.id });
    return a.id;
  });
  await page.click('[data-command="natalis"]');
  assert.equal(await page.evaluate((i) => Object.entries(window.northernWarsV2.state.commanders).find(([, c]) => c.army === i)?.[0], id), 'natalis');
  assert.match(await page.textContent('#sheet'), /Commander[\s\S]*Constable Jan Natalis/);
  await page.click('#sheet-close');
  // Cidaris as our vassal: a fleet built at its port, then sailed.
  await page.evaluate(() => {
    const { app } = window.northernWarsV2;
    app.state.minors.cidaris.suzerain = 'temeria';
    app.state.realms.temeria.production = 200;
    window.northernWarsV2.view.centreOn('cidaris_city');
    app.select({ region: 'cidaris_city' });
  });
  await page.click('[data-fleet]');
  const fleet = await page.evaluate(() => window.northernWarsV2.state.fleets.find((f) => f.owner === 'temeria'));
  assert.ok(fleet);
  await page.click('#sheet-close');
  await page.evaluate((fid) => { const { app } = window.northernWarsV2; app.state.fleets.find((f) => f.id === fid).points = 3; app.select({ fleet: fid }); }, fleet.id);
  assert.match(await page.textContent('#sheet'), /Our fleet at Cidaris[\s\S]*Tap a lit port/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'v2-portrait-fleet.png') });
  const dest = await page.evaluate(() => Object.keys(window.northernWarsV2.app.selected.reach).find((r) => window.northernWarsV2.state.cities[r].owner === 'cidaris'));
  if (dest) {
    const p = await page.evaluate((r) => window.northernWarsV2.view.screenOf(r), dest);
    await page.mouse.click(p.x, p.y);
    assert.equal(await page.evaluate((fid) => window.northernWarsV2.state.fleets.find((f) => f.id === fid).region, fleet.id), dest);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('the Book of Laws in the Realm sheet; a city\'s faiths and missionaries', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  await page.evaluate(() => { const r = window.northernWarsV2.state.realms.temeria; r.treasury = 2000; r.love = 70; r.devotion = 100; });
  await page.click('[data-open="realm"]');
  assert.match(await page.textContent('#sheet'), /The Book of Laws \(0 of 2\)[\s\S]*Free markets[\s\S]*Our faith is Melitele/);
  await page.click('[data-enact="free_markets"]');
  assert.deepEqual(await page.evaluate(() => window.northernWarsV2.state.laws.temeria.enacted), ['free_markets']);
  assert.ok(await page.isDisabled('[data-enact="monopolies"]'), 'the rival path is closed');
  await page.screenshot({ path: join(OUT, 'v2-portrait-laws.png') });
  await page.click('#sheet-close');
  // A neighbour's card: its faiths, and missionaries sent.
  const near = await page.evaluate(() => {
    const { app } = window.northernWarsV2;
    const s = app.state;
    const id = Object.keys(s.cities).find((x) => s.cities[x].owner !== 'temeria' && (s.faiths[x].melitele ?? 0) < 90
      && app.table.board.adj[x].some((l) => s.cities[l.a === x ? l.b : l.a].owner === 'temeria'));
    app.select({ region: id });
    return id;
  });
  assert.match(await page.textContent('#sheet'), /Faiths \(in every hundred\)/);
  const before = await page.evaluate((id) => window.northernWarsV2.state.faiths[id].melitele ?? 0, near);
  await page.click('[data-mission]');
  assert.ok(await page.evaluate((id) => window.northernWarsV2.state.faiths[id].melitele, near) > before);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a new game as the Nilfgaardian Empire from the Menu', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.click('[data-open="menu"]');
  await page.click('[data-newgame="nilfgaard"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.player), 'nilfgaard');
  await page.click('[data-open="realm"]');
  assert.match(await page.textContent('#sheet'), /Emhyr var Emreis[\s\S]*Our faith is Great Sun/);
  await page.click('#sheet-close');
  // The map looks over the Empire's capital, and its pieces answer the drag.
  const reach = await page.evaluate(() => {
    const { app } = window.northernWarsV2;
    const a = app.state.armies.find((x) => x.owner === 'nilfgaard');
    app.select({ army: a.id });
    return Object.keys(app.selected.reach).length;
  });
  assert.ok(reach > 0);
  await page.screenshot({ path: join(OUT, 'v2-portrait-nilfgaard.png') });
  await page.click('#end');
  assert.match(await page.textContent('#date'), /April 1262/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the great houses in Courts; a rising, and judgement when its seat is retaken', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('northern-wars.v2.save'));
  await page.reload();
  await page.waitForFunction(() => window.northernWarsV2 && document.getElementById('loading').hidden);
  await page.evaluate(() => {
    const s = window.northernWarsV2.state;
    s.realms.temeria.treasury = 1000;
    s.houses.dravnik.want = { kind: 'honours', turn: 0 };
  });
  await page.click('[data-open="courts"]');
  assert.match(await page.textContent('#sheet'), /The great houses[\s\S]*House Dravnik[\s\S]*Holds Mayena/);
  await page.click('[data-honours="dravnik"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.houses.dravnik.want), null);
  await page.screenshot({ path: join(OUT, 'v2-portrait-houses.png') });
  await page.click('#sheet-close');
  // Gelbrand rises; the table shows its host; its seat retaken brings the judgement.
  await page.evaluate(() => {
    const s = window.northernWarsV2.state;
    s.realms.temeria.fear = 0;
    for (const h of Object.values(s.houses)) h.loyalty = 60;
    s.houses.gelbrand.loyalty = 0;
  });
  await page.evaluate(async () => {
    const s = window.northernWarsV2.state;
    for (let i = 0; i < 40 && !s.houses.gelbrand.rebel; i++) { s.houses.gelbrand.loyalty = 0; document.getElementById('end').click(); await new Promise((r) => setTimeout(r, 30)); document.getElementById('sheet-close').click(); }
  });
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.cities.red_fort.owner), 'house_gelbrand');
  await page.evaluate(() => window.northernWarsV2.app.select({ region: 'red_fort' }));
  assert.match(await page.textContent('#sheet'), /House Gelbrand has risen/);
  await page.screenshot({ path: join(OUT, 'v2-portrait-rising.png') });
  // The rebel host beaten and its seat taken.
  await page.evaluate(() => {
    const s = window.northernWarsV2.state;
    s.armies = s.armies.filter((a) => a.owner !== 'house_gelbrand');
    s.cities.red_fort.holder = 'temeria';
    s.dilemma = null;
    window.northernWarsV2.app.select(null);
  });
  await page.click('#end');
  await page.waitForSelector('[data-lordjudge="pardon"]');
  await page.click('[data-lordjudge="pardon"]');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.cities.red_fort.owner), 'temeria');
  assert.equal(await page.evaluate(() => window.northernWarsV2.state.houses.gelbrand.rebel), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the war table in landscape', async () => {
  const { context, page, errors } = await open({ width: 844, height: 390 });
  await page.click('[data-open="realm"]');
  assert.match(await page.textContent('#sheet'), /Temeria[\s\S]*Taxes/);
  await page.screenshot({ path: join(OUT, 'v2-landscape-realm.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
