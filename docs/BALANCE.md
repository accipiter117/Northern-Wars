# Balance notes

How the realm behaves over a long reign, and the dials that shape it. Every number lives in `data/`; nothing here needs code changed.

## Thirty years, four crowns
From `node tools/longrun.mjs 30 <crown> 1,2,3`, averaged over three seeds and rounded. Since M12.

| Crown | What it does | People after 30 years | Treasury | Authority | Rebellions | Depositions | Wars |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Idle | Nothing; every decision left to its default | about 53,500 (from 54,240) | about 40,200, levelled off (M11: 42,200) | about 60 | 2 | 0 | 3 |
| Steward | Builds within its means, an earner and a food building in turn (gold and silver mines, toll bridges, merchants' quarters, markets and the new chains first among the earners), opens the best trade route it can twice a year, answers generously, keeps six patrols on the worst roads, honours sulking lords, grants an equal charter, hires witchers; at war raises one army to hold Vizima and takes any peace offered | about 79,600 (+47%; M11: 74,400) | about 241,000, held there by the cost of a hoarding court | about 89 | 1 | 0 | 1 |
| Spendthrift | As the steward but borrows to the bankers' limit to build faster | about 72,300 | at the bankers' limit for a decade, then rich | about 80 at the end, near 0 for years before | 1 | about 5 (4 to 5) | 3 |
| Tyrant | Heavy taxes, lords taxed and fined yearly, martial law, the Fire, expulsion, a frugal court | about 49,900 | about 28,200 | about 7 | 33 | 3 | 7 |

## The economy at work (M12)
The crown's month, averaged over its year, from `node tools/longrun.mjs 10 <crown> 1,2,3 ledger`:

| | Year 1 in | Year 10 in | Year 10 net | Where the year-10 money comes from |
| --- | --- | --- | --- | --- |
| Idle | about 1,087 | about 1,126 | about +100 | Taxes 470, market trade 365, surplus goods 180, foreign trade 105; out go garrisons 300 and a court swollen by the hoard to 690 |
| Steward | about 1,159 | about 3,496 (3.0 times year 1) | about +1,790 | Taxes 650, market trade 630, gold 500, goods from the chains 520, silver 195, crafts 210, crown routes 195, rents 185, tolls 65, donations 75; out go garrisons 260, upkeep 330, six patrols 195, the court 770 |

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
| Taxes per person | economy.json `taxes.perPersonMonth`, `prosperityBase`, `perProsperity` | city 0.009, town 0.008, village 0.006 a head, times 0.3 + 0.014 x prosperity | More coin from a big, thriving population |
| Debt | economy.json `debt.interestPerMonth`, `debtUnrest` | 1% a month; up to +10 unrest at the bankers' limit | Debt bites harder |
| Patrols | military.json `patrol.cost`, `perLength` | 6 plus 0.22 a unit of road (about 20 to 50) | Patrols cost more |
| Authority regrowth | groups.json `effects.authorityRegen`, `authorityRegenBelow` | +1 a month while under 75 | Laws and actions come round faster |
| Raid frequency | military.json `incidentChance` | 8% x threat | More raids; garrisons and patrols matter more |
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
- `node tools/longrun.mjs [years] [idle|steward|spendthrift|tyrant] [seeds] [ledger]` for the tables above; `ledger` prints each year's month, line by line. The crowns themselves live in `tools/crowns.mjs`.
- `node tools/lawbalance.mjs [years]` compares every law option with doing nothing.
- `node tools/balance.mjs [years] [idle|builder|borrower]` for the economy alone.
- `node tools/payback.mjs [years] [seed]` for how long each building takes to pay back.
