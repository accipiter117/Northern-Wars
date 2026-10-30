// Hands and armies in the browser (M21 C and D): the labour strip on the
// Realm tab, a preset with what it would do, a town's focus, and raising an
// army with its preview. Keeps portrait screenshots of each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';

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

test('the labour strip, a preset, a town\'s focus, and an army raised with its preview', async () => {
  const s = step(createState(world, 22), 92, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 12000;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // The strip on the Realm tab, and a tap to the Labour screen.
  await page.click('[data-tab="realm"]');
  await page.click('.segs [data-sub="overview"]');
  assert.match(await page.textContent('[data-part="labour-strip"]'), /Hands, in a hundred: fields \d+[\s\S]*Tap to set them/);
  await page.screenshot({ path: join(OUT, 'portrait-labour-strip.png') });
  await page.click('[data-part="labour-strip"]');
  await page.waitForSelector('[data-part="presets"]');
  // Each setting says what it would change, in its title.
  const preview = await page.getAttribute('[data-preset="harvest"]', 'title');
  assert.match(preview, /[+−]\d+ [a-z ]+[\s\S]*a month/);
  await page.screenshot({ path: join(OUT, 'portrait-preset.png') });
  await page.click('[data-preset="war"]');
  assert.deepEqual(await page.evaluate(() => window.northernWars.state.labour.split), world.labour.presets.war.split);

  // Maribor's focus, from its card: the preview first, then the order.
  await page.click('#sheet-close');
  await page.evaluate(() => { const st = window.northernWars.world.byId.maribor; window.northernWars.lookAt(st.x, st.y); });
  const mar = await page.evaluate(() => window.northernWars.screenOf('maribor'));
  await page.touchscreen.tap(mar.x, mar.y);
  await page.waitForSelector('#sheet:not([hidden])');
  await page.click('.segs [data-tsub="works"]');
  // The focus is one row on the town card: a chip says what it would do,
  // and a tap sets it.
  assert.match(await page.getAttribute('[data-part="focus"] [data-focus="food"]', 'title'), /This town and its villages: [\s\S]*a month|Little change/);
  await page.evaluate(() => document.querySelector('[data-part="focus"]').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(OUT, 'portrait-focus.png') });
  await page.click('[data-part="focus"] [data-focus="food"]');
  assert.equal(await page.evaluate(() => window.northernWars.state.labour.focus.maribor), 'food');

  // Raise an army: the levy, the lords, a mercenary company, and what it costs.
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="war"]');
  await page.click('[data-form="raise"] [data-set="levy:all"]');
  await page.click('[data-form="raise"] [data-set="nobles:true"]');
  await page.click('[data-merc="kovir"]');
  const text = await page.textContent('[data-part="raise-preview"]');
  assert.match(text, /\d[\d,]* men: [\d,]+ levied, \d+ from the lords, 800 hired[\s\S]*hands leave the works[\s\S]*crowns a month[\s\S]*Gathers in \d+ days/);
  assert.match(await page.textContent('[data-part="retinues"]'), /Dravnik \d+/);
  // Let the sheet settle after the last tap before scrolling to the preview.
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-part="raise-preview"]').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(OUT, 'portrait-raise.png') });
  await page.click('[data-raise]');
  const army = await page.evaluate(() => window.northernWars.state.armies.find((a) => a.side === 'temeria'));
  assert.ok(army && army.soldiers > 3000 && army.mercs.length === 1);
  // Raising opens the new army's card; back to the Military tab's Forces.
  await page.click('#sheet-back');
  await page.click('.segs [data-sub="forces"]');
  assert.match(await page.textContent('[data-part="under-arms"]'), /[\d,]+ men under arms[\s\S]*crowns a month; the treasury could pay them \d+ months?/);
  assert.deepEqual(errors, []);
  await context.close();
});
