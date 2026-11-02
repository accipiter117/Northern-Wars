import { readyCount } from './hand.js';
import {
  formatDate, seasonOf, SEASON_NAMES, realmStock, foodNeed, foodYield, foodCapacity, pressureLine, dateOf, MONTHS, ORDERS_A_MONTH, ledgerNet, authority,
} from '../sim/index.js';
import { number } from './format.js';
import { icon } from './icons.js';

// The top bar: the date, the speed buttons and the overflow menu; then
// (M24 A) the realm's goods as symbols and numbers, no words: coin with the
// month's change under it, grain, fuel, iron and cloth; then a slimmer row
// of the meters, each a symbol, a number and a thin bar. Every symbol is a
// button that opens its detail; a long press names it.

// The meters' row, in order: key, name, icon, which way is good, and the
// line past which it shows red.
// M24 B: Love, Fear, Authority (worked out from the two) and Unrest.
export const TOP_METERS = [
  { key: 'love', name: 'Love', icon: 'heart', good: 'up', bad: 25 },
  { key: 'fear', name: 'Fear', icon: 'gallows', good: 'up', bad: 10 },
  { key: 'authority', name: 'Authority', icon: 'sceptre', good: 'up', bad: 35, split: true },
  { key: 'unrest', name: 'Unrest', icon: 'flame', good: 'down', bad: 60 },
];

// Numbers short enough for a phone held upright: 6,678; 29.2k; 104k.
export function compact(n) {
  const v = Math.round(n);
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a < 10000) return sign + number(a);
  if (a < 100000) return `${sign}${(a / 1000).toFixed(1)}k`;
  if (a < 10000000) return `${sign}${Math.round(a / 1000)}k`;
  return `${sign}${(a / 1e6).toFixed(1)}m`;
}

