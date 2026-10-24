# Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 The living map | Scaffold, test harness, map render from geography.json, pan and zoom, settlements with basic stats and cards, calendar and speed controls, ambient caravans and patrols on roads and barges on rivers driven by simple placeholder values, save and load, deploy to GitHub Pages | Next |
| M2 Economy and population | Goods, production, consumption, buildings, taxes, monthly ledger, population growth and decline, trade traffic tied to the economy | Planned |
| M3 Laws and edicts | Law system, Authority, group reactions, effects over time | Planned |
| M4 Faith, culture and peoples | Faith mix, tension, non-human populations, pilgrims and refugees | Planned |
| M5 Nobility | Great houses, holdings, loyalty, demands, crown actions, soft failure | Planned |
| M6 Military holdings and events | Garrisons, castles, patrol routes, levies, threats, event system with auto-pause | Planned |
| M7 Balance and polish | Long-run balance, chronicle, tutorial hints, performance on mobile | Planned |

## M1 acceptance criteria
- The page loads on GitHub Pages and runs on a phone in portrait and landscape.
- Temeria, neighbouring lands, terrain zones, rivers, Lake Vizima, roads and all settlements render from data/geography.json, with names.
- Pan, pinch zoom and tap work. Tapping a settlement opens its card (name, type, population, holder; placeholder values are fine).
- The calendar advances in real time; pause, 1x, 2x and 4x work; the date and season show in the top bar.
- Ambient caravans and patrols travel the road network and barges move on the Pontar and Ismena; tapping a unit shows what it is.
- Save and load work via localStorage, plus JSON export and import.
- npm test passes: sim tests, the 10-year headless run, and Playwright smoke tests with screenshots in portrait and landscape.
