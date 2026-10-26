// The panel every screen opens in. In portrait it is a bottom sheet with
// three snap heights (peek shows only its title bar; half; full) that can be
// dragged by its title bar; a tap on the map lowers it to peek rather than
// closing it, and a swipe down from peek closes it. In landscape it is a side
// panel that stays open while the map is used.
//
// At rest the sheet is exactly as tall as it shows, so everything in it can
// be scrolled into view. While a finger drags it, it is made full height once
// and then moved by transform alone, so dragging costs the phone no layout.
const SNAPS = ['peek', 'half', 'full'];

export function createPanel({ onBack, onClose, onSnap }) {
  const el = document.getElementById('sheet');
  const head = document.getElementById('sheet-head');
  const body = document.getElementById('sheet-body');
  const title = document.getElementById('sheet-title');
  const backBtn = document.getElementById('sheet-back');
  let route = null;
  let lastHtml = '';
  let snap = 'half';
  let lastRaised = 'half';
  let open = false;

  const side = () => window.matchMedia('(orientation: landscape) and (min-width: 600px)').matches;
  const avail = () => {
    const top = document.getElementById('topbar').offsetHeight;
    const tabs = side() ? 0 : document.getElementById('tabbar').offsetHeight;
    return Math.max(120, window.innerHeight - top - tabs);
  };
  const headH = () => head.offsetHeight || 58;
  const heightOf = (s) => (s === 'peek' ? headH() : s === 'half' ? Math.round(avail() * 0.55) : avail());

  function place() {
    el.dataset.snap = side() ? 'side' : snap;
    if (side()) {
      el.style.transform = '';
      el.style.height = '';
      return;
    }
    el.style.transform = '';
    el.style.height = `${heightOf(snap)}px`;
  }

  function setSnap(s, { remember = true } = {}) {
    if (!SNAPS.includes(s)) return;
    snap = s;
    if (s !== 'peek' && remember) lastRaised = s;
    place();
    onSnap?.(s);
  }

  // Drag the sheet by its title bar; let go and it settles on the nearest
  // snap. A short tap on the bar of a lowered sheet raises it again.
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (side() || e.target.closest('button')) return;
    const a = avail();
    drag = { y: e.clientY, start: a - heightOf(snap), moved: false, a };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) <= 6) return;
    if (!drag.moved) {
      drag.moved = true;
      el.classList.add('dragging');
      el.style.height = `${drag.a}px`;
    }
    const y = Math.min(drag.a - headH() + 60, Math.max(0, drag.start + dy));
    el.style.transform = `translateY(${y}px)`;
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      if (snap === 'peek') setSnap(lastRaised === 'peek' ? 'half' : lastRaised);
      return;
    }
    const y = Math.min(d.a, Math.max(0, d.start + (e.clientY - d.y)));
    // Hand over from the transform to a real height where the finger let go,
    // then let it ease to the nearest snap.
    el.style.transform = '';
    el.style.height = `${Math.max(headH(), d.a - y)}px`;
    void el.offsetHeight;
    el.classList.remove('dragging');
    // Pulled down past the peek height: close.
    if (y > d.a - headH() + 40) {
      place();
      close();
      return;
    }
    const shown = d.a - y;
    const best = SNAPS.map((s) => [s, Math.abs(heightOf(s) - shown)]).sort((p, q) => p[1] - q[1])[0][0];
    setSnap(best);
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  backBtn.addEventListener('click', () => onBack?.());
  document.getElementById('sheet-close').addEventListener('click', () => close());
  window.addEventListener('resize', () => { if (open) place(); });

  function show(r, heading, html, { back = false, keepScroll = null } = {}) {
    const same = r === route;
    route = r;
    lastHtml = html;
    title.innerHTML = heading;
    backBtn.hidden = !back;
    body.innerHTML = html;
    if (!open) {
      open = true;
      el.hidden = false;
      if (snap === 'peek') snap = lastRaised;
      place();
    }
    if (keepScroll !== null) body.scrollTop = keepScroll;
    else if (!same) body.scrollTop = 0;
    return body;
  }

  // Replace only the [data-part] blocks whose markup changed, so a finger
  // halfway through a press is not lost. A block holding the field the
  // player is typing in, or a select they have open, is left alone.
  function patch(heading, html) {
    if (title.innerHTML !== heading) title.innerHTML = heading;
    if (html === lastHtml) return body;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const fresh = [...tpl.content.querySelectorAll(':scope > [data-part]')];
    const old = [...body.querySelectorAll(':scope > [data-part]')];
    const focus = document.activeElement;
    const typing = focus && body.contains(focus) && /^(INPUT|SELECT|TEXTAREA)$/.test(focus.tagName);
    if (!fresh.length || fresh.length !== old.length || fresh.some((p, i) => p.dataset.part !== old[i].dataset.part)) {
      const top = body.scrollTop;
      body.innerHTML = html;
      body.scrollTop = top;
    } else {
      fresh.forEach((part, i) => {
        if (typing && old[i].contains(focus)) return;
        if (part.innerHTML !== old[i].innerHTML) old[i].replaceWith(part);
      });
    }
    lastHtml = html;
    return body;
  }

  function close() {
    if (!open) return;
    open = false;
    el.hidden = true;
    onClose?.(route);
  }

  return {
    show, patch, close, setSnap, place,
    get route() { return route; },
    get open() { return open; },
    get snap() { return snap; },
    get raised() { return lastRaised; },
    get side() { return side(); },
    get scroll() { return body.scrollTop; },
    body,
    restoreSnap(s) {
      snap = SNAPS.includes(s) ? s : 'half';
      if (snap !== 'peek') lastRaised = snap;
    },
  };
}