export function createTopbar(world, { onSpeed, onMore, onMeter, onPressure }) {
  const $ = (id) => document.getElementById(id);
  const el = {
    date: $('date'),
    season: $('season'),
    treasury: $('m-treasury'),
    change: $('m-treasury-change'),
    granary: $('m-granary'),
    fuel: $('m-fuel'),
    iron: $('m-iron'),
    cloth: $('m-cloth'),
    pressure: $('pressure'),
  };
  // The meters' row is built from TOP_METERS.
  const row = $('meters');
  row.innerHTML = TOP_METERS.map((m) => `<button type="button" class="meter" data-go="meter:${m.key}" data-name="${m.name}" aria-label="${m.name}">
    <span class="m-ico">${icon(m.icon)}</span><span class="m-val" id="m-${m.key}">0</span><span class="m-bar"><i id="m-${m.key}-bar"></i>${m.split ? `<i id="m-${m.key}-bar2" class="lesser"></i>` : ''}</span></button>`).join('');
  for (const g of document.querySelectorAll('.goods .g-ico')) g.innerHTML = icon(g.dataset.icon);
  el.pressure?.addEventListener('click', () => onPressure?.(board));
  // The kingdom view or the board of the North (M20 D).
  let board = false;
  const speedButtons = [...document.querySelectorAll('[data-speed]')];
  for (const b of speedButtons) b.addEventListener('click', () => onSpeed(Number(b.dataset.speed)));
  // The Crown's hand (M34 B): its sceptre, and how many acts are ready.
  const hand = $('hand-button');
  if (hand) hand.querySelector('.hb-ico').innerHTML = icon('sceptre');
  const more = $('more-button');
  more.innerHTML = icon('more');
  more.addEventListener('click', onMore);

  // A tap opens the detail; a long press names the symbol, and the tap
  // that ends it is swallowed.
  const tip = document.createElement('div');
  tip.className = 'tb-tip';
  tip.hidden = true;
  document.getElementById('topbar').appendChild(tip);
  let held = null;
  let swallow = false;
  let tipTimer = 0;
  const hideTip = () => { tip.hidden = true; };
  for (const b of document.querySelectorAll('#topbar [data-name]')) {
    b.title = b.dataset.name;
    b.addEventListener('pointerdown', () => {
      clearTimeout(held);
      held = setTimeout(() => {
        swallow = true;
        tip.textContent = b.dataset.name;
        const r = b.getBoundingClientRect();
        const bar = document.getElementById('topbar').getBoundingClientRect();
        tip.style.left = `${Math.max(4, Math.min(bar.width - 140, r.left - bar.left + r.width / 2 - 70))}px`;
        tip.style.top = `${r.bottom - bar.top + 4}px`;
        tip.hidden = false;
        clearTimeout(tipTimer);
        tipTimer = setTimeout(hideTip, 1600);
      }, 450);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(held));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      if (swallow) {
        swallow = false;
        e.preventDefault();
        return;
      }
      onMeter(b.dataset.go);
    });
  }

  let last = '';
  let lastPressure = '';
  return {
    update(state, onBoard = board) {
      board = onBoard;
      const stock = realmStock(state);
      const food = stock.food;
      const orders = state.orders?.list.length ?? 0;
      const lastMonth = state.ledger?.history?.at(-1);
      const net = lastMonth ? ledgerNet(lastMonth).net : null;
      const cloth = state.market?.report?.cloth?.balance ?? null;
      // The hands' split too, so a new setting refreshes the pressure strip
      // (and its seasonal prompt) at once (M23 B).
      const split = state.labour ? Object.values(state.labour.split).join(',') : '';
      const valueOf = (key) => (key === 'authority' ? authority(state, world) : state[key] ?? 0);
      const meterKey = TOP_METERS.map((m) => Math.round(valueOf(m.key))).join(',');
      const key = `${state.day}|${state.treasury}|${Math.round(food)}|${meterKey}|${board}|${orders}|${split}|${net}`;
      if (key === last) return;
      last = key;
      // How many of the crown's acts are ready (M34 B).
      const count = $('hand-count');
      if (count) {
        const n = readyCount({ state, world });
        count.hidden = n === 0;
        count.textContent = String(n);
        $('hand-button')?.classList.toggle('has-ready', n > 0);
      }
      const d = dateOf(state.day);
      $('topbar')?.classList.toggle('on-board', board);
      el.pressure?.classList.toggle('on-board', board);
      if (board) {
        el.date.textContent = 'The North';
        el.season.textContent = `${MONTHS[d.month - 1].name} ${d.year}`;
        if (el.pressure) el.pressure.textContent = `${orders} of ${ORDERS_A_MONTH} orders set this month. Tap a realm to give one.`;
        lastPressure = '';
      } else {
        el.date.textContent = formatDate(state.day);
        el.season.textContent = SEASON_NAMES[seasonOf(state.day)];
        // The outlook walks every day to first frost, so it is worked out
        // afresh every ten days, at the turn of the month and when the crown
        // moves its hands or makes a call, not every day.
        const lab = state.labour;
        const when = `${Math.floor(state.day / 10)}|${d.month}|${lab ? `${Object.values(lab.split).join(',')}|${lab.winterTurn}|${Object.keys(lab.calls ?? {}).join(',')}|${JSON.stringify(lab.focus ?? {})}` : ''}`;
        if (el.pressure && when !== lastPressure) {
          lastPressure = when;
          el.pressure.textContent = pressureLine(state, world, { foodYield, foodNeed, foodCapacity });
        }
      }
      // A minus sign rather than a hyphen, and red, so debt is never missed.
      el.treasury.textContent = compact(state.treasury);
      el.treasury.classList.toggle('low', state.treasury < 0);
      // Last month's change under the coin, green or red.
      if (el.change) {
        el.change.textContent = net === null ? '' : `${net >= 0 ? '+' : '−'}${compact(Math.abs(net))}`;
        el.change.classList.toggle('up', net !== null && net >= 0);
        el.change.classList.toggle('down', net !== null && net < 0);
      }
      el.granary.textContent = compact(food);
      // Under a month of food across the realm is worth a red number.
      const season = seasonOf(state.day);
      const need = Object.values(state.settlements).reduce((a, st) => a + foodNeed(world, st, season), 0);
      el.granary.classList.toggle('low', food < need * 30);
      if (el.fuel) {
        el.fuel.textContent = compact(state.labour?.fuel ?? 0);
        el.fuel.classList.toggle('low', (state.labour?.short ?? 0) > 0.05);
      }
      if (el.iron) el.iron.textContent = compact(stock.iron);
      // Cloth is not kept in store: the month's balance, made less used.
      if (el.cloth) {
        el.cloth.textContent = cloth === null ? '0' : `${cloth > 0 ? '+' : ''}${compact(cloth)}`;
        el.cloth.classList.toggle('low', cloth !== null && cloth < 0);
      }
      for (const m of TOP_METERS) {
        const v = Math.round(valueOf(m.key));
        const val = $(`m-${m.key}`);
        if (!val) continue;
        val.textContent = v;
        const bad = m.good === 'up' ? v < m.bad : v > m.bad;
        val.classList.toggle('low', bad);
        const bar = $(`m-${m.key}-bar`);
        if (bar) {
          // Authority's bar is split: the part from the greater of Love and
          // Fear, then the quarter of the lesser, each in its own colour.
          if (m.split) {
            const loveLeads = (state.love ?? 0) >= (state.fear ?? 0);
            const major = Math.min(100, Math.max(state.love ?? 0, state.fear ?? 0));
            const minor = Math.max(0, Math.min(100 - major, v - major));
            bar.style.width = `${major}%`;
            bar.className = loveLeads ? 'love' : 'fear';
            const bar2 = $(`m-${m.key}-bar2`);
            if (bar2) {
              bar2.style.width = `${minor}%`;
              bar2.className = `lesser ${loveLeads ? 'fear' : 'love'}`;
            }
          } else {
            bar.style.width = `${Math.max(0, Math.min(100, v))}%`;
            bar.classList.toggle('bad', bad);
          }
        }
      }
    },
    setSpeed(speed) {
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
    },
  };
}
