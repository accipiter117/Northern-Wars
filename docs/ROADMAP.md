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
| M18 Music and sound | A looping soundtrack that starts on the first tap, fades when put away and ducks under alerts; synthesised interface sounds for taps, sheets, tabs, speed, orders, laws, coin, refusals, alerts, war and long presses; music and effects volume and mute in Help; music cached by the service worker with Range support | Done |
| M18 Rulers who govern | Foreign rulers assess threat, opportunity and purse each month and choose a posture (Grow, Arm, Expand, Consolidate, Scheme); standing armies with upkeep, a court that taxes hoards, debt with desertion and offers to Temeria; building from the full catalogue; wars with aims, musters and reasons in place of rivalry dice; deterrence, probes and harder-to-break pacts with Temeria; pacts between realms that last; posture and war aims learnt through embassies and spies | Done |
| M19 Conquest and battles | Towns that change hands change realm for good: occupation, annexation into full crown settlements, the capture choice (spare, sack, expel), grants, integration, revolts, claimants, fear and a league against Temeria, vassals; battles fought in phases with reserves and retreats, sieges you can watch, field attrition; borders that follow the towns | Done |
| M20 One map, a kingdom already built | The crown no longer builds: every place starts with the works its land gives it (spaces from the traced geography), works wear and break and are rebuilt, patched or left; labour through the seasons with fuel, royal calls and a Labour screen; one map with two levels (the kingdom up close, a board of the North far off) and three orders a month on the board | Done |
| M21 Wealth, hands and armies | Trade in five goods with surplus, shortage and prices; one deal per partner; home sales of surplus; taxes by estate; war income; loans; labour as a front-line lever with presets and town focus; armies mustered by population, retinues, mercenaries and pay; threats scaled to the realm; screens cleared of figures that lead to no decision | Done |
| M22 A lighter, livelier, fairer realm | A: frames only when something needs drawing, gentle and capped frame rates, Battery saver; B: every traveller stands for something real, life at the works, witchers on the road; C: one military of companies from levies, standing troops, retinues and hired swords, tuned against domestic threats; D: Trust, Unrest and Dread in place of Authority and Stability | Done (A to E) |
| M23 A busier map, armies on the move | A: the game's own dialog, Undo for what can be taken back; B: labour made easy; C: armies and figures on the move, merge and split; D: a fuller map everywhere | Done |
| M24 A rich, grim crown | A: a compact top bar of symbols; B: Love, Fear, Authority and Unrest; C: a rich crown at peace and a Steward's report; D: money from fighting; E: many armies and levies that join them | Done (A to E, and a follow-up on beasts, witchers and the camera) |
| M27 Lords worth having, traitors who pay | A and B: what lords give (guarding their lands, retinues, dues) and want; C and D: rebellion as a war and the Judgement; E: raising new houses | In progress (A to D) |
| M26 The Book of Laws and the faiths | A and B: the Book of Laws in chapters of rival paths, cooldowns, laws with headline effects; C and D: faiths with Devotion, perks, powers and clashes, and cooldown rings; E: faith and laws on the map | Done |

## M27 acceptance criteria
Parts A and B, what lords give and want:
- Loyal houses clear threats in their lands and lower Unrest there; disloyal ones let them fester.
- Retinues arrive as companies between levies and standing companies in grade, sized by lands and loyalty, shown on the house card and in the muster preview.
- Dues are a real line (about a fifth of peace income from five loyal houses), fall with disloyalty and stop in rebellion.
- One want a house at a time (land, command, war, honours, justice); granting it turns ambition into loyalty, ignoring it into grievance.
- At most one open demand at a time; Love, Fear and Authority shape the lords; the house card fits one screen.

Parts C and D, rebellion as a war and the judgement:
- A rising turns the house's holdings (garrisons and banners) and puts its host in the field at its seat; disloyal houses may join with their own hosts.
- It is fought with the ordinary armies, battles and sieges, and ends when the seat falls, the lord is taken in battle, or he sues after heavy defeats; a weak crown can be forced to terms. The old tally is gone.
- The Judgement card pauses the game: portrait slot, crimes, and pardon, fine and hostage, strip, exile or execute, each showing its effects.
- Punishing a rebel carries no tyranny penalty; punishing a loyal lord still does.

