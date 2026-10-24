# Changelog

## M1 The living map
- Static site scaffold (vanilla ES modules, no build step) ready for GitHub Pages from the repository root.
- Pure simulation in src/sim: seeded RNG with separate gameplay and ambient streams, a 365-day calendar with seasons, placeholder realm meters and a monthly ledger dispatch.
- Map drawn on canvas from data/geography.json: sea, neighbouring kingdoms, Temeria, terrain zones, rivers, Lake Vizima, roads and all 39 settlements, with zoom-dependent labels.
- Pan, pinch zoom, mouse-wheel zoom and tap. Settlement cards with population by people, faith mix, prosperity, unrest, production, garrison and holder.
- Pause, 1x, 2x and 4x speeds. Ambient caravans and patrols on the roads and barges on the Pontar and Ismena; tap one to see what it is and where it is bound.
- Autosave every month, manual save and load, JSON export and import, versioned save schema.
- npm test: sim unit tests, a ten-year headless run over five seeds, and Playwright smoke tests in portrait and landscape with screenshots.
