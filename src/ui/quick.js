// Long-press answers: a ring of quick actions round the finger, and a small
// card ("peek") that says what something is without leaving where you are.
// Both close on the next touch anywhere else.
import { escapeHtml } from './format.js';
import { icon } from './icons.js';

export function createQuick({ haptic }) {
  const ring = document.getElementById('quick-ring');
  const peekEl = document.getElementById('peek');
  const pressRing = document.getElementById('press-ring');
  let actions = [];

  // The filling ring under a held finger, in page coordinates.
  function pressing(at) {
    if (!at) {
      pressRing.hidden = true;
      return;
    }
    pressRing.style.left = `${at.x}px`;
    pressRing.style.top = `${at.y}px`;
    pressRing.style.setProperty('--press-ms', `${at.ms}ms`);
    pressRing.hidden = false;
    // Restart the fill animation for this press.
    pressRing.classList.remove('filling');
    void pressRing.offsetWidth;
    pressRing.classList.add('filling');
  }

  function close() {
    ring.hidden = true;
    ring.innerHTML = '';
    peekEl.hidden = true;
    peekEl.innerHTML = '';
    actions = [];
  }

  // Up to six round buttons on a circle about (x, y) in stage coordinates,
  // kept inside the stage.
  function show(x, y, title, list) {
    close();
    haptic?.('press');
    actions = list;
    const stage = ring.parentElement.getBoundingClientRect();
    const r = 76;
    const cx = Math.min(stage.width - r - 30, Math.max(r + 30, x));
    const cy = Math.min(stage.height - r - 34, Math.max(r + 40, y));
    const n = list.length;
    const buttons = list.map((a, i) => {
      // Spread from the top round the circle.
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / n;
      const bx = cx + Math.cos(angle) * r;
      const by = cy + Math.sin(angle) * r;
      return `<button type="button" class="quick-btn" data-quick="${i}" style="left:${bx}px;top:${by}px">${icon(a.icon ?? 'target')}<span>${escapeHtml(a.label)}</span></button>`;
    }).join('');
    ring.innerHTML = `<div class="quick-centre" style="left:${cx}px;top:${cy}px">${escapeHtml(title)}</div>${buttons}`;
    ring.hidden = false;
  }

  // A small card of what is known, near (x, y) in page coordinates, with
  // optional buttons underneath.
  function peek(x, y, title, html, list = []) {
    close();
    haptic?.('press');
    actions = list;
    peekEl.innerHTML = `<p class="peek-title">${title}</p>${html}${list.length ? `<div class="actions">${list.map((a, i) => `<button type="button" class="act" data-quick="${i}"><span class="act-label">${escapeHtml(a.label)}</span></button>`).join('')}</div>` : ''}`;
    peekEl.hidden = false;
    const w = peekEl.offsetWidth;
    const h = peekEl.offsetHeight;
    peekEl.style.left = `${Math.min(innerWidth - w - 10, Math.max(10, x - w / 2))}px`;
    peekEl.style.top = `${Math.min(innerHeight - h - 10, Math.max(10, y - h - 24))}px`;
  }

  function onClick(e) {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const a = actions[Number(b.dataset.quick)];
    close();
    haptic?.('confirm');
    a?.run();
  }
  ring.addEventListener('click', onClick);
  peekEl.addEventListener('click', onClick);
  // Any touch elsewhere closes them (and is not otherwise swallowed).
  document.addEventListener('pointerdown', (e) => {
    if ((ring.hidden && peekEl.hidden) || e.target.closest('#quick-ring .quick-btn, #peek')) return;
    close();
  }, true);

  return {
    show, peek, close, pressing,
    get open() { return !ring.hidden || !peekEl.hidden; },
  };
}
