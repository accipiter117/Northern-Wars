# Northern Wars v2: a turn-based game of the Northern Wars

Design document and build plan, from decisions made in conversation (November 2026). This replaces the real-time game; its map, realms, rulers, faiths, laws, peoples and art carry over. Existing saves will not.

v2 is built alongside the real-time game, at `/v2/` on the same site, until it is playable end to end; then the two swap and the real-time game is archived on a branch. The proposed unique units, buildings and wonders below are confirmed as the starting point (they come into play with step 4).

## The game in one paragraph

A turn-based strategy game in the spirit of Civilization VI, played on a king's war table. One turn is one month, from 1262 to 1272. The player leads one of five great powers (Temeria first) through the Dawn of the Reign and the three Northern Wars. Cities are established, not founded; they grow, train armies and raise a few unique buildings and wonders. Instead of a technology tree, each great power hits goals that ready it for war and faith, unlocking its unique units and abilities. Smaller kingdoms behave like Civilization city-states. The lore's great moments happen when the faction driving them earns them. The game ends in one of the endings of the Witcher 3 world, or in a domination or faith victory.

## Decisions

| Topic | Decision |
|---|---|
| Board | Regions and provinces, Diplomacy-board style (not hexes) |
| Turn | One month |
| Resolution | Civ style: the player moves, then each AI moves in turn |
| Armies | Stacked armies (carved pieces), several companies each |
| Battles | A short tactical battle screen |
| Cities | Build units, plus a few unique buildings and wonders unlocked by goals; no general build queues |
| Progress | Goals instead of technology, readying for war and faith expansion, unlocking unique units |
| Full civilisations | Temeria, Redania, Kaedwen, Aedirn, the Nilfgaardian Empire |
| Smaller kingdoms | Like city-states: envoys build influence, routes (protection, pressure, peace terms) seal suzerainty |
| Uniques per great power | Two or three unique units, a unique building and a wonder |
| Span | The Dawn of the Reign and all three Northern Wars as chapters (1262 to 1272) |
| Lore events | Scripted, but fired only when the faction driving them meets the requirements |
| Endings | The Witcher 3 outcomes, plus domination and faith victories |
| Build | Replace the current game |

## The board

- The traced map, divided into regions: each realm's provinces, with a city or castle at the heart of each and roads between neighbours. Armies move region to region.
- Movement: an army moves a number of regions a turn by roads, terrain and season (winter halves it). Rivers can only be crossed at bridges, fords and ferries, which makes the Yaruga and the Pontar crossings the keys to the map.
- Zones of control: an enemy army in a region stops movement through it; you must fight or go round.
- Supply: armies in friendly or held regions are supplied; deep in enemy land they lose strength each turn.
- The war table look: the zoomed-out view is the table with carved, painted wooden pieces for the five great powers (armies, kings and marshals, fleets), pennant pins for smaller realms, towers for capitals. Drag a piece to give its move.

## Cities and yields

- Each city has a small set of yields per turn: food (growth), production (units and wonders), crowns, faith, and renown (influence used for envoys and statecraft).
- Yields come from its works on the land (the spaces from the current game carry over as Civ-style districts), its people and its laws.
- Love, Fear, Authority and Unrest carry over as the realm's mood, playing the part of amenities: low Authority with high Unrest means riots, lost production and revolt.
- Production builds units and, once goals unlock them, a few unique buildings and wonders. Repairs after war stay.
- Conquered cities join with low yields that rise as they settle (integration from the current game).

## Progress: goals instead of technology

- Each great power has two goal trees for each chapter (Dawn, First War, Second War, Third War):
  - Arms and statecraft: readiness for war, fortifications, vassals, spies, laws.
  - Faith and the people: Devotion, the peoples of the realm, prosperity.
