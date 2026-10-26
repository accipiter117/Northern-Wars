# Changelog

## M14 Interface overhaul
- A tab bar along the foot (down the side when the phone lies flat): Realm, Court, Treasury, Military and Diplomacy, with badges for what waits. Each tab has sub-tabs and reopens where you left it. Chronicle, Help and the saves moved to a small menu under the three dots.
- A real back button: cards opened from a list stack up, and the back arrow, the browser's back and the Android back gesture retrace the way.
- The panel never loses your place. In portrait it is a sheet with three heights, dragged by its title; a tap on the map lowers it to its title bar instead of closing it. In landscape it sits beside the map and stays open. Screens remember their sub-tab, scroll, open sections and half-filled forms, across saves too.
- Decisions no longer jump in front of what you are doing: they wait in the Court inbox, sorted by urgency with the days left, and are answered right there. The game still pauses for each new one. Only war on Temeria, a siege of one of our towns, a rebellion or a deposition raise a red banner.
- Shorter cards: one layout everywhere, with key figures as chips and long text behind an (i). Town cards have Overview, Build, Military and People tabs, and Build lists only what can be raised there. Laws are one line each. Help is a searchable list. Small icons beside the meters.
- Fewer taps: tap a meter to see why it moved. Targets are picked on the map (hunts, patrols, stations, trade routes, sieges, the muster place) with the odds or the value shown before you confirm. Send nearest suitable company on every threat; Recruit here and Trade route from here on every town.
- No rules or balance changed.

## M13 A realm under arms
- Threats are things on the map. Bandit camps grow in the forests, marshes and hills near poor and restless places and send bands to hold the roads (caravans stop, crown routes and market trade are robbed) and fall on weak villages. Monster lairs hold drowners, wolves, harpies and wyverns, or something far worse. Scoia'tael commandos come out of the woods when the elves are angry; hostile neighbours send war parties over the border.
- What the crown's eyes reach it sees clearly; beyond them, rumours. A short alert names each sighting, and Help can pause the game on sightings.
- Standing companies: militia, archers, men-at-arms, crossbowmen, light cavalry and knights, recruited from a town's card. They draw on the town's people, the crown's stores of arms and horses, and the treasury every month; they have morale, wounds and experience, and desert when unpaid.
- Standing orders: hold a place, patrol a road, guard a trade route, hunt a sighted threat or enemy army, or stand ready to answer anything sighted nearby. Odds in plain words before a hunt; fights settle themselves, with a marker on the map and a report in the Chronicle. Witchers can be hired for the worst beasts.
- Field armies can take standing companies along, and fight better for them.
- Banner tokens for every force, sized by strength, with men and morale close up; camps and lairs drawn in the terrain; lines to where forces are going; a Forces screen with every company and threat and a button to send the nearest company.
- Old patrols become companies of light horse on the same roads. Save version 12.

## M12 A working economy
- A rescaled economy: a well-run crown now prospers instead of living in debt. Taxes depend on the kind of place and grow with prosperity and with market halls, guildhalls and merchants' quarters. Crafts earn several times more, by the size and fortunes of their place (a little less each the more of one trade the realm has). Gold mines yield about 150 a month at their peak. Patrols cost by the length of their road. Debt interest is 1% a month, but deep debt now stirs unrest.
- Production chains: sheep pastures and weavers' halls (wool to cloth), rye distilleries (spare grain to rye spirit), charcoal burners and weaponsmiths (timber and iron to arms, dearest while the realms around are at war), salt pans on the Velen coast (salt, and stores that keep longer), and horse studs on the southern farmland (horses, and cheaper patrols). Finished goods ride the crown's routes at a premium where the far end lacks them, most of all abroad, and the rest sells at home. Carts carry them along the roads.
- New trades: silver mines in the hills, toll bridges at the White Bridge and Devil's Ford that earn from every caravan crossing the Pontar, a shipyard at Gors Velen, a fishery and smokehouse, merchants' quarters in the cities, a pilgrims' hostel at the Temple of Melitele, an alchemist's workshop (the Eternal Fire disapproves) and a hunters' lodge that thins the beasts nearby. Each stands only where the land suits it, with sheep, horses, boats and smoke about it.
- The Treasury (formerly the Ledger): a line for every crown in and out, and the places that earn and cost most. Every town's card says what it earned and cost the crown last month. The first time the treasury goes into the red, a hint explains debt and opens the Treasury.
- The Trade screen shows the goods each route carries and what the chains made; patrols show their cost.
- tools/longrun.mjs can print each year's ledger; the model crowns live in tools/crowns.mjs; tools/payback.mjs covers every new building.
- Save version 11.

## M11 Trade, gold and a busier realm
- Crown trade routes, from a town's card or the new Trade and gold screen: between our towns and cities, or into a friendly neighbour's. Each earns by the towns' size and fortunes, the haul, what each sells the other and how safe the road is; bandits rob them, patrols protect them, war closes them. Every route has its own ledger line, a gold thread on the map and crown caravans on the road.
- Gold: known seams in the Mahakam foothills, the Pass of Klamat and the Tukaj Hills, and hidden ones for prospectors to find. A gold mine pays every month until the seam runs out, and brings miners, dwarves, bandits, envious neighbours and Mahakam's frown.
- Sixteen new buildings: harbour, warehouse, smithy, armoury, tannery, brewery, inn, bathhouse, hospice of Melitele, cathedral of the Eternal Fire, guildhall, dwarven bank, barracks, paved streets, sewers and the gold mine. Villages hold five buildings, castles five, towns eight, cities twelve.
- A busier map: every settlement is laid out as a place, with houses that multiply as it grows, patchwork fields, mills on the river, mines in the hills, walls round the town, smoke from the chimneys and workers on the roads to the fields. Fields green in spring, gold at harvest and bare under snow in winter. Far off, places show as compact clusters.
- A faster map: panning slides the drawn map instead of redrawing it, and the fog is cheaper.
- tools/payback.mjs measures how long each building takes to pay back.
- Save version 10.

## M9 War with neighbours
- War: declare it from a neighbour's card, be invaded by a neighbour who hates us or smells weakness (after war drums), be called to a true friend's side, and watch the neighbours fight one another.
- Armies raised from the crown levy, the lords' men and free companies, each with a marshal and a bold or cautious stance; ordered to hold a place, besiege a town or raid a realm.
- Battles, sieges (starved or stormed) and raids, with loot, sacked towns and refugees.
- Towns change hands: occupied towns pay the enemy, conquered towns pay the crown, and the map shows the new master's colours round them.
- Peace on four kinds of terms, enemy offers and demands, tribute, and three-year truces.
- A War screen, army cards (tap an army on the map), war decisions, ledger lines for armies, conquests and tribute, and new hints.
- Past the bankers' limit, unpaid bills no longer pile up without end.
- Save version 9.

## M8 The wider North
- A larger map: every neighbouring realm now reaches its real extent, with 35 towns, cities and castles of its own, roads, terrain and roads across the border.
- Living neighbours: their towns grow, their rulers raise buildings and keep garrisons, and their own caravans and riders travel their roads in their colours.
- Fog of war over foreign lands: shrouded until seen, then shown as last seen, and live where someone of ours is watching.
- Sight from border towns, a new Watchtower building, patrols, Temerian merchants abroad, friendly realms, true allies, embassies and spies.
- Embassies and spies on each realm's card, with what we can see of it and the places we know; tap a known foreign town for its card.
- Toasts no longer block taps on the map.
- Save version 8.

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
