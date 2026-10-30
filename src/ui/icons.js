// Small line icons drawn inline beside meters, resources and tabs, so fewer
// words are needed. Each keeps a text label beside it for clarity.
const PATHS = {
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4"/>',
  wheat: '<path d="M12 21V8"/><path d="M12 8c-3-1-4-4-3-6 2 1 3 3 3 6zM12 8c3-1 4-4 3-6-2 1-3 3-3 6zM12 13c-3-1-4-4-3-6 2 1 3 3 3 6zM12 13c3-1 4-4 3-6-2 1-3 3-3 6z"/>',
  crown: '<path d="M4 17l-1-9 5 4 4-6 4 6 5-4-1 9z"/><path d="M5 20h14"/>',
  scales: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14c3 0 6 2 6 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  flame: '<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-11 3 2 7 6 7 11 0 3-2 6-5 6z"/><path d="M12 21c-2 0-3-1-3-3 0-2 2-3 2-5 2 1 4 3 4 5s-1 3-3 3z"/>',
  moon: '<path d="M15 3a9 9 0 1 0 6 14.5A7.5 7.5 0 0 1 15 3z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  sword: '<path d="M19 3l-9 9M14 3h5v5M10 12l-3 3M5 13l6 6M3 21l3-3"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7"/><path d="M8 9h7M8 12h7M8 15h5"/>',
  castle: '<path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z"/><path d="M10 21v-5h4v5"/>',
  dove: '<path d="M3 13c4 0 6-2 8-6 1 3 3 4 7 4l3-2-1 4c-1 4-5 7-10 7-3 0-6-2-7-7z"/>',
  realm: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  inbox: '<path d="M4 4h16v16H4z"/><path d="M4 14h5l1 2h4l1-2h5"/>',
  hammer: '<path d="M14 4l6 6-3 3-6-6zM12 9l-9 9 3 3 9-9"/>',
  more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  // M24 A: the goods and the meters of the compact top bar.
  logs: '<path d="M4 15l9-5M4 15a2 2 0 1 0 2 3.5M13 10a2 2 0 1 1 2 3.5L6 18.5"/><path d="M11 18l9-5M11 18a2 2 0 1 0 2 3.5M20 13a2 2 0 1 1 1 3.4L13 21.5"/><path d="M15 3c1 2-1 3 0 5M18 4c1 2-1 3 0 5"/>',
  anvil: '<path d="M4 7h13a4 4 0 0 1-4 4H9v2h3v3H6v-3h3v-2H7a3 3 0 0 1-3-3z"/><path d="M5 20h12"/>',
  cloth: '<path d="M5 5h11a3 3 0 0 1 0 6H5z"/><path d="M5 11h11a3 3 0 0 1 0 6H5zM5 5v14"/><path d="M16 17v3"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  gallows: '<path d="M6 21V4h10M6 8l4-4M16 4v4"/><path d="M14.5 8a1.5 1.5 0 1 0 3 0v2a1.5 1.5 0 1 1-3 0z"/><path d="M3 21h8"/>',
  sceptre: '<path d="M7 17l10-10"/><circle cx="18" cy="6" r="2.5"/><path d="M5 19l2-2M4 16l4 4"/>',
};

export function icon(name, cls = '') {
  const p = PATHS[name];
  if (!p) return '';
  return `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${p}</svg>`;
}
