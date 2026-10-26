# Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 The living map | Scaffold, test harness, map render from geography.json, pan and zoom, settlements with basic stats and cards, calendar and speed controls, ambient caravans and patrols on roads and barges on rivers driven by simple placeholder values, save and load, deploy to GitHub Pages | Done |
| M2 Economy and population | Goods, production, consumption, buildings, taxes, monthly ledger, population growth and decline, trade traffic tied to the economy | Done |
| M3 Laws and edicts | Law system, Authority, group reactions, effects over time | Done |
| M3.5 Neighbours | The immediate neighbouring kingdoms brought to life in a small way, for variety and a sense of the wider world | Done |
| M4 Faith, culture and peoples | Faith mix, tension, non-human populations, pilgrims and refugees | Done |
| M5 Nobility | Great houses, holdings, loyalty, demands, crown actions, soft failure | Done |
| M6 Military holdings and events | Garrisons, castles, patrol routes, levies, threats, event system with auto-pause | Done |
| M7 Balance and polish | Long-run balance, chronicle, tutorial hints, performance on mobile | Done |
| M8 The wider North | A larger world with living neighbouring realms (towns, roads, growth, buildings, garrisons, traffic) under a fog of war lifted by watchers, merchants, friends, embassies and spies | Done |
| M9 War with neighbours | Armies raised from levies, lords and hired companies; marshals, orders and stances; battles, sieges, raids; towns that change hands; invasions, wars between neighbours, calls to arms; peace, tribute and truces | Done |
| M11 Trade, gold and a busier realm | Crown trade routes at home and abroad, gold deposits and prospecting, sixteen new buildings with limits per place, and settlements laid out as living places on the map (houses, fields, workshops, walls, smoke and workers) | Done |
| M12 A working economy | The economy rescaled so a well-run crown prospers: taxes that grow with development, earning buildings that earn, patrols by road length, cheaper debt; production chains (wool to cloth, grain to rye spirit, timber to charcoal to arms, salt, horses), silver, toll bridges, merchants' quarters, the pilgrims' hostel, the shipyard, the alchemist and the hunters' lodge; and the Treasury, with every line and every place's account | Done |
| M13 A realm under arms | Bandit camps, monster lairs, Scoia'tael commandos and foreign raiders as things on the map, seen or rumoured; standing companies of six troop types with morale, wounds, experience and pay, on standing orders (station, patrol, escort, hunt, respond); fights with odds in words; field armies raised from the companies; banner tokens, camps and lairs, and a Forces screen | Done |
| M14 Interface overhaul | A persistent tab bar (Realm, Court, Treasury, Military, Diplomacy) with sub-tabs and badges, an overflow menu, a navigation stack tied to the back gesture, a three-height sheet that a map tap lowers instead of closing (a side panel in landscape), screens that remember their place and forms across saves, decisions in a Court inbox answered inline with a banner only for what cannot wait, one card template, town cards in four tabs, compact laws, searchable help, meter cards, and map pick mode for every target | Done |
| M15 Native feel and a detailed North | A: no browser gestures, long press as a game gesture (quick-action rings, what's here, list previews), momentum and zoom gestures, an installable offline app with a versioned service worker, save and pause when put away, haptics and wake lock settings. B: the North retraced (24 lands, terrain, 19 rivers, lakes, 92 towns, new roads, same rules and life abroad, richer terrain art, cached terrain tiles) | Done |
| M17 Audiences with rulers | A full-screen audience with any ruler (portrait, mood and its reasons, trust); a deal table with live verdicts, counter-offers and deals carried out through the ledger and caravans; gifts, denunciations, tribute, asks and intelligence; treaties (non-aggression, trade, defensive, alliance, access, protectorate) that bind calls to arms and cost trust to break; war declared with a reason and terms before war; rulers with traits and agendas who request audiences and make and break pacts among themselves | Done |
| M18 Rulers who govern | Foreign rulers assess threat, opportunity and purse each month and choose a posture (Grow, Arm, Expand, Consolidate, Scheme); standing armies with upkeep, a court that taxes hoards, debt with desertion and offers to Temeria; building from the full catalogue; wars with aims, musters and reasons in place of rivalry dice; deterrence, probes and harder-to-break pacts with Temeria; pacts between realms that last; posture and war aims learnt through embassies and spies | Done |

## M1 acceptance criteria
- The page loads on GitHub Pages and runs on a phone in portrait and landscape.
- Temeria, neighbouring lands, terrain zones, rivers, Lake Vizima, roads and all settlements render from data/geography.json, with names.
- Pan, pinch zoom and tap work. Tapping a settlement opens its card (name, type, population, holder; placeholder values are fine).
- The calendar advances in real time; pause, 1x, 2x and 4x work; the date and season show in the top bar.
- Ambient caravans and patrols travel the road network and barges move on the Pontar and Ismena; tapping a unit shows what it is.
- Save and load work via localStorage, plus JSON export and import.
- npm test passes: sim tests, the 10-year headless run, and Playwright smoke tests with screenshots in portrait and landscape.

## M18 acceptance criteria
- Each foreign realm scores Threat, Opportunity and Purse (0 to 100, with parts) monthly and holds one of five postures for at least six months unless threat jumps; trait and agenda weights in data/strategy.json; the posture stored on the realm.
- Standing armies with upkeep and recruiting; raiseRealmArmy uses the standing army first; no foreign treasury beyond 24 months of income; debt brings desertion, a forced Consolidate and loan, goods or town offers; Verden's debt spiral and Kerack's lost garrisons fixed, each with a test.
- Foreign building from the full catalogue with Temeria's land limits, scored by payback, posture, agenda and traits; large realms build two at once.
- No rivalry dice: Expand picks a war aim, musters, declares with a reason; armies target the aim; held aims kept at peace; monthly press on, seek peace or call allies.
- Deterrence divides opportunity against Temeria; probes (raiders, tolls, demands, a show of force, denouncing, renegotiating); pacts with Temeria broken only by ambitious or opportunist rulers when the crown is weak, cautious ones when very weak, honourable ones never; soft balancing.
- Pacts between realms: two-year minimum, a lower break threshold, three years before re-signing.
- An embassy shows posture and reason, a spy the war aim and musters, otherwise rumour; posture in the audience mood reasons.
- Save version 15 with an upgrade from 14. tools/realms.mjs measures the targets (treasury, towns changing hands, probes and invasions, pact churn, debt floor); the M7 and M12 targets still hold.

## M17 acceptance criteria
- A full-screen audience with any ruler from their realm card, the Diplomacy tab's portraits or a long press on their capital, in portrait and landscape: portrait, name, realm, traits, mood in a word and a number with its reasons, and four buttons (Trade, Diplomacy, Alliance, War) each opening a panel; back to the buttons, close to where the player came from.
- Portraits through the sprite registry as portrait:<ruler id>, with a procedural placeholder (heraldic colours, a crowned silhouette, the realm's emblem).
- The deal table: crowns (lump or monthly), goods, routes, sight, passage, an embassy, a town; a live verdict (Acceptable, Close, They want more, Insulting); What would they accept?; the ruler's own proposal; agreed deals carried out by the simulation, payments and deliveries in the ledger and caravans on the map.
- Diplomacy: stance, gifts, embassy, spy, denounce, demand tribute, ask them to stop (massing troops, sheltering raiders, tolls), exchange or request intelligence.
- Treaties: non-aggression, trade, defensive, alliance, military access, protectorate; each with a length, terms the AI weighs and a cost to break (trust with that ruler and a little with every other); trust as a lasting memory per ruler; calls to arms by treaty.
- War with a stated reason (a claim, a broken treaty, an ally or protectorate, or none, which costs trust everywhere); terms before war; peace through the deal table.
- Rulers with personalities and agendas from data; requests for audiences with real proposals in the Court inbox, expiring if ignored, replacing random envoys; foreign realms make and break pacts by the same rules; the web of pacts on the Diplomacy tab; reasoning in one plain line.
- Built for parties beyond the eleven realms. Save version 14 with an upgrade from stances and envoys. Tests: verdicts match the valuation, counter-offers affordable and acceptable, treaties trigger calls to arms, breaking a treaty costs trust everywhere, foreign pacts made and broken over 30 years, deals and deliveries in the ledger.

## M15 acceptance criteria
Part A, native mobile feel:
- No text selection, long-press callouts, image dragging or context menus on the map and interface; fields stay selectable.
- Long press (about 450ms, small movement allowed, a filling ring under the finger): quick actions on our towns, companies, armies and threats; what's known of foreign towns and armies; what's here on open land; a quick look from list rows.
- Pressed state within a frame; momentum panning that comes to rest; pinch zoom between the fingers; double-tap to zoom in, two-finger tap to zoom out; the page never zooms, bounces or pulls to refresh.
- A valid manifest (name, short name, icons including maskable, standalone, theme and background colours, any orientation), Apple touch icon and status bar tags; a service worker caching every game file with a versioned cache, offline play and a restart prompt for new versions.
- Save and pause when hidden or closed, staying paused on return; optional wake lock; haptics with a setting; dynamic viewport units; 16px inputs; canvas pixel ratio capped at 2; no drawing while paused and still.
- Tests: long press opens quick actions with nothing selected; no context menu on the map; manifest valid and service worker registers; the game reloads offline; hiding the page saves; momentum panning comes to rest.

Part B, a detailed North:
- The 24 lands of the atlas replace the old outlines; the thirteen not modelled are drawn and named as lands beyond, with their towns and roads.
- The invented foreign terrain and the straight Pontar and Yaruga go; the atlas's forests, ranges, hills, marsh, 19 rivers and lakes come in. Temeria is unchanged.
- The traced towns replace the invented ones: capitals keep their ids, other old towns map to the nearest new town of the same realm, and a save upgrade (version 13) carries holdings, sieges, routes, memories, armies and ledger lines across.
- Foreign roads rebuilt: two or three nearest within a realm, roads across touching borders, round the mountains, over rivers near towns.
- The same rules abroad: camps and lairs in foreign wilds, terrain effects on foreign towns, timber, stone and iron, hidden gold.
- Richer terrain art (forests, peaks sized by range, mounds, reeds and pools, tapering rivers with names along the curve, lakes with shorelines, seeded scatter), visible under fog; level of detail by zoom and cached terrain tiles.
- Tests: every town inside its realm; no terrain or town in the sea; every town reachable by road; old saves upgrade with nothing lost; foreign threats spawn in foreign wilds; panning the whole North zoomed out on a slowed CPU stays inside a sixtieth of a second a frame.

## M14 acceptance criteria
- No game rules or balance change: this milestone is navigation, layout and interaction only (the one sim change, authorityParts, is the existing monthly Authority sum split into named parts and reused by the ledger, so the numbers are unchanged).
- A persistent tab bar (bottom in portrait, down the side in landscape; safe-area aware; 44px targets; badges) with Realm, Court, Treasury, Military and Diplomacy, each with segmented sub-tabs that reopen on the last one used; Chronicle, Help, Save, Load, Export, Import and New reign in an overflow menu.
- A navigation stack: cards opened from lists push, and the back arrow, browser back and Android back return to exactly where the player was.
- Portrait sheet with peek, half and full heights; a map tap lowers it to peek; landscape side panel stays open. Every screen remembers its sub-tab, scroll, open sections and half-filled forms for the session and across saves.
- Decisions go to the Court inbox (badge and toast, auto-pause as before), sorted by urgency with time left and answered inline; only war declared on Temeria, a siege of a Temerian town, a rebellion or a deposition raise a banner.
- One card template; town cards with Overview, Build (buildable only, one line each, Not possible here folded), Military and People; compact laws; searchable help; small icons beside meters and figures.
- Map pick mode with a preview of odds or value before confirming, for hunts, patrols, stations, trade routes, army orders and the muster place; contextual actions on threat, town and lord cards.
- Playwright tests count the taps from the map (meter 1, decision 2, company 3, build 4, law 4, return 1), check state survives a map tap, a close, a decision arriving mid-form and a reload, the back gesture, both layouts, and that no tab or card opens longer than about two screens at 390x844; the frame-budget test passes with the sheet open and being dragged.

## M13 acceptance criteria
- Dice-roll raids are gone: the monthly threat levels decide where bandit camps and monster lairs appear and grow. Camps send bands that hold roads (stopping real crown caravans and ambient carts on the map, robbing routes, trade and goods) and fall on weak villages; lairs hold beasts suited to their country, rarer and stronger kinds among them; witchers clear them with no losses, troops at a cost in men. Scoia'tael commandos come out of the woods when sympathy is high, strike and vanish; hostile neighbours send raiders over the border; enemy armies march visibly.
- Threats in sight show clearly with their size; beyond sight a rumour marker covers a rough area and firms up as sight reaches it. A short alert on each new sighting, and a Help option to pause on sightings.
- Standing companies of militia, men-at-arms, archers, crossbowmen, light cavalry and knights, each with strength, morale, experience and upkeep, suiting some foes better than others; recruited from a town's people, needing barracks, arms and horses as fits; unpaid companies lose morale and desert; they heal and recover at their station. Garrisons stay as local defence; field armies are raised from the companies plus levies and hired companies.
- Standing orders (Station, Patrol, Escort, Hunt, Respond); companies follow roads, slower in rough country and winter, and return to their station after a hunt; odds in plain words before a Hunt; fights resolve automatically with a battle marker and a Chronicle report.
- Banner tokens for every force (crown, lords, foreign, bandits, Scoia'tael, beasts) sized by strength, with men and morale close up; camps and lairs as sprites that grow; destination lines; a chosen company's road, route or radius; a Forces screen with a button to send the nearest suitable company.
- Balance: over ten years the steward with a modest standing army suffers far fewer losses than the idle crown, which feels threats more than before; a sensible peacetime force costs 15 to 25% of a developed realm's income (tools/longrun.mjs, docs/BALANCE.md).
- Tests for threats appearing and growing, bands stopping caravans, companies clearing camps and lairs, odds matching outcomes, desertion, sight and rumour, and the save upgrade; the frame-budget test with many tokens on screen; save version 12.

## M12 acceptance criteria
- Taxes depend on the kind of place and rise with prosperity and with market halls, guildhalls and merchants' quarters.
- Earning buildings earn several times more: gold mines about 150 a month at their peak, tapering as the seam runs out; craft and trade buildings 25 to 80 a month in a good place; every one pays back in 2 to 6 years (docs/BALANCE.md).
- Patrols cost by the length of their road, noticeably less for a short one; debt interest is about 1% a month and debt still costs Authority.
- Measured with tools/longrun.mjs over three seeds: the idle crown roughly breaks even, no richer than before; the steward's income at year 10 is at least 2.5 times year 1, with six patrols, standard garrisons and a clear surplus; a fully developed Vizima earns 600 or more a month; the spendthrift is still deposed.
- Sheep pastures and weavers, rye distilleries, charcoal burners, weaponsmiths (worth more while realms are at war), silver mines, salt pans, fisheries, toll bridges at the White Bridge and Devil's Ford, the shipyard at Gors Velen, horse studs, merchants' quarters, the pilgrims' hostel, the alchemist and the hunters' lodge, each only where the land suits it, each with art and life on the map. Finished goods sell at home and raise the value of the routes that carry them, most of all abroad. Carts carry the goods along each chain.
- Every income and cost has its own ledger line; settlement cards show what each place earned and cost the crown last month; the first time the treasury goes into the red a hint points to the Treasury.
- tools/payback.mjs covers every new building; BALANCE.md records the new long-run and payback tables; tests for taxes, each chain, toll bridges, the idle crown and the steward's solvency; save version 11 with an upgrade path.

## M11 acceptance criteria
(Numbered M11 as asked; no M10 has been defined yet.)
- Crown trade routes between Temerian towns and cities, or to a neighbour's towns and cities once relations are good enough, ordered from a town's card or the Trade screen. Each earns from both ends' size and fortunes, the haul, wares one end has and the other lacks, and road safety; costs coin to open and a little each month; earns more with a market hall at either end; follows the roads; is drawn on the map with crown caravans in proportion to its takings; is cut and robbed by bandits, protected by patrols, closed by war and reduced by cool relations; and has its own ledger line. How many the crown runs is limited, and raised by market halls, guildhalls, harbours and the guild law.
- Gold deposits at set hill and mountain sites (the Mahakam foothills by Carreras and Zavada, the Pass of Klamat by Razwan, the Tukaj Hills by Petrelsteyn and Rissberg) and two hidden ones found by prospecting (coin, time and a chance of failure). A gold mine pays directly until its seam runs out, slowly at first; gold draws miners and dwarves, bandits, greedy neighbours and Mahakam's displeasure.
- Sixteen new buildings, each limited to suitable places, with economic ones paying back as set in docs/BALANCE.md; cities hold more buildings than towns, towns more than villages.
- Settlements laid out as places: deterministic from the seed, nothing on roads, rivers or neighbours; houses grow with the people; fields as patchwork; mills on rivers, mines on hills, harbours on the water, lumber camps at forest edges, walls round the whole; smoke, workers, beasts, boats and builders; seasons on the fields and snow in winter; drawn back to front through the sprite registry; compact clusters far off, full layouts close up; each pre-rendered and redrawn only when it changes.
- Tests for route income and closure in war, deposits running out, prospecting, building limits and layouts; a browser test of a busy Vizima on a four-times-slowed CPU; hints; save version 10 with an upgrade path.

## M9 acceptance criteria
- The crown can declare war from a neighbour's card, at a cost in Authority unless it has a just cause; trade with the enemy stops.
- Armies are raised from a crown levy, the lords' men and free companies, with a marshal and a stance, and are given orders: hold, besiege or raid. They march the roads on the map in their colours, fight battles, starve or storm towns and plunder.
- Towns change hands: an occupied Temerian town pays nothing and takes no orders; a conquered foreign town pays the crown. The map shows the new master's colours round every town that changed hands, siege rings and battlefields.
- Neighbours invade (with warning), fight each other, and call on the crown as allies; foreign armies are seen only where the crown can see.
- Wars end in peace (as we were, each keeps what it holds, tribute, bought peace), offered by the crown or by the enemy, followed by a truce.
- Victories and defeats move Authority and the lords; long wars breed unrest. Version 8 saves load at peace.
- Thirty-year runs stay sane for every kind of crown.

## M8 acceptance criteria
- The map reaches beyond Temeria to every neighbour's real extent, with 35 foreign towns, cities and castles, their roads and roads across the borders; Temeria keeps its coordinates.
- Each neighbouring realm grows, taxes, keeps garrisons, raises buildings in its own order of preference and has its fires, raids, sickness, fairs and harvests, under lighter rules than Temeria.
- Fog of war: never-seen land is shrouded, once-seen land shows foreign towns as last seen, and land in sight shows them as they are. Sight comes from Temerian towns (more from a new Watchtower on the border), patrols, merchants abroad, embassies, friends (their towns), true allies and spies (the whole realm).
- Embassies and spies as crown actions; news from abroad only through those, friends or trade.
- Foreign caravans and riders in their realm's colours, shown only where they can be seen; tap a known foreign town for its card.
- The fog is cosmetic state: the game plays out the same with or without it (tested).
- Version 7 saves load with living realms.

## M7 acceptance criteria
- Thirty-year runs of four kinds of crown (idle, steward, spendthrift, tyrant) over several seeds with nothing running away; findings and dials in docs/BALANCE.md; a thirty-year guard in the test suite.
- A full treasury levels off (courtiers and hangers-on), and Authority regrows by itself only to 75.
- A chronicle with a summary of the reign, dispatches by subject and grouped by year.
- Tutorial hints that appear once each when their moment comes, with a Help screen to read them again or turn them off.
- Steady play at 60 frames a second on a CPU slowed four times with a 3x screen; the painted map is not redrawn during play, guarded by a smoke test.

## M6 acceptance criteria
- Crown garrisons can be held at four levels (skeleton to fortress), paid monthly; lords keep their own.
- Patrol routes between any two places, limited by crown soldiers and paid monthly, strengthen and protect every settlement on the road and are ridden by the map's patrols.
- Bandit and monster threat per settlement from poverty, unrest and wild country, cut by patrols, bounties and clearing; raids resolved by local strength against the raiders, reported as dispatches.
- Plague that spreads along the roads, kills monthly, can be quarantined or nursed, and leaves immunity.
- An event system (data/events.json) for plague, failed harvests, beasts, witchers, bandit captains, deserters, fires and mine collapses, pausing the game like other decisions.
- A Military and threats screen, a defence section on settlement cards, and patrol routes, plague, raids, bandit camps and monster lairs on the map.
- Version 6 saves load with no patrols and every garrison at standard.

## M5 acceptance criteria
- Five invented great houses (data/houses.json) with lords, seats, holdings, traits and banner colours; their lands pay the crown half their taxes and keep their own soldiers.
- Loyalty drifts with the nobles' mood, Authority, favour, grievance, a council seat and the laws a house's traits care about; disloyal houses unsettle their lands.
- Demands (data/demands.json) for land, exemptions, office, marriage, revenge and coin pause the game and default to refusal.
- Crown actions: honours, summon to court, levies, fines, grants of land, stripping a title.
- Rebellion below loyalty 15, resolved by weighing the crown's soldiers against the rebels'.
- Deposition after six months of collapsed Authority amid disorder or rebellion, with a chronicle of the reign and a regency or a new reign.
- House banners on the map, slashed red in rebellion; a Great Houses screen and house cards.
- Version 5 saves load with the houses in their lands.

## M4 acceptance criteria
- Each settlement's faith mix drifts monthly towards a target set by the crown's patronage, laws and the Eternal Fire's pull on cities.
- Tension between humans and non-humans in every settlement, raised by the Fire, hunger, poverty and harsh laws, lowered by charters; it only bites where non-humans live.
- High tension brings riots, and at its worst pogroms that kill or scatter non-humans and anger Mahakam, Brokilon and the non-human peoples.
- Scoia'tael sympathy follows elven opinion and pogroms; above 60 it brings ambushes near forests.
- Petitions from Temerian settlements arrive about one month in three, pause the game, and default if ignored.
- Pilgrims walk to the Temple of Melitele; refugees flee riot-struck and starving places.
- A Faith and peoples screen, tension on settlement cards, and a smoke-and-flame marker on riot-struck settlements.
- Version 4 saves load with tension and petitions.

## M3.5 acceptance criteria
- The eleven neighbouring realms each have a ruler, a temper, a relation with Temeria, border trade, a gateway town and laws they care about (data/neighbours.json).
- Relations drift towards a target set by the crown's stance (friendly, neutral, cold) and the laws in force. Friendly stances cost gifts; a stance holds for at least 90 days.
- Border trade appears in the ledger and stops when relations fall below -30. Foreign caravans cross the border and travel to Temerian towns.
- Envoys arrive about one month in three with a choice (data/envoys.json). The game pauses for them; unanswered envoys take the cautious answer after 20 days.
- Neighbouring lands are tinted by relation on the map and can be tapped to open their card.
- Version 3 saves load with every realm at its starting relation.

## M3 acceptance criteria
- Fourteen laws in three categories, each with two or three options, all in data/laws.json.
- Decreeing costs Authority and crowns, jolts the groups affected, and phases in over 30 days; a law cannot be changed again until it has taken hold.
- Nine groups (nobles, burghers, peasants, three faiths, three non-human peoples) hold an opinion that drifts towards what the laws give them, and that opinion moves unrest, trade and Authority.
- Authority regenerates monthly, faster with content lords and a splendid court, and drains with debt.
- A Laws screen shows the realm's mood and every law, with costs and who each option pleases or angers.
- Version 2 saves load with the customary laws.

## M2 acceptance criteria
- Every settlement keeps its own stores of food, timber, stone and iron; the realm totals are their sum.
- Food is grown on a harvest-shaped curve, eaten (more in winter), shipped from full stores to empty ones, and spoils beyond storage.
- Buildings are ordered from the settlement card, cost coin and materials, take days, and change yields, storage, trade, prosperity or unrest.
- A monthly ledger lists taxes, trade and sales against garrisons, upkeep, the court and interest, with a year of history.
- The treasury can go into debt up to the bankers' limit, at a cost in interest and Authority; past the limit garrisons go unpaid and desert.
- Population grows with prosperity and falls with hunger and high unrest.
- Caravans follow trade volume and grain carts follow real food shipments.
- Version 1 saves load and are upgraded.
