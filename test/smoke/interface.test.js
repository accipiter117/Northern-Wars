// The interface (M14): how many taps the common jobs take from the map, that
// the player never loses their place (a stray map tap, a close, a decision
// arriving mid-form, a reload), the back gesture, both layouts, and that no
// screen opens longer than about two screens of a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction, wildSites } from '../../src/sim/index.js';

const OUT = join(ROOT, 'test-results');
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();

test.after(async () => {
  await browser.close();
  server.close();
});

// A realm two months in, with a company, a sighted bandit camp, a trade
// route and a witcher's offer waiting at court.
function busyRealm() {
  let s = step(createState(world, 1262), 62, world);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.treasury = 8000;
  const marsh = wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
  s.threats.list = [{ id: 1, kind: 'bandits', terrain: 'marsh', x: marsh.x, y: marsh.y, near: 'anchor', men: 40, morale: 70, born: s.day, band: null, sighted: true, campSeen: true, alerted: true, rumour: null }];
  s.threats.nextId = 2;
  for (const a of [{ type: 'recruit', settlement: 'gors_velen', kind: 'menatarms' }, { type: 'route', from: 'vizima', to: 'maribor' }]) {
    const out = applyAction(s, world, a);
    assert.equal(out.error, undefined, out.error);
    s = out.state;
  }
  s.events = [{ id: 1, event: 'witcher', place: 'pontaria', day: s.day }];
  s.nextEventId = 2;
  return s;
}

async function open(vp, save, query = '?paused&nohints') {
  const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: vp.width < vp.height, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  if (save) await page.addInitScript((sv) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('northern-wars.save', sv); sessionStorage.setItem('seeded', '1'); } }, save);
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

// Every tap is counted, so the targets can be asserted.
function tapper(page) {
  let n = 0;
  return {
    get count() { return n; },
    reset() { n = 0; },
    async tap(sel) { n++; await page.click(sel); },
    async place(id) {
      n++;
      await page.evaluate((p) => { const st = window.northernWars.world.byId[p]; window.northernWars.lookAt(st.x, st.y); }, id);
      const q = await page.evaluate((p) => window.northernWars.screenOf(p), id);
      await page.touchscreen.tap(q.x, q.y);
    },
  };
}

const ui = (page) => page.evaluate(() => {
  const u = window.northernWars.ui;
  return { open: u.open, route: u.route, snap: u.snap, scroll: u.scroll, depth: u.depth };
});

// A spot of open map with nothing on it, above the sheet.
async function emptySpot(page) {
  return page.evaluate(() => {
    const top = document.getElementById('topbar').getBoundingClientRect().bottom + 20;
    const sheet = document.getElementById('sheet');
    const side = !sheet.hidden && sheet.dataset.snap === 'side';
    const bottom = sheet.hidden || side ? innerHeight - 40 : sheet.getBoundingClientRect().top - 20;
    const right = sheet.hidden || sheet.dataset.snap !== 'side' ? innerWidth - 20 : sheet.getBoundingClientRect().left - 20;
    for (let y = top; y < bottom; y += 17) {
      for (let x = 100; x < right; x += 23) if (!window.northernWars.pickAt(x, y)) return { x, y };
    }
    return null;
  });
}

