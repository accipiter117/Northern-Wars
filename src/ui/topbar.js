import {
  formatDate, seasonOf, SEASON_NAMES, realmStock, foodNeed, foodYield, foodCapacity, pressureLine, dateOf, MONTHS, ORDERS_A_MONTH,
} from '../sim/index.js';
import { number } from './format.js';
import { icon } from './icons.js';

// The top bar: the date, the speed buttons, the overflow menu button and the
// four meters. Each meter is a button that opens why it changed.
export function createTopbar(world, { onSpeed, onMore, onMeter, onPressure }) {
  const el = {
    date: document.getElementById('date'),
    season: document.getElementById('season'),
    treasury: document.getElementById('m-treasury'),
    granary: document.getElementById('m-granary'),
    authority: document.getElementById('m-authority'),
    stability: document.getElementById('m-stability'),
    pressure: document.getElementById('pressure'),
  };
  el.pressure?.addEventListener('click', () => onPressure?.(board));
  // The kingdom view or the board of the North (M20 D).
  let board = false;
  const speedButtons = [...document.querySelectorAll('[data-speed]')];
  for (const b of speedButtons) b.addEventListener('click', () => onSpeed(Number(b.dataset.speed)));
  const more = document.getElementById('more-button');
  more.innerHTML = icon('more');
  more.addEventListener('click', onMore);
  for (const m of document.querySelectorAll('.meter')) {
    const name = m.querySelector('.m-name');
    name.insertAdjacentHTML('afterbegin', icon(name.dataset.icon));
    m.addEventListener('click', () => onMeter(m.dataset.go));
  }

  let last = '';
  return {
    update(state, onBoard = board) {
      board = onBoard;
      const food = realmStock(state).food;
      const orders = state.orders?.list.length ?? 0;
      const key = `${state.day}|${state.treasury}|${Math.round(food)}|${Math.round(state.authority)}|${Math.round(state.stability)}|${board}|${orders}`;
      if (key === last) return;
      last = key;
      const d = dateOf(state.day);
      document.getElementById('topbar')?.classList.toggle('on-board', board);
      if (board) {
        el.date.textContent = 'The North';
        el.season.textContent = `${MONTHS[d.month - 1].name} ${d.year}`;
        if (el.pressure) el.pressure.textContent = `${orders} of ${ORDERS_A_MONTH} orders set this month. Tap a realm to give one.`;
      } else {
        el.date.textContent = formatDate(state.day);
        el.season.textContent = SEASON_NAMES[seasonOf(state.day)];
        if (el.pressure) el.pressure.textContent = pressureLine(state, world, { foodYield, foodNeed, foodCapacity });
      }
      // A minus sign rather than a hyphen, and red, so debt is never missed.
      el.treasury.textContent = state.treasury < 0 ? `\u2212${number(-state.treasury)}` : number(state.treasury);
      el.granary.textContent = number(food);
      el.treasury.classList.toggle('low', state.treasury < 0);
      el.authority.textContent = Math.round(state.authority);
      el.stability.textContent = Math.round(state.stability);
      // Under a month of food across the realm is worth a red number.
      const season = seasonOf(state.day);
      const need = Object.values(state.settlements).reduce((a, st) => a + foodNeed(world, st, season), 0);
      el.granary.classList.toggle('low', food < need * 30);
      el.stability.classList.toggle('low', state.stability < 40);
      el.authority.classList.toggle('low', state.authority < 25);
    },
    setSpeed(speed) {
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
    },
  };
}