- A goal is a concrete thing to achieve (fortify the Pontar crossings; win Sodden as a vassal; raise a faith to level 3; repair Vizima's quarters). Completing goals unlocks units, buildings, wonders, laws and abilities.
- The trees are asymmetric and fit each ruler (from the Dawn of the Reign paths: Foltest's cities and titles, Vizimir's spies, Henselt's army, Demavend's valley and mines, Emhyr's provinces and agents).
- Each chapter's trees stop at what fits the age, as the End Era mod does: no gunpowder, no modern anything.

## The five civilisations

| Power | Leader | Agenda | Unique units | Building / wonder |
|---|---|---|---|---|
| Temeria | Foltest | Holds the lesser crowns of the south | Blue Stripes (raiders and saboteurs, later chapters); Temerian crossbowmen; royal knights of Vizima | Royal fishery or court; the Temple of Melitele at Ellander |
| Redania | Vizimir II | Knows first, strikes second | Redanian knights; Dijkstra's agents (a spy unit) | Novigrad's banks; Oxenfurt Academy |
| Kaedwen | Henselt | Trusts the sword | Kaedweni cavalry; siege engineers | Drill yards; the school at Ban Ard |
| Aedirn | Demavend III | Guards the valley and the mines | Aedirnian maulers; Vengerberg guard | Upper Aedirn mines; Vengerberg's walls |
| Nilfgaard | Emhyr var Emreis | The White Flame's long plan | The Impera Brigade; Nauzicaa cavalry; the Alba Division | Imperial roads; the governors' palaces |

## Smaller kingdoms as city-states

- Middle crowns (Cintra, Kovir and Poviss, Lyria and Rivia, Skellige) and petty kingdoms (Sodden, Brugge, Verden, Cidaris, Kerack, Hengfors, Toussaint) each have a type and a suzerain bonus: trade (Kerack, Cidaris, Kovir), martial (Lyria and Rivia, Hengfors), seafaring (Skellige), industrial (Mahakam, protectorate only), courtly (Toussaint), frontier (Sodden, Brugge, Verden).
- Envoys, earned by renown and goals, build influence; the power with the most envoys has the right to seal suzerainty by one of the routes: protection when threatened, pressure (fear plus gifts), or peace terms after a war. Rivals can court a vassal away.
- City-states give quests (as Civ VI): clear a threat, defend them, send a trade deal; completing one gives envoys.
- Vassal kings keep the judgements from the current design when they rebel: depose, annex, pardon, execute.

## Battles

- When armies meet, a short tactical battle screen: a field of a few lanes (left, centre, right, reserve) on the region's terrain, companies as carved pieces. Over a few rounds the player places companies, commits the reserve and can sound the retreat; terrain, troop types, morale, commanders and weather decide each clash. Unique units have one ability each.
- Every battle can also be auto-resolved with its odds shown.
- Sieges: walls, food and time across turns, with storm, starve, terms or lift as now.

## Diplomacy and the AI

- Full diplomacy only between great powers: treaties, deals, audiences, agendas and grievances, Civ VI style.
- Each AI leader has a lore agenda that shapes whom it likes and hates.
- Spies carry over: networks, operations and counter-espionage, as the engine for many lore events.

## Chapters and lore events

- Dawn of the Reign (1262 to 1263): city quests, the five paths, the Road to War with its five boxes, then the First Northern War.
- The First Northern War (1263 to about 1264): the Empire takes Cintra and pushes into Sodden and Brugge; the North gathers for a decisive battle.
- The Second Northern War (about 1267 to 1268): Thanedd, Nilfgaard and the Scoia'tael strike Aedirn and Lyria; Kaedwen takes the Lower Marches.
- The Third Northern War (about 1271 to 1272): the Kingslayers, Radovid's rise and the last campaigns.
- Lore events fire when the faction driving them meets their requirements, and can be prevented. For example, the Kingslayers plot against Foltest needs the Empire to have a deep spy network in Temeria, a hired witcher-assassin and a moment of weakness; Temeria's spymaster can see it coming and stop it. Each chapter has a handful of such events for each side.

## Endings and victories

- The Empire triumphant: Nilfgaard holds the North; Temeria survives at best as an imperial vassal.
- The North holds: the Empire is driven back across the Yaruga and the northern crowns endure (Dijkstra's peace).
- One king rules the North: a single northern king unites it by the sword and the Empire is repulsed (Radovid's North).
- Domination: any great power holding a set share of the North's capitals.
- Faith: one faith dominant across most cities (the Eternal Fire's North, or the Great Sun spreading with the Empire).
- The chapter's end works out which lore ending applies from who holds the capitals, the crossings and the smaller kingdoms.

## What carries over, and what goes

Carries over: the traced map and geography, realms and rulers, provinces and towns, works and spaces, faiths and Devotion, the Book of Laws (as policy), Love, Fear, Authority and Unrest, peoples and quarters, lords and vassals, spies, dilemmas and demands, the war table look, art and sound.

Goes: the daily real-time engine, real-time marching and battles, continuous labour sliders (labour becomes a per-city focus each turn), ambient life as simulation (kept as decoration only).

## Build plan

1. Turn engine: one-month turns, an End turn button, AI realms taking their turns in order, monthly systems (economy, faiths, laws, dilemmas) run once a turn; save format v2.
2. The board: regions and their links, crossings, movement points, zones of control, supply; the war table view with draggable pieces.
3. Cities and yields: the five yields, production of units, repairs, growth, mood as amenities.
4. Goals: the goal trees per power and chapter, unlocks, and the unique units, buildings and wonders.
5. City-states: types, envoys, suzerain bonuses, quests, sealing by routes, vassal judgements.
6. Battles: the tactical battle screen, auto-resolve, sieges across turns.
7. Diplomacy and AI: great-power diplomacy with agendas, AI turns that use the board well, spies.
8. Chapters and lore events: the Dawn of the Reign, the three wars, requirement-driven events.
9. Endings and victories, then balance across many full games.
10. Polish: one screen per purpose, the Crown's hand for acts, art for pieces and cards.

Each step should be playable on its own before the next starts.

## Steps 1 and 2 as built (choices made where the design left room)

- **Where it lives.** `v2/` (page, styles, `src/engine` pure and `src/ui`), with its own data in `v2/data` (`board.json`, `game.json`). It reads the real-time game's world through `src/sim`'s loader (map, realms, rulers, works, dilemmas) and never changes it. Save key `northern-wars.v2.save`, format `northern-wars-v2` version 1.
- **Regions.** Every city, town and castle is the heart of a province; villages and temples join the nearest heart of their own realm: 78 provinces (Temeria 16). Links follow the traced roads, plus open country to up to four near neighbours on the same land.
- **Rivers.** Only the Pontar and the Yaruga are barriers (`board.json` `barriers`). A road across one is a bridge; any other way across is closed unless `crossings` names a ford or ferry (none yet). Fourteen bridges result, three ways closed. Lesser rivers slow a march off the road by one point.
- **Movement.** Three points a month; a road link costs 1, open country 2; December to February halve the points. Borders are closed in peace: an army may enter only its own land, land it holds, and the land of a realm it is at war with. Entering a region with an enemy army ends the march there and is a battle.
- **Supply.** At the end of its side's turn an army on land its realm controls mends 5 strength a company; elsewhere it loses 8. A company below 10 is lost.
- **Taking places.** An army alone in an enemy region at the end of its side's turn takes an unwalled town at once; a walled city or castle after two turns of siege. Retaking our own place frees it.
- **Battles until step 6.** A stand-in: odds by strength (cities and castles give the defender a fifth more), the loser loses 45% and falls back or breaks, the winner 15%.
- **The AI until step 7.** Each great power in turn raises a company at its capital when production allows, and at war marches on the nearest enemy region it can beat. Lesser crowns hold. No AI declares war yet (the Road to War comes with step 8); the player can, from War.
- **Yields.** Each works gives fixed yields (`game.json` `works`), plus per thousand people 1 food, 0.4 production and 1.6 crowns; taxes (light, fair, heavy) are the first policy, the Book of Laws following with goals. Food beyond what the people eat is stored and grows the city; production buys companies (foot 30, crossbows 35, horse 55); crowns pay the companies' upkeep.
- **Mood.** Love drifts to 55 and moves with taxes and hunger; Fear fades; Unrest drifts to 20 and rises with heavy taxes, hunger and debt. Authority below 30 with Unrest above 60 brings riots: production halved.
- **Dilemmas.** One month in four, a dilemma from the real-time game's book (those that ask nothing of the realm first) comes to court; an unanswered one takes its default at the end of the turn.
- **Skellige** is reached only by sea; fleets come later. Nilfgaard's seat on this map is Nazair.

## Steps 3 to 5 as built

- **Cities (step 3).** Each city has a focus a month: the chosen yield rises by two fifths, the others fall by a sixth. Works have a condition: a month under siege takes 15 from two works, a fall 10 from every works, a battle at the gates 10 from one; a works yields by its condition. Repairing mends every worn works at once for 0.4 production a point. A city we hold may be kept: it joins at 25 of 100 settled, yields a quarter of its takings rising to all of them, settles 4 a month (7 with an army in it), and adds to Unrest while below 50. The AI keeps what it has held two months.
- **Goals (step 4).** Chapters follow the calendar until step 8's story moves them: the Dawn to May 1263, the First War to 1266, the Second to 1270, the Third to the end. Each power has two goals per tree in the Dawn and First War and one in each later chapter (12 in all), in `v2/data/goals.json`, written to each ruler (Foltest's crossings, court and vassals; Vizimir's envoys and gold; Henselt's army and the Lower Marches; Demavend's valley, mines and Mahakam; Emhyr's legions, roads, governors and Cintra). Goals stay open in later chapters. The uniques of the design table are in `v2/data/uniques.json`; each unit has one ability (march, siege, walls or spying), and the buildings and wonders sit at their own cities (the Royal Court at Vizima, the Temple of Melitele at Ellander, and so on), counting only while that city is in their owner's hands.
- **Smaller crowns (step 5).** Thirteen courts (Brokilon keeps to itself) each have a type from the design: trade (+8 crowns a month to the suzerain), martial (+5 production), seafaring (+5 crowns, +2 renown), industrial (+7 production), courtly (+4 renown, a little Love) or frontier (+3 production, +3 crowns). Cintra and Angren, not named in the design, are courtly and frontier. An envoy costs 30 renown. Three envoys and the lead give the right to seal; pressure needs our companies to outnumber the court's three to one and a gift of 150 crowns (the court's fear of us, rather than our own people's Fear, which seldom climbs). Any envoy opens a court's roads to our armies; vassals follow their suzerain to war and supply its armies. A favour (a gift of 120 crowns, or an army in its capital for a month) brings two envoys. A rival three envoys ahead courts a vassal away; a suzerain below 30 Authority may see a vassal rise (6% a month), and judges it when its capital falls: depose, annex, pardon or execute. The AI sends an envoy every other month to the courts on its borders, does the favours it can afford there, and seals when it may.

## Step 6 as built

- **The field.** Three lanes (left, centre, right) and a reserve, numbers in `v2/data/battle.json`. Every company is foot, bow or horse for the field (the uniques by their kind). A lane's power is each company's strength times its power, times the ground (horse x1.25 in the open, x0.6 in forest, x0.5 in marsh and mountains; bows x1.2 on hills) and the weather (snow from December to February: bows and horse x0.8; rain in April, October and November: bows x0.85). Defenders of a walled place fight at x1.2 in the field and x1.5 when stormed, times their realm's walls (Vengerberg's walls, the school at Ban Ard) and their own steadiness (crossbowmen, the Vengerberg guard).
- **A round.** Each company loses 14 x the enemy lane's power / its own lane's power (a little luck either way, at most 45). A lane the enemy leaves empty adds half its power to the centre. Morale falls by the share of the side's strength lost; below 25 it breaks. Three rounds at most; then the side with more power times morale left wins (the defender on a tie). Sounding the retreat costs every company 10 more.
- **On the screen.** Tap a company, then a lane: freely before the first round, from the reserve only after it. "Fight a round", "Fight it out" (with the odds of winning as placed, from 24 quiet trial runs) or "Sound the retreat". A battle cannot be closed unfought: closing it fights it out.
- **After.** Losses are written back to the armies; beaten defenders fall back to a friendly region next door or break; victorious attackers take the field; the place's works are worn.
- **Sieges.** An open town falls at once. A walled place is besieged: each month it eats its stores (the harvest stops) and two works are worn; when the stores run out it is starved out. The besieger may storm it (a battle against its garrison: a city foot, foot and crossbows; a castle foot and two crossbows) or, with three times the garrison or the stores nearly gone, offer terms (half the damage of a fall). Marching away lifts the siege. The AI offers terms when it may and storms with twice the garrison; otherwise it starves the place out.

## Step 7 as built

- **Opinions.** Numbers in `v2/data/diplomacy.json`. Each ruler's opinion of each other power moves a fifth of the way each month towards: its old feeling (everyone dislikes the Empire; Kaedwen and Aedirn quarrel over the Lower Marches), its agenda (Temeria -15 for each of Sodden, Brugge, Verden and Cintra another power holds as a vassal; Redania -10 to a rival with more envoys abroad; Kaedwen +10 to a strong army, -10 to a weak one; Aedirn -15 to foreign armies on its borders; Nilfgaard -10 for each alliance a northern power is in), treaties (+20 alliance, +10 trade, +5 open borders), less grievances (a declaration of war 40 to the victim and 10 to every onlooker; a city taken 6; spies caught 20; fading 1 a month), less 50 while at war.
- **Treaties.** An alliance needs an opinion of 40, open borders 10, a trade deal 0 (6 crowns a month each). A declaration of war tears up the two sides' treaties and brings the victim's allies in.
- **War and peace.** Battles won score 2 and cities taken 3. A side takes peace when it is 4 points behind, or after 18 months unless it hates the other below -70; a smaller crown after 6 months. Peace hands back occupied places; kept (annexed) ones stay.
- **The AI.** Each month a power may sign treaties with those it likes (and offer them to the player), makes peace when both would, and once six months have passed may declare war on a power it hates below -50 if it has half again its companies (4% a month). On the board it merges armies sharing a region, pulls armies under half strength home, sends armies to threatened regions of its own, then marches on the nearest enemy region it can take.
- **Spies.** A network grows 5 a month in the chosen court and fades 1 elsewhere; an army of spies standing in a realm's land adds 3. Sabotage (30) wears a city's works; theft (25) takes 15% of the treasury, at most 200; incitement (30) adds 8 Unrest. The chance of being caught is 30% less a quarter of the network (at least 5%). The AI points its network at the power it likes least and acts now and then.

## Steps 8 and 9 as built

- **The story** lives in `v2/data/story.json`: an ordered list of events, each with a chapter, requirements (date, flags, goals met, who controls a region, spy networks, Authority, war scores, a chance a month) and effects (chapter, flags, wars and peace, the North's powers joining by their opinion of the foe, a fallen realm's lands annexed, mood, a new ruler, spy networks, damage, a ruler made aggressive, grievances). An event that asks the player something carries a choice. Events whose flags are already set (a late twin) are made moot, not fired.
- **The Dawn** ends when the Empire has met "The legions mass" and March 1263 has come (35% a month), or in September 1263 regardless: Cintra and Skellige are invaded; Redania, Kaedwen and Aedirn join if their opinion of the Empire is below -40; the player answers the Call of the North.
- **The First War:** Cintra falls when the Empire holds its capital (its lands become the Empire's, and Sodden and Brugge are next); Sodden Hill ends the war when the North's war score against the Empire is six ahead; otherwise an armed truce in June 1265.
- **The Second War** brews from September 1266: the Empire points its spies at Aedirn. From June 1267 Thanedd strikes if its network in Aedirn is 30 or more (Aedirn and Lyria invaded, the valley burned, Henselt takes the Lower Marches), unless a Temerian network of 50 in the Empire uncovers it from March 1267; otherwise the war comes plainly in January 1268. The player chooses whether to march to Aedirn's aid. The Peace of Cintra in June 1269.
- **The Third War** brews from January 1270: the Empire points its spies at Temeria. A Temerian network of 20 in the Empire warns of the plot when the imperial one reaches 40 (double the guard, hunt the agents, or ignore it). Foltest falls to the Kingslayers if the imperial network reaches 60, the king is unguarded and Temeria's Authority is below 60 (30% a month): a regency council, Love and Fear down, Unrest up. Demavend may fall the same way. Radovid rises in Redania from 1271 and makes it aggressive. The Empire invades Temeria and Redania in April 1271.
- **Endings** (`v2/data/endings.json`): domination (60% of the great and middle crowns' capitals) or faith (Devotion 1,500 and twice every other power's) end the game at once; at the end of December 1272, the Empire triumphant (it holds two of Vizima, Tretogor, Ard Carraigh and Vengerberg), one king rules the North (a northern power holds three), or the North holds. The player's fate: at the head of the North, its own master, an imperial province, or fallen (Vizima lost).
- In trial reigns with an idle player, the story ran to the Third War every time, and the endings varied (the North holds, the Empire triumphant).

## Step 10 so far
- Balance is checked by whole reigns (`tools/v2play.mjs`), with the AI as Temeria's steward and with Temeria idle: see docs/v2/ROADMAP.md. The AI raises companies (up to four a month) while their upkeep stays within 70% of its crowns, 60 companies at most, buying with crowns when short of production and holding six months of upkeep. Companies' upkeep is doubled (foot and crossbows 4, horse 8, the uniques likewise); crowns a thousand people 0.8.
- Crowns pay where production does, at 3 crowns a point: companies, repairs, unique buildings and wonders. The city card has a "Pay with" switch.
- The swap waits on the owner: v2 to the main address, and the real-time game kept at its own address.
