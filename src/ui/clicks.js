// One set of listeners for everything inside the panel. Screens describe
// what a control does with data attributes, and this turns a tap into it:
//   data-go="route"          open a card on top of the current screen
//   data-tab-go="tab:sub"    jump to a tab and one of its sub-tabs
//   data-sub / data-tsub     switch a tab's or a town card's sub-tab
//   data-order='{...}'       an order through the rules (data-undo offers
//                            Undo after it; data-confirm asks first, for what
//                            cannot be undone; data-then says where to go)
//   data-expand="key"        open or fold a row in place
//   data-form + data-set     set a remembered form field ("key:value")
//   data-form + data-field   a typed field, kept as it is typed
//   data-slide="kind"        a labour slider: the hands move when let go
//   data-pick-start='{...}'  start picking a target on the map
//   data-info                show or hide a card's longer text
import { setOpen, form, isOpen } from './memory.js';
import { ask } from './dialog.js';

const parse = (v) => (v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

export function attachPanelInput(app) {
  const body = document.getElementById('sheet-body');
  const { memory, nav } = app;
  const route = () => nav.current ?? '';
  const tabOf = (r) => (r.startsWith('tab:') ? r.slice(4) : null);

  body.addEventListener('click', (e) => {
    const t = e.target;
    const btn = t.closest('button');
    if (btn?.disabled) return;
    const at = (sel) => t.closest(sel);

    const infoBtn = at('[data-info]');
    if (infoBtn) {
      const text = infoBtn.nextElementSibling;
      if (text) {
        text.hidden = !text.hidden;
        infoBtn.setAttribute('aria-expanded', String(!text.hidden));
      }
      return;
    }
    const pick = at('[data-pick-start]');
    if (pick) return app.startPick(JSON.parse(pick.dataset.pickStart));
    const send = at('[data-send]');
    if (send) return app.sendNearest(Number(send.dataset.send));
    if (at('[data-regency]')) return app.regency();
    if (at('[data-new-reign]')) return app.newReign();

    // An audience with a ruler, from a portrait, a realm card or a request.
    const aud = at('[data-audience]');
    if (aud) {
      const deal = aud.dataset.audienceDeal;
      return app.audience(aud.dataset.audience, deal ? { panel: 'trade', items: JSON.parse(deal) } : {});
    }
    const ord = at('[data-order]');
    if (ord) {
      const action = JSON.parse(ord.dataset.order);
      const go = () => {
        const ok = ord.dataset.undo ? app.orderWithUndo(action, ord.dataset.undo) : app.order(action);
        if (ok) after(action, ord.dataset.then);
      };
      // What cannot be taken back asks first, in the game's own dialog.
      if (ord.dataset.confirm) {
        ask(ord.dataset.confirm, { yes: ord.querySelector('.act-label, .build-name')?.textContent.trim() || 'Yes' }).then((yes) => { if (yes) go(); });
      } else go();
      return;
    }
    const exp = at('[data-expand]');
    if (exp) {
      const r = route();
      setOpen(memory, r, exp.dataset.expand, !isOpen(memory, r, exp.dataset.expand));
      nav.refresh();
      app.persist();
      return;
    }
    const sub = at('[data-sub]');
    if (sub) {
      const tab = tabOf(route());
      if (tab) nav.change(() => { memory.sub[tab] = sub.dataset.sub; });
      app.noteSub?.();
      return;
    }
    const tsub = at('[data-tsub]');
    if (tsub) {
      nav.change(() => { memory.sub.town = tsub.dataset.tsub; });
      if (tsub.hasAttribute('data-recruit-here')) document.getElementById('recruit')?.scrollIntoView({ block: 'start' });
      return;
    }
    const filter = at('[data-set-filter]');
    if (filter) {
      const f = form(memory, 'places');
      f.filter = filter.dataset.setFilter;
      nav.refresh();
      app.persist();
      return;
    }
    const set = at('[data-set]');
    const holder = set?.closest('[data-form]');
    if (set && holder) {
      const [k, ...rest] = set.dataset.set.split(':');
      form(memory, holder.dataset.form)[k] = parse(rest.join(':'));
      nav.refresh();
      app.persist();
      return;
    }
    // A company chosen to march apart when an army divides (M23 C).
    const sb = at('[data-split-band]');
    const sHolder = sb?.closest('[data-form]');
    if (sb && sHolder) {
      const f = form(memory, sHolder.dataset.form);
      const i = Number(sb.dataset.splitBand);
      f.bands = (f.bands ?? []).includes(i) ? f.bands.filter((x) => x !== i) : [...(f.bands ?? []), i];
      nav.refresh();
      app.persist();
      return;
    }
    // A mercenary company for the army being raised (M21).
    const merc = at('[data-merc]');
    if (merc) {
      const f = form(memory, 'raise');
      const id = merc.dataset.merc;
      f.mercs = (f.mercs ?? []).includes(id) ? f.mercs.filter((x) => x !== id) : [...(f.mercs ?? []), id];
      nav.refresh();
      app.persist();
      return;
    }
    const unit = at('[data-unit]');
    if (unit) {
      const f = form(memory, 'raise');
      const id = Number(unit.dataset.unit);
      f.units = (f.units ?? []).includes(id) ? f.units.filter((x) => x !== id) : [...(f.units ?? []), id];
      nav.refresh();
      app.persist();
      return;
    }
    const chron = at('[data-chronicle]');
    if (chron) {
      form(memory, 'chronicle', { filter: 'all' }).filter = chron.dataset.chronicle;
      nav.refresh();
      return;
    }
    const tabGo = at('[data-tab-go]');
    if (tabGo) return app.goTab(tabGo.dataset.tabGo);
    const go = at('[data-go]');
    if (go) return nav.push(go.dataset.go);
    const action = at('[data-action]');
    if (action) app.menuAction(action.dataset.action);
  });

  // What follows a successful order: some lead somewhere.
  function after(action, then) {
    if (action.type === 'raise') {
      form(memory, 'raise').units = [];
      app.armyRaised();
    }
    if (action.type === 'house' && (action.kind === 'grant' || action.kind === 'strip')) {
      form(memory, `house:${action.house}`).picking = null;
      nav.refresh();
    }
    if (!then) return;
    if (then === 'back') nav.back();
    else if (then.startsWith('tab:')) app.goTab(then.slice(4));
    else nav.push(then);
  }

  // A labour slider (M23 B): its number follows the thumb as it moves, and
  // the hands move when it is let go; the others give way in proportion.
  body.addEventListener('change', (e) => {
    const slide = e.target.closest('input[data-slide]');
    if (!slide) return;
    const kind = slide.dataset.slide;
    const step = Number(slide.value) - (app.state.labour?.split?.[kind] ?? 0);
    if (step) app.order({ type: 'labourShift', kind, step });
  });

  body.addEventListener('input', (e) => {
    const slide = e.target.closest('input[data-slide]');
    if (slide) {
      const out = slide.closest('.slide-row')?.querySelector('output');
      if (out) out.textContent = slide.value;
      return;
    }
    const field = e.target.closest('[data-field]');
    const holder = field?.closest('[data-form]');
    if (!field || !holder) return;
    form(memory, holder.dataset.form)[field.dataset.field] = field.value;
    nav.refresh();
    app.persist();
  });

  // Sections remember being opened or folded. The toggle event does not
  // bubble, so it is caught on the way down.
  body.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.sec) return;
    setOpen(memory, route(), d.dataset.sec, d.open);
    app.persist();
  }, true);

  body.addEventListener('scroll', () => app.scrolled(), { passive: true });

  // A long press on a row that leads somewhere shows a quick look at it,
  // without leaving the list. The click that would follow is swallowed.
  let held = null;
  let swallow = false;
  const letGo = () => {
    if (held) clearTimeout(held.timer);
    held = null;
  };
  body.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('[data-go]');
    if (!row || e.button > 0) return;
    const at = { x: e.clientX, y: e.clientY };
    letGo();
    held = { at, timer: setTimeout(() => {
      held = null;
      swallow = true;
      preview(row.dataset.go, at);
    }, 450) };
  });
  body.addEventListener('pointermove', (e) => {
    if (held && Math.hypot(e.clientX - held.at.x, e.clientY - held.at.y) > 10) letGo();
  });
  body.addEventListener('pointerup', letGo);
  body.addEventListener('pointercancel', letGo);
  body.addEventListener('click', (e) => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function preview(route, at) {
    const out = app.preview(route);
    const tpl = document.createElement('template');
    tpl.innerHTML = out.html;
    const head = tpl.content.querySelector('[data-part="head"]') ?? tpl.content.querySelector('[data-part]');
    // Buttons inside a quick look would act from the wrong place: keep the words.
    head?.querySelectorAll('.actions, .info-btn').forEach((el) => el.remove());
    app.peek(at.x, at.y, out.title, head ? head.innerHTML : '');
  }
}
