// Where the player is. Each bottom tab keeps its own stack of screens, and a
// card opened from the map or the overflow menu while the panel is closed
// starts a stack of its own. Opening a card from a list pushes it; the back
// arrow, the browser's back button and the Android back gesture pop it, and
// return to exactly where the player was. Closing the panel forgets nothing:
// tapping the tab again brings back the same screen, scrolled the same way.
import { TABS, scrollKey } from './memory.js';
import { icon } from './icons.js';

const TAB_INFO = {
  realm: { label: 'Realm', icon: 'realm' },
  court: { label: 'Court', icon: 'crown' },
  treasury: { label: 'Treasury', icon: 'coin' },
  military: { label: 'Military', icon: 'sword' },
  diplomacy: { label: 'Diplomacy', icon: 'dove' },
};

export function tabBarHtml() {
  return TABS.map((t) => `<button type="button" class="tab" data-tab="${t}" aria-label="${TAB_INFO[t].label}">
    ${icon(TAB_INFO[t].icon)}<span class="tab-label">${TAB_INFO[t].label}</span><span class="tab-badge" hidden></span></button>`).join('');
}

export function createNav({ memory, panel, render, onShow, persist, onTab }) {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = tabBarHtml();
  let pushed = 0;
  let ignorePop = 0;

  const stack = () => memory.stacks[memory.active];
  const current = () => stack()?.at(-1) ?? null;

  const keyOf = (r) => scrollKey(memory, r);
  // Called before anything changes what the panel shows, so the scroll is
  // filed under the screen (and sub-tab) it belongs to.
  function rememberScroll() {
    if (panel.open && panel.route && shownKey) memory.scroll[shownKey] = panel.scroll;
  }
  let shownKey = null;

  function show() {
    const r = current();
    if (!r) return close();
    const out = render(r);
    shownKey = keyOf(r);
    panel.show(r, out.title, out.html, { back: stack().length > 1, keepScroll: memory.scroll[shownKey] ?? 0 });
    onShow?.(r, out);
    updateTabs();
    persist();
  }

  function addHistory() {
    try {
      history.pushState({ nw: ++pushed }, '');
    } catch { /* history can be unavailable in odd frames */ }
  }

  function tab(t) {
    rememberScroll();
    const wasOpen = memory.open;
    if (wasOpen && memory.active === t && stack().length > 1) memory.stacks[t] = [stack()[0]];
    onTab?.(t, wasOpen && memory.active === t);
    memory.active = t;
    memory.open = true;
    if (!wasOpen) addHistory();
    show();
  }

  // Open a card: on top of whatever is open, or on its own if nothing is.
  function push(route) {
    rememberScroll();
    if (!memory.open) {
      memory.active = 'map';
      memory.stacks.map = [route];
      memory.open = true;
      addHistory();
    } else if (current() !== route) {
      stack().push(route);
      if (stack().length > 16) stack().splice(0, stack().length - 16);
      addHistory();
    }
    show();
  }

  // Swap the top screen for another without adding a step (a card that
  // leads straight into another view of the same thing).
  function replace(route) {
    rememberScroll();
    stack()[stack().length - 1] = route;
    show();
  }

  function popOne() {
    rememberScroll();
    if (stack().length > 1) {
      stack().pop();
      show();
    } else close({ fromHistory: true });
  }

  function back() {
    if (pushed > 0) history.back();
    else popOne();
  }

  window.addEventListener('popstate', () => {
    if (ignorePop > 0) {
      ignorePop--;
      return;
    }
    if (pushed > 0) pushed--;
    if (memory.open) popOne();
  });

  function close({ fromHistory = false } = {}) {
    rememberScroll();
    memory.open = false;
    panel.close();
    if (!fromHistory && pushed > 0) {
      ignorePop++;
      const n = pushed;
      pushed = 0;
      try { history.go(-n); } catch { /* fine */ }
    }
    updateTabs();
    persist();
  }

  // Follow the realm on the open screen. Not while the sheet is lowered to
  // its title bar or held by a finger: nobody can read it then.
  function refresh() {
    if (!memory.open || !panel.open || panel.dragging || panel.snap === 'peek') return;
    const r = current();
    if (!r) return;
    const out = render(r);
    panel.patch(out.title, out.html);
  }

  // Re-draw the screen in full (a sub-tab changed, say), keeping its scroll
  // unless asked to start at the top.
  function redraw(top = false) {
    const r = current();
    if (!r) return;
    const out = render(r);
    shownKey = keyOf(r);
    if (top) memory.scroll[shownKey] = 0;
    panel.show(r, out.title, out.html, { back: stack().length > 1, keepScroll: memory.scroll[shownKey] ?? 0 });
    onShow?.(r, out);
    persist();
  }

  // Change what the current screen shows (a sub-tab, say) and draw it again,
  // filing the old scroll first.
  function change(fn) {
    rememberScroll();
    fn();
    redraw();
  }

  function updateTabs() {
    for (const b of bar.querySelectorAll('[data-tab]')) {
      const on = memory.open && memory.active === b.dataset.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  // Touch the page only when a count changes: a needless write makes the
  // browser restyle the page inside the next frame.
  const shownBadges = {};
  function setBadges(counts) {
    for (const b of bar.querySelectorAll('[data-tab]')) {
      const n = counts[b.dataset.tab] ?? 0;
      if (shownBadges[b.dataset.tab] === n) continue;
      shownBadges[b.dataset.tab] = n;
      const badge = b.querySelector('.tab-badge');
      badge.hidden = !n;
      badge.textContent = n > 9 ? '9+' : String(n);
    }
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) tab(b.dataset.tab);
  });

  return {
    tab, push, replace, back, close, refresh, redraw, change, setBadges, updateTabs, rememberScroll,
    get current() { return current(); },
    get depth() { return stack()?.length ?? 0; },
    get open() { return memory.open; },
    reopen() {
      if (memory.open && current()) {
        addHistory();
        show();
      }
    },
  };
}
