# Northern Wars: Kingdom of Temeria (v1 design)

## Fantasy
You are the crown of Temeria. You never place buildings tile by tile or march individual soldiers. Since M20 you do not build at all: the kingdom is already built, as the North is, and the crown's work is to keep it standing and to choose where its hands go. You set laws, fund projects, appoint and manage lords, balance faiths and peoples, and respond to crises. Underneath you the kingdom visibly lives: carts on the roads, patrols, pilgrims, refugees, barges on the rivers.

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
- Layers: sea and the lands of the North (the eleven realms we deal with muted and named, the lands beyond lighter with dashed borders); Temeria outline; terrain zones (marsh, forest, hills, mountains; Temeria's clipped to its outline, foreign ones to the land); rivers and lakes; roads (from the roads edge list); settlements; ambient units; labels. Since M15 the static layers are painted once into cached tiles (see "The North retraced (M15 B)").
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
- Works: what each place has comes from the land it stands on (see "One map, a kingdom already built (M20)"). The crown repairs them; it no longer builds.
- Trade traffic between settlements is shown as caravans; volume reflects prosperity and road safety.

#### As built in M2
- Stockpiles are per settlement (food, timber, stone, iron); coin goes straight to the treasury. The top bar Granary is the realm's total food.
- One measure of food feeds a hundred people for a day. Each settlement farms the ground around it (terrain within reach changes the yield); cities cannot feed themselves and depend on grain shipped from villages.
- Grain moves through one realm-wide market (no road distances yet), losing 5% on the way.
- Debt: the dwarven banking houses lend up to a credit limit at 2% a month. Every thousand crowns owed costs Authority each month (the lords' faith in the crown); past the limit, garrisons go unpaid, unrest rises and soldiers desert. When the great houses arrive (M5), debt should also lower their loyalty directly.
- All numbers are in data/economy.json and data/buildings.json. `node tools/balance.mjs [years] [idle|builder|borrower]` shows how they play out.

### Laws and edicts
Around 12 to 15 laws in categories, each with options. Changing a law costs Authority and coin, takes effect over time, and pleases or angers specific groups (nobles, burghers, peasants, clergy of each faith, each non-human people). Examples:
- Taxation: light, standard, heavy (since M21, three settings by estate in the Treasury: towns, villages and lords).
- Conscription: none, seasonal levy, standing muster.
- Public order: town watch, curfews, martial law.
- Non-human rights: equal charter, quarters and restrictions, expulsion.
- Faith: tolerance, Eternal Fire patronage, Melitele patronage.
- Guild charters, road corvee labour, grain price controls, monster bounties (witcher contracts), registration of mages, noble tax privileges.

#### As built in M3
- Fourteen laws (since M21 the two tax laws are three tax settings by estate): taxation, noble tax privileges, guild charters, grain prices, road corvee, conscription, public order, the royal court, monster bounties, registration of mages, faith of the crown, non-human rights, the Old Ways, poor relief.
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
- Patrols: one per 400 crown soldiers, 40 crowns a month each; +60 strength and -20 bandit / -5 monster threat for every settlement on the road. (Replaced in M13: patrols are companies on Patrol orders.)
- Threat (0 to 100): bandits = 10 + 0.5 per point of prosperity below 50 + 0.3 x unrest + wild country within 60 units (forest or marsh +15, hills +10); monsters = 5 + marsh 30, forest 20, mountains 20, hills 10, minus 15 with witcher bounties. Cleared threats are cut by 80% for the time bought.
- Each month every threat strikes with chance 8% x level/100; the raiders' strength is level x 4 x (0.5 to 1.5) against the garrison (x1.5 behind walls) plus any patrol. (Replaced in M13: threat levels breed camps and lairs, whose bands make the raids.)
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
- No armies, wars or treaties yet. (Since M17 envoys give way to rulers' own requests for audiences, and the relation is a ruler's mood, the sum of its reasons; see "Audiences with rulers (M17)".)

## The wider North (M8)
- The world (geography.bounds) reaches beyond Temeria to each neighbour's extent. Temeria keeps its own coordinates; foreign places, roads and terrain are tagged with their realm and never touch Temerian rules.
- Living realms (data/realms.json) under lighter rules: each foreign settlement grows (0.12% a month, more with food buildings), pays taxes and garrisons, and its realm raises one building at a time in its own order of preference. Incidents (fire, raids, sickness, fairs, harvests) touch prosperity and people. A realm's prosperity scales its trade with Temeria (0.6x to 1.5x).
- Fog of war, kept as cosmetic state in state.ambient (explored 20-unit grid cells, and each foreign settlement as last seen). Sight: Temerian towns (village 40 to castle 85, a Watchtower 130), +40 on patrolled roads, Temerian merchants abroad 45, an embassy 170 round a foreign capital, friendly realms (stance friendly, relation 40+) share 70 round their towns, true allies (75+) and a spy in place show the whole realm.
- Embassy: 250 crowns and 20 a month, refused below relation -30 and by Brokilon. Spy: 200 crowns, 120 days, one in four caught (relation -15).
- News of foreign incidents reaches the chronicle only through an embassy, a spy, a friend or open trade.

## The North retraced (M15 B)
- The map of the North is traced from an atlas (data/north-geography.json, kept unchanged; `node tools/north.mjs` builds data/geography.json and data/north-ids.json from it). Temeria itself, its towns, roads, terrain and rivers are untouched.
- 24 lands. The eleven realms we deal with (Redania, Kaedwen, Aedirn, Mahakam, Cidaris, Kerack, Brokilon, Verden, Brugge, Sodden, Cintra) take their traced outlines. The other thirteen (Kovir, Poviss, Hengfors, Lyria and Rivia, Dol Blathanna, Angren, Nazair, Mag Turga, Toussaint, Tir Tochair, Metinna, Korath, Skellige) are named "lands beyond": drawn, named and reached by road, with their 27 towns marked, but no realm of ours to deal with yet.
- Terrain abroad replaces the invented ranges and woods: 11 forests, 14 ranges, hills and marsh; 19 rivers (the old straight Pontar and Yaruga lines go) and the lakes.
- 65 traced towns in the eleven realms replace the invented ones. A capital keeps its id (Tretogor, Ard Carraigh, Vengerberg, Mount Carbon, Duen Canell, Cidaris, Kerack, Brugge, Cintra; Verden's seat moves to Hamm and Sodden's to Kagen under their old ids); every other old town maps to its nearest new town in the same realm.
- Roads abroad: within each realm a spanning tree plus each town's two or three nearest, and roads across every border where realms touch; costs steer them round mountains (6 times dearer) and the sea, and they cross rivers near towns. The old border crossings into Temeria keep their Temerian ends.
- The same rules abroad. Foreign towns read their ground from the terrain round them: villages by woods cut timber, in hills quarry stone, in mountains mine iron, and each realm earns a share of its tax by the ground it works (forest 10%, hills 15%, mountains 20%, marsh 2%). Hill and mountain towns can strike gold (0.4% a month, 80 a month for ten years). Foreign wild country breeds its own bandit camps and monster lairs (at most ten at once, half Temeria's chance): they take prosperity from the town they prey on, and that realm's soldiers clear them in time, sooner with a strong garrison. They are theirs to deal with: the crown's companies and witchers do not cross the border after them. Sight does not model terrain, so it is unchanged.
- Save version 13: an old save's foreign towns, buildings, owners, sieges, routes, embassies' memories, armies and ledger lines move to the new ids; armies on the march stop where they are and take new orders.

### Terrain art
- Forests as massed trees with darker edges, ranges as shaded peaks sized by the range (snow on the great ones), hills as mounds, marsh as reeds and pools, rivers that taper from source to mouth with their names set along the curve, lakes with a shoreline and a highlight. Scatter is seeded, so the same tree stands in the same place every time. Terrain stays visible under the fog of war.
- Level of detail by zoom: far out only the ranges, great forests and main rivers are named; marks thin out. The painted map is cut into 256-pixel tiles at six resolutions, painted a few per frame with a coarser tile standing in until the fine one is ready, and kept in a cache that grows to twice what one view needs. Panning across the whole North on a slowed CPU takes about a millisecond a frame.

## Audiences with rulers (M17)
Diplomacy as meetings with people. No story or scripted dialogue: rulers speak in short plain lines built from the simulation. Numbers live in data/diplomacy.json.

### The audience
- A full-screen meeting with a ruler, opened from the rulers' portraits on the Diplomacy tab, a realm card, a request in the Court inbox, or a long press on their capital. It pauses the realm while it lasts. Upright, the ruler fills the top half and four large buttons (Trade, Diplomacy, Alliance, War) the bottom; held flat, the ruler sits on the left. Back returns to the four buttons; the cross ends the audience where the player was.
- The ruler: portrait, name, realm, traits and agenda; mood as one word and the relation number, with the reasons behind it and their weights (their old view, our stance, the laws they care about, our towns of theirs, their agenda, treaties in force, trade between us, tolls, our armies near their border, wars fought, and remembered dealings that fade over two years or so); and trust.
- Portraits go through the sprite registry as portrait:<ruler id>. The placeholder is drawn from the realm's colours, a crown (or circlet, or none for the Sodden council) and the realm's emblem; painted portraits can be registered later with no code changes.
- Parties are whoever has a ruler in data/diplomacy.json, not the list of realms: lands beyond and powers without land can be given rulers and use the same screen.

### Rulers
- Traits: greedy (coin and goods count for more), honourable (keeps its word; minds broken treaties half as much again), ambitious (wants land, dislikes being bound, bends less), cautious (values safety, bends more to strength), opportunist (counts obligations lightly and breaks pacts when they stop paying), zealous (laws and faith it cares about count half as much again).
- Agendas: secure the borders (Mahakam, Brokilon, Brugge), grow trade (Aedirn, Cidaris, Kerack), take a town (Kaedwen wants Vergen, Cintra wants Dillingen), spread a faith (Redania the Eternal Fire, Sodden Melitele), crush the Scoia'tael (Verden). Each changes what they value and what moves their mood.
- Trust (0 to 100, starting at 50) is a lasting memory of whether Temeria keeps its word, separate from mood: deals honoured (+3) and treaties run to their end (+6) build it; deliveries that fall short (−6), broken deals (−15) and broken treaties (−20 to −50 with that ruler, −4 to −10 with every other) destroy it; a war declared without a reason costs 10 with everyone. It drifts back to the middle by 1% a month. Every treaty needs a minimum of trust (30 to 60); below it the ruler refuses and names the wrong ("Henselt refuses: Kaedwen does not trust us after we broke our defensive pact").

### Trade: the deal table
- Two columns, We offer and They offer. Items: crowns as a lump sum or monthly for a set time; goods by the month (grain, timber, stone, iron, cloth, rye spirit, arms, horses, salt); a trade route between named towns (opened free of the usual cost); what our or their watchers see; passage for armies; an embassy; a town (rare: valued at 160 crowns a point of its worth, three times that for a capital, which is never given up outside a peace).
- The ruler values every item in crowns by their own temper and needs (a realm that makes a good wants little of it; a poor realm values coin more; our promises of future payments count for less when trust is low) and adds goodwill from mood and trust (up to 300). The verdict is shown live: Acceptable (worth it to them), Close (within 15% or 80 crowns), They want more (within 60% or 300) or Insulting. The crown also sees what the deal is worth to us.
- What would they accept? builds a counter-offer from what they value most and the crown can afford: things they need that cost us little first (sight, an embassy, goods they lack that we hold), then crowns to close the gap; if the crown cannot pay, it asks for less from them instead. Hear their proposal lays out the ruler's own offer, built from their agenda and needs.
- Agreed deals are carried out by the simulation: lump sums, towns, embassies, routes and treaties at once; monthly payments and deliveries each month in the ledger (a Deals line each way, and the goods delivered listed under the month); caravans under treaty run between Vizima and their capital while goods move. A delivery the crown cannot make falls short (trust −6); twice, and the deal is broken.

### Diplomacy
- Stance (the three of old), a gift (100, 250 or 500 crowns; mood +5, +10 or +16, half as much again for the greedy; one every two months), an embassy and a spy (as before), exchanging or asking for intelligence (through the deal table), denouncing them (mood −20 with them, +8 with their enemies; twice a year at most), demanding tribute (a sum by their strength, for a year), and asking them to stop massing troops on our border, sheltering raiders (they clear the camps near our border and send no raiders for a year) or taxing our caravans.
- Demands and asks succeed by fear: our strength against theirs (times 40), plus their mood and trust, plus or minus temper, against the cost of what is asked. Greedy and opportunist rulers lay tolls on our caravans when their mood falls below −10 (our trade with them falls by a fifth).

### Alliances and treaties
- Non-aggression pact (5 years): neither makes war on the other. Trade pact (5 years): trade a quarter higher. Defensive pact (10 years): each joins the other's war if the other is attacked. Full alliance (10 years): each joins the other's wars and shares what it sees. Military access (2 years): one side's armies may pass. Protectorate (10 years): Kerack, Cidaris, Verden or Brugge places itself under our protection and pays 40 crowns a month; we must defend it.
- Each has a minimum mood and trust, a mood bonus while in force, and a price for breaking it. Calls to arms now follow treaties, not the old friendly-enough rule: a partner attacked calls us (to refuse is to break the treaty), and our partners join our defence by temper (95% for the honourable, 50% for opportunists, less if they no longer trust us) or break their word.
- The foreign realms make and break pacts among themselves by the same values: rivals, or a realm that fears another, sign non-aggression pacts; friends with a pact sign trade pacts; those in danger sign defensive pacts and alliances. Opportunists break pacts when they stop paying, others when old quarrels return; a rival bound by a pact keeps the peace unless an opportunist decides otherwise. The Diplomacy tab's Pacts screen draws the web of pacts and wars across the North.

### War
- War is declared with a reason: a border claim (they hold our towns; no Authority), a broken treaty (half), defending an ally or protectorate (we join their war; half), refused terms (half), or none (full cost, and every court trusts us less). Declaring ends every treaty with them, broken by us.
- Terms before war: demand they pay, cede a town or break a treaty with a third realm, or face war. They yield by fear; refused, the crown has a cause for three months.
- Peace terms use the deal table: each keeps what it holds, or every town handed back, with crowns, tribute and towns either way, weighed by the same war-weariness as before.

### Rulers who act
- Rulers request audiences with real proposals, about one in fourteen a month each: a deal of their own devising (by their agenda: trade pacts, non-aggression, defensive pacts, protectorates, goods for crowns), a demand when they are hostile and stronger (crowns, or the town they want, or else), or a warning when our armies crowd their border. Requests wait in the Court inbox and the Diplomacy tab's Audiences, can be accepted, refused or bargained over at the deal table, and lapse after 30 days. They replace the random envoys.
- Save version 14: old saves keep their stances; a friendly stance with a true ally (relation 75 or more) becomes a defensive pact for five years; trust starts from the relation; envoys still waiting take their default answer.

## Wealth, hands and armies (M21)
A crown should feel rich or poor through its own choices, raise a real army when it decides on war, pay for it, and beat ordinary threats while still fearing a real war. Fewer figures on screen, each tied to something the player can do.

### Trade in five goods (M21 A)
Numbers live in data/market.json; the rules in src/sim/market.js.
- The player trades five goods: **Grain**, **Timber and stone**, **Iron and arms**, **Cloth** (wool and cloth) and **Luxuries** (rye spirit, salt and horses; silver pays the crown directly). The underlying goods (food, timber, stone and iron in the stores, the industry's wool, cloth, charcoal, spirit, salt, arms and horses) still drive production; they roll up into the five in loads, each worth about the good's base price.
- Each good has a monthly balance: what the realm made against what it used (grain: a year's harvest against a year's eating, a month's worth). It shows as one line ("Iron and arms: short 40 a month"). The price at home rises with a shortage and falls with a glut (up to 1.8 times or down to 0.6 times the base), eased month to month.
- **Deals**: one per partner realm, saying what Temeria sells (a good the partner wants) and buys (a good it offers), so many loads a month, up to what the partner's people can take or supply. Each partner wants two goods and offers two, drawn from its own works; war makes it want iron and arms, worn fields make it want grain. Deals are made from the board's Trade order (sent at the turn of the month) or from the realm's card (agreed at once). A good sold abroad fetches 1.25 times its base price; a good bought costs 0.85 times. Bought grain, timber, stone and iron go into the stores; bought cloth and luxuries sell on at home, at the full home price while the realm is short.
- **Home sales**: what is left of each surplus at the end of the month (timber, stone and iron beyond what the stores hold, grain beyond what the granaries can keep, the industry's goods beyond what the realm wants) sells at home for 0.6 of the home price, so a surplus always earns something. One toggle per good holds it back instead (iron kept for a war): held goods stay in store.
- War, closed borders (relations below 10) or a fallen partner cut a deal; whatever it supplied is a quarter dearer for three months.
- The routes, carts and tolls stay underneath, but the player no longer opens routes one by one.

### More ways to make money (M21 B)
- **Taxes by estate**, three settings in the Treasury, each Light, Fair or Heavy, with the crowns each would bring in shown before choosing. They are decreed like laws (3 Authority, a month to take hold) and replace the old Taxation and Noble privilege laws.
  - Towns: the head tax in cities and towns and their market dues. Heavy angers the burghers and stirs the towns; Light pleases them and lets the towns grow richer.
  - Villages: the hearth tax in villages, castles and temples and a tithe of the month's harvest at the grain price (most at harvest). Heavy angers the peasants, stirs the villages and slows growth.
  - Lords: each great house pays a due of 40 crowns plus 0.02 a head for its lands; Light is 0.4 of that, Heavy twice. Heavy angers the nobles, which lowers the houses' loyalty.
- Surplus sold at home and trade deals are the main merchant income. Tolls and river dues stay.
- **War pays**: loot from a sack, a stormed town or plunder, ransoms (a realm buys back a commander we hold after a month, if it can pay, or at the deal table), coin in peace terms and tribute month by month, and requisition from occupied towns. Each comes in at once and shows as its own line on the month's ledger.
- **Loans** from the Vivaldi bank: 2,000, 5,000 or 10,000 crowns, repaid in 24 monthly payments with 1.2% a month of simple interest. The bank lends up to six months of income in all. A payment the treasury cannot meet is missed: the rate rises, the payment goes to the end, and the crown loses 3 Authority.
- **Crafts**: the crowding penalty for several works of the same craft is gentler (0.03 a work, from 0.07); a soft cap keeps the crafts together below 0.8 of the taxes and dues.

### Directing your people (M21 C)
- Labour is a front-line lever. The Realm tab's overview carries a strip with where the hands are (the largest shares) and the one most pressing shortage, with a tap to the Labour screen; the map's pressure strip names that shortage too.
- **At a stroke**: four one-tap splits on the Labour screen (data/labour.json `presets`): Harvest (fields and pastures), Winter (the woods, turf and the workshops), War footing (the mines, the smiths and the levies) and Rebuild (repairs). The + and − for each kind of work stay underneath.
- **A town's focus** (its card, Works): None, Food, Iron and arms, Cloth or Timber, offered where the town's district has works of that kind. The focus's kinds of work take 1.6 times their share of the district's hands (the town and the villages that lend it theirs); the rest give way.
- **More hands than a works needs** now work it harder: a works can take up to half as many hands again as it needs, for up to a quarter more (a field's extra hands count half). Only hands no other district needs go to this, so a preset or a focus that moves hands to a kind of work makes more of it.
- Every change shows its result before it is made, in the same place: "+120 iron, −60 grain a month", for the realm (presets) or the town and its villages (focus), worked out on a light copy of the realm.

### Armies of a real size (M21 D)
Numbers live in data/war.json `raise`; the rules in src/sim/armies.js.
- **The levy is a share of the people**, not of the garrisons: a city sends 8% of its people, a town 6%, a castle 5%, a village 4%, times the call (a third, half or all). Vizima sends about 1,440 at a full call, a town 150 to 500, a village 10 to 80. The men leave their places' hands while they are away (the works go short) and go back to work when the army is stood down. Garrisons stay in their towns.
- **Raising an army**: pick the muster on the map, the call, the lords and any mercenaries; the form shows the men, the hands that leave the works, the pay a month and the days to gather (the farthest place's road at 60 map units a day, at least three) before confirming. Until the levies are in, the army cannot march.
- **The lords' retinues**: each great house sends a tenth of its lands' people, all of it if its loyalty is 55 or more, half if lower, none below 30 (as before, a refusal). The form shows each house's likely men before calling them.
- **Mercenary companies**, hired for a season (90 days): the Free Company of Novigrad (600 men, not while at war with Redania), the Koviri Pikes (800) and the Grey Banner (400, only while a war is fresh). Dearer and better than levies (quality 1.25 to 1.4). When the season is out they leave.
- **Standing companies** stay the crown's best troops, and garrisons stay in their towns; walls still multiply a garrison's strength.
- **Pay**: levies 0.22 and retinues 0.28 a man a month, half as much again on campaign (beyond the realm, besieging or raiding); mercenaries 260 to 460 a month a company. An army the treasury cannot pay (below zero at the turn of the month) loses heart at once, and from its second month unpaid 12% of its men desert each month.
- The Military tab's Forces screen opens with one line: men under arms (garrisons, companies, the field), what they cost a month, and how many months the treasury could pay them.
- **Foreign realms** muster by the same shares of their people (half a call for the first army, then the rest), with their standing armies; their garrisons stay home.
- Save version 21: town focus empty; the crown's armies already in the field become levies of the people, their men returned to the garrisons they came from.

### Threats scaled to the realm (M21 E)
Numbers live in data/forces.json `threats`; the rules in src/sim/threats.js.
- **Threats grow with the realm, within bounds**: bandit camps, Scoia'tael commandos and raiding parties start and grow in proportion to the realm's people against the starting realm (about 54,000), between 0.7 and 1.3 of their old size.
- **And never past a cap**, so an ordinary threat is a nuisance any city's levy or standing company beats: a bandit camp at most 110 men, a commando 60, a raiding party 120 (300 when sent in war: those are for the armies). Beasts keep their own counts by kind.
- **Each threat shows its strength against the nearest force**, on its card and in the Threats list: "Bandit camp: about 45 men. Gors Velen's levy: 567, overwhelming odds." The force is the nearest free company or, failing one nearer, the levy of the nearest town, city or castle of ours at a full call (the odds count militia, so a levy must still be raised to use them).
- **Walls count in full** while they stand at a third or more (a breach undoes them): a garrison behind walls fights at 1.5 times its strength, as does every company stationed there (crossbows 1.8). A walled town beats off nearly every raid; villages have no walls and need patrols or a company near.
- Lists of threats longer than eight fold the rest under "N more".
- Save version 22: threats already on the map are cut to the new caps.

### Clearing the clutter (M21 F)
The rule for every screen: a card opens with three or four lines (status, chips, the one or two actions), then Details; any list longer than eight rows is grouped or folded. The audit, screen by screen:
- **Town card**: four chips, not five (the holder's chip only when a house holds the place, the garrison's otherwise; the other goes in the status line). The overview is three lines: what it produces and what it earned and cost; food for so many days; its works as pips and one line ("16 works, all in good repair") instead of sixteen names. The full stores table is under Details.
- **Treasury ledger**: one ledger of grouped lines. Income: taxes (with the towns, villages and lords beneath), trade deals, sales at home, crafts and mines, tolls and dues (customs, tolls, rents, donations and contracts as one line), war, loans. Expenses: armies and garrisons, upkeep of buildings, the court, goods bought abroad, loans and interest, and repairs and decrees (paid when ordered). The line by line breakdown is under Details.
- **Threat card**: one line with the threat's size against the nearest force; the size chip is gone.
- **Threats list**: eight rows, then "N more".
- **Already within the rule** (checked, unchanged): the Realm overview (meters, labour strip, what needs attention), Places (searchable, eight shown, then Show all), Labour (presets, then the split), Forces (one under-arms line, chips, companies), the company and army cards, Taxes and loans (one card per estate), Trade (one line per good), a realm's card (sections folded), Laws (one line per law), the Chronicle (grouped by year and filtered).

## One map, a kingdom already built (M20)
The crown does not build. Every realm starts the game fully developed, as the Witcher North is: towns already have their mills, mines, fisheries and markets, and what each place has comes from the land it stands on. The crown's levers are repairs after raids and war, where the kingdom's hands work through the seasons (Part C), laws, the court and war. Numbers live in data/spaces.json; the rules in src/sim/works.js.

### Spaces from the land
- Every settlement, Temerian and foreign, has a few spaces, each tagged by its land: coast, lake, river, plain, hills, forest, marsh, mountain; towns and cities add a town square, walled places and castles their defences, and a known gold deposit its seam. Most places have one to three spaces of land; cities up to four.
- `node tools/spaces.mjs` proposes them from the traced geography and writes data/spaces.json: a river within 35 map units gives a river space named for it; a lake within its outline plus 25 a lake space; a terrain zone within 45 a space of that terrain, named for the zone (the Jay Forest, the Tukaj Hills); the sea within 35 a coast space; open ground a plain space. The rules (`kinds`), the default works (`defaults`) and lore exceptions (`overrides`) are written by hand and kept when the tool is re-run.
- Temeria has no sea coast in the traced map, by design: no salt pans or shipyards of its own, and a reason to want Cidaris. (Gors Velen, Anchor and Acorn Bay still count as ports for routes and customs.)
- Each space holds one works, fixed at the start: plain (fields, horse stud, pasture), river (watermill, tannery, toll bridge, fishery), lake and coast (fishery, harbour, shipyard; salt pans on the coast), forest (lumber camp, charcoal burners, hunting lodge), hills and mountains (quarry, iron mine, silver mine, pasture), marsh (peat cutting, herbalists: new in M20), seam (gold mine). The town square holds a place's civic works as one space with a list (market hall, workshops, smithy, granary and shrine in a town; brewery, guildhall, bathhouse, paved streets and an inn more in a city). Defences hold walls, watchtower (on a border) and barracks.
- Starting works are the obvious ones for each kind of land, with lore exceptions: Vizima's royal mint (new in M20), dwarven bank, merchants' quarter and armoury, Maribor's watermill on the Ina and its weavers and distillery, Carreras's weaponsmiths, the toll bridges at White Bridge and La Valette, silver at Flotsam, Houtborg, Razwan, Vorune and Napeys, studs at Cleves and Old Bottoms, Mahakam's silver and iron, Cidaris's shipyard. Brokilon's dryads keep no works. Foreign realms get their spaces the same way, so they differ by their land, not by special rules.
- Gold deposits (M11) are seams: unique spaces whose old workings start flooded (condition 0) until the crown rebuilds the mine. A hidden seam shows as a space only once prospectors find it.

### Condition and damage
- Every works has a condition from 0 to 100. A works yields by the lower of its condition and its staffing (Part C): a brewery at 50 earns half, a market hall at 50 adds half its trade, ruined walls barely count. It costs at least 30% of its upkeep even in ruins, and since every works now stands from the start, the crown's upkeep runs at twice the old rate (`upkeepScale`; foreign realms pay the plain rate).
- Condition falls from: raids by bandits, monsters, Scoia'tael and raiders (12 to 36 off a works out in the fields or woods); armies foraging in enemy country; sieges (the camp tramples the fields, and the town's walls stand as the siege leaves them); the taking of a town and plunder; sacks (M19), which leave the four best works in ruins; winter storms on boats and quays; spring floods on the river works; fire in a crowded town square; and wear (0.45 a month for everything, 2.5 more while the crown cannot pay its bills). Cards and decisions say why ("Burned by bandits in July").
- A place's mood suffers with its ruins (works below 25) and with grudges from works the crown chose to leave.

### Repair, never build
- A works falling below 70 asks the crown at court (badged, toasted, but never pausing the game): Rebuild it (whole again; costs 35% of its old price for what is missing, with timber, stone and iron from the realm's stocks or bought in dearer; takes weeks; yields nothing while the masons work), Patch it up (12% of the old price for what is missing, and a quarter of the time; back about half way, working throughout; may give way again under the strain of winter), or Leave it (nothing spent; the place goes without, its unrest rises by 3 and it holds a grudge that fades over a year). Each choice shows its cost, time, hands and result before it is taken. Unanswered after 30 days, the works is left. A works once left is asked about again only after it has fallen 25 further.
- The town card's Works tab shows each space, what stands in it, its condition and why, and repairs under way; any worn works can be mended from there at any time. The overview shows the works as pips.
- Four crews mend at once (from Part C, the Repairs share of the kingdom's hands); the rest wait their turn.
- An idle crown watches its kingdom decay: after ten years its works stand at about a third and its income has fallen by two fifths; by year 20 everything is in ruins and by year 30 it is in debt.

### Labour through the seasons (M20 C)
Numbers live in data/labour.json; the rules in src/sim/labour.js.
- Each settlement's hands are three in ten of its people, less any men away with an army. Villages within a day's walk by road (110 map units) lend theirs to the nearest town or city, so a town's works are staffed by its hinterland (eleven villages lend, Murky Waters and White Orchard to Vizima among them).
- The crown splits the kingdom's hands by kind of work, in a hundred: fields 47, woods and turf 7, mines and quarries 7, pastures 3, fishing 4, crafts and trades 22, repairs 4, levies 6 to begin with. Each district mans its own works first, kind by kind, in proportion to what each needs; then hands to spare go to districts that are short, at 85% for the walk (the city folk who go out to the villages at harvest). A works on a card can be pinned to be manned first ("keep it fully manned").
- What each works needs (data/labour.json `need`) is set so the opening split mans the fields, crafts and mines at about 95%: hands are never quite enough for everything. Each place's own ground needs hands for its harvest too (the farm need), and its harvest is 30% (the old and the young) plus 70% times how well its fields are manned.
- The seasons: fields need hands from March to the end of October and none after first frost; pastures half as many again at the April and May shearing; fishing all year, but winter storms and ice close the water for 10 to 25 days, a third of winter months; mines, crafts and woods all year.
- Royal calls: the **harvest muster** (July to October, 42 days: the fields take three quarters of the hands and bring the harvest in up to 15% fuller; mines, crafts and repairs go short; unrest +4); **the winter turn** (a standing order: from first frost to March the field hands go half to the woods and turf, a fifth to the boats, the rest to the workshops); **raise the levies** (90 days, 300 crowns, unrest +3: a quarter of the hands under arms, garrisons filling towards twice their size, the works short).
- Fuel is a new stock: wood, charcoal and turf, in units that warm a hundred people for a winter month, cut by the woods hands (most at lumber camps, peat cuttings and charcoal clamps, less gathering elsewhere) and burned from November to March (half in November and March). With sound works and the opening split the woods cover a normal winter; ruined camps, levies or a shrunken woods share leave the woodpiles empty, and cold months bring unrest everywhere and deaths among the poorest four places in ten. The winter turn is the margin.
- Repairs: each 160 Repairs hands is a crew, and each crew mends one works at a time.
- The Labour screen (Realm, Labour): the year with this month marked, the fields' months and first frost; the grain the realm will hold at first frost (no more than its stores can keep) against what November to February will eat; fuel in store against a winter's burning; each kind of work with its hands, its need and a line on its season, with + and − to move five in a hundred; and the three calls. Kinds short of hands, or standing idle out of season, are flagged.
- Save version 18: the opening split, the winter turn not yet called, and a month and a half of fuel.

### One map, two levels (M20 D)
The rules in src/render/board.js and src/sim/board.js.
- One camera. Pulled back past about two thirds of the opening zoom, the kingdom view cross-fades into the board of the North: fully the kingdom at 0.76 of the opening zoom and above, fully the board at 0.56 and below (`BOARD` in src/render/board.js). The tiled land stays underneath both; towns, roads, people and armies fade out as the board fades in.
- The kingdom view, up close: each Temerian place carries a pip for each of its works (up to ten): green when sound and manned, blue when short of hands, red below half its condition, amber while being mended; its card shows its land tags, the hands within a day's walk, and each works' condition and staffing. The top bar shows the meters, date, season and one line of seasonal pressure (first frost, grain and fuel for winter), which opens the Labour screen.
- The board, far off, is a light overlay on a canvas of its own: each realm tinted in its colours over its land and named large; a marker on its seat with its men in hundreds (garrisons, standing army and armies in the field; a question mark where the crown has no eyes) and five pips for its works (red for the share worn or ruined); thin routes between neighbours (shared borders and the foreign roads); armies marching from one realm into another as dashed lines with an arrow. Names that would cover a marker or another name move above or below their marker, shrink, or wait for a closer zoom.
- The board's top bar reads "The North", the month and "2 of 3 orders set", and opens the month's orders.
- Tapping a realm opens its short card; tapping Temeria, or a double tap on any realm, glides back into the kingdom view. Zooming in does the same.
- Frames: on the board the hidden settlement layer is not redrawn, so a pan across the board on a CPU four times slower fits in a sixtieth of a second.

### Orders on the board (M20 E)
- Three orders a month, each for a realm: **March** (a Temerian army into a realm we are at war with, or have leave to cross, on its nearest town by road), **Trade** (send one good for another, a month's worth each way for six months, if the ruler agrees or names terms close enough) and **Envoy** (relations warm a little, and an audience waits at their court for twenty days, in the Court inbox). One of each kind per realm.
- Orders wait until the turn of the month and go out together with the rulers' own moves. The month's orders screen lists what is set (each can be withdrawn), what came of last month's, and what the rulers did at its turn (marches and wars declared).
- No rule changes: a march is the existing siege order, a trade the existing deal table, so armies, battles and deals behave as before.
- Save version 19: an empty set of orders.

### Conquest under M20
- A captured town comes with its spaces and their condition. Occupation stops its works for its owner and lets the occupier requisition; a sacked town's works stand in ruins; an annexed town is mended like any other, and mending what war broke there (not merely holding it) wins it over.

### Save
- Version 17: every place gets its spaces; what it had built fills the space of its kind (a pasture takes the place of the fields), civic buildings join the town square, anything under construction is finished, ruins from M19 sacks stand again at 15, occupied towns' works are worn to 75.

## Conquest and battles (M19)
Towns that change hands now change realm for good, and what becomes of them is the crown's choice and the crown's problem. Numbers live in data/conquest.json; the rules in src/sim/lands.js (who rules what) and src/sim/conquest.js (what it costs).

### How towns change hands
- **Taken by force.** A village or any unwalled place falls to an army that holds it a day unopposed. Walled towns, cities and castles need a siege.
- **Occupied, not owned.** While the war lasts a captured town is only occupied. The occupier can requisition grain and coin from it (its people resent it, and remember), but cannot build in it or grant it. On the map it is drawn with the occupier's colour hatched over the owner's.
- **Ownership changes only by:** a peace that leaves the town with its taker (each keeps what it holds, or towns named in the terms); a sale or exchange at the deal table; a revolt that frees it; or a great house that turns its coat and takes its lands to a neighbour that courted it.
- **Annexation.** A town that becomes Temerian is a full crown settlement from then on: its people by kind (they keep their origin, so Bremervoord's people stay Cidarians), their faith, prosperity, stores, buildings (damaged ones stay damaged), garrison, roads and place on the map. It is governed, built in and taxed like any Temerian town. A Temerian town lost at a peace leaves the crown's lists the same way.
- **A realm that loses every town falls.** Its ruler flees into exile as a claimant, to the court most hostile to the conqueror. A capital still goes home at a peace (M18) unless its taker holds every town the realm had left. A small realm (four towns or fewer) may instead be offered vassalage at the peace table: it keeps its ruler and its towns, under our protection, and pays a quarter of its income.
- **Old saves.** Any foreign town still held after its war ended is annexed when the save is loaded, so a reign keeps what it won; a realm left with nothing falls.

### What to do with a town
- **On capture** the crown is asked once (a short card, the game paused): spare it (the default: no loot, the best start); sack it (plunder of coin and goods at once, prosperity crashes, its best buildings burn, an eighth of its people die or flee, it smoulders for six weeks, its people hate us, and the whole North's fear of us rises twice as fast); or drive out one people (its own folk, elves, dwarves or halflings). Those driven out take the road to their kin; the town loses their share of people and prosperity for years. Driving out elves feeds the Scoia'tael and pleases the Eternal Fire; their kin's realms remember it.
- **At the peace** the crown decides who holds each town gained: kept as crown demesne, or granted to a great house (whose loyalty rises, and the others' envy with it).
- **Settlers.** Once a town is ours, Temerian settlers can be paid to move there over a year: integration rises faster, but locals turned off their land side with the old crown.
- **Rebuilding.** What a sack burned can be rebuilt for half its cost, once the ruins stop smouldering.

### Integration
- Every conquered town has an integration from 0 to 100, shown as a bar on its card with the reasons it is rising or falling.
- It starts from how the town was taken (spared, sacked or a people driven out), how far its people and faith stand from Temeria's (Soddeners are near kin, the folk of Mahakam strangers), and how bloody the war was.
- It rises each month with time, a garrison, prosperity, what the crown builds there and tolerant laws; it falls with heavy taxes, martial law, harsh laws on its people or its faith, a claimant's agitation, and every sack or expulsion elsewhere.
- A town that has not taken to the crown pays less tax (a third of its due at nothing), sends fewer men to the levy and the garrison, and is more restless.
- Foreign rulers' conquests work the same way, more slowly; a realm still digesting sullen conquests leans to Consolidate rather than another war.

### Revolts
- A conquered town with low integration and high unrest may rise, more readily with a claimant stirring it. Its rebels (about a twentieth of its people) declare for their old crown. If they outnumber the garrison they hold the town and it stops paying.
- A rising can spread to nearby towns of the same people, and the old realm, if it still stands and is cold to us, may march to help.
- The crown can crush it (the odds are shown: the garrison, armies and companies near by, and a share of nearby garrisons, against the rebels; integration falls but the town is held), or treat with it (a charter and lighter taxes for three years; integration rises; Authority falls).
- An army standing in the town puts a rising down. A revolt that holds its town for a season frees it: the town returns to its old crown, raising a fallen realm again.

### Claimants
- An exiled ruler's legitimacy starts at 80 and fades each year, faster where the old lands take to their new masters (integration above 70). Below 5 the claim is given up.
- A claimant stirs their old towns (integration falls, risings come readier) and, with a willing host, may land with an exile army.
- The crown can pay a pension to renounce, send an agent to discredit them (it may be caught, which angers the host), or ask the host at the deal table to hand them over.

### Fear
- Each ruler keeps a Fear of a conqueror, apart from mood and trust. Every town taken raises it (larger towns more, sacks and expulsions twice over), most in the realms near by; it ebbs a point a month in peace. It shows on the Diplomacy tab and among each ruler's mood reasons.
- When the North's fear of Temeria runs high (35 on average), the most afraid swear a league: strike one and the rest join the war. When fear is extreme (65) and Temeria weakened (at war elsewhere, or stability under 45), the league may declare war together.
- Foreign rulers follow the same rules by their tempers: greedy and opportunist captains sack, zealous ones drive out elves, the rest spare; they annex, face risings and claimants, and fear one another.

### Battles you can watch (M19 C)
- When two hostile armies meet they fight over several days, one round a day: a skirmish of two days where archers and crossbows count most; the melee, where men-at-arms and knights decide it and levies break first; then rout and pursuit, where the victors' horse cut down the fleeing.
- Each round both sides lose men and spirit by their strength in the line (stance, marshal, morale, arms, quality), their troops (a crown army by its companies, a foreign one by its realm's custom), the ground (woods blunt horse and archers, hills favour the defender, marsh bogs cavalry) and the weather (rain on the bowstrings, snow). A side breaks when its spirit is spent or half its men are down.
- Each battle draws its fortune once, from the old odds (strength cubed against strength cubed), so over many battles the winner is as often the stronger side as the single roll had it; the odds shown on the Battle card are the captains' reckoning from the strengths and spirit they can see.
- A fifth of each army starts in reserve. Committing it (once the lines close) puts more men in the line: better odds, heavier losses. Sounding the retreat (at any time) gives up the field and saves what remains; the withdrawal costs more once the lines have closed, and more against horse. Foreign captains, and our marshals when not told otherwise, commit when bold or when the day turns, and a cautious captain losing badly withdraws.
- Events, one short line each: a volley that breaks a charge, a cavalry charge as the lines close, a flank turned by a skilled marshal, levies breaking, a commander wounded, killed or taken in the rout (captured commanders are ransomed at the deal table, or go home at a peace once held a year), rain on the bowstrings, an army joining from near by, the rout.
- When one of our armies gives battle the game drops to 1x so it can be watched, and goes back to its speed afterwards; a setting in Help pauses instead. A banner leads to the Battle card: both sides' men in the line and in reserve, their losses and spirit, a bar of who is winning, the events so far, and the two orders.

### Sieges (M19 C)
- Walls: none round a village (it falls to an army that holds it a day), timber round a town (35), stone round a city or castle (80), and 40 more where walls were built. Siege works wear them down day by day, stone at half the rate of timber.
- Food: a crown town's own stores against what it eats; abroad, by its kind and fortunes (a town about two months). When it runs out the garrison starves.
- The camp: sickness that grows with the weeks, and desertion when the men go unpaid. The garrison sallies against a thin camp, burning works. A relief army coming is seen.
- Starving, the defenders offer terms: the garrison marches out and the town is taken intact. The crown is asked (accepted if unanswered); foreign captains accept.
- The crown's orders: storm the walls (the odds and the likely dead shown, taken or thrown back at those odds), starve them out (the marshal will not storm unless told), or lift the siege. Captains storm by themselves when the odds suit their stance.

### Field attrition (M19 C)
- Armies lose men outside battle: to supply when far from a friendly town, to winter, to disease in a large army in the warm months, and to desertion when unpaid. The army card shows what the last month cost, by cause.
- Every battle and siege leaves a report in the Chronicle: the sides, the dead, the main turns of it and what was taken.

### On the map (M19 D)
- Borders follow the towns. Every patch of land belongs to the nearest town among those of the realm whose traced outline it lies in (src/sim/territory.js, a grid of 6-unit cells worked out once). At the start every border is the atlas's; when a town changes realm, the country round it changes with it, painted in its new realm's colour with the old border cleared and the new one smoothed. Won land is explored and in sight.
- A battle in progress is drawn where it is fought: both banners, figures clashing, each side's numbers, dust, arrows in the skirmish, the broken side fleeing. Tap it for the Battle card.
- A siege camp: tents by the besiegers' number, a ring of works, the walls drawn as they stand with gaps where they are breached, and smoke once they fall.
- Sacked towns smoulder for weeks; driven-out peoples walk the roads to their kin as refugee columns; a town in revolt flies the rebels' torn banners.
- A foreign town's card says what it would be worth to the crown: its people, the taxes and trade they would bring once they took to us, a gold seam or harbour, its buildings, and whether it has stone walls, timber or none (and so falls in a day).

### Save
- Version 16: lands, claimants and conquest records; towns held after ended wars are annexed.

## Rulers who govern (M18)
The foreign realms stop rolling dice and start governing. Each month every ruler looks at their realm, chooses what to do with it, and spends their money accordingly. Numbers live in data/strategy.json; the rules in src/sim/strategy.js.

### The monthly assessment
- Three scores, each 0 to 100, with their parts kept so the reasoning can be shown:
  - **Threat:** wars they are in (more if losing), hostile neighbours, armies massing near them, enemy camps, neighbours much stronger than they are.
  - **Opportunity:** a weak neighbour (our strength against theirs), a neighbour busy with another war, a town their agenda wants, towns they lost, a thinly held border. Opportunity against Temeria is divided by our deterrence (below).
  - **Purse:** months of income in the treasury, and debt.
- From these and the ruler's traits and agenda they choose one of five postures: **Grow** (build to earn), **Arm** (soldiers and walls), **Expand** (pick a war aim and prepare), **Consolidate** (pay debts, mend) or **Scheme** (work against a stronger neighbour without open war). Honourable rulers never scheme.
- A posture holds for at least six months unless the threat jumps by 20 or more. Debt forces Consolidate.

### Money becomes power
- Every realm keeps a standing army that costs upkeep each month and coin to recruit. How large it wants the army depends on its posture and income; it recruits only from what is left after three months' reserve. When it goes to war, the standing army marches first and the levy makes up the rest; veterans fight a little better.
- A court that hoards pays for it: anything beyond twelve months of income costs 15% of the surplus a month, so no foreign treasury piles up past about two years of income.
- Debt bites: soldiers desert, towns lose prosperity and garrisons thin, monthly payments and tribute stop, and the ruler offers Temeria a loan, goods or even a village for coin.
- Verden no longer spirals into debt (a protectorate's tribute now lapses when it cannot pay, and rulers refuse monthly terms beyond a third of their income), and Kerack's garrisons recover after a war.

### Mending (since M20)
- Foreign rulers no longer build. Their realms start with the works their land gives them, as Temeria's do, and each month a ruler mends its worst works (anything below 60) out of what is left after two months' income, up to 35 points a works. A realm in debt mends nothing and its works wear faster. (Until M20 they built from the whole catalogue, scored by payback, posture, agenda and traits.)

### Wars with a purpose
- No more rivalry dice. A ruler in Expand picks a war aim: the town their agenda names, then towns they lost, then a weak town on a border. They muster an army for about six weeks (seen by our scouts), then declare with a reason. Their armies march on the aim.
- Each month at war they decide: press on, seek peace, or call their allies again. At peace, a side that holds its aim keeps it; a modest lead settles as each keeps what it holds. Capitals always go back to their realm, so no realm is wiped out.

### Deterrence and probes
- Temeria's soldiers near their border, its garrisons and companies, a share of its whole army and its bound allies divide a ruler's appetite for war on us. A well-defended crown is probed rather than invaded.
- Probes: sponsoring raiders on our roads, tolls on our caravans, demands, a show of force on the border, denouncing us abroad, or asking to renegotiate a pact for coin.
- A pact with Temeria can only be broken by an ambitious or opportunist ruler while the crown is weak (low Authority or stripped garrisons); a cautious one only when it is very weak; an honourable one never.
- Shared fear of a strong Temeria warms the neighbours to each other (soft balancing).

### Pacts that last
- Pacts between foreign realms run at least two years, break only when relations sour badly, and once broken cannot be signed again for three years. Pacts that run out are renewed in place. The North starts with the standing pacts already signed.

### What we learn
- An embassy tells us their posture and why ("Henselt is arming: a stronger neighbour on his border"). A spy tells us their war aim and planned musters. Without either, only rumour: busy markets, roads full of soldiers, a court short of coin.
- Their posture adds a line to their mood reasons in an audience.

### Save
- Version 15: old saves gain postures, standing armies and assessments on their first month.

## War with neighbours (M9)
This replaces "no battles in v1": the owner asked for war. The crown still governs rather than commands: it raises armies, names marshals and gives orders and a stance; marshals do the marching and battles resolve by themselves. All numbers are in data/war.json.

- Ownership: a Temerian town taken by an enemy keeps its record but carries an occupier (it pays the crown nothing, builds nothing, takes no orders and is left out of Stability); a foreign town taken by Temeria or another realm carries an owner (Temeria's conquests pay into a Conquered towns ledger line and are watched like our own towns). Every war remembers the towns that changed hands in it.
- Raising an army (Military, War): a crown levy (a third or half of each crown garrison; the levied garrisons are not refilled while the men are away, and their fields suffer), the lords' men (40% of each loyal house's soldiers, at a grievance; houses below loyalty 30 send excuses), and free companies (200 men, 250 crowns each and 60 a month). Up to three armies, each with a marshal (skill 1 to 1.2; a house's own man wins it favour) and a stance: bold (attacks harder, storms at 3 to 1, seeks battle at 0.8 to 1) or cautious (defends harder, storms only at 5 to 1, fights only at 1.2 to 1). Armies in the field cost 0.15 crowns a man a month.
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
(Since M21 the player trades by deals in five goods; the routes below remain as the machinery underneath, no longer opened one by one. See "Trade in five goods".)
- Between two towns or cities: ours, or a neighbour's (one end must be ours) once that realm's relation is 20 or more, it trades with us and we are not at war. Opened from a town's card or Treasury, Trade routes, for 400 crowns plus 0.8 a unit of road; 12 crowns a month to run.
- A month's takings = 0.0038 x the square root of both towns' people x their fortunes (average prosperity / 55) x the haul (road length / 350, from 0.6 to 1.6) x wares (1.3 if they make different things, 0.75 if the same; a foreign town always counts as different) x road safety (1 less 0.9% per point of the worst threat along the way, at least a quarter) x relation abroad (the border-trade factor, x1.25) x a quarter more for each market hall at either end and the harbour and guildhall bonuses, divided by the square root of how many routes share each end.
- Bandits rob a month's takings with a chance of 30% x (1 - safety). An occupied end, or war with the far end's realm, closes the route.
- The crown runs 2 routes, plus one for every two market halls, one for each guildhall and harbour, plus one under free guilds and minus one under a guild monopoly, up to 8.
- Each route is a ledger line, a gold thread along the road on the map, and crown caravans in proportion to its takings (their merchants see abroad like any Temerian merchant).

### Gold
- Seams (data/gold.json): the Carreras seam (9,000 crowns), Zavada spur (5,000), the Klamat reef by Razwan (7,000), Tukaj diggings by Petrelsteyn (6,000) and Rissberg workings (4,000), all known; the Napeys vein (8,000) and the Dregsdon lode (6,000), hidden.
- Prospecting from the card of a place within 100 units of hills or mountains: 300 crowns, 60 days; a hidden seam there is found seven times in ten (otherwise the prospectors may try again); where there is none, they say so and are not sent again.
- A gold mine yields 60 crowns a month (a lord takes his share in his lands) until less than a third is left, then less and less (never under a tenth), until the seam is worked out.
- Side effects: 0.4% more people a month at the mine (three in ten of them dwarves); +20 bandit threat within 70 units; each working mine makes greedy neighbours greedier; each mine within 170 of Mahakam costs 8 relation with it.

### What the works do (M11, built from the start since M20)
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
- (Until M20 places held villages 5, castles 5, temples 3, towns 8, cities 12 buildings. Since M20 a place holds what its spaces hold.)

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
- Patrols cost 6 plus 0.22 a unit of road they ride (a short patrol about 20, a long one about 50), less 10% for each horse stud (to 70%). (Replaced in M13 by companies' own pay; studs now stock the crown's stables.)
- Debt interest is 1% a month. Debt still drains Authority, and now also raises unrest in every crown town in proportion to how near the bankers' limit it is (up to +10 at the limit) (choice: with interest halved, debt alone no longer threatened a spendthrift crown).

### Production chains
- Makers: sheep pastures (villages and towns on open land or hills) 55 wool; salt pans (Anchor, Acorn Bay, Gors Velen) 38 salt; horse studs (Cleves, Old Bottoms, Brenna, Carcano, Vidort, Mortara) 13 horses.
- Workers, in order: charcoal burners (near forest, or where timber is cut) turn 45 timber into charcoal; weaponsmiths (on a smithy) turn 0.6 iron and 1 charcoal into each of 22 arms; weavers' halls (towns and cities) turn 60 wool into cloth; rye distilleries (food villages and towns) turn 2 measures of spare grain (beyond 60 days' stores, from anywhere in the realm) into each of 28 rye spirit. All amounts scale with the place's fortunes.
- Goods are pooled realm-wide each month (choice: simplest that still makes carts run from maker to worker). Suppliers are credited the raw price of what the workers take.
- Each crown route carries up to 30 units of finished goods (cloth, spirit, arms, salt, horses) that one end lacks: a home town lacks a good when it has no building making it; a foreign realm lacks what data/industry.json `abroadMakes` does not list for it. The route earns 30% of the goods' price on top at home, 60% abroad. The rest sells at home at full price up to the realm's demand (people x a per-good share), and at half price beyond it.
- Prices: wool 0.6, charcoal 1.1, cloth 1.6, spirit 2.2, arms 4 (+25% for every neighbouring realm at war), salt 1.5, horses 5.
- Salt pans let every store in the realm hold 6% more food each (up to 18%). Horse studs fill the crown's stables (since M13). Hunters' lodges cut monster threat by 12 within 90 units.

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

## A realm under arms (M13)
All numbers are in data/forces.json. Choices the brief left open are marked (choice).

### Threats on the map
- The monthly threat levels (bandits and monsters, as since M6) no longer roll raids. They decide where camps and lairs appear and how they grow.
- Bandit camps appear in forest, marsh or hills within reach of a settlement whose bandit level is 35 or more (a monthly chance that grows with the level), no nearer than 110 to another camp, at most seven. They start with 15 to 30 men and grow 7% a month x level/50, up to 40 + 1.6 x level; they wither where the level falls below 20 (patrolled roads, prosperity) and break up below 8 men.
- A camp of 25 or more sends a band of six in ten of its men to a nearby road (the busiest and nearest are likeliest). The band holds the road 6 to 12 days, then falls on a weak village nearby if it can (the garrison behind its walls and any company stationed there must be under nine tenths of the band's strength), then goes home with its loot.
- A held road robs: a crown route over it loses the share of the month the road was held; the two towns at its ends lose up to half their market trade and the sale value of their goods in proportion. Ambient caravans and carts stop where a band stands (cosmetic).
- Monster lairs appear in marsh, forest, hills or mountains where the monster level is 30 or more, at most six: drowners or a water hag in the marshes; wolves, a werewolf or a leshen in the forests; harpies or a griffin in the hills; wyverns or a forktail in the mountains. The rare kinds are few but dreadful. Lairs grow by one beast every three months and send packs to hunt the roads and villages near.
- A witcher contract clears a sighted lair in 20 days for 150 + 2.5 x its strength (six tenths of that under Witcher contracts), nine times in ten, with no soldier lost (choice: the "existing contracts" are the bounty law, made cheaper).
- Scoia'tael commandos come out of the woods near Brokilon and the elves of the realm when sympathy is over 40 (they replace M4's dice-roll ambushes): 20 to 50 elves, worth more in the forest. They hold a road for a few days, fall on any company that comes near, and vanish within a month.
- Neighbours at -40 or worse (and any at war with us) send war parties of 40 to 120 over the border by road to a Temerian place near it, to plunder and go home. Enemy armies at war march visibly as since M9.
- Raids on villages use M6's losses (prosperity, unrest, stores, people), and the garrison loses 15% of its men.

### Sight
- The crown sees what its towns (village 40 to castle 85, a watchtower 130, an inn +30), patrolled roads (+40), companies (70, mounted 95), armies (90), friends and spies see. The cosmetic traffic never counts (choice: so sighting can drive orders without breaking determinism).
- A threat in sight shows clearly with its size. Out of sight but within 200 of a Temerian town, it shows as a rumour ring whose radius (25 to 90) shrinks as the crown's eyes come nearer.
- A short alert names each new sighting; Help can set the game to pause on sightings.

### Standing companies
- Types: militia (150 men, worth 0.8 each, 0.3 a man a month), archers (100, 1.0, 0.55), men-at-arms (100, 1.4, 0.8, 15 arms), crossbowmen (80, 1.2, 0.8, 10 arms, barracks; x1.5 behind walls), light cavalry (60, 1.5, 1.1, 20 horses, fast), knights (50, 2.6, 2.2, 30 horses and 10 arms, barracks, cities and castles).
- How well each suits a foe: light horse x1.25 against bandits (and x1.15 more in open country, x0.7 in forest or marsh); archers x1.2 against beasts; knights x1.5 against soldiers but x0.6 against beasts; militia weak against all.
- Recruited in a crown town, city or castle (militia in villages too) from its people: the men leave the population, and come back when the company stands down. A village holds one company, a town or castle two, a city three, barracks two more.
- Arms and horses: the crown's armouries keep up to 60 arms (smithies add 2 a month, armouries 4, weaponsmiths' output first) and its stables up to 60 horses (the studs' output first), before the rest goes to market. Short of arms, they are bought abroad at 8 to 10 crowns each; short of horses, light horse buy theirs at 22 each, knights cannot be raised (choice).
- Pay by type each month, charged to the station's account. Unpaid (past the bankers' limit), morale falls 12 a month; under 35, a tenth of the men desert each month.
- Wounds: four in ten of the fallen are wounded and come back, 15% a month at the station (30% with a hospice or barracks). Morale returns 6 a month at the station (12 with a hospice or barracks). Experience: +0.08 each victory, up to 1, each point worth +30%.
- Garrisons stay as each town's own defence; companies stationed in a town also stand on its walls.
- A field army may take standing companies along: their men join the army and their quality lifts its strength; when it stands down they go home with the survivors' share and the army's victories as experience. Levies and hired companies fill it out as before.

### Orders
- Station (hold a place), Patrol (ride a road end to end), Escort (ride a crown route end to end), Hunt (march on a sighted camp, lair, band, commando or enemy army and fight it, then take up the old order again), Respond (stay at the station; ride out to any sighted threat within 60, 100 or 150 when the odds are at least even, then come home).
- Companies follow the roads, and leave them only for the last stretch to their quarry. Speed 18 a day x the troop (light horse 1.6, knights 1.3) x the ground (hills 0.8, forest 0.75, marsh and mountains 0.6) x the season (winter 0.6). No weather beyond the seasons (choice).
- When a company comes within 14 of its quarry (or a patrol or guard meets a band on its road, or Scoia'tael meet any company), every free company within reach joins the fight.
- Odds in words, from both sides' strength (men, worth, morale, experience, how the troop suits the foe, the ground): Overwhelming at a 90% chance of winning, Favourable 65%, Even 35%, Risky 10%, else Hopeless. The chance is strength cubed over the sum of both strengths cubed, as in battles between armies. The loser loses a quarter to half its men, the winner 4 to 12%, scaled by the strength between them.
- A beaten threat is gone (a band's camp is weakened, a camp or lair attacked at home is broken and the country round it quiet for 120 days); a beaten company falls back to its station for 12 days. Each fight leaves a battle marker and a report in the Chronicle.

### On the map
- Banner tokens: Temerian colours for the crown's companies, a lord marshal's house colours for his army, the realm's colours for foreign raiders and armies, ragged dark banners for bandits, a long pennon with a squirrel's tail for the Scoia'tael, and silhouettes for beasts. One to five figures by strength; close up, the men and a morale bar.
- Camps (tents, a palisade as they grow) and lairs (bog pools, dens, nests, caves, with more bones as they grow) stand in the terrain, through the sprite registry.
- Moving forces draw a faint line to where they are going. A chosen company shows its patrol road, escort route or response radius.
- Forces screen: every company and army (strength, morale, pay, orders, place) and every sighted threat (kind, size, distance to the nearest town) with a button to send the nearest suitable company.

## Ambient units
Spawned and steered by the simulation layer (cosmetic only, separate RNG). Since M22 B every traveller stands for something real, carries what it is for, and its numbers follow that source; anything with no source was removed (the old garrison riders, the merchant caravans between random towns, the tax collectors).
- Merchant caravans: the surplus sold at home (M21), from a place that makes the good to a market town, as often as the home sales are worth (none when nothing is sold).
- Temerian merchants: the goods we sell under a trade deal, from a place that makes them to the partner's capital. Foreign merchants: the goods we buy under a deal, from their capital to one of our market towns.
- Caravans under treaty, crown caravans on the old routes, goods carts along the production chains, grain carts from full stores to hungry ones, refugees and exiles: as before, each from its real source.
- Pilgrims: from wherever the faithful are to the Temple of Melitele, or the nearest cathedral or shrine standing whole.
- Patrols: outriders of each company on patrol orders, one for each, along its road and back.
- River barges: on rivers our towns stand on, as often as their trade (home sales and deals) is worth; none in winter while the rivers are frozen.
- Abroad: the realms' own caravans between their towns and their riders out of their strongholds.
Units move along the road network (or rivers for barges), at speeds affected by season. A tap shows a small label, a long press the same in a quick look, in one line: "Merchant caravan: grain from Ellander to Maribor, sold at home for about 194 crowns a month", "Patrol: the Maribor Light cavalry on the road from Maribor to Vizima".

### Life at the works (M22 B)
Kingdom view only, close up (never on the board). Small figures at each of our works, from `worksLife` in src/sim/worklife.js (numbers in data/labour.json `life`), drawn with the settlement art's life sprites so painted art can replace them:
- Each works shows a few figures by its kind (fields 3, woods 2, mines 2, pastures 1 and a flock, the water 2 boats) at full staffing, more up to half again when overstaffed, fewer when short of hands.
- The fields follow the year: ploughing with an ox in March to May, tending in June, July and October, harvesting with sheaves in August and September, empty in winter. Woodsmen fell a tree; miners swing picks beside a cart; shepherds stand with their flocks, smaller at the spring shearing; boats go out on the lakes and rivers, none in winter or while storms close the water.
- A damaged works (below 45) shows no one, only a scorch mark; one under repair shows its builders with hammers.
- Cheap: drawn only at the life zoom, at most 240 figures on screen (120 under Battery saver, which also halves each group).

### Witchers on the road (M22 B)
A witcher hired for a lair rides out from the nearest place of ours (four tenths of the contract's days), fights at the lair (the contract is settled halfway through, with his blade flashing on the map), and rides home if he won; if he lost, no one comes back. A long press says who he is and what the contract is worth: "Witcher: Halvard of the School of the Wolf, riding out from Anchor; the crown's contract on drowners near Anchor, 204 crowns".

## UI
Rebuilt in M14 around one rule: the player never loses their place.

### Getting about
- Top bar: date and season, the speed buttons, and a small overflow menu (three dots) holding Chronicle, Help, Save, Load, Export, Import and New reign. Below them the four meters (Treasury, Granary, Authority, Stability), each with a small icon; tapping one opens a card saying why it moved (last month's biggest lines in and out; food grown against food eaten and the places shortest of it; next month's Authority part by part; the most restless places).
- A tab bar along the foot in portrait (down the left side in landscape), safe-area aware, with badges: Realm, Court, Treasury, Military, Diplomacy. Each tab has segmented sub-tabs and reopens on the last one used.
  - Realm: Overview (the meters with their month's movement, what needs attention, the five places in most trouble) and Places (every place, searchable and filtered).
  - Court: Decisions (the inbox), Laws, Great houses, Faith.
  - Treasury: Ledger, Trade routes, Mines and industry.
  - Military: Forces, Threats, Garrisons, War.
  - Diplomacy: Realms, Spies and embassies, Envoys.
- A navigation stack per tab: opening a card from a list (a town, a lord, a company, a realm) pushes it, and the back arrow, the browser's back button and the Android back gesture return to exactly where the player was. A card opened from the map while the panel is closed starts a stack of its own. Tapping the open tab again returns to its root.

### Never losing your place
- Portrait: the panel is a bottom sheet with three heights (peek shows only its title bar; half; full), dragged by its title bar. A tap on the map lowers it to peek instead of closing it; a tap on the title raises it again. Swiping down from peek, or the close button, closes it. Landscape: a side panel that stays open while the map is used.
- Every screen remembers its sub-tab, its scroll (per sub-tab), its opened sections and any half-filled form (raising an army, opening a route, a lord's grant) for the session and across saves (localStorage key northern-wars.ui, beside the save but outside the game state). The panel starts closed after a reload; one tap on a tab brings back exactly what was open.
- Decisions never open themselves over another screen. They go to the Court inbox with a badge and a short toast, and the game still pauses for each new one. The inbox lists them by urgency with the days left, and each is answered in the list; the choice that will be taken if it is left is marked. A lord's card shows his pending demand, and a realm's card its envoy, with their answers.
- Only what cannot wait (war declared on Temeria, a siege of a Temerian town, a rebellion, a deposition) raises a red banner across the top, which leads straight there and can be dismissed.

### Cards
- One template everywhere: title in the panel's head, a one-line status, key figures as compact chips with small icons, the main actions as buttons, then collapsible sections. Long descriptions sit behind an (i) button.
- Town cards: a summary head (population, prosperity, unrest, holder, garrison) with Recruit here and Trade route from here, then Overview, Build, Military and People tabs. Build lists only what can be raised there, one line each with its cost; a tap opens the details and the Build button; what the place can never have is folded under Not possible here.
- Laws: one line per law with the option in force; a tap shows the options and who each pleases or angers; tapping one decrees it.
- Help: a searchable list of short topics.
- No tab or card is longer than about two screens of a 390x844 phone when first opened.

### Fewer taps
- Map pick mode for anything that needs a target: a company's Hunt, Patrol and Station, a trade route's far end, an army's hold or siege, the muster place. A banner says what to tap; once tapped it shows the odds or the value, and Confirm commits. No lists of place names where a tap on the map will do.
- Threat cards and the Threats list have Send nearest suitable company; town cards have Recruit here, Trade route from here and the garrison level.
- Measured from the map by browser tests: why a meter moved, 1 tap; answering a decision, 2; sending a company after a sighted threat, 3; building in a town, 4; changing a law, 4; getting back to a screen after a stray map tap or a close, 1.

### Native feel (M15 A)
- No browser behaviour on game surfaces: no text selection, long-press callouts, image dragging or context menus, and no page zoom, bounce or pull-to-refresh. Fields (search) stay selectable and use 16px text so iOS never zooms on focus. Buttons show their pressed state the moment they are touched.
- Long press (about 450ms, with a ring filling under the finger) is a game gesture. On a town of ours: a ring of quick actions (Build, Recruit, Garrison, Trade route, Open card). On a crown company: Station, Patrol, Escort, Hunt, Respond; on a crown army: Hold, Besiege, Open card. On a threat: Send nearest, Open card. On anything foreign: what is known of it. On open land: what's here (the ground, whose land, the nearest place, how dangerous it is). On a list row in the panel: a quick look at the card it leads to, without leaving the list.
- Map gestures: a flick glides on with friction; pinch zooms between the fingers; a double tap on open land zooms in and a two-finger tap zooms out.
- An installable app: a web app manifest with parchment-and-ink icons (including a maskable one), Apple touch icon and status bar tags. A service worker (sw.js, generated by `npm run sw` from every game file and versioned by their hash) keeps the game for instant start and offline play; when a new version is ready a small prompt offers to restart. It is not registered for automated test runs unless they ask with `?sw`.
- Put away or closed, the game saves and pauses, and stays paused on return. Help has settings for vibration (short ticks for long presses, orders and alerts, on Android; iOS has none) and for keeping the screen awake while the realm runs.
- The layout uses the dynamic viewport height, so the sheet and tab bar do not jump as the browser's bars come and go. The map canvas is drawn at no more than two device pixels per CSS pixel, and while paused with nothing moving it is not redrawn at all.

### Battery (M22 A)
- Frames on demand: a frame is asked for only when something needs drawing (the realm stepping, the camera moving or gliding, a tap or key, the panel changing, layers still filling in, or something on screen that moves of itself). Paused with nothing moving, no frames are asked for at all until the next event.
- Paused with travellers in sight, the map draws a gentle 8 frames a second (each traveller stirs a little on the spot); with smoke, battles or sieges in sight, 15. Running, it draws at most 30 a second, full rate only while the camera moves.
- Battery saver, in Help (on by default on phones, chosen by a coarse pointer): 30 frames a second always, even while panning; half the travellers drawn; no wake lock.
- Put away: nothing draws, the realm pauses (and stays paused on return, as since M15), the music stops and the sound is suspended, and the wake lock is released. The wake lock is only ever held while the realm runs, the setting is on and Battery saver is off.
- Measured over ten seconds at 390x844 (frames the loop ran): paused and idle 585 before, 0 after; paused with travellers in sight 601 before (none of them drawing anything), 79 after; running 590 before, 296 after.

### Look
- Parchment and ink, one dark theme. Touch targets of 44px or more; no hover-only controls; motion kept short and off under reduced-motion settings.

## Save
- Autosave to localStorage every in-game month, plus manual save, export and import as JSON. Versioned save schema.

## Sound
- One looping soundtrack (assets/audio/march-of-the-shadow.m4a), streamed through an audio element routed into Web Audio so volume works on iOS. It starts on the first tap, plays on while paused, fades out when the page is hidden and dips under bells and horns.
- Interface sounds are synthesised at runtime in src/ui/audio.js, never loaded from files: tap, open, close, flick, clock, confirm, seal, coin, knock, bell, horn and ring. Each varies slightly; no more than four play at once.
- Music and effects each have a volume and a mute, kept in the per-device prefs.
