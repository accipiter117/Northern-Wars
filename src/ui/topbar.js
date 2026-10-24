import { formatDate, seasonOf, SEASON_NAMES } from '../sim/index.js';
import { number } from './format.js';

export function createTopbar({ onSpeed, onMenu }) {
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
      const key = `${state.day}|${state.treasury}|${state.granary}|${Math.round(state.authority)}|${Math.round(state.stability)}`;
      if (key === last) return;
      last = key;
      el.date.textContent = formatDate(state.day);
      el.season.textContent = SEASON_NAMES[seasonOf(state.day)];
      el.treasury.textContent = number(state.treasury);
      el.granary.textContent = number(state.granary);
      el.authority.textContent = Math.round(state.authority);
      el.stability.textContent = Math.round(state.stability);
      el.granary.classList.toggle('low', state.granary < 1000);
      el.stability.classList.toggle('low', state.stability < 40);
      el.authority.classList.toggle('low', state.authority < 25);
    },
    setSpeed(speed) {
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
    },
  };
}
