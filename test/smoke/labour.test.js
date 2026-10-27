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

test('the Labour screen: seasons, winter outlook, hands by kind, and the royal calls', async () => {
  // Late June, the harvest still to come.
  const s = step(createState(world, 20), 120, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  for (const vp of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
    await page.goto(`${base}?paused&nohints`);
    await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
    await page.click('[data-tab="realm"]');
    await page.click('.segs [data-sub="labour"]');
    await page.waitForSelector('[data-part="labour"]');
    const text = await page.textContent('[data-part="labour"]');
    assert.match(text, /Grain at first frost[\s\S]*Fuel in store[\s\S]*Fields[\s\S]*Woods and turf[\s\S]*Mines[\s\S]*Crafts[\s\S]*Repairs[\s\S]*Levies[\s\S]*Harvest muster[\s\S]*The winter turn[\s\S]*Raise the levies/);
    assert.equal(await page.locator('.season-strip .mon.now').count(), 1);
    await page.screenshot({ path: join(OUT, `${vp.name}-labour.png`) });
    if (vp.name === 'portrait') {
      const before = await page.evaluate(() => window.northernWars.state.labour.split.woods);
      await page.click('[data-shift="woods:5"]');
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.northernWars.state.labour.split.woods), before + 5);
      await page.click('[data-call="winter"]');
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.northernWars.state.labour.winterTurn), true);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});
