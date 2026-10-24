// One sheet element serves every panel: settlement cards, the realm menu and
// the chronicle. Only one is open at a time.
export function createSheet({ onClose }) {
  const sheet = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  let current = null;
  let lastHtml = '';
  document.getElementById('sheet-close').addEventListener('click', () => close());

  function open(kind, html) {
    const same = current === kind;
    current = kind;
    lastHtml = html;
    body.innerHTML = html;
    sheet.hidden = false;
    if (!same) sheet.scrollTop = 0;
    return body;
  }

  // Replace only the [data-part] blocks whose markup changed.
  function patch(kind, html) {
    if (current !== kind) return open(kind, html);
    if (html === lastHtml) return body;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const fresh = [...tpl.content.querySelectorAll(':scope > [data-part]')];
    const old = [...body.querySelectorAll(':scope > [data-part]')];
    if (!fresh.length || fresh.length !== old.length) return open(kind, html);
    lastHtml = html;
    fresh.forEach((part, i) => {
      if (part.innerHTML !== old[i].innerHTML) old[i].replaceWith(part);
    });
    return body;
  }

  function close() {
    if (!current) return;
    current = null;
    sheet.hidden = true;
    body.innerHTML = '';
    onClose?.();
  }

  return { open, patch, close, get current() { return current; }, body };
}
