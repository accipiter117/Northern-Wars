# Northern Wars v2: roadmap

Built at `/v2/` alongside the real-time game until it is playable end to end. Design: docs/v2/DESIGN.md.

| Step | Milestone | Scope | Status |
| --- | --- | --- | --- |
| 1 | M36 The turn engine | One-month turns, End turn, AI powers in order, the month's systems once a turn (yields, growth, treasury, Devotion, renown, mood, taxes, dilemmas), save format v2 | Done |
| 2 | M37 The war table | Regions and links from the traced map, Pontar and Yaruga crossings, movement points, winter, zones of control, supply, sieges, the table with draggable carved pieces | Done |
| 3 | M38 Cities and yields | Per-city focus, works worn by war and repaired with production, conquered cities kept and settling, unsettled cities adding to Unrest | Done |
| 4 | M39 Goals | Two goal trees per power and chapter; unique units (with abilities), buildings and wonders; the AI meets goals and raises uniques too | Done |
| 5 | M40 City-states | Types and suzerain bonuses, envoys, the three routes, favours, rivals courting vassals away, rebellion and judgements | Done |
| 6 | M41 Battles | The lanes battle screen, auto-resolve with odds, sieges across turns | Next |
| 7 | M42 Diplomacy and AI | Great-power diplomacy and agendas, an AI that uses the board, spies | |
| 8 | M43 Chapters and lore events | The Dawn, the three wars, requirement-driven events | |
| 9 | M44 Endings | The lore endings, domination and faith; balance across full games | |
| 10 | M45 Polish and the swap | One screen per purpose, art for pieces and cards; v2 becomes the game | |

## M36 and M37 acceptance criteria
- `/v2/` loads at 390x844 portrait and 844x390 landscape with no console errors, over Temeria in March 1262.
- End turn moves the month on, fills the treasury from the cities' yields, runs each AI power in turn and saves; a save resumes the same game, and the same seed and orders give the same game.
- About 78 provinces from the traced map; every mainland province is reachable; the Pontar and the Yaruga are crossed only at bridges (or named fords and ferries).
- Dragging a piece lights every region it can reach this month and marches it on release; winter halves the march; borders are closed in peace; an enemy army ends a march and is fought; armies out of supply waste; towns fall at once and walled places after a siege.
- A region's card shows its yields, works and crossings, and raises companies; Realm sets taxes; War declares war; Reports lists the turns' news; a dilemma comes to court about one month in four.
- Ten years run to December 1272 with every meter finite and in range.

## M38 to M40 acceptance criteria
- A city's card sets its focus (balanced, food, production, crowns or faith), shows worn works and mends them for production, and offers to keep a city we hold.
- Sieges, falls and battles wear a city's works, and worn works yield less. A kept city yields a quarter of its takings at first and all of them once settled, and adds to Unrest until half settled. The AI keeps what it has held two months.
- Goals: two trees for each of the five powers in each of the four chapters (12 goals each), checked at the end of every month, unlocking the unique units, buildings and wonders of the design (or yields a month). A unique raised with production at its own city; a wonder once in the world.
- Unique units carry one ability each: riders alone march further, engineers shorten sieges, guards hold walls, spies cross any border.
- Courts: envoys for renown; three or more, and the lead, give the right to seal a vassal by protection, pressure (our companies three to one, and a gift) or peace terms (we hold its capital). Vassals give their type's bonus, open their roads and follow their suzerain to war. Favours bring envoys; a rival three envoys ahead courts a vassal away; a weak suzerain's vassal may rebel, and is judged when its capital falls.
- A step 1 and 2 save carries on.
