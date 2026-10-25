# Balance notes

How the realm behaves over a long reign, and the dials that shape it. Every number lives in `data/`; nothing here needs code changed.

## Thirty years, four crowns
From `node tools/longrun.mjs 30 <crown> 1,2,3`, averaged over three seeds and rounded.

| Crown | What it does | People after 30 years | Treasury | Authority | Rebellions | Depositions |
| --- | --- | --- | --- | --- | --- | --- |
| Idle | Nothing; every decision left to its default | about 52,900 (from 54,240) | about 43,500, levelled off | about 76 | 2 | 0 |
| Steward | Builds within its means, answers generously, patrols the worst roads, honours sulking lords, grants an equal charter, hires witchers | about 74,000 (+36%) | about 1,900, all spent | about 71 | 0 | 0 |
| Spendthrift | As the steward but borrows to the bankers' limit to build faster | about 65,900 | in debt to the limit | 0 | 6 | 4 |
| Tyrant | Heavy taxes, lords taxed and fined yearly, martial law, the Fire, expulsion, a frugal court | about 50,000 | about 47,000 | 0 | 27 | under 1 |

Since M8 the neighbouring realms grow and build too, and a thriving neighbour trades more with Temeria; that lifted the steward from +26% to +36% over thirty years.

What this says about the design:
- **Building is how a realm grows.** The steward ends with a quarter more people than the idle crown, and almost all of it comes from fields, mills and granaries feeding the cities.
- **Debt is survivable but costly.** Living at the bankers' limit drains Authority month after month; the lords depose that crown about every seven years.
- **The iron fist holds, at a price.** Martial law keeps order and a large army crushes every rising, so the tyrant is rarely deposed, but it spends thirty years at war with its own lords and the realm shrinks.
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

## Tools
- `node tools/longrun.mjs [years] [idle|steward|spendthrift|tyrant] [seeds]` for the table above.
- `node tools/lawbalance.mjs [years]` compares every law option with doing nothing.
- `node tools/balance.mjs [years] [idle|builder|borrower]` for the economy alone.
