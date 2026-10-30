// The game's own dialog and Undo (M23 A): a weighty order that can be taken
// back happens at once and its notice offers Undo, which puts the realm back
// exactly; what cannot be taken back (standing a company down, abandoning a
// reign) asks first in the game's dialog, never the browser's. Keeps
// portrait screenshots of both at 360x640.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
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

async function open(save) {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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

// A tap on something in the panel, which may sit below the half-open
// sheet's fold.
async function tap(page, sel) {
  await page.waitForSelector(sel, { state: 'attached' });
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await page.click(sel);
}

const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};

test('a weighty order happens at once, and Undo puts the realm back exactly', async () => {
  const s = quiet(step(createState(world, 31), 40, world, { ambient: false }));
  s.trust = 80;
  const { context, page, errors } = await open(serialize(s));
  const before = await page.evaluate(() => JSON.stringify(window.northernWars.state));
  // Declare war on Kaedwen from its card: no question, the war begins.
  await page.click('[data-tab="diplomacy"]');
  await tap(page, '[data-go="realm:kaedwen"]');
  await tap(page, '[data-declare]');
  assert.equal(await page.evaluate(() => window.northernWars.state.wars.length), 1);
  assert.equal(await page.isVisible('#undo'), true, 'the notice offers Undo');
  assert.equal(await page.isVisible('#dialog'), false);
  assert.match(await page.textContent('#undo-text'), /war/i);
  await page.screenshot({ path: join(OUT, 'portrait-undo.png') });
  await page.click('#undo-go');
  assert.equal(await page.evaluate(() => window.northernWars.state.wars.length), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(window.northernWars.state)), before, 'the realm is as it was');
  assert.equal(await page.isVisible('#undo'), false);
  // Undo lasts only until a day passes. (Undo leaves us on the card we were
  // on, the war panel or Kaedwen's own.)
  if (!(await page.$('[data-declare]'))) {
    await page.click('[data-tab="diplomacy"]');
    await page.click('[data-tab="diplomacy"]');
    await tap(page, '[data-go="realm:kaedwen"]');
  }
  await tap(page, '[data-declare]');
  await page.click('[data-speed="4"]');
  await page.waitForFunction((d) => window.northernWars.state.day > d, s.day);
  await page.click('[data-speed="0"]');
  assert.equal(await page.isVisible('#undo'), false, 'Undo is gone once a day has passed');
  assert.deepEqual(errors, []);
  await context.close();
});

test('what cannot be undone asks first, in the game\'s own dialog', async () => {
  let s = quiet(step(createState(world, 32), 40, world, { ambient: false }));
  s.treasury = 6000;
  s = applyAction(s, world, { type: 'recruit', settlement: 'vizima', kind: 'archers' }).state;
  const id = s.forces.companies[0].id;
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="forces"]');
  await tap(page, `[data-company="${id}"]`);
  await page.waitForSelector('[data-disband-company]');
  await tap(page, '[data-disband-company]');
  // The dialog, fitting the phone, the safe choice focused.
  await page.waitForSelector('#dialog:not([hidden])');
  assert.match(await page.textContent('#dialog-text'), /Stand this company down/);
  const box = await page.$eval('#dialog .dialog', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  assert.ok(box.l >= 0 && box.r <= 360 && box.t >= 0 && box.b <= 640, JSON.stringify(box));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'dialog-no');
  await page.screenshot({ path: join(OUT, 'portrait-dialog.png') });
  // Cancel: nothing happens.
  await page.click('#dialog-no');
  assert.equal(await page.isVisible('#dialog'), false);
  assert.equal(await page.evaluate((c) => window.northernWars.state.forces.companies.some((x) => x.id === c), id), true);
  // Escape cancels too.
  await tap(page, '[data-disband-company]');
  await page.waitForSelector('#dialog:not([hidden])');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate((c) => window.northernWars.state.forces.companies.some((x) => x.id === c), id), true);
  // Yes: the company is stood down, and no Undo is offered.
  await tap(page, '[data-disband-company]');
  await page.waitForSelector('#dialog:not([hidden])');
  await page.click('#dialog-yes');
  await page.waitForFunction((c) => !window.northernWars.state.forces.companies.some((x) => x.id === c), id);
  assert.equal(await page.isVisible('#undo'), false);

  // Abandoning the reign asks too; Cancel keeps it.
  const day = await page.evaluate(() => window.northernWars.state.day);
  await page.click('#more-button');
  await page.click('[data-more="new"]');
  await page.waitForSelector('#dialog:not([hidden])');
  assert.match(await page.textContent('#dialog-text'), /Abandon this reign/);
  await page.click('#dialog-no');
  assert.equal(await page.evaluate(() => window.northernWars.state.day), day);
  assert.deepEqual(errors, []);
  await context.close();
});
