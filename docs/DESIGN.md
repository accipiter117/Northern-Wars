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

### Laws and edicts
Around 12 to 15 laws in categories, each with options. Changing a law costs Authority and coin, takes effect over time, and pleases or angers specific groups (nobles, burghers, peasants, clergy of each faith, each non-human people). Examples:
- Taxation: light, standard, heavy.
- Conscription: none, seasonal levy, standing muster.
- Public order: town watch, curfews, martial law.
- Non-human rights: equal charter, quarters and restrictions, expulsion.
- Faith: tolerance, Eternal Fire patronage, Melitele patronage.
- Guild charters, road corvee labour, grain price controls, monster bounties (witcher contracts), registration of mages, noble tax privileges.

### Faith, culture and peoples
- Faiths: the Eternal Fire (zealous, urban, hostile to non-humans and magic), Melitele (healing, charity, women and the poor), the Old Ways (rural, druidic, Velen).
- Each settlement has a faith mix that shifts over time with patronage, laws, preachers and events.
- Tension between humans and non-humans per settlement, raised by Eternal Fire influence, hard times and certain laws; lowered by charters and prosperity. High tension produces riots and pogroms, which feed Scoia'tael sympathy among elves.

### Nobility and vassal lords
- Five great houses with original names (invented, Slavic and Germanic flavour, not canon characters), each holding a seat and several settlements.
- Each house: loyalty, power (levies and wealth), ambition, and one or two traits.
- Houses make demands (land, offices, exemptions, marriages, revenge) through events.
- Crown actions: grant land or honours, summon to court, demand levies, impose a fine, strip a title (costs Authority, risks rebellion).

### Military holdings
- Garrisons per settlement and castles, funded monthly.
- Patrol routes along roads reduce banditry and raise road safety (visible as patrol units).
- Levies raised through lords and conscription law.
- No battles in v1. Threats (bandits, monsters, Scoia'tael, riots) are resolved automatically by local strength against threat level, reported as dispatches.

### Events
- Data-driven event cards with conditions, two or three choices and effects. Examples: plague, failed harvest, a monster in the marshes, a riot in Vizima, a lord's demand, a Scoia'tael ambush, a preacher of the Eternal Fire, a witcher seeking a contract.
- Major events auto-pause the game.

## Ambient units
Spawned and steered by the simulation layer (cosmetic only in v1, separate RNG). Kinds and what drives their numbers:
- Merchant caravans: trade volume between settlements.
- Grain carts: harvest and food flows towards cities.
- Patrols: garrison funding and patrol routes.
- Tax collectors: monthly, from towns to Vizima.
- Pilgrims: faith activity, travelling to the Temple of Melitele.
- Refugees: unrest, famine or plague, moving away from trouble.
- River barges: on the Pontar and Ismena.
Units move along the road network (or rivers for barges), at speeds affected by season. Tapping one shows a small label of what it is and where it's going.

## UI
- Top bar: date and season, speed controls, treasury, granary, Authority, Stability.
- Tap a settlement: card with population, peoples, faith, prosperity, unrest, production, garrison, holder, buildings.
- Menus: Realm overview, Laws, Faith and Peoples, Nobles, Military, Chronicle (dispatch log).
- Portrait: map fills the screen, panels as bottom sheets. Landscape: map with a side panel.
- Parchment and ink look for the placeholder UI. Light and dark themes not needed in v1; one dark parchment theme.

## Save
- Autosave to localStorage every in-game month, plus manual save, export and import as JSON. Versioned save schema.