## M26 acceptance criteria
Parts A and B, the Book of Laws:
- Five chapters, each with two rival paths of three tiers; a tier needs the one below; signing a path's first law locks the rival until the path is repealed from the top down.
- Signing shows the headline effect, cost, groups who cheer or grumble and any act unlocked, asks once, takes effect over the enactment days, and moves Love, Fear and Unrest at once with a one-line reaction.
- The ink dries 30 days after any signing or repeal; a law changed rests 90 days; repealing angers those who liked it, shown before confirming.
- Taxes, the court and bounties are quick settings in the Treasury and Military with a 30-day rest.
- tools/laws.mjs runs a reign with and without each law; every law moves its headline by about 20% or its stated flat amount; the table is in BALANCE.md.
- Save upgrade maps the old laws to the Book with no cooldowns running.

Parts C and D, the faiths and their powers:
- Devotion 0 to 100 per faith with levels at 20, 40, 60, 80 and 100; perks cumulative; a power at level 3 (and level 5) with cooldowns.
- Acts: endow a temple, church land, preachers, the festival in season, a royal pilgrimage; the faith of the crown grows twice as fast.
- Rival faiths clash only where both are above 40; Freedom of worship halves clashes; the inquisition makes the Fire win and the losers angrier. AI realms on the same rules.
- Cooldown rings on every resting button, a long press for the days left, a gold dot when ready; the faith sheet on one screen; a Court badge when a power comes ready.
- tools/laws.mjs measures Freedom of worship and Faith of the crown; tests for levels, perks, powers, rests, clashes and the version 28 save.

Part E, the faiths and laws on the map:
- Close up: pyres after a purge, groves and stone circles of the Old Ways, Melitele's hospice banners, festival processions, the king's pilgrimage, the king's riders on the roads and gibbets under public executions.
- Which marks stand is a pure function tested in Node; a browser test draws them round Vizima without errors.

## M24 acceptance criteria
Part A, a compact top bar:
- One row of symbols and numbers, no words: coin with the month's change, grain, fuel, iron and cloth; a second slimmer row of the meters, each a symbol, a number and a thin bar.
- Every symbol opens its detail; a long press names it.
- Fits 360px in portrait without wrapping and sits neatly in landscape; tests for both.

Part B, Love, Fear, Authority and Unrest:
- Love and Fear replace Trust and Dread; Authority is derived (the higher plus a quarter of the lower) and replaces Standing.
- Authority decides tax gathered, levies answering, houses obeying, riots and revolts, and deposition; the flavours of a loved and a feared crown.
- Unrest of 30 to 50 has no penalties; Dread's sources and effects folded into Love, Fear and Unrest.
- Gibbets, heads on the gates, bunting and a procession on the map, close up and cached.
- Save upgrade; tests for each meter's causes, the formula, a feared crown's taxes and levies, Fear's fading and collapse, Unrest under 50, and nothing reading Trust, Dread or Standing.

Part E, many armies:
- Named armies with commanders, no limit beyond the treasury and the men.
- Every city and town can call its levy as companies from its card: hold, hunt a nearby threat, march to join, merge.
- Several musters at once, the levies converging on the map.
- The War tab lists every army (men, spirit, pay, orders) and merges any two where they stand.
- Tests.

