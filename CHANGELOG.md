# Changelog

## M2 Economy and population
- Per-settlement stockpiles of food, timber, stone and iron; the Granary meter shows the realm total.
- Harvest-shaped farming that depends on settlement type, trade, terrain, prosperity and buildings; winter appetite; spoilage; grain shipped from full stores to hungry ones.
- Ten buildings (fields, watermill, granary, lumber camp, quarry, iron mine, market hall, guild workshops, stone walls, shrine), ordered from the settlement card.
- Monthly ledger with income, expenses and a year of history.
- Crown debt: borrowing up to a credit limit, interest, falling Authority, unpaid and deserting garrisons past the limit.
- Monthly population change from prosperity, hunger and unrest; hunger dispatches.
- Grain carts follow real shipments; caravan numbers follow trade.
- Save version 2, with an upgrade path for version 1 saves.
- tools/balance.mjs for ten-year runs of idle, building and borrowing crowns.
- Fix: tapping a busy town now opens the town rather than a cart passing through it.

## M1 The living map
- Static site scaffold (vanilla ES modules, no build step) ready for GitHub Pages from the repository root.
- Pure simulation in src/sim: seeded RNG with separate gameplay and ambient streams, a 365-day calendar with seasons, placeholder realm meters and a monthly ledger dispatch.
- Map drawn on canvas from data/geography.json: sea, neighbouring kingdoms, Temeria, terrain zones, rivers, Lake Vizima, roads and all 39 settlements, with zoom-dependent labels.
- Pan, pinch zoom, mouse-wheel zoom and tap. Settlement cards with population by people, faith mix, prosperity, unrest, production, garrison and holder.
- Pause, 1x, 2x and 4x speeds. Ambient caravans and patrols on the roads and barges on the Pontar and Ismena; tap one to see what it is and where it is bound.
- Autosave every month, manual save and load, JSON export and import, versioned save schema.
- npm test: sim unit tests, a ten-year headless run over five seeds, and Playwright smoke tests in portrait and landscape with screenshots.
