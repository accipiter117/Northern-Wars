// One military in the browser (M22 C): a town's Military card with its
// companies and its muster, calling the muster, an army made of companies
// with another joined to it, and the skirmish table. Keeps portrait
// screenshots of each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize, applyAction } from '../../src/sim/index.js';
import { skirmishTable } from '../../tools/skirmish.mjs';

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

test('a town\'s companies and muster, and an army of companies with another joined to it', async () => {
  let s = step(createState(world, 22), 92, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 9000;
  s = applyAction(s, world, { type: 'recruit', settlement: 'maribor', kind: 'crossbows' }).state;
  s = applyAction(s, world, { type: 'raise', muster: 'maribor', levy: 'third', nobles: false, mercs: [], units: [s.forces.companies[0].id], marshal: 'vestibor', stance: 'cautious' }).state;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`browser dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript((save) => localStorage.setItem('northern-wars.save', save), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);

  // Maribor's Military tab: its garrison companies, its muster, and the call.
  // (An army stands at Maribor, and a tap there picks the army: open the
  // town from the Places list.)
  await page.click('[data-tab="realm"]');
  await page.click('.segs [data-sub="places"]');
  await page.fill('[data-form="places"] input[data-field="q"]', 'Maribor');
  await page.click('[data-go="town:maribor"]');
  await page.waitForSelector('.segs [data-tsub="military"]');
  await page.click('.segs [data-tsub="military"]');
  const text = await page.textContent('[data-part="muster"]');
  assert.match(text, /Garrison of Maribor: [\d,]+ garrison soldiers in \d+ compan[\s\S]*Its muster: [\d,]+ men in \d+ companies \([\d,]+ militia and [\d,]+ crossbowmen\)[\s\S]*under arms in a day[\s\S]*Call the muster/);
  await page.evaluate(() => document.querySelector('[data-part="muster"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-town-military.png') });
  await page.click('[data-muster="maribor"]');
  await page.waitForFunction(() => window.northernWars.state.armies.some((a) => a.muster === 'maribor'));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-muster.png') });

  // The army's card: its companies; join the muster to it.
  const army = await page.evaluate(() => window.northernWars.state.armies.find((a) => a.side === 'temeria' && !a.muster).id);
  const muster = await page.evaluate(() => window.northernWars.state.armies.find((a) => a.muster === 'maribor').id);
  await page.click('[data-tab="military"]');
  await page.click('.segs [data-sub="forces"]');
  await page.click(`[data-army="${army}"]`);
  await page.waitForSelector('[data-part="companies"]');
  await page.click('[data-sec="companies"] > summary');
  assert.match(await page.textContent('[data-part="companies"]'), /Companies \(\d+\)[\s\S]*Maribor spearmen: [\d,]+ militia \(levy\)[\s\S]*crossbowmen \(standing company\)[\s\S]*Join The muster of Maribor to this army/);
  await page.click(`[data-merge="${muster}"]`);
  await page.waitForFunction(() => !window.northernWars.state.armies.some((a) => a.muster === 'maribor'));
  const merged = await page.evaluate((id) => window.northernWars.state.armies.find((a) => a.id === id), army);
  assert.ok(merged.bands.length >= 3);
  await page.evaluate(() => document.querySelector('[data-part="companies"]').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'portrait-army-companies.png') });
  // Detach one company.
  const n = merged.bands.length;
  await page.click('[data-part="companies"] [data-detach="0"]');
  await page.waitForFunction(([id, k]) => window.northernWars.state.armies.find((a) => a.id === id)?.bands.length === k - 1, [army, n]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the skirmish table, drawn for the record', async () => {
  const rows = skirmishTable(createState(world, 1), world);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=390"><link rel="stylesheet" href="${base}styles.css">
    <style>body{background:#1c1712;color:#efe3c6;font-family:Georgia,serif;margin:0;padding:12px}table{border-collapse:collapse;font-size:12px;width:100%}td,th{padding:4px 3px;border-bottom:1px dotted #5a4a32;text-align:right}td:first-child,th:first-child{text-align:left}th{color:#c9a85b;font-weight:600}.need{color:#e8a08e}</style></head>
    <body><h3 style="color:#c9a85b;margin:4px 0 8px">Skirmish table (M22 C)</h3><p style="font-size:12px;color:#b5a27e;margin:0 0 8px">Chance the defenders win: a city, a town and a village of ours (garrison and own muster, walls), and one standing company.</p>
    <table><tr><th>Threat</th><th>City</th><th>Town</th><th>Village</th><th>Company</th></tr>
    ${rows.map((r) => `<tr class="${r.need ? 'need' : ''}"><td>${r.label}${r.need ? ' *' : ''}</td><td>${pct(r.odds.city)}</td><td>${pct(r.odds.town)}</td><td>${pct(r.odds.village)}</td><td>${pct(r.odds.company)}</td></tr>`).join('')}
    </table><p style="font-size:12px;color:#b5a27e">* needs a field army or standing companies</p></body></html>`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setContent(html);
  await page.screenshot({ path: join(OUT, 'portrait-skirmish-table.png'), fullPage: true });
  await context.close();
});
