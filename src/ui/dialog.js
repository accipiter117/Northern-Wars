// The game's own dialog (M23 A), in place of the browser's confirm, alert and
// prompt: those look foreign, freeze the page and cannot be styled or tested
// well on a phone. Kept only for what cannot be taken back (standing a
// company or an army down, accepting terms of peace, abandoning a reign);
// anything else happens at once with an Undo in its notice instead.
//
//   ask(text, { yes, no, danger }) -> Promise<boolean>
//   tell(text, { ok })             -> Promise<void>   (one button)
//
// One dialog at a time: asking again while one is open answers the first
// with false.

let open = null;

function els() {
  return {
    veil: document.getElementById('dialog'),
    text: document.getElementById('dialog-text'),
    yes: document.getElementById('dialog-yes'),
    no: document.getElementById('dialog-no'),
  };
}

function close(answer) {
  if (!open) return;
  const { resolve, before } = open;
  open = null;
  const { veil } = els();
  veil.hidden = true;
  document.removeEventListener('keydown', onKey, true);
  if (before && document.contains(before)) before.focus?.({ preventScroll: true });
  resolve(answer);
}

// While the dialog is up it owns the keyboard: Escape answers it without
// also closing the panel behind, and no game shortcut fires underneath.
function onKey(e) {
  if (!open) return;
  if (e.key === 'Tab') return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    close(false);
  }
}

export function isAsking() {
  return !!open;
}

export function ask(text, { yes = 'Yes', no = 'Cancel', danger = true } = {}) {
  close(false);
  const d = els();
  d.text.textContent = text;
  d.yes.querySelector('.act-label').textContent = yes;
  d.yes.classList.toggle('danger', danger);
  d.no.hidden = !no;
  if (no) d.no.querySelector('.act-label').textContent = no;
  d.veil.hidden = false;
  document.addEventListener('keydown', onKey, true);
  return new Promise((resolve) => {
    open = { resolve, before: document.activeElement };
    // The safe choice takes the focus, so a stray Enter never confirms.
    (no ? d.no : d.yes).focus({ preventScroll: true });
  });
}

export async function tell(text, { ok = 'Very well' } = {}) {
  await ask(text, { yes: ok, no: '', danger: false });
}

// Wired once: the two buttons, and a tap on the veil (outside the box)
// counts as Cancel.
export function attachDialog() {
  const d = els();
  d.yes.addEventListener('click', () => close(true));
  d.no.addEventListener('click', () => close(false));
  d.veil.addEventListener('click', (e) => { if (e.target === d.veil) close(false); });
}
