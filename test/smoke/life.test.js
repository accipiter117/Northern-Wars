// Life on the map in the browser (M22 B): a long press on a traveller says
// what it is in one line; a witcher on the road says who he is and what the
// contract is worth; life at the works shows close up, in its seasons, and
// never on the board. Keeps portrait screenshots of each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction, partnerTrade, wildSites, unitPosition } from '../../src/sim/index.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();

test.after(async () => {
  await browser.close();
  server.close();
});

const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
function quiet(s) {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
}

// A realm with a deal, a company on patrol and a witcher hired.
function busy(days = 62) {
  let s = quiet(step(createState(world, 3), days, world));
  s.treasury = 8000;
  const p = partnerTrade(s, world, 'redania');
  s = act(s, { type: 'trade', realm: 'redania', sell: { good: p.wants[0], qty: 40 }, buy: { good: p.offers[0], qty: 20 } });
  s = act(s, { type: 'recruit', settlement: 'maribor', kind: 'lightcav' });
  s = act(s, { type: 'company', id: s.forces.companies[0].id, order: { kind: 'patrol', from: 'maribor', to: 'vizima' } });
  const site = wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
  s.threats.list.push({ id: 900, kind: 'monsters', terrain: 'marsh', species: 'drowners', x: site.x, y: site.y, near: 'anchor', count: 6, morale: 70, born: s.day, band: null, sighted: true, campSeen: true, alerted: true, rumour: null, level: 40 });
  s = act(s, { type: 'witcher', threat: 900 });
  // A few days on: the traffic is on the roads, the witcher on his way.
  return quiet(step(s, 4, world));
}

async function open(s, prefs = { batterySaver: false }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(([sv, p]) => { localStorage.setItem('northern-wars.save', sv); localStorage.setItem('northern-wars.prefs', JSON.stringify(p)); }, [serialize(s), prefs]);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}
async function hold(page, x, y, ms = 650) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('a long press on a traveller or a witcher says what it is in one line', async () => {
  const s = busy();
  const { context, page, errors } = await open(s);
  // A traveller of ours on the road at home, brought to the middle of the
  // map close up: the first one the map would pick there.
  const kinds = ['caravan', 'patrol', 'pilgrim', 'goods', 'grain', 'export'];
  const candidates = s.ambient.units.filter((x) => kinds.includes(x.kind)).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  assert.ok(candidates.length, 'travellers of ours on the road');
  let q = null;
  for (const u of candidates) {
    const at = unitPosition(world, u, u.pos);
    await page.evaluate((p) => { window.northernWars.zoomTo(2); window.northernWars.lookAt(p.x, p.y); }, at);
    await page.waitForTimeout(200);
    const p = await page.evaluate((id) => window.northernWars.unitScreenOf(id), u.id);
    const hit = p && await page.evaluate((pt) => window.northernWars.pickAt(pt.x, pt.y), p);
    if (hit?.unit === u.id) { q = p; break; }
  }
  assert.ok(q, 'a traveller the map shows');
  await hold(page, q.x, q.y);
  await page.waitForSelector('#peek:not([hidden])');
  const line = await page.textContent('[data-part="what-unit"]');
  assert.match(line, /^(Temerian merchants|Merchant caravan|Patrol|Pilgrims|Goods cart|Grain cart): .+/);
  await page.screenshot({ path: join(OUT, 'portrait-longpress-traveller.png') });
  await page.mouse.click(10, 300);

  // The witcher on his way to the lair.
  await page.evaluate(() => { const nw = window.northernWars; const c = nw.state.threats.contracts[0]; const st = nw.world.byId[c.from]; nw.lookAt(st.x, st.y); });
  const w = await page.evaluate(() => window.northernWars.witcherScreenOf(900));
  assert.ok(w, 'the witcher is on the map');
  await hold(page, w.x, w.y);
  await page.waitForSelector('#peek:not([hidden])');
  assert.match(await page.textContent('[data-part="what-unit"]'), /^Witcher: .+, riding out from Anchor; the crown's contract on drowners near Anchor, \d+ crowns$/);
  await page.screenshot({ path: join(OUT, 'portrait-witcher.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('life at the works close up in spring and at the harvest, none on the board, half under Battery saver', async () => {
  const shots = [['spring', 60], ['harvest', 165]];
  let full = 0;
  for (const [name, days] of shots) {
    const s = quiet(step(createState(world, 3), days, world));
    const { context, page, errors } = await open(s);
    await page.evaluate(() => { const nw = window.northernWars; nw.zoomTo(16); const st = nw.world.byId.petrelsteyn; nw.lookAt(st.x, st.y); });
    await page.waitForTimeout(600);
    const drawn = await page.evaluate(() => window.northernWars.renderer.flags.lifeDrawn);
    assert.ok(drawn > 0, `${drawn} figures at the works in ${name}`);
    full = Math.max(full, drawn);
    const q = await page.evaluate(() => window.northernWars.screenOf('petrelsteyn'));
    await page.screenshot({ path: join(OUT, `portrait-works-${name}.png`), clip: { x: Math.max(0, q.x - 150), y: q.y - 150, width: 300, height: 300 } });
    // Pulled back to the board: no life at the works at all.
    await page.evaluate(() => window.northernWars.zoomTo(0.3));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.northernWars.renderer.flags.lifeDrawn), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Battery saver: half the figures.
  const s = quiet(step(createState(world, 3), 165, world));
  const { context, page } = await open(s, { batterySaver: true });
  await page.evaluate(() => { const nw = window.northernWars; nw.zoomTo(16); const st = nw.world.byId.petrelsteyn; nw.lookAt(st.x, st.y); });
  await page.waitForTimeout(600);
  const half = await page.evaluate(() => window.northernWars.renderer.flags.lifeDrawn);
  assert.ok(half > 0 && half <= Math.ceil(full * 0.6) + 2, `${half} figures under Battery saver against ${full}`);
  await context.close();
});
