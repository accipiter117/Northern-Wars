// The Labour screen: where the kingdom's hands work through the seasons.
// Since M23 B it is one screen on a phone: a bar of the hands by kind of
// work (idle hands a gap at its end), the five settings at a stroke (or
// Custom), and at most three lines on what matters now. Adjust opens a
// slider for each kind of work and the royal calls.
import {
  LABOUR_KINDS, splitNow, winterOutlook, canCall, dateOf, MONTHS, foodYield, foodNeed, foodCapacity, labourPreview, monthlyOutput, canPreset, presetNow, seasonalPrompt,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr } from './card.js';
import { form } from './memory.js';

// What a change to the hands would do, in one line: "+120 iron, −60 grain a
// month". Previews are worked out once per state and kept (M21 C).
const previews = new WeakMap();
export function previewOf(state, world, key, change) {
  let m = previews.get(state);
  if (!m) previews.set(state, (m = {}));
  return (m[key] ??= labourPreview(state, world, change, monthlyOutput));
}

const OUT_NAMES = { grain: 'grain', materials: 'timber and stone', iron: 'iron', cloth: 'cloth', luxuries: 'luxuries', crowns: 'crowns from the crafts' };
export function outputLine(diff) {
  const parts = Object.entries(diff).filter(([, v]) => Math.abs(v) >= 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
    .map(([k, v]) => `${v > 0 ? '+' : '\u2212'}${number(Math.abs(v))} ${OUT_NAMES[k]}`);
  return parts.length ? `${parts.join(', ')} a month` : 'Little change this month';
}

// The most pressing shortage of hands, if any: the kind of work with work
// to do that is least well manned.
export function pressingShortage(state, world) {
  const r = state.labour?.report;
  if (!r) return null;
  let worst = null;
  for (const k of LABOUR_KINDS) {
    const x = r[k];
    if (!x || x.need <= 0) continue;
    const pct = x.staffed / x.need;
    if (pct < 0.85 && (!worst || pct < worst.pct)) worst = { kind: k, pct, name: world.labour.kinds[k].name };
  }
  return worst;
}

// A compact strip for the Realm tab: where the hands are, the one most
// pressing shortage, and a tap to the Labour screen.
export function labourStripHtml(app) {
  const { world, state } = app;
  if (!world.labour || !state.labour?.report) return '';
  const split = splitNow(state, world);
  const top = LABOUR_KINDS.filter((k) => split[k] >= 5).sort((a, b) => split[b] - split[a]).slice(0, 4)
    .map((k) => `${escapeHtml(world.labour.kinds[k].name.toLowerCase())} ${Math.round(split[k])}`).join(', ');
  const worst = pressingShortage(state, world);
  return `<button type="button" class="labour-strip" data-part="labour-strip" data-tab-go="realm:labour">
    <span class="ls-main">Hands, in a hundred: ${top}</span>
    <span class="ls-sub">${worst ? `<span class="down">Most pressing: ${escapeHtml(worst.name.toLowerCase())}, ${Math.round(worst.pct * 100)}% manned.</span>` : 'Every kind of work is manned.'} Tap to set them.</span></button>`;
}

const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

function seasonStrip(world, state) {
  const now = dateOf(state.day).month;
  const fields = world.labour.kinds.fields.months;
  const frost = world.labour.calls.winter.frost;
  return `<div class="season-strip" data-part="seasons" role="img" aria-label="The year: fields from ${MONTHS[fields[0] - 1].name} to ${MONTHS[fields.at(-1) - 1].name}, first frost in ${MONTHS[frost - 1].name}">
    ${MONTHS.map((m, i) => {
      const n = i + 1;
      const tags = [fields.includes(n) ? 'f' : '', n === frost ? 'frost' : ''].filter(Boolean).join(' ');
      return `<span class="mon ${SEASON_OF[i]}${n === now ? ' now' : ''}" data-tags="${tags}"><b>${m.name[0]}</b>${fields.includes(n) ? '<i class="fld"></i>' : ''}${n === frost ? '<i class="frost"></i>' : ''}</span>`;
    }).join('')}
  </div>`;
}

function callsHtml(world, state) {
  const c = world.labour.calls;
  const lab = state.labour;
  const btn = (id, label, sub, active) => {
    const check = canCall(state, world, id);
    return `<button type="button" class="build${active ? ' on' : ''}" data-call="${id}" ${orderAttr({ type: 'call', call: id })} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(label)}</span><span class="build-blurb">${escapeHtml(sub)}</span>
      <span class="build-cost">${check.ok ? '' : escapeHtml(check.reason)}</span></button>`;
  };
  const until = (k) => (lab.calls[k] ? ` ${lab.calls[k].until - state.day} days more.` : '');
  return `<div data-part="calls"><h3>Royal calls</h3><div class="build-list">
    ${btn('harvest', `${c.harvest.name}${lab.calls.harvest ? ' (called)' : ''}`, `${c.harvest.blurb}${until('harvest')}`, !!lab.calls.harvest)}
    ${btn('winter', `${c.winter.name}: ${lab.winterTurn ? 'standing' : 'not called'}`, `${c.winter.blurb} ${lab.winterTurn ? 'Tap to call it off.' : 'Tap to call it.'}`, lab.winterTurn)}
    ${btn('levy', `${c.levy.name}${lab.calls.levy ? ' (called)' : ''}`, `${c.levy.blurb} ${c.levy.coin} crowns.${until('levy')}`, !!lab.calls.levy)}
  </div></div>`;
}

// The bar: each kind of work's hands at work, in its own colour, and the
// idle hands a hatched gap at the end.
function handsBar(world, state) {
  const r = state.labour.report ?? {};
  // Hands on call (M34 A) are counted once, as on call, not again in the
  // work they help with.
  const parts = LABOUR_KINDS.map((k) => ({ k, n: Math.max(0, (r[k]?.staffed ?? 0) - (r[k]?.helped ?? 0)) })).filter((x) => x.n > 0);
  const idle = LABOUR_KINDS.reduce((a, k) => a + (r[k]?.idle ?? 0), 0);
  const call = onCall(r);
  const total = parts.reduce((a, x) => a + x.n, 0) + idle + call || 1;
  const pct = (n) => Math.round((100 * n) / total);
  const segs = parts.map((x) => `<span class="seg k-${x.k}" style="flex:${x.n}" title="${escapeHtml(world.labour.kinds[x.k].name)}: ${number(x.n)} at work"></span>`).join('');
  const oncall = call > 0 ? `<span class="seg oncall" style="flex:${call}" title="${number(call)} on call"></span>` : '';
  const gap = idle > 0 ? `<span class="seg idle" style="flex:${idle}" title="${number(idle)} idle"></span>` : '';
  const key = parts.sort((a, b) => b.n - a.n)
    .slice(0, 3).map((x) => `<span><i class="sw k-${x.k}"></i>${escapeHtml(world.labour.kinds[x.k].name)} ${pct(x.n)}%</span>`).join('');
  return `<div data-part="hands-bar"><div class="hands-bar" role="img" aria-label="The kingdom's ${number(total)} hands at work by kind, ${number(call)} on call, ${number(idle)} idle">${segs}${oncall}${gap}</div>
    <div class="hands-key">${key}${call > 0 ? `<span data-oncall><i class="sw oncall"></i>On call ${pct(call)}%</span>` : ''}${idle > 0 ? `<span><i class="sw idle"></i>Idle ${pct(idle)}%</span>` : ''}</div></div>`;
}

// Masons and levies with nothing to do, lending a hand where it is short.
function onCall(r) {
  return (r.repairs?.onCall ?? 0) + (r.levies?.onCall ?? 0);
}

// The five settings at a stroke, and Custom when the hands stand at none.
function presetChips(world, state) {
  const now = presetNow(state, world);
  const suggest = seasonalPrompt(state, world)?.preset;
  const chips = Object.entries(world.labour.presets ?? {}).filter(([k]) => k !== 'note').map(([id, p]) => {
    const on = id === now;
    const check = canPreset(state, world, id);
    const title = on ? 'In force' : outputLine(previewOf(state, world, `preset:${id}`, { split: p.split }));
    return `<button type="button" class="chip${on ? ' on' : ''}${id === suggest ? ' suggest' : ''}" data-preset="${id}" aria-pressed="${on}" title="${escapeHtml(`${p.blurb} ${title}`)}" ${on ? '' : orderAttr({ type: 'preset', preset: id })} ${on || check.ok ? '' : 'disabled'}>${escapeHtml(p.name)}</button>`;
  }).join('');
  const custom = now ? '' : '<span class="chip on" data-preset="custom" aria-pressed="true">Custom</span>';
  return `<div class="chips presets" data-part="presets">${chips}${custom}</div>`;
}

// At most three lines: the season's suggestion or the grain for winter,
// the fuel, and the most pressing shortage (or the idle hands).
function labourLines(world, state) {
  const o = winterOutlook(state, world, { foodYield, foodNeed, foodCapacity });
  const month = dateOf(state.day).month;
  const wintry = month >= 11 || month <= 2;
  const lines = [];
  const prompt = seasonalPrompt(state, world);
  if (prompt) lines.push(`<span class="suggest-t">${escapeHtml(prompt.text)}</span> ${escapeHtml(world.labour.presets[prompt.preset].name)} is marked above.`);
  else if (!wintry) lines.push(o.short ? `<span class="down">Grain is short for winter</span>: ${number(o.atFrost)} at first frost against ${number(o.winter)} needed.` : `Grain enough for winter: ${number(o.atFrost)} at first frost, in ${o.days} days.`);
  if (state.labour.short > 0.05) lines.push('<span class="down">The woodpiles are empty</span>: hearths are going cold.');
  else lines.push(`Fuel ${number(o.fuel)} of a winter's ${number(o.fuelNeed)}${wintry ? '' : `, about ${number(o.fuelAtFrost)} by first frost`}.`);
  const worst = pressingShortage(state, world);
  const r = state.labour.report ?? {};
  const idle = LABOUR_KINDS.reduce((a, k) => a + (r[k]?.idle ?? 0), 0);
  if (worst) lines.push(`<span class="down">${escapeHtml(worst.name)} short of hands</span>: ${Math.round(worst.pct * 100)}% manned.`);
  else if (idle > 0) lines.push(`${number(idle)} hands idle: nothing for them to do this season.`);
  return `<div class="labour-lines" data-part="labour-lines">${lines.slice(0, 3).map((l) => `<p>${l}</p>`).join('')}</div>`;
}

// Adjust: a slider for each kind of work (the others give way in
// proportion), with its hands and what it needs; then the royal calls.
function sliderRow(world, state, kind, split) {
  const def = world.labour.kinds[kind];
  const r = state.labour.report?.[kind] ?? { hands: 0, need: 0, staffed: 0, idle: 0 };
  const base = state.labour.split[kind];
  const now = Math.round(split[kind]);
  let warn = '';
  if (r.need > 0 && r.staffed < r.need * 0.8) warn = ` <span class="down">${Math.round((100 * r.staffed) / r.need)}% manned</span>`;
  else if (r.need === 0 && r.hands > 0 && kind !== 'repairs' && kind !== 'levies') warn = ' <span class="warn-t">idle this season</span>';
  // On call (M34 A): helping where hands are short until they are wanted.
  if (r.onCall) warn = `, <span class="oncall-t" data-oncall="${kind}">${number(r.onCall)} on call, at work where hands are short until ${kind === 'repairs' ? 'masons are wanted' : 'war comes'}</span>`;
  return `<label class="slide-row" data-kind="${kind}">
    <span class="sr-top"><span class="sr-name"><i class="sw k-${kind}"></i>${escapeHtml(def.name)}</span><output>${base}</output></span>
    <input type="range" min="0" max="${world.labour.maxShare}" step="1" value="${base}" data-slide="${kind}" aria-label="${escapeHtml(def.name)}, hands in a hundred">
    <span class="sr-sub">${number(r.hands)} hands${r.need ? `, needs ${number(r.need)}` : ''}${now !== base ? `, ${now} by a call` : ''}${warn}</span></label>`;
}

function adjustHtml(world, state) {
  const split = splitNow(state, world);
  return `<div data-part="labour-adjust">
    <div class="adjust-head"><p class="sub">Hands in a hundred. Move one and the others give way in proportion.</p>
      <button type="button" class="act" data-form="labour" data-set="adjust:false"><span class="act-label">Done</span></button></div>
    ${seasonStrip(world, state)}
    <div class="slide-rows">${LABOUR_KINDS.map((k) => sliderRow(world, state, k, split)).join('')}</div>
    ${callsHtml(world, state)}
  </div>`;
}

export function labourHtml(app) {
  const { world, state, memory } = app;
  if (!world.labour || !state.labour) return '<p class="sub">No labour to set in this world.</p>';
  if (form(memory, 'labour', { adjust: false }).adjust) return adjustHtml(world, state);
  return `<div data-part="labour" data-form="labour" data-fit>
    ${handsBar(world, state)}
    ${presetChips(world, state)}
    ${labourLines(world, state)}
    <button type="button" class="act wide" data-part="adjust" data-set="adjust:true"><span class="act-label">Adjust each kind of work, and the royal calls</span></button>
  </div>`;
}
