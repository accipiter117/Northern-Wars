import { formatDate, seasonOf, SEASON_NAMES, realmStock, foodNeed } from '../sim/index.js';
import { number } from './format.js';

export function createTopbar(world, { onSpeed, onMenu }) {
  const el = {
    date: document.getElementById('date'),
    season: document.getElementById('season'),
    treasury: document.getElementById('m-treasury'),
    granary: document.getElementById('m-granary'),
    authority: document.getElementById('m-authority'),
    stability: document.getElementById('m-stability'),
  };
  const speedButtons = [...document.querySelectorAll('[data-speed]')];
  for (const b of speedButtons) b.addEventListener('click', () => onSpeed(Number(b.dataset.speed)));
  document.getElementById('menu-button').addEventListener('click', onMenu);

  let last = '';
  return {
    update(state) {
      const food = realmStock(state).food;
      const key = `${state.day}|${state.treasury}|${Math.round(food)}|${Math.round(state.authority)}|${Math.round(state.stability)}`;
      if (key === last) return;
      last = key;
      el.date.textContent = formatDate(state.day);
      el.season.textContent = SEASON_NAMES[seasonOf(state.day)];
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
