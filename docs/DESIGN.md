# Northern Wars: Kingdom of Temeria (v1 design)

## Fantasy
You are the crown of Temeria. You never place buildings tile by tile or march individual soldiers. You set laws, fund projects, appoint and manage lords, balance faiths and peoples, and respond to crises. Underneath you the kingdom visibly lives: carts on the roads, patrols, pilgrims, refugees, barges on the rivers.

## Structure
- Sandbox: no fixed goal, rule as long as you like.
- Soft failure: if Authority and Stability both collapse for a sustained period, the great houses depose you. Show a short chronicle of the reign and offer to continue under a regency (reset Authority, keep the world).

## Time
- Real-time with pause. 1 simulation tick = 1 in-game day.
- Speeds: paused, 1x (1 day per second), 2x, 4x.
- Calendar with months and seasons. Monthly ledger: income, upkeep, and a summary dispatch.
- Seasons matter: harvest in late summer and autumn, winter slows travel and raises food use.
- Auto-pause on major events and decisions.

## Map
- Painted map later; v1 uses procedural placeholder art drawn on canvas from data/geography.json.
- Coordinates are a local Temeria map space (1000 wide, 929 tall, origin top-left).
- Layers: sea and neighbouring lands (muted, named, not playable); Temeria outline; terrain zones (marsh, forest, hills, mountains; clip to the Temeria outline); rivers and Lake Vizima; roads (from the roads edge list); settlements; ambient units; labels.
- Pan, pinch zoom and tap to select. Labels for small settlements appear only when zoomed in.
- Settlements are laid out as places (since M11): houses round a landmark, every crown building in its own spot, fields as patchwork, walls round the whole, and the garrison on the left as soldier figures (one per 200 men, up to five) under a banner that turns grey and ragged when pay stops. See "Trade, gold and a busier realm (M11)".

## Realm-level meters
- Treasury (crowns), Granary (food stores).
- Authority (0 to 100): the crown's power over the nobility. Spent to pass laws and act against lords.
- Stability (0 to 100): public order across the realm, derived from settlement unrest.

## Settlements
- Types: city, town, village, castle, temple. Three cities: Vizima (capital), Maribor, Gors Velen.
- Each settlement: population by people (human, dwarf, elf, halfling), prosperity, unrest, faith mix, main production, garrison, and holder (crown demesne or a noble house).
- Starting populations (rough guide): Vizima 18,000; Maribor 9,000; Gors Velen 7,000; towns 1,500 to 3,000; villages 200 to 600; castles 100 to 300; temple 150.
- Flavour placements: dwarves concentrated in Carreras and the Mahakam border and present as craftsmen in Vizima; elves few, near the Brokilon border and in a Vizima quarter; halflings in the southern farmland; the Old Ways strong in Velen; Melitele centred on her temple near Ellander; the Eternal Fire growing in the cities.

## Systems (built across milestones)

### Economy and production
- Goods: food, timber, stone, iron, coin.
- Each settlement produces according to type, terrain and buildings; consumption by population; surplus flows to the crown via taxes and markets.
- Buildings: a short list per settlement type (farms, mills, mines, markets, workshops, walls, granaries, temples). Built from the settlement card with crown funds; take days to complete.
- Trade traffic between settlements is shown as caravans; volume reflects prosperity and road safety.

