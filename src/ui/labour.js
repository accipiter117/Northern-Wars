// The Labour screen (M20 C): where the kingdom's hands work through the
// seasons. A strip of the year with this month marked; the grain the realm
// will hold at first frost against what winter will eat, and the fuel; each
// kind of work with its hands, what it needs and a line on its season; the
// royal calls. Hands short or standing idle are flagged.
import {
  LABOUR_KINDS, splitNow, winterOutlook, canCall, dateOf, MONTHS, foodYield, foodNeed, foodCapacity,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr } from './card.js';

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
    <h3>Where the hands go</h3>
    <div class="labour-rows">${LABOUR_KINDS.map((k) => kindRow(world, state, k, split)).join('')}</div>
    ${callsHtml(world, state)}
  </div>`;
}
