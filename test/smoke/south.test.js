// The map south of the Yaruga in the browser (M30 A): Ebbing, Nazair and
// the dark heartland band at the edge, with the road on to the City of the
// Golden Towers. Keeps portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT } from '../helpers.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

test.after(async () => {
  await browser.close();
  server.close();
});

test('the southern map: Ebbing below Cintra, the provinces whole, the heartland at the edge', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  const facts = await page.evaluate(() => {
    const g = window.northernWars.world.geography;
    return { bottom: g.bounds[3], ends: g.roadEnds.length, ebbing: !!g.lands.ebbing, heartland: !!g.lands.heartland?.heartland };
  });
  assert.deepEqual(facts, { bottom: 1950, ends: 3, ebbing: true, heartland: true });
  await page.evaluate(() => { const nw = window.northernWars; nw.zoomTo(0.9); nw.lookAt(330, 1700); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, 'portrait-south-ebbing.png') });
  await page.evaluate(() => { const nw = window.northernWars; nw.zoomTo(1.4); nw.lookAt(740, 1800); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, 'portrait-south-golden-towers.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
