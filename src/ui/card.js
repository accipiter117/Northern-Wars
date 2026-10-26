// One layout for every card: a one-line status, key figures as compact chips,
// the main actions as buttons, then collapsible sections. Long descriptive
// text sits behind an info button. Every block is a [data-part] so a daily
// refresh replaces only what changed.
import { escapeHtml } from './format.js';
import { icon } from './icons.js';
import { isOpen } from './memory.js';

// A figure chip: an icon, a short label and a value, toned good or bad.
export function chip({ icon: ic, label, value, tone = '', go = null }) {
  const inner = `${ic ? icon(ic) : ''}<span class="fig-label">${escapeHtml(label)}</span><b>${value}</b>`;
  return go
    ? `<button type="button" class="fig${tone ? ` ${tone}` : ''}" data-go="${go}">${inner}</button>`
    : `<span class="fig${tone ? ` ${tone}` : ''}">${inner}</span>`;
}

export function chips(list) {
  return `<div class="figs">${list.filter(Boolean).map(chip).join('')}</div>`;
}

// Long text behind a small (i) button.
export function info(text, key = 'info') {
  if (!text) return '';
  return `<button type="button" class="info-btn" data-info="${key}" aria-label="More about this" aria-expanded="false">${icon('info')}</button><span class="info-text" data-info-text="${key}" hidden>${escapeHtml(text)}</span>`;
}

// The head of a card: status, chips and main actions.
export function cardHead({ status = '', chips: figs = [], actions = '', infoText = '', extra = '' }) {
  return `<div data-part="head" class="card-head">
    ${status || infoText ? `<div class="status">${status}${info(infoText)}</div>` : ''}
    ${figs.length ? chips(figs) : ''}
    ${extra}
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

// A collapsible section, remembered open or shut per screen.
export function section(memory, route, id, title, html, { open = false, count = null } = {}) {
  if (!html) return `<div data-part="sec-${id}"></div>`;
  const on = isOpen(memory, route, id, open);
  return `<div data-part="sec-${id}"><details class="sec" data-sec="${id}"${on ? ' open' : ''}>
    <summary>${escapeHtml(title)}${count !== null ? ` <span class="count">${count}</span>` : ''}</summary>
    <div class="sec-body">${html}</div></details></div>`;
}

// Segmented sub-tabs at the top of a tab screen or card.
export function segs(list, current, attr = 'data-sub') {
  return `<div data-part="segs" class="segs" role="tablist">${list.map(([id, label, badge]) =>
    `<button type="button" role="tab" class="seg${id === current ? ' on' : ''}" ${attr}="${id}" aria-selected="${id === current}">${escapeHtml(label)}${badge ? ` <span class="seg-badge">${badge}</span>` : ''}</button>`).join('')}</div>`;
}

export function button(label, attrs, { cls = 'act', disabled = false, sub = '' } = {}) {
  return `<button type="button" class="${cls}" ${attrs}${disabled ? ' disabled' : ''}><span class="act-label">${label}</span>${sub ? `<span class="act-sub">${sub}</span>` : ''}</button>`;
}

// An action carried as JSON in the button, applied through the rules.
export function orderAttr(action, confirmText = '') {
  return `data-order='${escapeHtml(JSON.stringify(action))}'${confirmText ? ` data-confirm="${escapeHtml(confirmText)}"` : ''}`;
}