Part D, money from fighting:
- Threat purses (a bandit hoard and bounty, a beast's reward and trophies, a Scoia'tael bounty under bounties; a witcher's fee netted off), shown on threat cards.
- Raid loot raised, with caravans and herds seized; the raided hate and fear Temeria; the expected loot shown before the order.
- Ransoms for captured lords and commanders.
- Each its own line in the Steward's report and the War group of the ledger.

Part C, a rich crown at peace:
- A well-run crown at peace about +1,500 a month, a careless one about break-even, an idle one slowly into debt; a large army in the field for a season eats most of a year's peace surplus; checked with tools/crowns.mjs and recorded in BALANCE.md.
- Higher yields (head tax, tithe, goods sold abroad and at home, mines); upkeep follows staffing; a works being mended costs only its repair.
- Conquered towns pay their garrison and upkeep from their own takings and never cost the crown; income from about a quarter up to the whole with integration and repair; a sacked town pays its loot, then almost nothing.
- The Steward's report each month (inbox and Treasury) with the top three costs and a one-tap fix each; a pressure-strip warning for work under half manned; the ledger in Taxes, Trade and sales, Crafts and goods, War and Other, each opening to its lines.
- Balanced mans crafts, mines, pastures and woods properly and never leaves thousands idle.

## M23 acceptance criteria
Part A, in-app dialogs:
- One dialog in the game's style (src/ui/dialog.js) that returns a promise; no confirm, alert or prompt anywhere in src.
- Reversible orders happen at once with an Undo in their notice; Undo restores the realm exactly.
- A dialog only for what cannot be undone: stand down a company, disband an army, accept terms of peace, abandon the reign.
- A test fails if confirm(, alert( or prompt( appears in src; the browser tests fail on any browser dialog; the dialog fits 360x640.

Part B, labour made easy:
- The pressure strip opens Labour; Labour comes first in the Realm tab.
- One screen at 360x640 with no scrolling: a stacked bar with idle hands as a gap; Harvest, Winter, War footing, Rebuild and Balanced, showing Custom after any change; at most three lines.
- Adjust: a slider per kind of work; no + and − buttons.
- A town's focus as one row on its card.
- A seasonal prompt in the pressure strip.
- Tests: the sheet fits 360x640 without scrolling; settings, Custom, sliders, calls, the focus row and the prompt.

Part C, armies and figures on the move:
- Columns sized by men, with banner, dust and wagons; camps at night; foraging parties.
- Routes with days to arrive; a long press shows an army's details.
- Figures (commanders, envoys, couriers, spies, witchers and lords), each tied to a real action, with a long press; fog of war respected.
- Merge under a chosen commander; march to join; divide.
- Tests: days to arrive, merge, join, divide with nothing lost, figures from real acts and gone on arrival, the same seed with or without figures, the save upgrade, and the browser.

Part D, a fuller map:
- Deterministic countryside in the map's tiles: farmland by people with seasonal colours, orchards, farmsteads, windmills, copses, points of interest and wild land; foreign realms included.
- Density by population; nothing over roads, rivers, lakes, places or labels.
- City life close up; burnt or bare fields after sacks and famine; the board stays clean.
- Budgets respected; Battery saver thins it.
- Tests and before/after screenshots.

## M22 acceptance criteria
Part A, battery and performance:
- The map is drawn only when something needs drawing; paused and idle, no frames are asked for until the next event.
- Paused with ambient life on screen, about 8 frames a second; running, at most 30 unless the camera moves.
- Battery saver in Help (on by default on phones): 30 frames a second always, half the ambient sprites, no wake lock.
- Hidden: nothing draws, the realm pauses, the music stops, the audio context is suspended and the wake lock released; shown again, drawing and sound resume. The wake lock is held only while running with the setting on.
- Tests count frames paused and idle, paused with life, running and hidden, and check the audio and the wake lock.

Part B, life on the map that means something:
- Every moving sprite stands for something real (home sales, deals, a holy place, a company on patrol, river trade), and its count follows that source; sprites with no source are gone.
- A long press on any sprite says what it is in one line, with what it is worth.
- Life at the works close up: figures by staffing, season and condition; a scorch mark where damaged, builders where mended.
- Witchers ride out to the lair, fight there, and ride home if they won; a long press says who and for how much.
- Life at the works only close up, capped on screen, halved by Battery saver.

Part C, one military:
- Every soldier belongs to a company; armies are lists of companies; one strength formula everywhere.
- Levy companies of about 200 by the place's troop types, standing companies, retinues and hired companies.
- A town's Military card shows its garrison companies, its possible levy and how fast, and standing companies near; Call the muster raises its levy companies on the spot.
- Raise an army gathers standing companies, levies, retinues and hired companies, with the same preview; companies keep their identity and can be detached; armies in one place can merge.
- tools/skirmish.mjs: a city's garrison and muster beats ordinary threats at least 80% of the time, a town's a small band at least 75%; only large bands, famous monsters and war parties need an army. Table in BALANCE.md.
- Save version 23: armies become lists of companies, with nothing lost.

Part D, three meters:
- The top bar shows Treasury, Granary, Trust in the Crown, Unrest and Dread; all five fit 360px, each a button opening three to five reasons, biggest first.
- Trust, Unrest and Dread each move with the causes in the brief and do what the brief says when high or low.
- Every Authority cost becomes a Trust cost or an Unrest rise; every read of Authority becomes Standing (from the three, never shown).
- Deposition after months of very low Trust together with very high Unrest.
- Tests: each meter moves with its causes; nothing reads or spends Authority; deposition follows Trust and Unrest; the five meters fit 360px.
- tools/crowns.mjs: the steward keeps Trust high and Dread low; the tyrant runs high Unrest; the idle crown loses Trust. Recorded in BALANCE.md.
- Save version 24.

## M21 acceptance criteria
Part A, trade in five goods:
- All trade folds into Grain, Timber and stone, Iron and arms, Cloth and Luxuries; the underlying goods stay for production.
- Each good has a monthly balance shown as one line; prices rise with shortage and fall with glut.
- One deal per partner (board Trade order or the realm's card), selling a good it wants and buying one it offers, so much a month; partners' wants and offers come from their land and change with war and worn fields.
- Unsold surplus sells at home for less than abroad unless held back with one toggle.
- War, closed borders and a fallen partner cut deals and raise the price of what they supplied.

Part B, more ways to make money:
- Taxes by estate (Towns, Villages, Lords; Light, Fair or Heavy) with the crowns each setting yields shown before choosing, replacing the old tax laws.
- Tolls and river dues stay; loot, ransoms, coin in peace terms, tribute and requisition each show as their own income line.
- Loans from the Vivaldi bank with monthly repayments and interest, capped by income; missed payments raise the rate and cost Authority.
- A gentler crowding penalty on crafts with a soft cap below the taxes.
- Save version 20.

Part C, directing your people:
- A labour strip on the Realm tab and the map's pressure strip show where the hands are and the most pressing shortage, with a tap to the Labour screen.
- One-tap presets (Harvest, Winter, War footing, Rebuild) over the + and − per kind of work.
- A town's focus (None, Food, Iron and arms, Cloth, Timber) pulls its district's hands to that work.
- Every change shows its result before it is made ("+120 iron a month, −60 grain").

Part D, armies of a real size:
- Levies by population (city about 8%, town 6%, village 4%), taken from the place's hands and returned when stood down.
- Raising an army shows men, hands lost, monthly cost and days to gather; levies gather along the roads before it can march.
- The houses' retinues by size and loyalty, shown before calling; mercenary companies of 400 to 800 for a season.
- Pay by men and type with field pay on campaign; unpaid armies lose morale, then desert; the Military tab shows men under arms, cost and months it can be paid.
- Foreign realms muster by the same rules.
- Save version 21.

Part E, threats scaled to the realm:
- Camps, commandos and raiding parties scale with the realm's people and are capped, so a city's levy or a standing company beats an ordinary threat.
- Each threat shows its strength against the nearest force ("Bandit camp: about 120 men. Maribor's levy: 450.").
- Walls count fully; garrisons win most raids on walled towns; villages need patrols.
- A normal reign meets a nuisance, not a drain.
- Save version 22 rescales threats already on the map.

Part F, clearing the clutter:
- Every screen audited: cards open with three or four lines plus Details; lists longer than eight rows are grouped or folded.
- The Treasury is one ledger of grouped income lines (taxes by estate, trade, sales, tolls and dues, war, loans) and expense lines (armies, upkeep, repairs, court).
- The audit is written into DESIGN.md.

## M20 acceptance criteria
Part A, spaces from the land:
- Every settlement, Temerian and foreign, has one to three spaces of land (cities up to four), each tagged coast, lake, river, plain, hills, forest, marsh or mountain, plus a town square for towns and cities and defences for walled places and castles; known gold deposits are seam spaces.
- tools/spaces.mjs proposes them from data/geography.json and writes data/spaces.json, keeping its hand-written rules, defaults and overrides; Vizima has the lake and the Ismena, Petrelsteyn the Jay Forest and the Tukaj Hills, Gors Velen the Velen marshes, Houtborg the Mahakam foothills, White Bridge and La Valette the Pontar, Mayena and Armeria the Ina, Red Fort the Yaruga; Temeria has no sea coast.
- Each space holds one fixed works (the square and defences a list), from the land kind and lore; peat cutting, herbalists and the royal mint are new works; the build action and menu, build costs and slots are gone.

Part B, condition, damage and repair:
- Every works has a condition from 0 to 100 and yields by the lower of condition and staffing.
- Raids, foraging armies, sieges, captures, plunder, sacks, storms, floods, fire and wear lower it, faster when upkeep goes unpaid; cards say why.
- A damaged works raises a repair decision (rebuild, patch, leave it) showing cost, time, hands and result; patches can fail again in winter; repairs show on the card; four crews at once.
- Captured towns come with their condition; sacked towns' works stand in ruins; annexed towns are mended like any other.
- Save version 17 carries old buildings into spaces, finishes or keeps what was under construction, and turns M19 ruins into damaged works.

Part C, labour through the seasons:
- Every settlement has hands; villages within a day's walk by road lend theirs to the nearest town or city; spare hands go where they are short.
- The crown splits the hands by kind of work (fields, woods, mines, pastures, fishing, crafts, repairs, levies), spread over the matching works in proportion; a works can be pinned.
- Seasons decide the work (fields March to October, fishing closed by winter weather, pastures busiest at the shearing); harvest muster, winter turn and raising the levies act and cost as described; military levies take hands.
- Fuel from timber, charcoal and peat; a cold winter brings unrest and deaths in the poorest places.
- The Labour screen in the Realm tab: season strip, grain at first frost against winter's need, fuel, hands by kind with notes, the calls, warnings for hands short or idle.
- Save version 18.

Part D, one map, two levels:
- One camera with a level-of-detail switch at about two thirds of the opening zoom and a cross-fade between the kingdom view and the board.
- Kingdom view: works pips beside settlements; the settlement card shows land tags, hands within a day's walk and each works' condition and staffing; the top bar shows meters, date, season and one pressure line.
- Board: large realm names, markers with men in hundreds (only where seen) and works pips (red when damaged), routes between neighbours (shared borders and foreign roads), tints by owner, dashed lines for marches; "The North", the month and its orders in the top bar.
- Tapping a realm opens a short card; tapping Temeria or zooming in returns to the kingdom view; a double tap zooms in. The board is a light overlay on its own layer within the frame budget.

Part E, orders on the board:
- Three orders a month (March, Trade, Envoy), shown as "2 of 3 orders set"; they resolve at the turn of the month together with the rulers' own moves; marches show as dashed lines; existing rules unchanged.
- Save version 19.

## M1 acceptance criteria
- The page loads on GitHub Pages and runs on a phone in portrait and landscape.
- Temeria, neighbouring lands, terrain zones, rivers, Lake Vizima, roads and all settlements render from data/geography.json, with names.
- Pan, pinch zoom and tap work. Tapping a settlement opens its card (name, type, population, holder; placeholder values are fine).
- The calendar advances in real time; pause, 1x, 2x and 4x work; the date and season show in the top bar.
- Ambient caravans and patrols travel the road network and barges move on the Pontar and Ismena; tapping a unit shows what it is.
- Save and load work via localStorage, plus JSON export and import.
- npm test passes: sim tests, the 10-year headless run, and Playwright smoke tests with screenshots in portrait and landscape.

## M19 acceptance criteria
Part A, how towns change hands:
- Villages and unwalled places fall to an army holding them a day; walled towns, cities and castles need a siege.
- Captured towns are occupied during a war (requisition allowed, no building or granting), drawn hatched in the occupier's colour.
- Ownership changes only by a peace, a deal, a revolt or a defecting house. A town that becomes Temerian is a full crown settlement (peoples keeping their origin, faith, prosperity, stores, buildings with damage, garrison, roads), governed like any other.
- A realm that loses every town falls and its ruler becomes a claimant; a small realm may be offered vassalage instead.
- Save upgrade: towns held after their war ended are annexed; a realm left with none falls.

Part B, what a town costs:
- On capture a short card (game paused): spare, sack or expel a people, with their consequences (loot, damage, smoke, refugees, Scoia'tael, the Eternal Fire, kin realms, fear).
- At the peace, crown demesne or a grant to a great house; resettlement once annexed.
- Integration 0 to 100 on every annexed town, as a bar on its card, rising and falling for the reasons given, with lower taxes and levies and more unrest when low.
- Revolts that start, spread, may bring in the old realm, can be crushed or treated with, and free a town held for a season.
- Claimants with fading legitimacy, agitation, exile armies; pension, spy, hand-over at the deal table.
- Fear of Temeria per ruler, shown on the Diplomacy tab and in mood reasons; a league when high, a joint war when extreme and Temeria weakened. AI realms follow the same rules.

Part C, battles and sieges you can watch:
- Field battles in three phases (skirmish, melee, rout and pursuit), several rounds each, losses and spirit by strength, troops, ground and weather; a side breaks on spirit or numbers; outcomes over many trials match the old odds; the odds shown stay truthful.
- A fifth of each army in reserve; commit (from the melee) and retreat (any time) for the crown, by temper for captains.
- Events from troops, ground, weather and commanders, one line each; captured commanders ransomed at the deal table.
- Battle pace: 1x for our battles, or pause by a setting.
- Sieges with walls (none, timber, stone) worn by works, garrison, food in days, sickness and desertion, sallies, relief, surrender on terms, and orders to storm (odds and losses shown), starve or lift.
- Field attrition by supply, winter, disease and desertion, shown on the army card; a Chronicle report for every battle and siege.

Part D, the map:
- Territory borders that follow the towns (nearest town within its traced realm) and redraw when a town changes realm.
- A battle in progress drawn on the map, opening its Battle card on a tap; siege art (tents, works, damaged walls, smoke).
- Smouldering sacked towns, refugee columns of expelled peoples, rebel banners over risen towns.
- The foreign town card shows the town's worth and its walls.

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