test('the tap targets, counted from the map', async () => {
  const s = busyRealm();
  const { context, page, errors } = await open(PORTRAIT, serialize(s));
  const t = tapper(page);

  // See why a meter changed: one tap.
  await t.tap('.meter[data-go="meter:authority"]');
  assert.match(await page.textContent('#sheet-title'), /Authority/);
  assert.match(await page.textContent('#sheet-body'), /Next month, part by part[\s\S]*Returns by itself|In all/);
  assert.equal(t.count, 1, 'meter: taps');
  await page.screenshot({ path: join(OUT, 'm14-meter.png') });
  await page.click('#sheet-close');

  // Answer a waiting decision: two taps.
  t.reset();
  assert.equal(await page.isVisible('[data-tab="court"] .tab-badge'), true, 'the Court tab carries a badge');
  await t.tap('[data-tab="court"]');
  await t.tap('#sheet-body [data-choice="1"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.events.length), 0);
  assert.equal(t.count, 2, 'decision: taps');
  await page.click('#sheet-close');

  // Send a company after a sighted threat: three taps or fewer.
  t.reset();
  await t.tap('[data-tab="military"]');
  await t.tap('[data-sub="threats"]');
  await t.tap('[data-send="1"]');
  const c = await page.evaluate(() => window.northernWars.state.forces.companies[0]);
  assert.equal(c.order.kind, 'hunt');
  assert.equal(c.order.threat, 1);
  assert.ok(t.count <= 3, `send a company: ${t.count} taps`);
  await page.click('#sheet-close');

  // Mend a damaged works in a town: four taps or fewer (M20).
  await page.evaluate(() => { window.northernWars.state.settlements.vizima.cond = { brewery: 40 }; });
  t.reset();
  await t.place('vizima');
  await t.tap('.segs [data-tsub="works"]');
  await t.tap('[data-works="brewery"]');
  await t.tap('[data-repair="patch"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.settlements.vizima.repair?.brewery?.kind), 'patch');
  assert.ok(t.count <= 4, `repair: ${t.count} taps`);
  await page.click('#sheet-close');

  // Change a law: four taps or fewer.
  t.reset();
  await t.tap('[data-tab="court"]');
  await t.tap('[data-sub="laws"]');
  await t.tap('[data-law="taxation"]');
  await t.tap('[data-decree="taxation:heavy"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.laws.taxation.option), 'heavy');
  assert.ok(t.count <= 4, `law: ${t.count} taps`);
  await page.click('#sheet-close');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a stray map tap, a close and a decision mid-form lose nothing', async () => {
  const s = busyRealm();
  s.events = [];
  const { context, page, errors } = await open(PORTRAIT, serialize(s));
  const t = tapper(page);

  // Half-fill the form to raise an army, and scroll down to it.
  await page.click('[data-tab="military"]');
  await page.click('[data-sub="war"]');
  await page.click('[data-set="levy:half"]');
  await page.click('[data-set="companies:2"]');
  await page.evaluate(() => { document.getElementById('sheet-body').scrollTop = 260; });
  await page.waitForTimeout(50);
  const before = await ui(page);
  assert.equal(before.route, 'tab:military');
  assert.ok(before.scroll > 100, `scrolled ${before.scroll}`);
  const filled = async () => page.evaluate(() => [...document.querySelectorAll('#sheet-body .chip.on')].map((b) => b.dataset.set).filter(Boolean).sort().join());

  // A stray tap on the map lowers the sheet to its title bar...
  const spot = await emptySpot(page);
  assert.ok(spot, 'an empty spot of map');
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(250);
  assert.equal((await ui(page)).snap, 'peek');
  assert.equal((await ui(page)).open, true, 'a map tap never closes the panel');
  // ...and one tap brings it back exactly as it was.
  t.reset();
  await t.tap('#sheet-title');
  await page.waitForTimeout(250);
  let now = await ui(page);
  assert.equal(t.count, 1);
  assert.equal(now.snap, 'half');
  assert.equal(now.route, 'tab:military');
  assert.ok(Math.abs(now.scroll - before.scroll) < 2, `scroll ${now.scroll} vs ${before.scroll}`);
  assert.match(await filled(), /companies:2[\s\S]*levy:half/);

  // Closed by mistake: one tap on the tab brings it all back.
  await page.click('#sheet-close');
  assert.equal(await page.isHidden('#sheet'), true);
  t.reset();
  await t.tap('[data-tab="military"]');
  now = await ui(page);
  assert.equal(t.count, 1);
  assert.equal(now.route, 'tab:military');
  assert.ok(Math.abs(now.scroll - before.scroll) < 2, `scroll after close ${now.scroll} vs ${before.scroll}`);
  assert.match(await filled(), /companies:2[\s\S]*levy:half/);
  assert.match(await page.textContent('#sheet-body'), /Raise an army/);

  // A decision arrives mid-form: a toast and a badge, the game pauses, and
  // the form stays exactly where it was.
  await page.evaluate(() => {
    const st = window.northernWars.state;
    st.events.push({ id: 7, event: 'witcher', place: 'pontaria', day: st.day });
    window.northernWars.setSpeed(1);
  });
  await page.waitForSelector('[data-tab="court"] .tab-badge:not([hidden])', { timeout: 5000 });
  await page.waitForFunction(() => window.northernWars.speed === 0);
  assert.match(await page.textContent('#toast'), /News from Chippira[\s\S]*waits at court/);
  now = await ui(page);
  assert.equal(now.route, 'tab:military');
  assert.match(await filled(), /companies:2[\s\S]*levy:half/);
  await page.screenshot({ path: join(OUT, 'm14-decision-mid-form.png') });

  // Saved and reloaded, the same screen comes back from the tab.
  await page.click('#more-button');
  await page.click('[data-more="save"]');
  await page.reload();
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  assert.equal(await page.isHidden('#sheet'), true, 'the panel starts closed');
  await page.click('[data-tab="military"]');
  now = await ui(page);
  assert.equal(now.route, 'tab:military');
  assert.match(await filled(), /companies:2[\s\S]*levy:half/);
  assert.match(await page.textContent('.segs .seg.on'), /War/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the back arrow and the browser back gesture retrace the way', async () => {
  const { context, page, errors } = await open(PORTRAIT, serialize(busyRealm()));
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="houses"]');
  await page.click('[data-house="brodowin"]');
  assert.equal((await ui(page)).route, 'house:brodowin');
  await page.click('[data-place="dorndal"]');
  assert.equal((await ui(page)).route, 'town:dorndal');
  assert.equal((await ui(page)).depth, 3);
  // The in-app back arrow.
  await page.click('#sheet-back');
  assert.equal((await ui(page)).route, 'house:brodowin');
  // The browser's (and Android's) back.
  await page.goBack();
  await page.waitForFunction(() => window.northernWars.ui.route === 'tab:court');
  assert.match(await page.textContent('.segs .seg.on'), /Great houses/);
  await page.goBack();
  await page.waitForFunction(() => !window.northernWars.ui.open);
  assert.equal(await page.isHidden('#sheet'), true);
  // A card opened from the map: back closes it.
  const v = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(v.x, v.y);
  assert.equal((await ui(page)).route, 'town:vizima');
  await page.goBack();
  await page.waitForFunction(() => !window.northernWars.ui.open);
  assert.deepEqual(errors, []);
  await context.close();
});

test('portrait: a tab bar along the foot and a sheet with three heights', async () => {
  const { context, page, errors } = await open(PORTRAIT, serialize(busyRealm()));
  const bar = await page.locator('#tabbar').boundingBox();
  assert.ok(bar.y + bar.height >= PORTRAIT.height - 1 && bar.width >= PORTRAIT.width - 1, 'along the foot');
  for (const b of await page.locator('[data-tab]').all()) {
    const box = await b.boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, 'tabs are big enough to tap');
  }
  await page.click('[data-tab="realm"]');
  assert.equal((await ui(page)).snap, 'half');
  await page.screenshot({ path: join(OUT, 'm14-portrait-half.png') });
  const head = await page.locator('#sheet-head').boundingBox();
  const drag = async (dy) => {
    const h = await page.locator('#sheet-head').boundingBox();
    await page.mouse.move(h.x + 80, h.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(h.x + 80, h.y + 20 + (dy * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  await drag(-head.y);
  assert.equal((await ui(page)).snap, 'full');
  await drag(PORTRAIT.height);
  const after = await ui(page);
  assert.ok(after.snap === 'peek' || !after.open, `dragged down: ${after.snap}`);
  if (after.open) {
    await drag(200);
    assert.equal((await ui(page)).open, false, 'a swipe down from peek closes it');
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('landscape: tabs down the side and a panel that stays open beside the map', async () => {
  const { context, page, errors } = await open(LANDSCAPE, serialize(busyRealm()));
  const bar = await page.locator('#tabbar').boundingBox();
  assert.ok(bar.x <= 1 && bar.height > bar.width, 'down the left side');
  await page.click('[data-tab="military"]');
  const panel = await page.locator('#sheet').boundingBox();
  assert.ok(panel.x > LANDSCAPE.width / 2 - 1 && panel.x + panel.width >= LANDSCAPE.width - 1, 'a side panel on the right');
  assert.equal((await ui(page)).snap, 'side');
  const spot = await emptySpot(page);
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(150);
  assert.equal((await ui(page)).open, true, 'the map is used with the panel open');
  // A town tapped meanwhile opens on top, and back returns.
  // Bring Vizima to the middle of the strip of map left of the panel.
  await page.evaluate(() => {
    const nw = window.northernWars;
    const st = nw.world.byId.vizima;
    nw.lookAt(st.x, st.y);
    const scale = nw.screenOf('vizima').x - nw.screenOfPoint(st.x - 1, st.y).x;
    const strip = (document.getElementById('stage').getBoundingClientRect().left + document.getElementById('sheet').getBoundingClientRect().left) / 2;
    nw.lookAt(st.x + (nw.screenOf('vizima').x - strip) / scale, st.y);
  });
  const v = await page.evaluate(() => window.northernWars.screenOf('vizima'));
  await page.touchscreen.tap(v.x, v.y);
  assert.equal((await ui(page)).route, 'town:vizima');
  await page.screenshot({ path: join(OUT, 'm14-landscape-town.png') });
  await page.click('#sheet-back');
  assert.equal((await ui(page)).route, 'tab:military');
  assert.deepEqual(errors, []);
  await context.close();
});

test('no tab or card opens longer than about two screens', async () => {
  const s = busyRealm();
  const { context, page, errors } = await open(PORTRAIT, serialize(s));
  const limit = PORTRAIT.height * 2;
  const tooLong = [];
  const measure = async (name) => {
    const h = await page.evaluate(() => document.getElementById('sheet-body').scrollHeight);
    if (h > limit) tooLong.push(`${name}: ${h}px`);
  };
  const subs = { realm: ['overview', 'places'], court: ['inbox', 'laws', 'houses', 'faith'], treasury: ['ledger', 'routes', 'industry'], military: ['forces', 'threats', 'garrisons', 'war'], diplomacy: ['realms', 'intel', 'envoys'] };
  for (const [tab, list] of Object.entries(subs)) {
    await page.click(`[data-tab="${tab}"]`);
    for (const sub of list) {
      await page.click(`.segs [data-sub="${sub}"]`);
      await measure(`${tab}/${sub}`);
    }
  }
  await page.click('#sheet-close');
  for (const town of ['vizima', 'white_orchard', 'gors_velen']) {
    await page.evaluate((p) => { const st = window.northernWars.world.byId[p]; window.northernWars.lookAt(st.x, st.y); }, town);
    const q = await page.evaluate((p) => window.northernWars.screenOf(p), town);
    await page.touchscreen.tap(q.x, q.y);
    for (const sub of ['overview', 'build', 'military', 'people']) {
      await page.click(`.segs [data-tsub="${sub}"]`);
      await measure(`${town}/${sub}`);
    }
    await page.click('#sheet-close');
  }
  // The cards opened from those lists, and the screens of the overflow menu.
  const via = [
    ['house', ['[data-tab="court"]', '.segs [data-sub="houses"]', '[data-house="brodowin"]']],
    ['realm', ['[data-tab="diplomacy"]', '.segs [data-sub="realms"]', '[data-realm="redania"]']],
    ['company', ['[data-tab="military"]', '.segs [data-sub="forces"]', '[data-company="1"]']],
    // Military last showed the company's card: a second tap on the tab goes
    // back to its root.
    ['threat', ['[data-tab="military"]', '[data-tab="military"]', '.segs [data-sub="threats"]', '[data-threat="1"]']],
    ['meters', ['.meter[data-go="meter:treasury"]']],
    ['help', ['#more-button', '[data-more="help"]']],
    ['chronicle', ['#more-button', '[data-more="chronicle"]']],
  ];
  for (const [name, taps] of via) {
    for (const sel of taps) await page.click(sel);
    await measure(name);
    await page.click('#sheet-close');
  }
  assert.deepEqual(tooLong, [], 'screens over two screens long');
  assert.deepEqual(errors, []);
  await context.close();
});