#### As built in M2
- Stockpiles are per settlement (food, timber, stone, iron); coin goes straight to the treasury. The top bar Granary is the realm's total food.
- One measure of food feeds a hundred people for a day. Each settlement farms the ground around it (terrain within reach changes the yield); cities cannot feed themselves and depend on grain shipped from villages.
- Grain moves through one realm-wide market (no road distances yet), losing 5% on the way.
- Debt: the dwarven banking houses lend up to a credit limit at 2% a month. Every thousand crowns owed costs Authority each month (the lords' faith in the crown); past the limit, garrisons go unpaid, unrest rises and soldiers desert. When the great houses arrive (M5), debt should also lower their loyalty directly.
- All numbers are in data/economy.json and data/buildings.json. `node tools/balance.mjs [years] [idle|builder|borrower]` shows how they play out.

### Laws and edicts
Around 12 to 15 laws in categories, each with options. Changing a law costs Authority and coin, takes effect over time, and pleases or angers specific groups (nobles, burghers, peasants, clergy of each faith, each non-human people). Examples:
- Taxation: light, standard, heavy.
- Conscription: none, seasonal levy, standing muster.
- Public order: town watch, curfews, martial law.
- Non-human rights: equal charter, quarters and restrictions, expulsion.
- Faith: tolerance, Eternal Fire patronage, Melitele patronage.
- Guild charters, road corvee labour, grain price controls, monster bounties (witcher contracts), registration of mages, noble tax privileges.

#### As built in M3
- Fourteen laws: taxation, noble tax privileges, guild charters, grain prices, road corvee, conscription, public order, the royal court, monster bounties, registration of mages, faith of the crown, non-human rights, the Old Ways, poor relief.
- Nine groups: nobles, burghers, peasants, the three faiths and the three non-human peoples. Opinion 0 to 100, starting at 50. Peasants move village unrest, burghers town unrest and trade, nobles castle unrest and Authority; faiths and peoples move unrest by their share of each settlement.
- A decree's opinion shock is 40% of the eventual shift, felt at once; the rest arrives as opinion drifts (2% of the gap a day).
- Authority: +1 a month, plus or minus noble mood and the court, minus debt. Laws cost 5 to 20.
- Garrisons no longer only shrink: they drift towards the size the conscription law calls for. Soldiers have no use beyond upkeep and order until M6.
- `node tools/lawbalance.mjs` compares every option with the customary laws.

### Faith, culture and peoples
- Faiths: the Eternal Fire (zealous, urban, hostile to non-humans and magic), Melitele (healing, charity, women and the poor), the Old Ways (rural, druidic, Velen).
- Each settlement has a faith mix that shifts over time with patronage, laws, preachers and events.
- Tension between humans and non-humans per settlement, raised by Eternal Fire influence, hard times and certain laws; lowered by charters and prosperity. High tension produces riots and pogroms, which feed Scoia'tael sympathy among elves.

#### As built in M4
- Faith drifts 3% a month towards a target: the settlement's founding mix, x1.5 for the crown's patron faith and x0.85 for its rivals, x1.25 for the Fire in cities, x0.5 for the Old Ways while suppressed, x1.1 for the Fire while magic is banished.
- Tension target = 15 + 0.4 per percent of Fire worshippers + 30 x hunger + 0.3 per point of prosperity below 50, plus laws (charter -10, expulsion +25, Fire patronage +8, martial law -5). It adds up to 15% of itself to unrest, scaled by the non-human share (full at one in eight).
- Riots above tension 50, pogroms above 72. Under the customary laws a ten-year reign sees none; Fire patronage with expulsion sees about four riots a year.
- Scoia'tael sympathy: 20 + 1.2 per point the elves' opinion falls below 50, plus 15 per pogrom. Above 60, ambushes near forests and Brokilon.
- Petitions (data/petitions.json) reuse the envoy card: a preacher, a hospice, a grove, a walled quarter, elf youths, a pilgrim escort, a dwarven forge.

### Nobility and vassal lords
- Five great houses with original names (invented, Slavic and Germanic flavour, not canon characters), each holding a seat and several settlements.
- Each house: loyalty, power (levies and wealth), ambition, and one or two traits.
- Houses make demands (land, offices, exemptions, marriages, revenge) through events.
- Crown actions: grant land or honours, summon to court, demand levies, impose a fine, strip a title (costs Authority, risks rebellion).

#### As built in M5
- Houses (invented): Dravnik (Mayena; proud, warlike), Wolbrecht (Houtborg; devout, cautious), Ostrowicz (Petrelsteyn; old blood, schemer), Gelbrand (Red Fort; greedy, pious), Brodowin (Dorndal; loyalist). Each holds its seat and two villages.
- Held lands: the crown takes 50% of their taxes and trade (0% while exempt or in rebellion) and pays none of their soldiers.
- Loyalty target = starting loyalty + 0.5 x (nobles' opinion - 50) + 0.2 x (Authority - 50) + favour - grievance + 10 with a council seat + trait cares. Drifts 1% a day; favour decays 10% and grievance 5% a month.
- Lands of a house add 0.1 unrest per point of loyalty below 50, and +20 in rebellion. Average house loyalty above 50 adds to Authority each month.
- Rebellion: below 15 loyalty, 30% a month; houses below 30 may join. After three months the crown's committed soldiers (half its own garrisons, halved again if unpaid) are weighed against the rebels' soldiers plus a fifth of their people. Win at 1.5x: the rebels forfeit all but their seats, Authority +10. Otherwise after six months the crown cedes land and 15 Authority.
- Deposition: Authority below 15 together with Stability below 75 or a rebellion; six such months (a good month only eases the count) bring a regency (Authority 40, grievances halved) and a chronicle of the reign.
- Stability now averages unrest by people and by settlement equally.

### Military holdings
- Garrisons per settlement and castles, funded monthly.
- Patrol routes along roads reduce banditry and raise road safety (visible as patrol units).
- Levies raised through lords and conscription law.
- No battles in v1. Threats (bandits, monsters, Scoia'tael, riots) are resolved automatically by local strength against threat level, reported as dispatches.

#### As built in M6
- Garrison levels: skeleton x0.5, standard x1, strong x1.5, fortress x2 of a crown settlement's normal garrison (times the conscription law).
- Patrols: one per 400 crown soldiers, 40 crowns a month each; +60 strength and -20 bandit / -5 monster threat for every settlement on the road.
- Threat (0 to 100): bandits = 10 + 0.5 per point of prosperity below 50 + 0.3 x unrest + wild country within 60 units (forest or marsh +15, hills +10); monsters = 5 + marsh 30, forest 20, mountains 20, hills 10, minus 15 with witcher bounties. Cleared threats are cut by 80% for the time bought.
- Each month every threat strikes with chance 8% x level/100; the raiders' strength is level x 4 x (0.5 to 1.5) against the garrison (x1.5 behind walls) plus any patrol.
- Plague: 2.5% deaths a month (halved by priestesses or Melitele patronage), 15% chance a month to spread to each road neighbour unless quarantined, lasts 90 to 150 days, then three years' immunity.
- Events: about one month in three, one card from data/events.json fitting a settlement, season and threat. Decisions open gravest first: deposition, events, demands, envoys, petitions.

### Events
- Data-driven event cards with conditions, two or three choices and effects. Examples: plague, failed harvest, a monster in the marshes, a riot in Vizima, a lord's demand, a Scoia'tael ambush, a preacher of the Eternal Fire, a witcher seeking a contract.
- Major events auto-pause the game.

## Neighbouring realms (M3.5, kept small)
- The eleven realms on the map are no longer only scenery: Redania, Kaedwen, Aedirn, Mahakam, Brokilon, Cidaris, Kerack, Verden, Brugge, Sodden and Cintra each have a ruler (lore figures of the period), a temper, a relation with Temeria from -100 to 100, border trade and a gateway town.
- Relation drifts (1% of the gap a day) towards: the realm's starting view, plus the crown's stance (friendly +25 at 30 crowns a month in gifts, neutral 0, cold -25), plus the laws it cares about (Mahakam and Brokilon about non-human rights, Redania about mages and the Eternal Fire, and so on).
- Trade a month = the realm's trade x (0.5 + relation/100), up to 1.5x; nothing below -30. Brokilon never trades.
- Envoys: about one month in three, one envoy card from a fitting realm (trade pacts, border disputes, refugees, marriages, loans, smugglers, Mahakam's smiths, dryad arrows, spies). Each has two or three choices touching relation, the treasury, Authority, group opinion, settlers or soldiers. The game pauses on arrival; ignored envoys default after 20 days. This is the seed of the M6 event system.
- No armies, wars or treaties yet.

## The wider North (M8)
- The world (geography.bounds) reaches beyond Temeria to each neighbour's extent. Temeria keeps its own coordinates; foreign places, roads and terrain are tagged with their realm and never touch Temerian rules.
- Living realms (data/realms.json) under lighter rules: each foreign settlement grows (0.12% a month, more with food buildings), pays taxes and garrisons, and its realm raises one building at a time in its own order of preference. Incidents (fire, raids, sickness, fairs, harvests) touch prosperity and people. A realm's prosperity scales its trade with Temeria (0.6x to 1.5x).
- Fog of war, kept as cosmetic state in state.ambient (explored 20-unit grid cells, and each foreign settlement as last seen). Sight: Temerian towns (village 40 to castle 85, a Watchtower 130), +40 on patrolled roads, Temerian merchants abroad 45, an embassy 170 round a foreign capital, friendly realms (stance friendly, relation 40+) share 70 round their towns, true allies (75+) and a spy in place show the whole realm.
- Embassy: 250 crowns and 20 a month, refused below relation -30 and by Brokilon. Spy: 200 crowns, 120 days, one in four caught (relation -15).
- News of foreign incidents reaches the chronicle only through an embassy, a spy, a friend or open trade.

## War with neighbours (M9)
This replaces "no battles in v1": the owner asked for war. The crown still governs rather than commands: it raises armies, names marshals and gives orders and a stance; marshals do the marching and battles resolve by themselves. All numbers are in data/war.json.

- Ownership: a Temerian town taken by an enemy keeps its record but carries an occupier (it pays the crown nothing, builds nothing, takes no orders and is left out of Stability); a foreign town taken by Temeria or another realm carries an owner (Temeria's conquests pay into a Conquered towns ledger line and are watched like our own towns). Every war remembers the towns that changed hands in it.
- Raising an army (War, in the menu): a crown levy (a third or half of each crown garrison; the levied garrisons are not refilled while the men are away, and their fields suffer), the lords' men (40% of each loyal house's soldiers, at a grievance; houses below loyalty 30 send excuses), and free companies (200 men, 250 crowns each and 60 a month). Up to three armies, each with a marshal (skill 1 to 1.2; a house's own man wins it favour) and a stance: bold (attacks harder, storms at 3 to 1, seeks battle at 0.8 to 1) or cautious (defends harder, storms only at 5 to 1, fights only at 1.2 to 1). Armies in the field cost 0.15 crowns a man a month.
- Orders: hold a place (and march out to meet any enemy army within 150), besiege a place (starve it out over about 70 days, longer behind walls, in a castle or a city, or storm it when strong enough), or raid a realm (plunder four unwalled towns and villages, then come home). A town is defended by its garrison and townsfolk (3 in every 100 people), times 1.6 behind walls, 1.4 in a castle and 1.5 in a city.
- Battles: when hostile armies come within 16 units. The stronger side (men x marshal x spirit x stance, x1.6 behind its own walls) usually wins: the chance is s^3 / (s^3 + t^3). The beaten side loses a quarter to nearly half, the victor a few in ten, and the beaten army falls back and cannot be brought to battle again for eight days. Victories and defeats move Authority and the lords' mood.
- Capture: the victor leaves a tenth of its men as garrison, carries off loot, and the town loses prosperity, people and calm, and is marked sacked (refugees take to the roads). Losing a town costs Authority (Vizima 30) and angers its lord.
- Marching wears an army down (more in enemy country and in winter), and an army in enemy country strips the land it stands on.
- Foreign realms raise armies under the same rules (45% of their garrisons plus a levy of their people; big realms field two) and fight border wars: they strike places within 260 units of their own lands, and their lost towns above all.
- How wars start: the crown declares (Authority 5 plus a quarter of any warmth between us; nothing if they hold Temerian land); a neighbour invades when it hates us, holds claims, smells weakness (Authority under 25 or a rising) or is simply greedy (Kaedwen and Redania most), after 45 days of war drums the crown hears of; rival realms fight one another; a true ally attacked asks the crown to join.
- Peace: the crown leading a war can offer peace as we were, each keeps what it holds, tribute to us, or bought peace; each term has a price to the enemy, and they accept once their weariness plus how badly the war goes for them outweighs it (never in the first three months). The enemy sues for peace when tired and dictates terms when winning: a victor keeps one prize (never a great city unless it was a rout) and may demand tribute. Peace brings a three-year truce. Unanswered, the crown fights when attacked, takes an offered peace and stays out of a friend's war.
- War weariness: unrest rises the longer the realm is at war (up to +10), and the burghers sour while trade with the enemy is shut.

## Trade, gold and a busier realm (M11)
All numbers are in data/trade.json, data/gold.json, data/buildings.json and data/layout.json.

### Crown trade routes
- Between two towns or cities: ours, or a neighbour's (one end must be ours) once that realm's relation is 20 or more, it trades with us and we are not at war. Opened from a town's card or Trade and gold in the menu, for 400 crowns plus 0.8 a unit of road; 12 crowns a month to run.
- A month's takings = 0.0038 x the square root of both towns' people x their fortunes (average prosperity / 55) x the haul (road length / 350, from 0.6 to 1.6) x wares (1.3 if they make different things, 0.75 if the same; a foreign town always counts as different) x road safety (1 less 0.9% per point of the worst threat along the way, at least a quarter) x relation abroad (the border-trade factor, x1.25) x a quarter more for each market hall at either end and the harbour and guildhall bonuses, divided by the square root of how many routes share each end.
- Bandits rob a month's takings with a chance of 30% x (1 - safety). An occupied end, or war with the far end's realm, closes the route.
- The crown runs 2 routes, plus one for every two market halls, one for each guildhall and harbour, plus one under free guilds and minus one under a guild monopoly, up to 8.
- Each route is a ledger line, a gold thread along the road on the map, and crown caravans in proportion to its takings (their merchants see abroad like any Temerian merchant).

### Gold
- Seams (data/gold.json): the Carreras seam (9,000 crowns), Zavada spur (5,000), the Klamat reef by Razwan (7,000), Tukaj diggings by Petrelsteyn (6,000) and Rissberg workings (4,000), all known; the Napeys vein (8,000) and the Dregsdon lode (6,000), hidden.
- Prospecting from the card of a place within 100 units of hills or mountains: 300 crowns, 60 days; a hidden seam there is found seven times in ten (otherwise the prospectors may try again); where there is none, they say so and are not sent again.
- A gold mine yields 60 crowns a month (a lord takes his share in his lands) until less than a third is left, then less and less (never under a tenth), until the seam is worked out.
- Side effects: 0.4% more people a month at the mine (three in ten of them dwarves); +20 bandit threat within 70 units; each working mine makes greedy neighbours greedier; each mine within 170 of Mahakam costs 8 relation with it.

### New buildings
- Harbour (on a river, the lake or the sea; Gors Velen, Anchor and Acorn Bay count as ports): food from the water, trade, customs on navigable water, route value, one more route.
- Warehouse: stores 200 more timber, stone and iron; surplus sells for a quarter more.
- Smithy: soldiers here cost 30% less to keep; uses iron. Armoury (needs a smithy): its garrison fights 30% harder, and armies raised while it stands fight 5% harder (up to 30%); uses iron.
- Tannery (where food is grown) and brewery: coin from local produce; a little unrest.
- Inn (at a crossroads of three roads): coin, trade, sight 30 further, busier roads.
- Bathhouse, hospice of Melitele and sewers (needs paved streets): plague spreads less and kills fewer; the hospice pleases Melitele's clergy and draws her faithful.
- Cathedral of the Eternal Fire (cities): +0.4 Authority a month, less unrest, more tension and more of the Fire; pleases its clergy, displeases elves and dwarves.
- Guildhall (needs a market hall): one more route, better routes, pleases the burghers.
- Dwarven bank (cities with 300 dwarves): the bankers lend 3,000 more and charge a quarter less interest.
- Barracks: 40% more crown soldiers kept here at the ordinary pay.
- Paved streets: prosperity, a little less plague, faster carts.
- Places hold villages 5, castles 5, temples 3, towns 8, cities 12 buildings.

### The map as a living place
- Each settlement's layout (src/render/layout.js) is planned from the game's seed: a landmark (keep, hall, chapel, temple) at the heart; houses in rings round it, more as the people grow (a city from 12 up to 44), spilling outside the walls once the heart is full; buildings by kind (core, edge, by a road, on the river, on the water, towards the hills, the forest or the gold seam); fields as patchwork in a ring outside, pastures for villages; walls round the whole. Nothing is placed on a road, a river, the lake, the sea, or nearer another settlement than its own. Pieces are drawn back to front.
- Up close (2 screen pixels per map unit or more) the whole layout shows; further off, a compact cluster round the settlement's marker. Close enough (2.8), smoke rises from chimneys and smithies, workers walk to the fields, mines and quays, beasts graze, boats bob, builders work on scaffolding. Life follows game time, so a paused realm holds still.
- Fields are green in spring, ripening in summer, gold at harvest and bare in winter, with snow on roofs and fields from December to February.
- Each layout is drawn once into its own canvas, and again only when a building, the population step, the season or the zoom step changes. Everything is drawn through the sprite registry ('structure' and 'life'), ready for painted art.

## A working economy (M12)
All numbers are in data/economy.json, data/industry.json, data/buildings.json and data/military.json. Design choices not settled by the brief are marked (choice).

### The scale of the crown's money
- Taxes a head a month by kind of place: city 0.009, town 0.008, village 0.006, castle 0.0055, temple 0.003, times a fortunes factor (0.3 + 0.014 x prosperity: 1.0 at 50, 1.2 at 65), times the tax law, plus 8% for a market hall, 10% for a guildhall and 10% for a merchants' quarter. Calibrated so the untended realm's taxes start where they did (about 500).
- Crafts earn their value (market 30, workshop 35, tannery 30, brewery 34, inn 28, harbour 20, smithy 12, guildhall 22, fishery 30, alchemist 45, hunters' lodge 40) x 0.8 in a village, 1 in a town, 1.3 in a city, x the place's fortunes. Each further building of the same craft in the realm cuts every one's takings: 1 / (1 + 0.07 x (count - 1)) (choice: so that filling every slot with one trade is not a money machine).
- Gold mines yield 150 a month at their peak; seams are two and a half times larger so they last as long as before. A gold mine costs 3,000.
- Patrols cost 6 plus 0.22 a unit of road they ride (a short patrol about 20, a long one about 50), less 10% for each horse stud (to 70%).
- Debt interest is 1% a month. Debt still drains Authority, and now also raises unrest in every crown town in proportion to how near the bankers' limit it is (up to +10 at the limit) (choice: with interest halved, debt alone no longer threatened a spendthrift crown).

### Production chains
- Makers: sheep pastures (villages and towns on open land or hills) 55 wool; salt pans (Anchor, Acorn Bay, Gors Velen) 38 salt; horse studs (Cleves, Old Bottoms, Brenna, Carcano, Vidort, Mortara) 13 horses.
- Workers, in order: charcoal burners (near forest, or where timber is cut) turn 45 timber into charcoal; weaponsmiths (on a smithy) turn 0.6 iron and 1 charcoal into each of 22 arms; weavers' halls (towns and cities) turn 60 wool into cloth; rye distilleries (food villages and towns) turn 2 measures of spare grain (beyond 60 days' stores, from anywhere in the realm) into each of 28 rye spirit. All amounts scale with the place's fortunes.
- Goods are pooled realm-wide each month (choice: simplest that still makes carts run from maker to worker). Suppliers are credited the raw price of what the workers take.
- Each crown route carries up to 30 units of finished goods (cloth, spirit, arms, salt, horses) that one end lacks: a home town lacks a good when it has no building making it; a foreign realm lacks what data/industry.json `abroadMakes` does not list for it. The route earns 30% of the goods' price on top at home, 60% abroad. The rest sells at home at full price up to the realm's demand (people x a per-good share), and at half price beyond it.
- Prices: wool 0.6, charcoal 1.1, cloth 1.6, spirit 2.2, arms 4 (+25% for every neighbouring realm at war), salt 1.5, horses 5.
- Salt pans let every store in the realm hold 6% more food each (up to 18%). Horse studs make patrols cheaper. Hunters' lodges cut monster threat by 12 within 90 units.

### The trades that pay directly
- Silver mines (Vorune, Napeys, Razwan, Houtborg, Flotsam): 62 a month, for ever (choice: steadier and smaller than gold, with no seam to run out).
- Toll bridges (the White Bridge, and Devil's Ford at La Valette): road links that cross the Pontar are found from the map and given to the nearest toll site. Each month a bridge counts the caravans crossing: 5 local carts, 0.45 for every crown of trade with the realms beyond (Redania at Devil's Ford; Kaedwen and Aedirn at the White Bridge), and 0.12 for every crown a crown route earns if its road crosses there. Each pays 2.5.
- Merchants' quarter (cities): rents of 0.0045 a head x fortunes, so they grow with the city.
- Pilgrims' hostel (the Temple of Melitele): 30 + 100 x Melitele's share of the realm's faith.
- Shipyard (Gors Velen): 70 a month in contracts, routes from Gors Velen worth 20% more, 20 more in customs.
- Alchemist's workshop (towns and cities): potions sold as a craft; angers the Eternal Fire's clergy.

### Showing the money
- The Ledger is now the Treasury: a line for every source (taxes, market trade, surplus timber, stone and iron, border trade, customs, each craft by building, each good from the chains, gold, silver, tolls, rents, donations, shipyard contracts, each crown route, conquests, tribute) and every cost, the places that earned most and those that cost more than they earned.
- Every place keeps last month's account: what it earned the crown (its taxes, trade, crafts, goods, tolls and the rest, after the lords' share) and what it cost (garrison, upkeep, its share of routes). Its card says so.
- The first time the treasury goes into the red, a hint explains the cost of debt with a button that opens the Treasury.
- Goods carts on the map follow last month's flows, from pasture to weavers, from burners to forges, from workshop to the head of the route that carries the goods (cosmetic).

## Ambient units
Spawned and steered by the simulation layer (cosmetic only in v1, separate RNG). Kinds and what drives their numbers:
- Merchant caravans: trade volume between settlements.
- Grain carts: harvest and food flows towards cities.
- Patrols: garrison funding and patrol routes.
- Tax collectors: monthly, from towns to Vizima.
- Pilgrims: faith activity, travelling to the Temple of Melitele.
- Refugees: unrest, famine or plague, moving away from trouble.
- River barges: on the Pontar and Ismena.
- Goods carts: last month's flows along the production chains.
Units move along the road network (or rivers for barges), at speeds affected by season. Tapping one shows a small label of what it is and where it's going.

## UI
- Top bar: date and season, speed controls, treasury, granary, Authority, Stability.
- Tap a settlement: card with population, peoples, faith, prosperity, unrest, production, garrison, holder, buildings.
- Menus: Realm overview, Laws, Faith and Peoples, Nobles, Military, Chronicle (dispatch log).
- Portrait: map fills the screen, panels as bottom sheets. Landscape: map with a side panel.
- Parchment and ink look for the placeholder UI. Light and dark themes not needed in v1; one dark parchment theme.

## Save
- Autosave to localStorage every in-game month, plus manual save, export and import as JSON. Versioned save schema.
