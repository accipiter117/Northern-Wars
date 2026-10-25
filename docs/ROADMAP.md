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

## M1 acceptance criteria
- The page loads on GitHub Pages and runs on a phone in portrait and landscape.
- Temeria, neighbouring lands, terrain zones, rivers, Lake Vizima, roads and all settlements render from data/geography.json, with names.
- Pan, pinch zoom and tap work. Tapping a settlement opens its card (name, type, population, holder; placeholder values are fine).
- The calendar advances in real time; pause, 1x, 2x and 4x work; the date and season show in the top bar.
- Ambient caravans and patrols travel the road network and barges move on the Pontar and Ismena; tapping a unit shows what it is.
- Save and load work via localStorage, plus JSON export and import.
- npm test passes: sim tests, the 10-year headless run, and Playwright smoke tests with screenshots in portrait and landscape.

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
