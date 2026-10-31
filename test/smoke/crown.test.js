// The crown's hold in the browser (M24 B): Love, Fear, Authority (with its
// bar split by where it comes from) and Unrest in the top bar, each opening
// its reasons; the crown's acts from the Love and Fear cards; gibbets at
// the crossroads and the king's progress on the map. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld, signLaws } from '../helpers.js';
import { createState, step, serialize, applyAction } from '../../src/sim/index.js';

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

async function open(save) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), save);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

function realm() {
  // Five months in, so every meter has reasons; a feared crown with gibbets
  // up round Maribor and a hanging fresh there.
  let s = step(createState(world, 7), 150, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 9000;
  // Hangings and feasts are unlocked by the Book of Laws (M26).
  signLaws(s, world, 'curfews', 'executions', 'poor_relief', 'hospices', 'royal_feasts');
  s = act(s, { type: 'act', kind: 'gibbets', settlement: 'maribor' });
  s = act(s, { type: 'act', kind: 'hang', settlement: 'maribor' });
  s.fear = Math.max(s.fear, 55);
  return s;
}

test('Love, Fear, Authority and Unrest, each with its reasons; Authority\'s bar split by its sources', async () => {
  const s = realm();
  const { context, page, errors } = await open(serialize(s));
  const keys = await page.$$eval('#topbar .meter', (els) => els.map((e) => e.dataset.go));
  assert.deepEqual(keys, ['meter:love', 'meter:fear', 'meter:authority', 'meter:unrest']);
  // Authority's bar: the greater part and the quarter of the lesser.
  const parts = await page.$$eval('#m-authority-bar, #m-authority-bar2', (els) => els.map((e) => ({ w: parseFloat(e.style.width), c: e.className })));
  assert.equal(parts.length, 2);
  assert.ok(parts[0].w >= parts[1].w && parts[1].w > 0, JSON.stringify(parts));
  const shown = Number(await page.textContent('#m-authority'));
  assert.ok(Math.abs(parts[0].w + parts[1].w - shown) <= 1.5, `${parts[0].w} + ${parts[1].w} against ${shown}`);
  await page.screenshot({ path: join(OUT, 'portrait-crown-topbar.png'), clip: { x: 0, y: 0, width: 390, height: 140 } });
  for (const [key, title] of [['love', 'Love'], ['fear', 'Fear'], ['authority', 'Authority'], ['unrest', 'Unrest']]) {
    await page.click(`#topbar [data-go="meter:${key}"]`);
    await page.waitForSelector('#sheet:not([hidden])');
    assert.match(await page.textContent('#sheet-title'), new RegExp(title));
    const lines = await page.$$eval('[data-part="why"] [data-part="reasons"] > div', (els) => els.length);
    assert.ok(lines >= 1 && lines <= 5, `${key}: ${lines} lines`);
    if (key === 'love' || key === 'fear') assert.ok(await page.locator('[data-part="acts"] [data-act]').count() >= 2, `${key} offers the crown's acts`);
    await page.evaluate(() => document.querySelector('[data-part="why"]').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, `portrait-crown-${key}.png`) });
    await page.click('#sheet-close');
  }
  // A feast from the Love card: Love rises, with Undo on offer.
  const love = await page.evaluate(() => window.northernWars.state.love);
  await page.click('#topbar [data-go="meter:love"]');
  await page.evaluate(() => document.querySelector('[data-act="feast"]').scrollIntoView({ block: 'center' }));
  await page.click('[data-act="feast"]');
  assert.ok(await page.evaluate(() => window.northernWars.state.love) > love);
  assert.equal(await page.isVisible('#undo'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('gibbets at the crossroads, heads on the gate, and the king on progress, on the map', async () => {
  let s = realm();
  s = act(s, { type: 'act', kind: 'progress' });
  // A few days on, the train is on the road and the first town reached.
  s = step(s, 8, world, { ambient: false });
  const { context, page, errors } = await open(serialize(s));
  await page.evaluate(() => { const nw = window.northernWars; const m = nw.world.byId.maribor; nw.zoomTo(2.6); nw.lookAt(m.x, m.y); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'portrait-gibbets.png') });
  const progress = await page.evaluate(() => window.northernWars.state.figures.find((f) => f.kind === 'progress'));
  assert.ok(progress, 'the king\'s train is on the road');
  await page.evaluate((f) => { const nw = window.northernWars; const a = nw.world.byId[f.from]; const b = nw.world.byId[f.to]; nw.lookAt((a.x + b.x) / 2, (a.y + b.y) / 2); }, progress);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'portrait-progress.png') });
  const p = await page.evaluate((id) => window.northernWars.figureScreenOf(id), progress.id);
  const hit = await page.evaluate((pt) => window.northernWars.pickAt(pt.x, pt.y), p);
  assert.equal(hit?.figure, progress.id);
  assert.deepEqual(errors, []);
  await context.close();
});
