# Changelog

## M7 Balance and polish
- Long-run balance: thirty-year runs of four kinds of crown, written up in docs/BALANCE.md with the dials worth turning, and tools/longrun.mjs to repeat them.
- A full treasury now draws courtiers and hangers-on (1% a month of anything above 5,000), so an idle hoard levels off around 43,000 instead of passing 150,000.
- Authority regrows by itself only up to 75; beyond that it takes content lords or a splendid court.
- Chronicle: a summary of the reign, filters by subject, entries grouped by year, and room for 400 dispatches.
- Tutorial hints for a first reign, and a Help screen.
- Performance: the map is split into a painted layer and a settlement layer, danger marks are reckoned monthly, panels refresh twice a second at most, and a paused game stops drawing.

## M6 Military holdings and events
- Garrison levels for every crown settlement, from skeleton to fortress, set from its card.
- Patrol routes ordered from a new Military and threats screen, drawn on the map and ridden by the mounted patrols.
- Bandits and monsters that grow in poor, angry and wild places and raid when the garrison is too weak, with bandit camps and monster lairs marked on the map.
- Plague that spreads along the roads, with quarantine and Melitele's priestesses as answers.
- Events: plague, failed harvests, beasts, witchers, bandit captains, deserters, fires and mine collapses.
- A defence section on settlement cards: threats, strength and garrison level.
- Save version 7.

## M5 Nobility
- Five great houses with lords, seats, lands, traits and colours. Their lands pay the crown half their taxes, keep their own soldiers and fly their banners on the map.
- Loyalty, favour, grievance and ambition for each house, with demands that pause the game: land, tax exemptions, a council seat, a royal match, a feud, coin.
- The crown's hand: bestow honours, summon to court, demand levies, impose a fine, grant land, strip a title.
- Rebellion when a house is pushed too far, decided by the strength of the crown's soldiers; rebel banners are slashed red.
- Deposition when Authority collapses amid disorder or rebellion, with a chronicle of the reign and the choice of a regency or a new reign.
- Decisions that arrive together now open one after another.
- Stability now gives the countryside an equal say with the cities.
- Save version 6.

## M4 Faith, culture and peoples
- Faith shifts over the years with the crown's patronage and laws; the Eternal Fire slowly gains in the cities.
- Tension between humans and non-humans in every settlement, shown on the settlement card where non-humans live.
- Riots and pogroms, with a smoke-and-flame marker over riot-struck settlements and refugees fleeing them.
- Scoia'tael sympathy among the elves, and commando ambushes near the forests when it runs high.
- Petitions from Temerian settlements, answered like envoys.
- Pilgrims on the road to the Temple of Melitele.
- A Faith and peoples screen: realm faith, the peoples, Scoia'tael sympathy, the tensest places and waiting petitions.
- Save version 5.

## Map dressing: soldiers and buildings
- Garrisons stand beside their settlements as blue-coated spearmen (one per 200 men, up to five) under a Temerian banner; unpaid garrisons turn grey under a ragged banner.
- Patrols ride as mounted lancers facing the way they travel.
- Every finished building appears as a small icon round its settlement (fields, watermill, granary, lumber camp, quarry, iron mine, market hall, workshops, shrine), works in progress as scaffolding, and stone walls as a ring round the settlement marker.
- Icons, soldiers and banners are sprites in the registry (src/render/sprites-buildings.js), ready to be replaced by painted art.
- Tapping a settlement's soldiers or buildings opens its card, which now marks an unpaid garrison.

## M3.5 Neighbouring realms
- Eleven neighbouring realms with rulers, tempers, relations, border trade and gateways, on a new Neighbouring realms screen and as cards opened by tapping their land on the map.
- Stances (friendly, neutral, cold) and the crown's laws move each realm's relation; neighbouring lands are tinted green or red on the map to match.
- Border trade and gifts in the ledger. Foreign caravans, with red pennants, cross the borders to Temerian towns.
- Envoys with choices arrive about one month in three and pause the game; unanswered ones are settled cautiously after 20 days.
- ledgerNet() is the single sum of a month's accounts, used everywhere.
- Save version 4.

## M3 Laws and edicts
- Fourteen laws in three categories, decreed from a new Laws screen (realm menu). Each decree costs Authority and crowns and phases in over a month.
- Nine groups with an opinion of the crown, shown as the realm's mood with arrows for which way each is heading. Opinion moves unrest, trade and Authority.
- Authority now regenerates monthly, helped by content lords and a splendid court, and drained by debt.
- Laws reach taxes, trade, garrison size and pay, harvests, granary storage, the court's cost, monthly edicts, growth, and the exodus of non-humans under expulsion.
- The ledger lists edicts and decree costs.
- Save version 3; older saves gain the customary laws.
- tools/lawbalance.mjs compares every law option against doing nothing.

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
