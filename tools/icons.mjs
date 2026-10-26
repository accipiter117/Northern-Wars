// Draws the app's placeholder icons (parchment, ink and a shield) as SVG and
// renders them to PNG with the preinstalled browser. Run after changing the
// design: node tools/icons.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));

// A shield in ink and gold on old paper, with a tower on it. `pad` is how
// much of the square the parchment fills beyond the shield: a maskable icon
// keeps everything inside the middle 80%.
export function iconSvg(size, { maskable = false } = {}) {
  const inset = maskable ? 0.2 : 0.08;
  const s = size;
  const k = s * (1 - inset * 2);
  const o = s * inset;
  const p = (x, y) => `${(o + x * k).toFixed(1)},${(o + y * k).toFixed(1)}`;
  const shield = `M${p(0.18, 0.12)} L${p(0.82, 0.12)} L${p(0.82, 0.5)} Q${p(0.82, 0.8)} ${p(0.5, 0.94)} Q${p(0.18, 0.8)} ${p(0.18, 0.5)} Z`;
  const tower = `M${p(0.38, 0.72)} L${p(0.38, 0.42)} L${p(0.35, 0.42)} L${p(0.35, 0.33)} L${p(0.41, 0.33)} L${p(0.41, 0.37)} L${p(0.47, 0.37)} L${p(0.47, 0.33)} L${p(0.53, 0.33)} L${p(0.53, 0.37)} L${p(0.59, 0.37)} L${p(0.59, 0.33)} L${p(0.65, 0.33)} L${p(0.65, 0.42)} L${p(0.62, 0.42)} L${p(0.62, 0.72)} Z`;
  const door = `M${p(0.46, 0.72)} L${p(0.46, 0.6)} Q${p(0.5, 0.54)} ${p(0.54, 0.6)} L${p(0.54, 0.72)} Z`;
  const corner = maskable ? 0 : s * 0.18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#efe1bb"/><stop offset="1" stop-color="#cdb27c"/></radialGradient></defs>
  <rect width="${s}" height="${s}" rx="${corner}" fill="url(#g)"/>
  <rect x="${s * 0.03}" y="${s * 0.03}" width="${s * 0.94}" height="${s * 0.94}" rx="${corner * 0.8}" fill="none" stroke="#3a2a18" stroke-opacity="0.35" stroke-width="${s * 0.012}"/>
  <path d="${shield}" fill="#23365e" stroke="#2a1d10" stroke-width="${s * 0.03}" stroke-linejoin="round"/>
  <path d="${shield}" fill="none" stroke="#d8c08a" stroke-width="${s * 0.012}" stroke-linejoin="round" transform="translate(0 0)"/>
  <path d="${tower}" fill="#e6d3a2" stroke="#2a1d10" stroke-width="${s * 0.01}" stroke-linejoin="round"/>
  <path d="${door}" fill="#2a1d10"/>
</svg>`;
}

const ICONS = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, maskable] of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${iconSvg(size, { maskable })}`);
    await writeFile(join(OUT, name), await page.locator('svg').screenshot({ omitBackground: true }));
  }
  await writeFile(join(OUT, 'icon.svg'), iconSvg(64));
  await browser.close();
  console.log('Icons written to icons/');
}
