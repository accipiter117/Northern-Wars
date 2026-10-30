# Balance notes

How the realm behaves over a long reign, and the dials that shape it. Every number lives in `data/`; nothing here needs code changed.

## Thirty years, four crowns
From `node tools/longrun.mjs 30 <crown> 1,2,3`, averaged over three seeds and rounded down. Rerun for M19 A and B (conquest); M18 figures in brackets.

| Crown | What it does | People after 30 years | Treasury | Raids suffered | Depositions | Wars |
| --- | --- | --- | --- | --- | --- | --- |
| Idle | Nothing; every decision left to its default; no companies; rulers' requests left to lapse | about 52,200 from 54,240 (52,300) | about 32,800, levelled off (35,700) | about 1,150 (1,090) | about 1 (0) | 0 to 4 (0 to 3) |
| Steward | As in M15 (builds earners and food in turn, opens routes, answers generously, keeps a standing army that grows with its income, hunts what it sees), and since M17 holds audiences: a trade pact with every realm that trades and a non-aggression pact with every realm, each signed when the ruler accepts it as it stands or for 300 crowns or less; rulers' proposals taken when they are worth it to us, demands refused, warnings heeded | about 76,200 (84,400): about 83,000 in two seeds, 62,900 in the third | about 217,800 (253,000) | about 135 (128) | 0, 0 and 2 (0) | 0 to 1 (0 to 1), and one campaign of its own every eight years |
| Spendthrift | As the steward, audiences included, but borrows to the bankers' limit to build faster, and recruits only once out of debt | about 42,600 (70,200), a quarter of its towns lost for good in two of three seeds | at the limit or close to it (152,400) | about 661 (435) | about 12 (3) | 3 to 8 (1 to 3) |
| Tyrant | Heavy taxes, lords taxed and fined yearly, martial law, the Fire, expulsion, a frugal court; no companies; no audiences | about 24,500 (47,900), 14 to 16 towns lost for good | at the limit (13,800) | about 792 (1,140) | about 11 (1) | 7 to 8 (9 to 11) |

### Three meters (M22 D)
From `node tools/longrun.mjs 10 <crown> 1,2` and a month-by-month trace of each crown, seeds 1 to 3, rounded down. Numbers in data/meters.json.

| Crown | Trust | Unrest | Dread | What drives it |
| --- | --- | --- | --- | --- |
| Steward | 48 to 58 in peace | about 18 | 0 to 6 | Full granaries in winter, threats cleared, repairs; decrees cost it a little. A war it chooses and loses (seed 3, year 9) drops it to near 0 for a year, then it climbs back. |
| Tyrant | 15 after the first year, then 0 | 50 in year 1, then 31 to 59 (mostly the 40s) | about 22 | Every decree, heavy taxes on all three estates, raids left unanswered, hunger and ruined works; it strips a lord twice a year. |
| Idle | 56, 34, then 0 from year 3 | 22 in the first years, about 35 to 40 once Trust is gone | about 23 | Raids left unanswered (at most 3 a month) and works left in ruins, against the pull back toward 50 (about 2 a month at 0). |

