# Northern Wars: working rules

## What this is
A mobile-first browser kingdom simulator set in the Witcher world. Player is the crown of Temeria, governing through policy, appointments and crisis decisions, not micromanagement. Real-time with pause, Frostpunk style. Ambient units (caravans, patrols, pilgrims, refugees) move on their own and show the state of the realm. Full design: docs/DESIGN.md. Milestones: docs/ROADMAP.md.

## Tech
- Vanilla JavaScript (ES modules), HTML and CSS. No framework, no bundler, no build step.
- Served as static files by GitHub Pages from the repository root. index.html lives at the root.
- Canvas 2D for the map and ambient units; DOM for UI panels.
- Node 20+ for tests only: node:test for simulation tests, Playwright for browser smoke tests.

## Architecture
- src/sim/: pure simulation. No DOM, no window, no timers. step(state, days, rng) returns the new state. Must run headless in Node.
- src/render/: canvas map, terrain, settlements, ambient units, camera (pan, pinch zoom, tap).
- src/ui/: DOM panels, top bar, menus, dispatch feed.
- src/main.js: wires sim, render and UI; owns the game loop and speed controls.
- data/: all content as JSON (geography, settlements, buildings, laws, faiths, peoples, houses, events). Adding a kingdom must mean adding data, not editing engine code.
- Seeded RNG only (for example mulberry32). Gameplay RNG and ambient-traffic RNG are separate streams so cosmetic traffic never changes game outcomes.
- Sprite registry: every drawable thing is requested by kind and id (getSprite('settlement', 'vizima')). v1 returns procedural placeholders; painted art will be dropped in later by registering images, with no other code changes.

## Testing (run before every push)
- npm test runs: simulation unit tests; a headless 10-year simulation for several seeds asserting no NaN or Infinity, all meters in range, populations non-negative, determinism (same seed gives the same state); and Playwright smoke tests loading the page at 390x844 portrait and 844x390 landscape, checking no console errors and taking screenshots into test-results/.
- Never push with failing tests.

## Conventions
- Player-facing text: British English, no em dashes (use commas, brackets or full stops), plain natural language, grim and grounded tone.
- Mobile first: touch targets at least 44px, works in portrait and landscape, respects safe-area insets, no hover-only interactions.
- Keep files small and focused. Comment the why, not the what.
- Original work only: setting names and lore facts are fine; no assets, text or art copied from the games, books or other fan projects.
- One milestone per pull request. Update docs/ROADMAP.md status and add a short entry to CHANGELOG.md each time.
- If a design question isn't answered in docs/DESIGN.md, make the simplest reasonable choice, note it in the PR, and keep going.
