# Balance notes

How the realm behaves over a long reign, and the dials that shape it. Every number lives in `data/`; nothing here needs code changed.

## Thirty years, four crowns
From `node tools/longrun.mjs 30 <crown> 1,2,3`, averaged over three seeds and rounded.

| Crown | What it does | People after 30 years | Treasury | Authority | Rebellions | Depositions | Wars | Towns held by an enemy at the end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Idle | Nothing; every decision left to its default | about 53,800 (from 54,240) | about 42,200, levelled off | about 60 | 2 | 0 | 3 | 0 to 6 (one war still running) |
| Steward | Builds within its means, answers generously, patrols the worst roads, honours sulking lords, grants an equal charter, hires witchers; at war raises one army to hold Vizima and takes any peace offered | about 72,900 (+34%) | about 4,200 | about 78 | under 1 | 0 | 1 | 0 to 1 |
| Spendthrift | As the steward but borrows to the bankers' limit to build faster | about 58,700 | in debt to the limit | about 10 | 8 | 7 | 6 | 0 to 3 |
| Tyrant | Heavy taxes, lords taxed and fined yearly, martial law, the Fire, expulsion, a frugal court | about 50,100 | about 32,900 | about 6 | 34 | 3 | 7 | 2 |

Since M8 the neighbouring realms grow and build too, and a thriving neighbour trades more with Temeria; that lifted the steward from +26% to +36% over thirty years. Since M9 neighbours make war: on a strong, steady crown about once in thirty years, on a weak one (no Authority, risings) every four or five years, which is the main reason the spendthrift and the tyrant now fare worse. Kaedwen and Redania are the hungriest.

What this says about the design:
- **Building is how a realm grows.** The steward ends with a quarter more people than the idle crown, and almost all of it comes from fields, mills and granaries feeding the cities.
- **Debt is survivable but costly.** Living at the bankers' limit drains Authority month after month; the lords depose that crown about every seven years.
- **The iron fist holds, at a price.** Martial law keeps order and a large army crushes every rising, so the tyrant is rarely deposed, but it spends thirty years at war with its own lords and the realm shrinks.
- **Weakness invites wolves.** Greedy neighbours weigh Temeria's Authority, its lords' loyalty and its soldiers against their own. A crown with no Authority and lords in revolt is invaded again and again; a strong one with warm relations is left alone.
- **War is costly even when won.** Levies thin the garrisons (so other towns fall easily), armies cost coin every month, and every lost town costs Authority. A clever crown wins by striking a weak neighbour's border towns and making peace while ahead.
- **An absent crown drifts.** Lords' grievances pile up from unanswered demands, raids go unchecked (about ten a year against about five for the steward), and the population slowly falls.

## The dials worth knowing
| Dial | File | Now | What turning it up does |
| --- | --- | --- | --- |
| The court's monthly cost | economy.json `upkeep.courtMonth` | 420 | Less spare coin; slower building |
| Hoard drain | economy.json `upkeep.hoardPerMonth` | 1% a month above 5,000 | A full treasury levels off sooner |
| Taxes per person | economy.json `taxes.perPersonMonth` | 0.009 | More coin from a big population |
| Authority regrowth | groups.json `effects.authorityRegen`, `authorityRegenBelow` | +1 a month while under 75 | Laws and actions come round faster |
| Raid frequency | military.json `incidentChance` | 8% x threat | More raids; garrisons and patrols matter more |
| Plague spread | military.json `plague.spread` | 15% a month to each road neighbour | Wider outbreaks |
| Envoys, petitions, demands, events | `envoyChance`, `petitionChance`, `demandChance`, `eventChance` | 35%, 30%, 25%, 30% a month | More interruptions; about one decision a month in all |
| Rebellion threshold | houses.json `rebellion.below` | loyalty 15 | Houses rise sooner |
| Foreign growth | realms.json `economy.growthPerMonth` | 0.12% a month | Neighbours grow faster, and trade more |
| Sight | realms.json `vision` | towns 40 to 85, watchtower 130, embassy 170 | Less of the North under fog |
| Spy risk | realms.json `intelligence.spy.discovery` | one in four | Spying costs more goodwill |
| Invasions | war.json `ai.declareChance`, `ai.greed`, `ai.aggression` | 1% a month x aggression x hostility | Neighbours attack more often |
| Town defence | war.json `siege.militiaPerPerson`, `battle.wallsDefence`, `cityDefence`, `castleDefence` | 3 per 100 people; walls x1.6, city x1.5, castle x1.4 | Towns hold out longer; storms rarer |
| Siege length | war.json `siege.starveDays` (x1.6 walls, x1.5 castle, x2 city) | 70 days | More time to send relief |
| Peace | war.json `peace.acceptMargin`, `prizeAt`, `cityPrizeAt` | 10; a prize at 45, a city only at 90 | Wars end sooner, and cost less land |
| Armies' pay | war.json `raise.fieldPayPerSoldier`, `companyCoin`, `companyMonthly` | 0.15 a man a month; 250 and 60 a company | War drains the treasury faster |

## Tools
- `node tools/longrun.mjs [years] [idle|steward|spendthrift|tyrant] [seeds]` for the table above.
- `node tools/lawbalance.mjs [years]` compares every law option with doing nothing.
- `node tools/balance.mjs [years] [idle|builder|borrower]` for the economy alone.