- Low Trust bites in three ways: people drift away (0.05% a month at 0), prosperity slips (0.5 a month at 0) and towns grow angrier (up to +7 to their unrest at 0). An idle realm keeps a little over 80% of its people after ten years (the long-run test's floor), against about 87% before M22 D.
- A war is judged by the month: battles move Trust by at most 8 a month and towns lost or taken by at most 10 (the capital's fall, 30, is not capped). Without the caps a single lost war cost the steward 60 Trust from battles alone.
- Unrest counts a point for every 300 men away with the levies.
- No crown in these runs was deposed: it takes Trust under 20 and Unrest over 70 together for six months.

### One military (M22 C)
Every soldier is in a company, and everything is measured by the one strength formula in data/forces.json: garrisons as companies of garrison soldiers (1 a man), levies as militia spearmen (1.1 against soldiers since M22, from 0.8) with crossbowmen from towns or bowmen from villages and the woods, retinues as men-at-arms and militia, hired companies by their troop type. A place defends itself with its garrison and its own muster, behind its walls.

From `node tools/skirmish.mjs` (the chance the defenders win; garrison plus its own muster, walls where they stand; the company is 100 men-at-arms at the start's morale):

| Threat | Men or beasts | City (Maribor) | Town (White Bridge) | Village (Mortara) | One standing company | Needs an army |
| --- | --- | --- | --- | --- | --- | --- |
| Bandits, a small band | 30 | 100% | 100% | 37% | 99% |  |
| Bandit camp, ordinary | 156 | 100% | 89% | 0% | 57% |  |
| Bandit camp, at its largest | 240 | 100% | 69% | 0% | 27% | yes |
| Scoia'tael commando, ordinary | 35 | 100% | 98% | 3% | 88% |  |
| Scoia'tael commando, at its largest | 120 | 100% | 53% | 0% | 15% | yes |
| Raiders over the border | 80 | 100% | 97% | 2% | 86% |  |
| A war party, in war | 300 | 99% | 42% | 0% | 10% | yes |
| Drowners (a lair, marsh) | 10 | 100% | 100% | 23% | 99% |  |
| A water hag (famous, marsh) | 2 | 100% | 72% | 0% | 32% | yes |
| Wolves (a lair, forest) | 11 | 100% | 100% | 44% | 100% |  |
| A werewolf (famous, forest) | 1 | 100% | 86% | 0% | 53% | yes |
| A leshen (famous, forest) | 1 | 100% | 57% | 0% | 19% | yes |
| Harpies (a lair, hills) | 10 | 100% | 100% | 23% | 99% |  |
| A griffin (famous, hills) | 1 | 100% | 77% | 0% | 38% | yes |
| Wyverns (a lair, mountains) | 2 | 100% | 100% | 15% | 98% |  |
| A forktail (famous, mountains) | 1 | 100% | 82% | 0% | 45% | yes |

- **Targets met**: a city beats every ordinary camp, commando and lair (100%); a town beats a small band (100%) and an ordinary camp (89%).
- **What needs an army**: the largest camps (up to 240 men, raised from 110 in M21 E), the largest commandos (up to 120, from 60), war parties (300) and the famous monsters (three times as dreadful as before). A town wins against these only 42 to 86% of the time, and one standing company 10 to 53%.
- **Villages cannot stand alone** (37% against even a small band), so patrols and companies near them still matter.
- **Over twenty years** (`node tools/longrun.mjs 20 <crown> 1,2,3`, M21 E in brackets): the steward saves as before (50,000 to 57,000, net +840 to +1,025) and suffers 9 to 17 raids (14 to 39); the idle crown 562 to 760 raids (675 to 785), now that towns rise in their own defence; the warlord's largest field army is 6,280 to 6,665 men (5,780 to 5,880), its levies now whole companies, and it still saves.

The dials, in data/forces.json:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `levy.size`, `levy.spears` | 200 men a company, 0.6 spearmen | Bigger levy companies; more spears, fewer bows |
| `suits.soldiers.militia` | 1.1 | Levies stronger against armies |
| `garrison.perMan` | 1 | Garrisons stronger |
| `threats.bandits.capMax`, `threats.scoiatael.capMax` | 240, 120 | Larger camps and commandos at their worst |
| species `power` (famous beasts) | three times M21 | Famous monsters harder |

### Threats and clutter (M21 E and F)
Threats now grow with the realm's people (0.7 to 1.3 of their old size) and are capped (a camp 110 men, a commando 60, raiders 120, or 300 in war); walls count in full. From `node tools/longrun.mjs 20 <crown> 1,2,3`, raids suffered and villagers killed over 20 years (C and D in brackets):

| Crown | Raids in 20 years | Killed in raids | Days a road was held |
| --- | --- | --- | --- |
| Steward | 14 to 39 (15 to 21) | 15 to 46 (17 to 27) | 218 to 355 (223 to 368) |
| Standing (3,000 men in companies) | 14 to 38 (19 to 23) | 23 to 44 (24 to 28) | 349 to 469 (330 to 369) |
| Idle (no companies) | 675 to 785 (675 to 794) | 951 to 1,033 (951 to 1,064) | 5,464 to 6,254 (5,464 to 6,621) |
| Warlord (no companies) | 688 to 836 (669 to 856) | 1,130 to 1,321 (1,087 to 1,450) | 5,606 to 6,813 (5,618 to 7,207) |

- **A normal reign meets a nuisance**: about one raid a year and two villagers dead, with companies on patrol. Even a crown with no companies loses about 50 villagers a year in a realm of 55,000; the raids hurt it through broken works, not deaths.
- **The caps change little in a well-run realm**, because its camps never grew that large: they stop the runaway case (a poor, restless realm breeding camps of 200 men) and keep raiders in peace to a size a town's levy beats. Every camp sighted in the tests loses to the nearest company or levy.
- **The steward now gives its iron towns an iron focus** (the brief's steward uses focus): at year 20 it holds 38,000 to 59,000 crowns and nets +831 to +1,036 a month (before: 56,000 to 61,000 and +943 to +1,068). In one seed of three its people end lower (52,500 against 59,800), as the focus draws hands from the fields: a focus is a trade, not a free gain.
- **Walls**: a walled town's garrison now fights at a full 1.5 times its strength until the walls fall below a third, so raids go for the villages (as the brief asked, villages need patrols).

The dials, in data/forces.json `threats`:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `scale.basePop`, `min`, `max` | 54,000; 0.7 to 1.3 | Threats grow faster with the realm |
| `bandits.capMax`, `scoiatael.capMax`, `raiders.capMax`, `raiders.warCap` | 110, 60, 120, 300 | Larger ordinary threats |
| `wallsBonus` (companies behind walls) | 1.5 (crossbows 1.8) | Walled towns hold harder |

### Hands and armies (M21 C and D)
Armies are now mustered from the people (about 8% of a city, 6% of a town, 4% of a village at a full call), the lords send retinues by their lands and loyalty, and companies cost 0.55 of their old upkeep. From `node tools/longrun.mjs 20 <crown> 1,2,3`:

| Crown | What it does | Under arms | Treasury at year 20 | Net a month at year 20 |
| --- | --- | --- | --- | --- |
| Standing | Recruits companies until it keeps about 3,000 men, patrols and hunts with them | 27 to 29 companies (about 3,000 men) plus the garrisons | 2,800 to 14,000, still saving | +851 to +984 |
| Steward | As in A and B, a small standing force | about 2,200 to 2,400 | 56,000 to 61,000 | +943 to +1,068 |
| Warlord | Musters the whole levy and the lords, hires a company, pays with plunder and loans | about 5,700 to 5,800 in the field at once (about 8,000 with a standing force beside it) | 14,000 to 22,000 | +1,222 to +1,612 |
| Idle | Nothing | none beyond the garrisons | 29,000 to 30,000, falling 258 to 300 a month | −300 to −258 |

- **A peaceful realm can keep about 3,000 standing men and still save** (the target), and its works stay at 80 to 86% because companies take no hands from the fields.
- **A full muster is about 5,800 men** (levy, retinues and a mercenary company). With the standing companies beside it the realm puts about 8,000 in the field for a season, as the brief asked, but every levied man is a hand gone from the works until he is stood down.
- **The idle crown still slides**: its works fall to ruin by year 20 and it loses about 270 a month.
- **Without companies the villages suffer** (the warlord, with none, sees 670 to 860 raids in 20 years against about 20 for the standing crown): Part E answers this.

The dials, in data/war.json, data/labour.json and data/forces.json:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| war `raise.muster.share` | city 0.08, town 0.06, village 0.04 | Bigger levies, more hands lost |
| war `raise.retinue.perPerson` | 0.1 of a lord's people | Bigger retinues |
| war `raise.pay` levy, retinue, field | 0.22, 0.28 a man, ×1.5 on campaign | Dearer armies |
| war `raise.unpaid` | morale −20 a month, desert 12% below 50 morale | Unpaid armies melt faster |
| labour `focus.boost` | 1.6 | A town's focus pulls harder |
| forces companies `upkeep` | 0.55 of M20 | Dearer standing companies |

### Trade and money (M21 A and B)
More ways to earn: taxes by estate (the lords' dues and the villages' tithe are new), surplus sold at home (grain that once spoiled now sells), trade deals, war's takings and loans. From `node tools/longrun.mjs 30 <crown> 1,2,3`, at year 30 (M20 C in brackets):

| Crown | People | Treasury at year 10 | Treasury at year 30 | Net a month at year 30 |
| --- | --- | --- | --- | --- |
| Idle | about 33,100 (29,400) | 62,000 to 66,000 | 1,000 to 1,900 (at the floor) | −112 to −70 |
| Steward (deals with every partner, taxes Fair) | about 58,900 (57,000) | 38,000 to 51,000 | 14,000 to 34,000 (800 to 2,500) | +580 to +707 |
| Spendthrift | about 60,100 (56,500) | 42,000 to 47,000 | 19,000 to 35,000 | +480 to +541 |
| Tyrant (every tax Heavy) | about 16,900 (12,200) | 23,000 to 30,000 | at the debt floor by year 20 | −336 to −34 |

- **The well-run crown now has money to spend.** At the start the realm nets about +1,000 a month at Fair taxes (M20: about +800 before repairs): towns about 1,200 (head tax and market dues), villages 60 to 280 (the tithe follows the harvest), lords about 300. The steward's deals sell its timber and stone surplus to Redania, Kaedwen and others and buy cloth and luxuries it lacks: about +200 a month in exports against 150 to 210 in imports, most of it resold at home while the realm is short. This is the headroom Part D's standing army will need (the target, about 3,000 men plus the garrisons while still saving, is checked there).
- **Heavy taxes pay, at a price.** Towns Heavy brings in about +30% (roughly +370 a month) and angers the burghers (towns' unrest +3, prosperity −2); villages Heavy about +30% and slows growth; lords Heavy doubles their dues (about +300) and costs the houses' loyalty through the nobles' mood. The tyrant, taxing everything Heavy, still ends in debt: its works fall to ruin and its people leave.
- **The idle crown slides, more slowly than in M20.** It now banks the lords' dues and the home sales of its surplus, so it hoards about 64,000 in the first decade (M20: 38,000); from then on its ruined works cost more than they earn and it loses 70 to 250 a month, nearly broke by year 30 (M20: at the debt floor by then).
- **Home sales** (0.6 of the home price) earn about 300 a month for the steward, most of it grain the granaries could not keep.

The dials, in data/market.json, data/economy.json and data/laws.json:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| market `home` | 0.6 | Home sales of surplus earn more (and the idle crown less fast into debt) |
| market `export.want`, `import.offer` | 1.25 and 0.85 | Deals earn more |
| market `price.swing`, `min`, `max` | 0.6, 0.6 to 1.8 | Shortages and gluts move prices more |
| market `deals.perPerson` | 0.0025 loads a head a month | Bigger deals |
| economy `taxes.tithe` | 0.15 of the harvest at the grain price | The villages pay more |
| economy `taxes.nobles` | 40 a house plus 0.02 a head | The lords pay more |
| laws `taxBy` (Light and Heavy) | −0.25 and +0.3 | Wider gap between settings |
| economy `loans.rate`, `capMonths` | 1.2% a month, six months of income | Dearer, larger loans |
| economy `crafts.crowding`, `capShare` | 0.03, 0.8 of taxes and dues | Several works of a craft earn less each; the cap binds sooner |

### The board of the North (M20 D and E)
No balance change. Orders on the board go through the rules that already exist (a march is a siege order, a trade the deal table, an envoy a small warming and an audience), so the crowns' figures above stand. The board's markers count a realm's garrisons as well as its armies.

### Labour through the seasons (M20 C)
The kingdom's works are now manned from a pool of hands (about three in ten of the people), split by the crown between eight kinds of work, with seasons, royal calls and a fuel stock for the winter. From `node tools/longrun.mjs 30 <crown> 1,2,3`, at year 30 (Part A and B figures in brackets):

| Crown | What it does with the hands | People after 30 years | Works (mean condition) | Treasury | Depositions |
| --- | --- | --- | --- | --- | --- |
| Idle | Leaves the split as it starts and calls nothing | about 29,400 (40,000) | 33 by year 10, 0 by year 20 | about 38,000 at year 10, at the debt floor by 30 | 4 |
| Steward | Calls the winter turn every autumn and a harvest muster when grain is short; moves hands to kinds that go short, repairs from crafts | about 57,000 (56,700) | 54 to 82 | 800 to 2,500 | 0 |
| Spendthrift | As the steward, and rebuilds everything on credit | about 56,500 (56,300) | 39 to 87 | -10,700 to -100 | 0 to 1 |
| Tyrant | Raises the levies every six months, mends nothing | about 12,200 (25,300) | 0 | at the debt floor | 28 to 30 |

- **The idle crown declines faster.** Without the winter turn its woodpiles run low in hard winters and the poorest die of cold (about 1,400 dead to raids and cold by year 30); it loses close to half its people and is deposed four times. This is the brief's "an idle crown must visibly decline".
- **The steward holds level.** Seasonal work (more hands in the woods before winter, a muster in a lean year) is what keeps it where Parts A and B left it. In one seed of three its works slip to 54 by year 30 as the gold runs out and repairs outpace the treasury.
- **The tyrant's levies cost it dearly.** Every levy empties the works for three months; with nothing mended its people fall to under a quarter of the start.
- **Food.** Part C pays the fields by staffing, so the base yield (economy.json `farmBase`) went back up to 0.82 of the M19 value (0.77 in Part B): fully manned fields grow what Part B's did.

The dials, in data/labour.json:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `handsShare` | 0.3 of the people | More hands for everything |
| `lendReach` | 110 (about a day's walk) | Villages further out lend to a town |
| `spread` | 0.85 | Spare hands fill short districts more fully |
| `split` | fields 47, woods 7, mines 7, pastures 3, fishing 4, crafts 22, repairs 4, levies 6 | The starting split |
| `crew` | 160 hands to a repair crew | Fewer repairs at once |
| `fuel.short.sickness`, `fuel.short.unrest` | 0.15% a month, 8 | A harsher cold winter |
| `calls.levy.coin` | 300 crowns for three months | A dearer levy |

### A kingdom already built (M20 A and B)
The crown no longer builds: every place starts with the works its land gives it, they wear and break, and the crown mends them. From `node tools/longrun.mjs 30 <crown> 1,2,3` and `node tools/realms.mjs 30 steward 1,2,3,4`, at year 30 (M19 figures in brackets):

| Crown | What it does about its works | People after 30 years | Works (mean condition) | Treasury | Depositions | Wars |
| --- | --- | --- | --- | --- | --- | --- |
| Idle | Nothing: every repair question is left | about 40,000 (52,800) | 34 by year 10, 0 by year 20 | about 40,000 at year 10, in debt by 30 | 2 to 3 (0) | 0 to 3 |
| Steward | Rebuilds what falls below 75 while the treasury holds 2,500 over the cost, patches when it cannot | about 56,700 (78,300) | 77 to 86, no ruins | 1,000 to 9,100 | 0 | 0 to 1 |
| Spendthrift | Rebuilds everything, on credit if need be | about 56,300 (59,300) | 86 to 87, no ruins | about 0 to 4,300 | 0 (3 to 19) | 0 |
| Tyrant | Leaves everything | about 25,300 (19,400) | 0 | in debt | 15 to 16 | 3 to 6 |

- **The idle crown now visibly declines.** Its works wear out (about a third left by year 10, ruins everywhere by year 20); its income falls by two fifths in ten years and its treasury, which still piles up to about 40,000 in the first decade, runs into debt in the third. It loses a quarter of its people and is deposed two or three times. This answers the old complaint that an idle crown simply hoarded.
- **The steward holds what it was given, no more.** With nothing to build, its people stay about where they began (about 56,700, against M19's 78,300, which came from building fields, mills and granaries). Its works stay at 77 to 86 for thirty years; its treasury runs down slowly as the gold seams it reopens are worked out. Never invaded in the four realms-tool seeds (M18 target: one or fewer).
- **The spendthrift no longer collapses.** With nothing to borrow for but repairs, it behaves as a slightly more generous steward. The tyrant still pays most: its works fall to nothing and it is deposed fifteen times, but it keeps more of its people than in M19 (its kingdom starts richer).
- **Where the money comes from.** A realm with every works standing from the start would earn far more than the M12 crown did, so: crafts earn 35% of their old value (`economy.json crafts.works`), the works' trade bonus counts at 35% (`trade.worksScale`), silver mines yield 40 (was 62), merchants' rents are 0.003 a head (was 0.0045), the crown's works cost twice their old upkeep (`spaces.json condition.upkeepScale`; foreign realms pay the plain rate), and the base farm yield is 0.77 of before, so the realm grows about 6% more food than it eats, as in M19. The start nets about +800 a month before repairs (M19: +250, with nothing to repair).
- **Repairs.** Rebuilding costs 35% of a works' old price for the share that is missing (patching 12%), and everything wears 0.45 a month (2.5 more while the bills go unpaid). Keeping a whole kingdom standing costs the steward about 250 to 400 a month. At first (60%, 0.55 a month) the steward could not keep up and collapsed by year 30 in two seeds of three.
- **Foreign realms** no longer build; they mend their worst works from what they can spare. Their incomes at year 10 are in the range M18's builders reached (Redania about 2,700 a month, Cintra about 700). Sodden and Verden, the poorest, stay out of debt (longest run at the floor: 0 months).

The dials, in data/spaces.json (`condition`) unless named:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `wear` | 0.45 a month | Faster decay, dearer upkeep of a kingdom |
| `unpaidWear` | 2.5 a month more | A crown in debt falls apart faster |
| `rebuild.coin`, `patch.coin` | 35% and 12% of the old price for what is missing | Dearer repairs |
| `decideBelow` | 70 | Repair questions come sooner |
| `upkeepScale` | 2 (the crown only) | Dearer works, a poorer crown |
| `crews` | 4 | More repairs at once (replaced by the Repairs share of hands in Part C) |
| economy.json `crafts.works`, `trade.worksScale` | 0.35 and 0.35 | A richer realm |

### The map (M19 D)
No balance change. Part D draws what the simulation already decides (borders, battles, sieges, smoke, refugees, rebels) and adds the town's worth to the foreign card. The one rule it touches is sight: land Temeria has won counts as explored and in view, as its own always has, which only changes what the crown can see. The steward and idle crown figures above were rerun and match.

### What battles and sieges changed (M19 C)
Battles now last days and sieges are counted in walls, food and sickness; the outcome of a battle over many trials is the old roll's (tested in `test/sim/battle.test.js`: within six points at strength ratios of 1, 1.2, 1.5 and 2). From `node tools/realms.mjs 30 <crown> 1,2,3,4` and `node tools/longrun.mjs 30 <crown> 1,2,3`:

| | Idle | Steward | Spendthrift | Tyrant |
| --- | --- | --- | --- | --- |
| People after 30 years | about 52,800 | about 78,300 (69,000 to 89,200) | about 59,300 (29,300 in one seed, about 74,000 in the others) | about 19,400 |
| Invasions in 30 years (realms tool, four seeds) | 1, 1, 1, 0 | 0, 0, 0, 0 | | |
| Wars (longrun, three seeds) | 1 each | 0 to 4 | 0 to 9 | 10 to 11 |
| Depositions | 0 | 0 to 2 | 3 to 19 | 16 to 28 |
| Towns lost for good | 0 | 0 to 3 | 0 to 11 | 3 to 15 |

- **The steward is never invaded** in the four realms seeds, and its own campaigns (a town every eight years, Riedbrune most often) cost it a town at most. Its income still more than triples by year 10 (3.2, 3.4 and 3.3 times) and the idle crown still breaks even (year 10 nets +49 to +111).
- **Wars drag where a crown refuses to lose.** The model crowns now refuse a peace that leaves their towns with the enemy for the first year of a war, then take what is offered. Refusing for two years cost far more people (to sieges, starvation and raids) than the towns themselves.
- **The tyrant pays most.** At Authority nothing it is the North's favourite target: ten or eleven wars, two dozen regencies, and a third of the people it began with. The spendthrift collapses the same way in one seed of three. This is the design's "weakness invites wolves" at its harshest; if it proves too harsh in play, the dials are `peace.keepShare` (what a victor keeps) and strategy.json `deterrence.muster` (how much the neighbours respect the crown's levies).

The battle dials, all in data/war.json:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `battles.skirmishRounds` | 2 days | Longer exchanges of arrows before the lines close |
| `battles.morale.melee`, `battles.morale.skirmish` | 15 and 6 spirit a day at even strength | Shorter battles |
| `battles.casualties.melee` | 3.5% of the line a day at even strength | Bloodier battles |
| `battles.reserve` | a fifth of each army | A bigger reserve to commit |
| `battles.pursuit.cavalry` | 30% of the broken side for an all-horse victor | Deadlier routs |
| `battles.retreat.melee` | 7% of the army, more against horse | A costlier retreat once the lines have closed |
| `sieges.wear`, `sieges.stoneWear` | 1 a day for a thousand men, stone at half | Walls fall sooner |
| `sieges.food` | a town about 60 days, a city 90 | Longer sieges before terms |
| `sieges.sickness` | 0.12% of the camp a day, rising with the weeks | Sieges cost the besiegers more |
| `attrition.supplyRange`, `attrition.supply` | 140 map units, 0.12% a day beyond | Armies waste faster far from home |

### What conquest changed (M19 A and B)
Towns lost at a peace now leave the realm for good, so the four crowns' figures count only the towns each still holds. From `node tools/realms.mjs 30 <crown> 1,2,3,4` and `node tools/longrun.mjs 30 <crown> 1,2,3`:

| Measure | Steward | Idle |
| --- | --- | --- |
| Invasions of Temeria in 30 years (M18 targets: steward 1 or fewer; idle still invaded) | 0, 1, 3, 1 (one seed over) | 0, 0, 4, 0 |
| Towns Temeria annexed / lost for good by year 30 | 1 in every seed / 5 in one seed | 0 / 1 in one seed |
| Towns that changed realm between foreign realms (target: 3 of 4 seeds) | 4 to 8 in every seed; a realm fell in two | 3 to 7 in every seed; a realm fell in one |
| Foreign treasury, most months of income | 16.9 (target 24 or fewer) | 17.4 |
| Steward's income, year 10 against year 1 | 3.1, 3.2 and 2.9 times (target 2.5 or more) | year 10 nets about +110 a month (breaks even) |

- **The steward conquers and holds.** Every eight years it picks a realm a third of its strength or less (Sodden, most often), takes a town near the border, keeps it at the peace, spares it and builds there. It is invaded once at most in three of four seeds (three times, losing five towns, in the fourth). In two of the longrun seeds its people (about 83,000) and treasury are close to M18's; in the third a war and two regencies cost it a quarter of its people (about 62,900).
- **A lost war now costs towns, so weak crowns shrink.** The spendthrift, in debt for its first decade, and the tyrant, at Authority nothing, are invaded six to eight times in thirty years. Each peace takes a town or two from them for good (a victor keeps only its war aim and towns worth up to a tenth of its own), so the tyrant ends with about three in five of its towns and under half its people, and the spendthrift loses a quarter of its towns in two of three seeds. Before M19 those towns stayed counted as only occupied, which hid the loss. Both are deposed far more often (about 11 and 12 times).
- **The North consolidates, slowly.** Foreign realms annex what they win: by year 30 four to seven towns have changed realm abroad and one of the small realms may have fallen, its ruler in exile. Conquests integrate slowly abroad, and a realm digesting sullen towns leans to Consolidate rather than another war, which keeps the big winners (Cintra, Kaedwen) from rolling on.
- **What deterrence counts.** Annexation made the winners strong enough to look past one another at Temeria, which then seemed three to six times weaker at its border than it is. Deterrence now also counts the army the crown could muster (half its levies and its lords' men, times 0.6), as a neighbour's own levy is counted; with that, invasions of the idle crown fell from about ten a reign back to M18's few.

Flagged rather than fixed:
- No town has risen in these runs: the steward spares, garrisons and settles its conquests, and keeps tolerant laws. Risings come to a crown that sacks, taxes hard or rules harshly (tested in `test/sim/conquest.test.js`).
- The league against Temeria never formed: no model crown takes enough towns to frighten the North. One that conquers a town a year would raise it within a decade.
- The model tyrant campaigns for plunder and sacks what it takes (Ansegis in seed 2), but it is too weak to take much.
- **Authority no longer creeps to the cap in a long peace.** Above 75 (the point below which it returns by itself) it now fades by 3% of the excess a month (`effects.authorityFade` in data/groups.json): an untended crown settles near 76, a steward in the 80s. Fewer wars in M19 had let the untended crown's Authority drift to 100.

The dials, all in data/conquest.json unless named:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `peace.keepShare`, `peace.keepMin` | a tenth of the victor's own towns' value, at least 12 | Victors keep more at a peace; weak crowns shrink faster |
| `integration.start`, `integration.distance` | 45, less 35 for strangers | Conquests start warmer (or colder) |
| `integration.monthly.*` | time 0.35, garrison 0.3, tolerance 0.4, harsh laws -0.8 | Conquests come round faster (or slower) |
| `integration.foreignMonthly` | 0.2 a month | Foreign realms digest conquests sooner and look for the next war sooner |
| `revolt.chance`, `revolt.integrationBelow` | 5% a month below 30 | More risings |
| `claimant.fadePerYear` | 5 (12 where the land is won over) | Exiles give up sooner |
| `fear.perValue`, `fear.leagueAt`, `fear.attackAt` | 0.6 a point of town value; league at 35, war at 65 | The North bands together sooner |
| strategy.json `deterrence.muster` | 0.6 of what the crown could muster | Neighbours respect the crown's levies more |
| strategy.json `choose.digest`, `digestMax` | 10 a sullen conquest, up to 45 | Conquerors pause longer between wars |

### What rulers who govern changed (M18)
From `node tools/realms.mjs 30 <crown> 1,2,3,4` (four seeds, thirty years), against the M18 targets:

| Target | Steward | Idle |
| --- | --- | --- |
| No foreign treasury above 24 months of income | highest 17.2 months | highest 17.0 months |
| Towns change hands between foreign realms in 3 of 4 seeds | 4 of 4 | 4 of 4 |
| The steward faces 1 or more probes a decade | about 9 a decade (lowest 5) | about 1 a decade |
| The steward is invaded once or less in 30 years | 0, 0, 0, 0 | 2, 0, 3, 2 |
| The idle crown is still invaded and loses towns | | invaded in 3 of 4 reigns; towns still held by an enemy at year 30 in 2 of 4 |
| Foreign pacts signed plus broken, 10 or fewer a decade | about 3 (highest 6) | about 4 (highest 10) |
| No realm at the debt floor more than 24 months | 0 months | 0 months |

- **A strong crown is probed, a weak one invaded.** The steward's garrisons, companies and allies keep every neighbour's appetite for war below the line, so they push instead: sponsored raiders, tolls, demands, shows of force on the border. The idle crown, with nothing on its borders, sees few probes because its neighbours simply march.
- **The tyrant pays for weakness.** With Authority at nothing and the lords against it, every ambitious neighbour sees its chance: nine to eleven wars in thirty years against three to six before, Its treasury halves. It is deposed less often (about once, against five), within the spread of three seeds.
- **The steward is a little poorer and no less safe.** It fights at most one war (seed 3) and ends about 2% smaller than in M17, with a few more raids (neighbours now sponsor raiders on its roads) and tolls on its caravans. Its income still triples (year 10 about 3.1 times year 1), and the idle crown still breaks even (year 1 about 1,078 a month, year 10 nets about +30 to +110).
- **The North is alive.** Every seed sees towns change hands between foreign realms through wars with stated aims (agenda towns, lost towns taken back, weak border towns), and foreign rulers raise markets, harbours, barracks, guildhalls, mines and inns where their land allows.
- **Courts no longer hoard.** No living realm holds more than about eighteen months of income; the surplus goes into soldiers and buildings, and the court tax eats the rest.
- **No debt spirals.** Verden's old protectorate tribute now lapses when it cannot pay, and rulers refuse monthly terms beyond a third of their income, so no realm sits at the debt floor.

Flagged rather than fixed:
- Capitals always go back to their realm at peace, so a realm can be bled but never wiped out. A choice, so the North keeps its players.
- The North starts with its standing pacts already signed (non-aggression between rivals, trade between friends), so the first year is not a rush of signings.
- Realms earning under 20 crowns a month (near dead after a lost war) are left out of the treasury measure, where months of income mean nothing.
- Mahakam has no mountain country on the map, so it cannot dig mines; worth fixing in the terrain data when the lands are next touched.

The dials, all in data/strategy.json:

| Dial | Now | What turning it up does |
| --- | --- | --- |
| `war.minRatio` | 1.3 | Rulers need a bigger edge before declaring war; fewer wars |
| `deterrence.whole` | 0.35 of our whole army | Our army deters from further away; fewer invasions, more probes |
| `probes.chance`, `probes.cooldown` | 10% a month when tempted, once a year at most | More (or fewer) probes |
| `court.freeMonths`, `court.share` | 12 months free, 15% of the rest a month | Foreign treasuries cap lower |
| `army.upkeep`, `army.recruitCost` | 0.15 and 1.2 crowns a man | Smaller standing armies abroad |
| `choose.minMonths`, `choose.threatJump` | 6 months, 20 points | Rulers keep their course longer |
| `pacts.minYears`, `pacts.cooldownYears`, `pacts.breakBelow` | 2 years, 3 years, -45 | Pacts between realms last longer and churn less |
| `pactBreak.weakAuthority` | 25 | Pacts with Temeria break sooner when the crown is weak |

### What audiences changed (M17)
- **Peace can be bought, and the steward buys it.** Within its first years the steward holds a non-aggression pact with all eleven realms and a trade pact with the ten that trade; over thirty years it fights no war at all, against four or five before. Kaedwen, which wants war with a weak Temeria, asks a price for the pact (a hundred crowns or two); the rest sign for nothing. Without wars to lose, the steward ends with about 2,200 more people and a quarter more in the treasury than in M15. A player who will not deal (the idle crown and the tyrant) sees no change: their numbers move only with the shifted random draws.
- **Trade pacts pay.** With every trader's pact, the steward's border trade at year 10 is about 165 crowns a month, against about 93 before: a quarter more from the pacts, and more again because warmer neighbours (mood about +31 on average, trust about 67) trade more. The steward's income still more than triples (year 1 about 1,205 a month, year 10 about 4,040, 3.3, 3.3 and 3.5 times on the three seeds).
- **The small realms seek protection.** Kerack, Cidaris, Verden or Brugge ask the steward to take them under protection once or twice in ten years, for 40 crowns a month, and the steward accepts. Their requests for deals bring in a few hundred crowns over ten years.
- **The spendthrift is spared its wars.** In M15 it lost 11 to 16 places in up to nine wars while in debt; signing the same pacts, it now fights at most two and keeps its people (about 71,900, back above its M13 figure).
- **The North keeps its quarrels.** Left alone, the foreign realms hold 10 to 17 pacts among themselves at any time, mostly non-aggression between rivals and the fearful, with trade pacts among friends and the odd defensive pact or alliance, and break two to six of them in thirty years, opportunists first. Wars between them still come (two to ten in thirty years), fewer where a pact holds.
- **A dial to watch:** if peace proves too cheap in play, `treatyValue.hostility` in data/diplomacy.json is what a hostile ruler charges for a non-aggression pact (700 crowns per point of hostility), and `treaties.nonaggression.minTrust` how far they must believe us.

### What the retraced North changed (M15)
- **Temeria's own life is as it was.** Its land, towns, roads and threats are untouched, so the idle and tyrant crowns land within a few hundred people and raids of their M13 figures. The tyrant's depositions fall from about six to about three, within the spread of three seeds rather than a real change.
- **The neighbours are richer, and fight more.** Foreign towns now earn from their ground (timber, stone, iron) and some strike gold, and they lose a little to their own camps and lairs. Richer realms raise bigger armies, so the crowns that build up (and so tempt or anger their neighbours) see more wars: the steward 4 to 5 in thirty years against 2 to 3 before.
- **The steward copes; the spendthrift pays.** The steward's companies and full treasury see its wars off with about five places lost and retaken, and it ends richer and bigger than before. The spendthrift, in debt for its first decade, loses 11 to 16 places across up to nine wars on two of the three seeds, which is why its people fall by about 4,400 against M13. That is the risk of borrowing to the limit in a harder North, and a fair one; no dial changed for it.
- **The steward's income still triples** (year 1 about 1,140 a month, year 10 about 3,640, 3.1, 3.4 and 3.1 times on the three seeds).

## A realm under arms (M13)
Ten years, from `node tools/longrun.mjs 10 <crown> 1,2,3`:

| | Raids on villages | Dead in raids | Days bands held a road | Camps and lairs cleared | Companies | Their pay |
| --- | --- | --- | --- | --- | --- | --- |
| Idle | about 300 (M12: about 115) | about 52,200 from 54,240 (52,300) | about 32,800, levelled off (35,700) | about 1,150 (1,090) | about 1 (0) | 0 to 4 (0 to 3) |
| Steward | about 120 | about 76,200 (84,400): about 83,000 in two seeds, 62,900 in the third | about 217,800 (253,000) | about 135 (128) | 0, 0 and 2 (0) | 0 to 1 (0 to 1), and one campaign of its own every eight years |
| M15 rerun: idle | about 315 | about 532 | about 2,555 | 0 | 0 | 0 |
| M15 rerun: steward | about 113 | about 160 | about 1,003 | about 20 | 9 | about 560 a month |
| M17 rerun: idle | about 321 | about 567 | about 2,589 | 0 | 0 | 0 |
| M17 rerun: steward | about 97 | about 127 | about 930 | about 18 | 9 to 10 | about 560 a month |

- **The idle crown feels it.** Raids come more than twice as often as before M13, because nothing stops a camp from growing and nothing clears it. Over thirty years the untended realm shrinks a little and loses about 1,600 people to raiders and beasts.
- **A modest standing army pays for itself.** The steward's eight or nine companies cut raids by three fifths and deaths by more than two thirds. They clear about fifteen camps and lairs in ten years and halve the days bands hold the roads. Their pay, about 520 a month, is 15% of a developed realm's income, the bottom of the 15 to 25% the brief set.
- **Threats never vanish.** A steward still suffers a raid or so a month somewhere: camps reappear where the country is poor and wild once the 120 quiet days after a clearing are over, and Scoia'tael and war parties come regardless.
- **The tyrant fares worst.** Martial law does not clear a single camp; with Scoia'tael sympathy at 60 and more, commandos join the bandits, and its realm loses a seventh of its people in thirty years (M12: about a twelfth).
- **The steward's income still triples** (year 1 about 1,150, year 10 about 3,480, 3.0 times), after paying for its companies.

## The economy at work (M12)
The crown's month, averaged over its year, from `node tools/longrun.mjs 10 <crown> 1,2,3 ledger`:

| | Year 1 in | Year 10 in | Year 10 net | Where the year-10 money comes from |
| --- | --- | --- | --- | --- |
| Idle | about 1,087 | about 52,200 from 54,240 (52,300) | about 32,800, levelled off (35,700) | about 1,150 (1,090) | about 1 (0) | 0 to 4 (0 to 3) |
| Steward | about 1,159 | about 76,200 (84,400): about 83,000 in two seeds, 62,900 in the third | about 217,800 (253,000) | about 135 (128) | 0, 0 and 2 (0) | 0 to 1 (0 to 1), and one campaign of its own every eight years |

The M12 targets, and where they stand:
- **The idle crown roughly breaks even, no richer than before.** Its first-year income is about 1,087 a month (M11: 1,091) and its thirty-year treasury about 40,200 (M11: 42,200). By year 30 its month nets about zero.
- **The steward's income at year 10 is at least 2.5 times year 1.** It is 3.3, 2.45 and 3.3 times on the three seeds, 3.0 on average. Seed 2 falls just short because a neighbour takes six of its towns in a war in the ninth year. It keeps six patrols (about 195 a month, against 280 for seven before) and standard garrisons, with a monthly surplus of 1,400 to 2,000.
- **A fully developed Vizima alone earns 600 or more a month.** With a market hall, guildhall, merchants' quarter, guild workshops, brewery, inn, alchemist, fishery, harbour, smithy, bank and paving it earns about 1,180 and costs about 120 (tested in `test/sim/industry.test.js`).
- **The spendthrift is still at risk.** Deep debt now raises unrest as the tax farmers squeeze, and the lords depose that crown four or five times in thirty years (M11: about twice). Once its buildings pay off, it climbs out of debt in its second decade.

Worth knowing (flagged rather than fixed):
- **A steward who builds everything becomes very rich.** After about fifteen years every slot is full and the treasury piles up until the hoarding court (1% a month above 5,000) eats the surplus, levelling off between 180,000 and 270,000. That is a crown with nothing left to buy: the money is there for war, and for whatever later milestones add. If it feels too much, raise `upkeep.hoardPerMonth` or the cost of crafts crowding.
- **Gold runs out.** The known seams are worked out in fifteen to twenty years, so the steward's gold line falls from about 600 a month to nothing in its third decade.
- **Food buildings still matter.** A steward who builds only earners ends with about 59,500 people after thirty years; one who builds only food first spends a decade on fields and barely grows its income. Taking turns gives the most of both.

What this says about the design:
- **Building is how a realm grows and pays.** Earners raise the income; fields, mills and granaries raise the people, who then pay more tax.
- **Debt is survivable but costly.** Living at the bankers' limit drains Authority, and the squeeze on the towns raises unrest until the lords call for a regency.
- **The iron fist holds, at a price.** Martial law keeps order and a large army crushes every rising, so the tyrant is rarely deposed, but it spends thirty years at war with its own lords and the realm shrinks.
- **Weakness invites wolves; so does wealth.** Greedy neighbours weigh Temeria's Authority, lords and soldiers against their own, and gold whets their appetite.
- **An absent crown drifts.** Lords' grievances pile up from unanswered demands, raids go unchecked, and the population slowly falls.

## What buildings pay back
The rule: a building that earns coin should pay back its cost (coin plus its materials at their sale price) in **2 to 6 years** in a typical place for it, so building is always worth it but never an instant fortune. Buildings that buy order, health, defence, faith or credit (walls, shrines, watchtowers, warehouses, armouries, barracks, bathhouses, hospices, the cathedral, the bank, paved streets, sewers) are not meant to pay back in coin; nor are mills and granaries, which pay back in people fed.

Earnings scale with the place: a craft earns its value times 0.8 in a village, 1 in a town and 1.3 in a city, times the place's fortunes, and each further building of the same craft in the realm earns a little less (a crowded market). The lords keep half of what their own lands earn, so a building on a lord's holding pays the crown less: the places below are crown lands.

From `node tools/payback.mjs 6 1` (six years, with and without the building from the first day; a workshop that needs another's goods is measured with its supplier standing in both reigns):

| Building | Where measured | Cost | Gain a month | Pays back in |
| --- | --- | --- | --- | --- |
| Harbour | Gors Velen | 1,648 | about 70 | 2.0 years |
| Weavers' hall (with a pasture) | White Bridge | 1,443 | about 60 | 2.0 years |
| Horse stud | Cleves | 1,420 | about 61 | 2.0 years |
| Gold mine | Carreras | 3,088 | about 123 | 2.1 years |
| Salt pans | Anchor | 1,339 | about 52 | 2.1 years |
| Shipyard | Gors Velen | 2,296 | about 91 | 2.1 years |
| Rye distillery | Ellander | 1,544 | about 60 | 2.1 years |
| Pilgrims' hostel | Temple of Melitele | 1,744 | about 71 | 2.1 years |
| Charcoal burners | Razwan | 612 | about 23 | 2.2 years |
| Silver mine | Razwan | 1,649 | about 56 | 2.4 years |
| Lumber camp | Findetann | 312 | about 11 | 2.4 years |
| Quarry | Zavada | 272 | about 9 | 2.5 years |
| Hunters' lodge | Razwan | 720 | about 24 | 2.5 years |
| Iron mine | Carreras | 620 | about 20 | 2.6 years |
| Tannery | Ellander | 910 | about 29 | 2.6 years |
| Sheep pastures | White Orchard | 615 | about 20 | 2.6 years |
| Brewery | White Bridge | 1,021 | about 32 | 2.7 years |
| Merchants' quarter | Maribor | 1,856 | about 56 | 2.8 years (Vizima, about 2) |
| Alchemist's workshop | White Bridge | 1,430 | about 42 | 2.8 years |
| Guild workshops | White Bridge | 1,349 | about 37 | 3.0 years |
| Inn | Pontaria | 920 | about 25 | 3.1 years |
| Market hall | White Bridge | 1,444 | about 37 | 3.3 years |
| Toll bridge | La Valette (Devil's Ford) | 1,468 | about 35 | 3.5 years, faster with a crown route over the river |
| Weaponsmiths (with charcoal) | White Bridge | 1,572 | about 32 | 4.1 years, faster while the neighbours are at war |
| Fishery and smokehouse | Murky Waters | 925 | about 19 | 4.1 years |
| Guildhall | White Bridge | 1,544 | about 27 | 4.7 years, plus the extra trade route it allows |
| Smithy | White Bridge | 536 | about 8 | 5.8 years, plus cheaper garrisons |
| Fields | White Bridge | 265 | about 4 | 6.0 years, mostly paid in food |

A crown trade route between two of the cities costs about 700 crowns and earns 30 to 90 a month from trade, more when it carries finished goods the far end lacks: it pays back in about two years, but the crown can run only a few, and bandits and war can stop them.

## The dials worth knowing
| Dial | File | Now | What turning it up does |
| --- | --- | --- | --- |
| The court's monthly cost | economy.json `upkeep.courtMonth` | 420 | Less spare coin; slower building |
| Hoard drain | economy.json `upkeep.hoardPerMonth` | 1% a month above 5,000 | A full treasury levels off sooner |
| Company pay | forces.json `companies.*.upkeep` | militia 0.3 to knights 2.2 a man a month | A standing army costs more |
| Threats breeding | forces.json `threats.bandits.spawnAt`, `spawnChance`, `growth`, `max`; `threats.monsters` likewise | bandits from level 35, up to 7 camps; beasts from 30, up to 6 lairs | More, bigger camps and lairs |
| Fights | forces.json `fight.power`, `loserLoss`, `winnerLoss`, `suits` | strength cubed; a quarter to half the loser, 4 to 12% the winner | Fights decided more surely, and bloodier |
| Witchers | forces.json `threats.monsters.witcher` | 150 + 2.5 x strength; nine in ten succeed | Witchers cost more or fail more |
| Taxes per person | economy.json `taxes.perPersonMonth`, `prosperityBase`, `perProsperity` | city 0.009, town 0.008, village 0.006 a head, times 0.3 + 0.014 x prosperity | More coin from a big, thriving population |
| Debt | economy.json `debt.interestPerMonth`, `debtUnrest` | 1% a month; up to +10 unrest at the bankers' limit | Debt bites harder |
| Authority regrowth | groups.json `effects.authorityRegen`, `authorityRegenBelow` | +1 a month while under 75 | Laws and actions come round faster |
| Plague spread | military.json `plague.spread` | 15% a month to each road neighbour | Wider outbreaks |
| Envoys, petitions, demands, events | `envoyChance`, `petitionChance`, `demandChance`, `eventChance` | 35%, 30%, 25%, 30% a month | More interruptions; about one decision a month in all |
| Rebellion threshold | houses.json `rebellion.below` | loyalty 15 | Houses rise sooner |
| Foreign growth | realms.json `economy.growthPerMonth` | 0.12% a month | Neighbours grow faster, and trade more |
| Sight | realms.json `vision` | towns 40 to 85, watchtower 130, embassy 170 | Less of the North under fog |
| Spy risk | realms.json `intelligence.spy.discovery` | one in four | Spying costs more goodwill |
| Trade route value | trade.json `base`, `distance`, `complement`, `marketBonus` | 0.0038 x the root of both towns' people | Routes earn more |
| How many routes | trade.json `limit` | 2, up to 8 | More routes to run |
| Gold | gold.json `yield`, deposits' `gold`, `taper` | 150 a month; 10,000 to 22,500 a seam | Richer, longer-lived mines |
| Crafts | buildings.json `craft` effects; economy.json `crafts.placeScale`, `crowding` | 12 to 45 a building; village 0.8, town 1, city 1.3; 7% less each for every other of its kind | Crafts pay more |
| Production chains | industry.json `makers`, `workers`, `goods` prices and `demand`, `glut` | e.g. a pasture 55 wool, weavers 60 cloth at 1.6; beyond home demand, half price | Chains pay more |
| Route premium | industry.json `routes` | 30 units a route; +30% at home, +60% abroad | Routes that carry goods pay more |
| Tolls | industry.json `tolls` | 2.5 a caravan; 0.45 caravans a crown of a neighbour's trade, 0.12 a crown of a crown route | Toll bridges pay more |
| Silver, rents, donations, contracts | industry.json `silver`, `quarter`, `hostel`, `shipyard` | 62; 0.0045 a head; 30 + 100 x Melitele's share; 70 | Those buildings pay more |
| Building room | buildings.json `slots` | village 5, town 8, city 12 | More can be built in each place |
| Invasions | war.json `ai.declareChance`, `ai.greed`, `ai.aggression` | 1% a month x aggression x hostility | Neighbours attack more often |
| Town defence | war.json `siege.militiaPerPerson`, `battle.wallsDefence`, `cityDefence`, `castleDefence` | 3 per 100 people; walls x1.6, city x1.5, castle x1.4 | Towns hold out longer; storms rarer |
| Siege length | war.json `siege.starveDays` (x1.6 walls, x1.5 castle, x2 city) | 70 days | More time to send relief |
| Peace | war.json `peace.acceptMargin`, `prizeAt`, `cityPrizeAt` | 10; a prize at 45, a city only at 90 | Wars end sooner, and cost less land |
| Armies' pay | war.json `raise.fieldPayPerSoldier`, `companyCoin`, `companyMonthly` | 0.15 a man a month; 250 and 60 a company | War drains the treasury faster |

## Tools
- `node tools/longrun.mjs [years] [idle|steward|spendthrift|tyrant] [seeds] [ledger]` for the tables above (it counts raids, deaths, road-days held, camps cleared, fights and companies); `ledger` prints each year's month, line by line. The crowns themselves live in `tools/crowns.mjs`.
- `node tools/realms.mjs [years] [steward|idle] [seeds] [quiet]` for how the foreign realms govern: per realm per decade their postures, treasury in months of income, standing army and buildings, then their wars with aims and the M18 targets.
- `node tools/lawbalance.mjs [years]` compares every law option with doing nothing.
- `node tools/balance.mjs [years] [idle|builder|borrower]` for the economy alone.
- `node tools/payback.mjs [years] [seed]` for how long each building takes to pay back.
