# Northern Wars v2: roadmap

Built at `/v2/` alongside the real-time game until it is playable end to end. Design: docs/v2/DESIGN.md.

| Step | Milestone | Scope | Status |
| --- | --- | --- | --- |
| 1 | M36 The turn engine | One-month turns, End turn, AI powers in order, the month's systems once a turn (yields, growth, treasury, Devotion, renown, mood, taxes, dilemmas), save format v2 | Done |
| 2 | M37 The war table | Regions and links from the traced map, Pontar and Yaruga crossings, movement points, winter, zones of control, supply, sieges, the table with draggable carved pieces | Done |
| 3 | M38 Cities and yields | Per-city focus, works worn by war and repaired with production, conquered cities kept and settling, unsettled cities adding to Unrest | Done |
| 4 | M39 Goals | Two goal trees per power and chapter; unique units (with abilities), buildings and wonders; the AI meets goals and raises uniques too | Done |
| 5 | M40 City-states | Types and suzerain bonuses, envoys, the three routes, favours, rivals courting vassals away, rebellion and judgements | Done |
| 6 | M41 Battles | The lanes battle screen, auto-resolve with odds, sieges across turns (storm, starve, terms, lift) | Done |
| 7 | M42 Diplomacy and AI | Opinions moved by each ruler's lore agenda, grievances and treaties (alliance, open borders, trade, peace); war scores; spies and their operations; an AI that defends, heals, merges, makes war and peace and offers treaties | Done |
| 8 | M43 Chapters and lore events | Chapters moved by the story; the Road to War, the fall of Cintra, Sodden Hill, Thanedd, the Peace of Cintra, the Kingslayers, Radovid and the Third War, each when its driver earns it; player choices; plots seen coming and foiled | Done |
| 9 | M44 Endings | Domination and faith at once; the Empire triumphant, one king rules the North or the North holds at the end of 1272; the player's own fate | Done |
| 10 | M45 Polish and the swap | Balance from whole reigns (`tools/v2play.mjs`), crowns that matter, How to play, painted pieces with strength bars, more names on the table; the swap waits on the owner's word | In progress |

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

## M41 acceptance criteria
- A march into an enemy army opens the battle screen: three lanes and a reserve, both sides placed by the book, ours to rearrange before the first round; the reserve can be committed between rounds.
- Up to three rounds; terrain and weather change what each kind is worth (horse strong in the open, weak in woods and marsh; bows better on hills, worse in rain and snow); an empty flank is turned; morale falls with losses and breaks; the retreat can be sounded.
- "Fight it out" shows the odds of winning as placed; the AI's battles, and any left unfought at the end of the turn, are fought out by the book.
- A walled place under siege eats its stores and falls when they run out; it can be stormed (its garrison fights behind walls, engineers and raiders at half again their strength) or offered terms (besiegers three times the garrison, or stores nearly gone); marching away lifts the siege. The AI storms when twice the garrison, and takes terms when it may.

## M42 acceptance criteria
- Each great power holds an opinion of each other, shown with its reasons: old feeling, its lore agenda (Foltest's southern crowns, Vizimir's envoys, Henselt's respect for strength, Demavend's valley, Emhyr's hatred of northern unity), treaties, grievances and war.
- Treaties (alliance, open borders, trade) are signed when the other side's opinion is high enough; an alliance opens lands and supply and brings the ally into a defensive war; trade pays crowns a month. Peace is taken when a war goes badly or drags on; occupied places are handed back, kept ones stay.
- The AI offers the player treaties and peace (answered on the Diplomacy sheet), signs with other powers, declares war on a hated and much weaker power, makes peace when it suits both sides, and on the board defends threatened regions, pulls hurt armies home and merges its armies.
- Spies: a network grows in one court at a time (agents in their land add to it), pays for sabotage, theft and incitement, and is sometimes caught (a grievance).

## M43 and M44 acceptance criteria
- The chapter is the story's: the Dawn gives way to the First War when the Emperor's legions are mustered and 1263 has come (or by September 1263 regardless), and so on; a chapter that lags moves on by date.
- Lore events fire only when their requirements hold (Cintra falls when the Empire holds it; Sodden Hill when the North's war score against the Empire is six ahead; Thanedd needs the Empire's network in Aedirn, and is foiled by a deep Temerian network in the Empire; the Kingslayers need a deep imperial network in Temeria and a moment of weakness, and a spymaster who sees it coming can guard the king). Each fires once; twin events (a late Road to War, a late Second War) never both happen.
- The player answers the Call of the North and Aedirn's plea, and the plot warning, on story cards; told events show as cards; Goals shows the chapter and the story so far.
- Domination (60% of the North's capitals) and faith (Devotion 1,500 and twice everyone else's) end the game at once; otherwise the end of 1272 brings the lore's ending and the player's fate. A whole reign runs from the Dawn to an ending.

## M45 so far
- `node tools/v2play.mjs [seeds] [idle]` plays whole reigns, with the AI as Temeria's steward or with Temeria idle, and prints each ending.
- Before: every AI capped at 24 companies, crowns piling to about 80,000 by 1272, every stewarded reign ending "The North holds" in a stalemate. After: the AI raises companies while its crowns can carry their upkeep (at most 70% of its crowns, 60 companies in all), upkeep is doubled, crowns a thousand people are halved (0.8), and crowns can pay for companies, repairs and wonders at 3 for each point of production. Stewarded reigns end with about 20,000 crowns; idle ones fall to the Empire in most seeds (the Empire triumphant or ruling the North in 6 of 8).
- How to play shows on a first visit and from the Menu. Pieces are painted wood lit from the upper right, with a band in the realm's second colour, a horse's head for an army of riders, a strength bar beneath and a red ring when out of supply. Towns and cities are named once the table is zoomed in a little.
- Still to come: the swap (v2 to the main address, the real-time game kept at its own), when the owner says so.
