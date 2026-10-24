// One sheet element serves every panel: settlement cards, the realm menu and
// the chronicle. Only one is open at a time.
export function createSheet({ onClose }) {
  const sheet = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  let current = null;
  document.getElementById('sheet-close').addEventListener('click', () => close());

  function open(kind, html) {
    const same = current === kind;
    current = kind;
    body.innerHTML = html;
    sheet.hidden = false;
    if (!same) sheet.scrollTop = 0;
    return body;
  }

  function close() {
    if (!current) return;
    current = null;
    sheet.hidden = true;
    body.innerHTML = '';
    onClose?.();
  }

  return { open, close, get current() { return current; }, body };
}
