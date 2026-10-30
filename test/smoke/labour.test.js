// The Labour screen in the browser (M20 C): the year, the outlook for
// winter, where the hands go and the royal calls. Keeps portrait and
// landscape screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, dateOf } from '../../src/sim/index.js';

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

test('the Labour sheet: one screen with the bar, the settings and three lines; Adjust with sliders and the royal calls', async () => {
  // Late June, the harvest still to come.
  const s = step(createState(world, 20), 120, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  for (const vp of [{ name: 'portrait', width: 360, height: 640 }, { name: 'landscape', width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
    await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
    await page.goto(`${base}?paused&nohints`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    // The pressure strip opens Labour, which comes first in the Realm tab.
    await page.click('#pressure');
    await page.waitForSelector('[data-part="labour"]');
    assert.equal(await page.$eval('.segs button', (b) => b.dataset.sub), 'labour');
    await page.waitForTimeout(400);
    if (vp.name === 'portrait') {
      // One screen at 360x640: nothing to scroll, the Adjust button in view.
      assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('sheet-body'); return b.scrollHeight <= b.clientHeight + 1; }), true, 'the sheet fits without scrolling');
      const adj = await page.$eval('[data-part="adjust"]', (e) => e.getBoundingClientRect().bottom);
      const tabs = await page.$eval('#tabbar', (e) => e.getBoundingClientRect().top);
      assert.ok(adj <= tabs, `Adjust at ${adj}, tab bar at ${tabs}`);
    }
    // The bar, with idle hands a gap at its end; five settings; at most three lines.
    assert.ok(await page.locator('.hands-bar .seg').count() >= 4);
    assert.deepEqual(await page.$$eval('[data-part="presets"] [data-preset]', (els) => els.map((e) => e.dataset.preset)), ['harvest', 'winter', 'war', 'rebuild', 'balanced']);
    assert.equal(await page.$eval('[data-preset="balanced"]', (e) => e.getAttribute('aria-pressed')), 'true');
    const lines = await page.$$eval('[data-part="labour-lines"] p', (els) => els.length);
    assert.ok(lines >= 1 && lines <= 3, `${lines} lines`);
    await page.screenshot({ path: join(OUT, `${vp.name}-labour.png`) });
    if (vp.name === 'portrait') {
      // A setting at a stroke, with Undo-free plain order.
      await page.click('[data-preset="harvest"]');
      assert.deepEqual(await page.evaluate(() => window.northernWars.state.labour.split), world.labour.presets.harvest.split);
      // Adjust: a slider moves one kind and the others give way; Custom shows.
      await page.click('[data-part="adjust"]');
      await page.waitForSelector('[data-part="labour-adjust"]');
      assert.equal(await page.locator('.labour-row .step, [data-shift]').count(), 0, 'no more + and - buttons');
      const before = await page.evaluate(() => window.northernWars.state.labour.split.woods);
      await page.$eval('input[data-slide="woods"]', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, before + 6);
      await page.waitForFunction((v) => window.northernWars.state.labour.split.woods === v, before + 6);
      assert.equal(await page.evaluate(() => Object.values(window.northernWars.state.labour.split).reduce((a, b) => a + b, 0)), 100);
      await page.screenshot({ path: join(OUT, 'portrait-labour-adjust.png') });
      // The royal calls live under Adjust.
      await page.evaluate(() => document.querySelector('[data-call="winter"]').scrollIntoView({ block: 'center' }));
      // The winter turn stands from the start (M24 C): a tap calls it off.
      const standing = await page.evaluate(() => window.northernWars.state.labour.winterTurn);
      await page.click('[data-call="winter"]');
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.northernWars.state.labour.winterTurn), !standing);
      await page.evaluate(() => document.querySelector('[data-part="labour-adjust"] [data-set="adjust:false"]').scrollIntoView({ block: 'center' }));
      await page.click('[data-part="labour-adjust"] [data-set="adjust:false"]');
      await page.waitForSelector('[data-part="labour"]');
      assert.equal(await page.$eval('[data-preset="custom"]', (e) => e.textContent), 'Custom');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('the season prompts in the pressure strip, and its setting is marked on the sheet', async () => {
  // August: harvest time, with the hands at their usual round.
  let s = createState(world, 21);
  while (dateOf(s.day).month !== 8) s = step(s, 5, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  assert.match(await page.textContent('#pressure'), /Harvest time/);
  await page.click('#pressure');
  await page.waitForSelector('[data-part="labour"]');
  assert.equal(await page.$eval('[data-preset="harvest"]', (e) => e.classList.contains('suggest')), true);
  assert.match(await page.textContent('[data-part="labour-lines"]'), /Harvest time/);
  await page.screenshot({ path: join(OUT, 'portrait-labour-prompt.png') });
  await page.click('[data-preset="harvest"]');
  await page.waitForFunction(() => !/Harvest time/.test(document.getElementById('pressure').textContent));
  assert.deepEqual(errors, []);
  await context.close();
});
