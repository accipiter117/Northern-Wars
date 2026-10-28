// The Labour screen (M20 C): where the kingdom's hands work through the
// seasons. A strip of the year with this month marked; the grain the realm
// will hold at first frost against what winter will eat, and the fuel; each
// kind of work with its hands, what it needs and a line on its season; the
// royal calls. Hands short or standing idle are flagged.
import {
  LABOUR_KINDS, splitNow, winterOutlook, canCall, dateOf, MONTHS, foodYield, foodNeed, foodCapacity, labourPreview, monthlyOutput, canPreset,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr } from './card.js';

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

function presetsHtml(world, state) {
  const presets = Object.entries(world.labour.presets ?? {}).filter(([k]) => k !== 'note');
  if (!presets.length) return '';
  const now = state.labour.split;
  const buttons = presets.map(([id, p]) => {
    const same = Object.keys(p.split).every((k) => p.split[k] === now[k]);
    const check = canPreset(state, world, id);
    const line = same ? 'In force' : outputLine(previewOf(state, world, `preset:${id}`, { split: p.split }));
    return `<button type="button" class="build${same ? ' on' : ''}" data-preset="${id}" ${orderAttr({ type: 'preset', preset: id })} ${check.ok && !same ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(p.name)}</span><span class="build-blurb">${escapeHtml(p.blurb)}</span>
      <span class="build-cost" data-part="preset-preview">${escapeHtml(line)}</span></button>`;
  }).join('');
  return `<div data-part="presets"><h3>At a stroke</h3><div class="build-list presets">${buttons}</div></div>`;
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

function outlookHtml(world, state) {
  const o = winterOutlook(state, world, { foodYield, foodNeed, foodCapacity });
  const pct = (a, b) => Math.max(0, Math.min(100, Math.round((100 * a) / Math.max(1, b))));
  const month = dateOf(state.day).month;
  const wintry = month >= 11 || month <= 2;
  const grain = wintry ? '' : `<div class="gauge-row" data-part="grain"><div class="lbl"><span>Grain at first frost, against winter's need</span><span>${number(o.atFrost)} of ${number(o.winter)}</span></div>
    <div class="gauge${o.short ? ' bad' : ''}"><span style="width:${pct(o.atFrost, o.winter)}%"></span></div>
    <p class="sub">First frost in ${o.days} days. ${o.short ? 'Grain is short for winter: more hands in the fields, or a harvest muster.' : 'Enough grain for the winter, as things stand.'}</p></div>`;
  const fuel = `<div class="gauge-row" data-part="fuel"><div class="lbl"><span>Fuel in store, against a winter's burning</span><span>${number(o.fuel)} of ${number(o.fuelNeed)}</span></div>
    <div class="gauge${(wintry ? o.fuel : o.fuelAtFrost) < o.fuelNeed * 0.6 ? ' bad' : ''}"><span style="width:${pct(o.fuel, o.fuelNeed)}%"></span></div>
    <p class="sub">${state.labour.short > 0.05 ? 'The woodpiles are empty: hearths are going cold, and the poorest are dying.' : `Wood, charcoal and turf, cut by the woods hands. Hearths burn it from November to March.${wintry ? '' : ` About ${number(o.fuelAtFrost)} by first frost at this rate.`}`}${state.labour.made !== undefined ? ` Last month ${number(state.labour.made)} cut, ${number(state.labour.burned ?? 0)} burned.` : ''}</p></div>`;
  return `${grain}${fuel}`;
}

function kindRow(world, state, kind, split) {
  const def = world.labour.kinds[kind];
  const r = state.labour.report?.[kind] ?? { hands: 0, need: 0, staffed: 0, idle: 0 };
  const base = state.labour.split[kind];
  const now = Math.round(split[kind]);
  let warn = '';
  if (r.need > 0 && r.staffed < r.need * 0.8) warn = `<span class="down">Short: ${Math.round((100 * r.staffed) / r.need)}% manned</span>`;
  else if (r.need === 0 && r.hands > 0 && kind !== 'repairs' && kind !== 'levies') warn = '<span class="warn-t">Idle: nothing to do this season</span>';
  else if (r.idle > r.hands * 0.25 && kind !== 'woods') warn = `<span class="warn-t">${number(r.idle)} idle</span>`;
  const step = (d) => orderAttr({ type: 'labourShift', kind, step: d });
  return `<div class="labour-row" data-kind="${kind}">
    <div class="lr-main"><span class="lr-name">${escapeHtml(def.name)}</span>
      <span class="lr-hands">${number(r.hands)} hands${r.need ? ` · needs ${number(r.need)}` : ''}${now !== base ? ` · <small>${now} in a hundred by a call (${base} set)</small>` : ''}</span>
      <span class="lr-note">${escapeHtml(def.note)} ${warn}</span></div>
    <div class="lr-share">
      <button type="button" class="step" data-shift="${kind}:-5" aria-label="Fewer hands to ${escapeHtml(def.name.toLowerCase())}" ${step(-5)} ${base <= 0 ? 'disabled' : ''}>−</button>
      <b>${base}</b>
      <button type="button" class="step" data-shift="${kind}:5" aria-label="More hands to ${escapeHtml(def.name.toLowerCase())}" ${step(5)} ${base >= world.labour.maxShare ? 'disabled' : ''}>+</button>
    </div></div>`;
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

export function labourHtml(app) {
  const { world, state } = app;
  if (!world.labour || !state.labour) return '<p class="sub">No labour to set in this world.</p>';
  const split = splitNow(state, world);
  const total = LABOUR_KINDS.reduce((a, k) => a + (state.labour.report?.[k]?.hands ?? 0), 0);
  return `<div data-part="labour">
    <p class="sub">The kingdom's ${number(total)} hands, by kind of work, in a hundred. Villages within a day's walk lend theirs to the nearest town; spare hands go where they are short.</p>
    ${seasonStrip(world, state)}
    ${outlookHtml(world, state)}
    ${presetsHtml(world, state)}
    <h3>Where the hands go</h3>
    <div class="labour-rows">${LABOUR_KINDS.map((k) => kindRow(world, state, k, split)).join('')}</div>
    ${callsHtml(world, state)}
  </div>`;
}
