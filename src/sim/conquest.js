// What becomes of a town taken in war, and what holding it costs (M19). The
// taker chooses once how it is treated (spared, sacked, or a people driven
// out); while the war lasts it is only occupied; a peace that leaves it with
// its taker makes it theirs for good (lands.js). Then its people must be won
// over: integration rises with a garrison, prosperity, building and time,
// and falls with heavy taxes, harsh laws and a claimant's agitation. Towns
// that never take to their new crown rise; rulers driven from their thrones
// plot from exile; and every town taken makes the North more afraid.
// Foreign rulers follow the same rules by their own tempers.
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';
import {
  TEMERIA, ownerOf, originOf, placeOf, peopleAt, valueOf, sideName, hostile, atWar, warBetween, sideIndex, realmNow, setOwner,
} from './conflict.js';
import { hasTrait, remember, changeTrust, treatyBetween } from './diplomacy.js';
import { transferTown, peopleOf, livingRealms, syncWorld } from './lands.js';
import { creditLimit } from './economy.js';
import { roadPath } from './world.js';
import { damageWorks, worksSummary } from './works.js';

const C = (world) => world.conquest;
const say = (state, text) => addDispatch(state, text, 'military');
const abroad = (state, text) => addDispatch(state, text, 'abroad');
const PEOPLES = ['human', 'dwarf', 'elf', 'halfling'];

export function defaultConquest() {
  return { decisions: [], nextId: 1, revolts: [], nextRevolt: 1, exodus: [], league: null, fear: {} };
}

function cq(state) {
  return (state.conquest ??= defaultConquest());
}

// ---- Fear ----

// Fear of Temeria (or of any realm that conquers), kept per ruler: separate
// from their mood and their trust. fear[rid][of].
export function fearOf(state, rid, of = TEMERIA) {
  return cq(state).fear[rid]?.[of] ?? 0;
}

function addFear(state, world, of, id, mult = 1) {
  const f = C(world).fear;
  const at = world.byId[id];
  for (const rid of livingRealms(state)) {
    if (rid === of || rid === 'brokilon') continue;
    const near = (world.foreignByRealm[rid] ?? []).some((t) => Math.hypot(world.byId[t].x - at.x, world.byId[t].y - at.y) < f.near);
    const v = valueOf(state, world, id) * f.perValue * mult * (near ? f.neighbourShare : f.farShare);
    const row = (cq(state).fear[rid] ??= {});
    row[of] = clamp((row[of] ?? 0) + v, 0, f.max);
  }
}

// How afraid of Temeria the North is, on average.
export function northFear(state, world) {
  const list = livingRealms(state).filter((r) => r !== 'brokilon');
  if (!list.length) return 0;
  return list.reduce((a, r) => a + fearOf(state, r), 0) / list.length;
}

// ---- Capture ----

// Called when an army takes a town. The crown is asked how to treat it (a
// short card, the game paused); a foreign captain decides by his ruler's
// temper.
export function onCapture(state, world, rng, a, id, prev, how) {
  if (!C(world)) return;
  const p = placeOf(state, world, id);
  const war = warBetween(state, a.side, prev);
  p.bloody = Math.round((war?.lost ?? [0, 0]).reduce((x, y) => x + y, 0));
  // A town of the taker's own coming home needs no choosing.
  if (originOf(world, id) === a.side) return;
  if (a.side === TEMERIA) {
    const d = cq(state);
    d.decisions = d.decisions.filter((x) => !(x.kind === 'capture' && x.town === id));
    d.decisions.push({ id: d.nextId++, kind: 'capture', town: id, day: state.day, options: captureOptions(state, world, id) });
    return;
  }
  const rid = a.side;
  const c = C(world).ai;
  if (!state.realms[rid]) return;
  const greedy = hasTrait(world, rid, 'greedy') || hasTrait(world, rid, 'opportunist');
  if (rng.chance(greedy ? c.sackGreedy : c.sackBase)) return sack(state, world, id, rid);
  const zealous = hasTrait(world, rid, 'zealous');
  const elves = peoplesAt(state, world, id).elf ?? 0;
  if (zealous && elves > 20 && rng.chance(c.expelZealous)) return expel(state, world, id, rid, 'elf');
  spare(state, world, id, rid);
}

// What the crown may choose: spare it, sack it, or drive out one people.
export function captureOptions(state, world, id) {
  const out = ['spare', 'sack'];
  const peoples = peoplesAt(state, world, id);
  const total = Object.values(peoples).reduce((a, b) => a + b, 0) || 1;
  for (const k of PEOPLES) if ((peoples[k] ?? 0) / total >= 0.04 || (peoples[k] ?? 0) >= 50) out.push(`expel:${k}`);
  return out;
}

// The people of a place by kind, abroad or at home.
export function peoplesAt(state, world, id) {
  const p = placeOf(state, world, id);
  if (!p) return {};
  if (typeof p.population !== 'number') return { ...p.population };
  if (!p.peoples) {
    const mix = peopleOf(world, p.origin ?? originOf(world, id)).mix ?? { human: 0.94, dwarf: 0.02, elf: 0.02, halfling: 0.02 };
    p.peoples = {};
    for (const [k, v] of Object.entries(mix)) p.peoples[k] = Math.round(p.population * v);
  }
  return { ...p.peoples };
}

export function optionLabel(state, world, id, opt) {
  if (opt === 'spare') return 'Spare it';
  if (opt === 'sack') return `Sack it (about ${Math.round(sackLoot(state, world, id))} crowns)`;
  const k = opt.split(':')[1];
  const origin = originOf(world, id);
  const name = k === 'human' ? peopleOf(world, origin).name : world.groups.groups[k]?.name ?? k;
  return `Drive out the ${k === 'human' ? name : name.toLowerCase()}`;
}

function sackLoot(state, world, id) {
  const s = C(world).capture.sack;
  const p = placeOf(state, world, id);
  return peopleAt(state, world, id) * s.lootPerPerson * (p.prosperity / 50) + (p.stock ? goodsWorth(world, p.stock) * s.goods : 0);
}

function goodsWorth(world, stock) {
  let v = 0;
  for (const [g, n] of Object.entries(stock)) v += (world.economy.goods.prices[g] ?? 0) * n;
  return v;
}

function spare(state, world, id, by) {
  const p = placeOf(state, world, id);
  p.treated = 'spared';
  addFear(state, world, by, id, 1);
}

function sack(state, world, id, by) {
  const s = C(world).capture.sack;
  const p = placeOf(state, world, id);
  const loot = Math.round(sackLoot(state, world, id));
  if (by === TEMERIA) state.treasury += loot;
  else if (state.realms[by]) state.realms[by].treasury += loot;
  if (p.stock) for (const g of Object.keys(p.stock)) p.stock[g] *= 1 - s.goods;
  p.prosperity = clamp(p.prosperity - s.prosperity, 0, 100);
  if (typeof p.population === 'number') {
    p.population = Math.round(p.population * (1 - s.people));
    if (p.peoples) for (const k of Object.keys(p.peoples)) p.peoples[k] = Math.round(p.peoples[k] * (1 - s.people));
  } else for (const k of Object.keys(p.population)) p.population[k] -= Math.round(p.population[k] * s.people);
  if (p.unrest !== undefined) p.unrest = clamp(p.unrest + s.unrest, 0, 100);
  // The best of what stood there is burned or pulled down.
  const worth = (b) => world.buildings[b]?.cost.coin ?? 0;
  const k = world.works?.sack;
  const burn = [...p.buildings].filter((b) => b !== 'walls').sort((x, y) => worth(y) - worth(x)).slice(0, k ? k.works : s.damaged);
  if (k) {
    // Since M20 nothing is unbuilt: the works stand in ruins, to be mended.
    burn.forEach((b, i) => damageWorks(state, world, id, b, 100 - (k.to[0] + ((k.to[1] - k.to[0]) * i) / Math.max(1, burn.length - 1)), 'Burned in the sack'));
  } else {
    p.buildings = p.buildings.filter((b) => !burn.includes(b));
    p.damaged = [...(p.damaged ?? []), ...burn];
  }
  p.smoulder = state.day + s.smoulderDays;
  p.treated = 'sacked';
  addFear(state, world, by, id, C(world).fear.sack);
  shiver(state, world, by, 'sack');
  const text = `${world.byId[id].name} is sacked by ${sideName(world, by)}: ${loot} crowns in plunder, ${burn.length ? `${burn.map((b) => world.buildings[b].name.toLowerCase()).join(', ')} burned, ` : ''}and its people dead or scattered.`;
  if (by === TEMERIA) say(state, text);
  else abroad(state, text);
}

function expel(state, world, id, by, kind) {
  const e = C(world).capture.expel;
  const p = placeOf(state, world, id);
  const peoples = peoplesAt(state, world, id);
  const gone = peoples[kind] ?? 0;
  if (typeof p.population === 'number') {
    p.peoples[kind] = 0;
    p.population = Math.max(0, p.population - gone);
  } else p.population[kind] = 0;
  const total = Object.values(peoples).reduce((a, b) => a + b, 0) || 1;
  const share = gone / total;
  p.prosperity = clamp(p.prosperity - e.prosperity * Math.min(1, share * 2), 0, 100);
  p.expelled = { kind, share, until: state.day + e.prosperityYears * 365 };
  if (p.unrest !== undefined) p.unrest = clamp(p.unrest + e.unrest, 0, 100);
  p.treated = 'expelled';
  addFear(state, world, by, id, C(world).fear.expel);
  shiver(state, world, by, 'expel');
  // They take the roads to their kin.
  const kin = kinOf(world, id, kind);
  cq(state).exodus.push({ from: id, to: kin.place, people: gone, kind, until: state.day + 40 });
  const origin = originOf(world, id);
  const label = kind === 'human' ? peopleOf(world, origin).name : world.groups.groups[kind]?.name.toLowerCase() ?? kind;
  if (by === TEMERIA) {
    if (kind === 'elf') {
      state.sympathy = clamp((state.sympathy ?? 0) + e.sympathy, 0, 100);
      if (state.opinion.elf !== undefined) state.opinion.elf = clamp(state.opinion.elf - 10, 0, 100);
      if (state.opinion.eternal_fire !== undefined) state.opinion.eternal_fire = clamp(state.opinion.eternal_fire + e.fireMood, 0, 100);
    } else if (kind !== 'human' && state.opinion[kind] !== undefined) state.opinion[kind] = clamp(state.opinion[kind] - 8, 0, 100);
    if (kin.realm && state.diplomacy && state.realms[kin.realm] && !state.realms[kin.realm].fallen) {
      remember(state, world, kin.realm, `We drove ${label} out of ${world.byId[id].name}`, e.kinRelation, { fade: 1080 });
    }
    say(state, `${gone} ${label} are driven out of ${world.byId[id].name}. Their columns take the road to ${kin.place ? world.byId[kin.place].name : 'the border'}.`);
  } else abroad(state, `${sideName(world, by)} drives ${gone} ${label} out of ${world.byId[id].name}.`);
}

// Where a people driven out go: their own realm's nearest town, the dwarves
// to Mahakam, the elves to Brokilon.
function kinOf(world, id, kind) {
  const realm = kind === 'dwarf' ? 'mahakam' : kind === 'elf' ? 'brokilon' : kind === 'human' ? originOf(world, id) : null;
  const at = world.byId[id];
  let best = null;
  const pool = realm ? (world.foreignByRealm[realm] ?? []) : Object.keys(world.byId).filter((x) => x !== id);
  for (const t of pool) {
    if (t === id || !roadPath(world, id, t, true)) continue;
    const d = Math.hypot(world.byId[t].x - at.x, world.byId[t].y - at.y);
    if (!best || d < best.d) best = { place: t, d };
  }
  return { realm, place: best?.place ?? null };
}

// A sack or an expulsion anywhere sours every conquered town of the taker.
function shiver(state, world, by, kind) {
  const v = C(world).integration.elsewhere[kind];
  if (by === TEMERIA) {
    for (const s of Object.values(state.settlements)) if (s.integration !== undefined) s.integration = clamp(s.integration - v, 0, 100);
  } else if (state.realms[by]) {
    for (const s of Object.values(state.realms[by].settlements)) if (s.integration !== undefined) s.integration = clamp(s.integration - v, 0, 100);
  }
}

// ---- What a town would be worth ----

// What a foreign town would bring the crown, as last seen: its people, what
// they would pay in taxes and trade at the crown's rates (before any
// sullenness), its buildings, a gold seam, a harbour, and its walls.
export function worthOf(state, world, id, view) {
  const type = world.byId[id].type;
  const e = world.economy;
  const people = view?.population ?? 0;
  const fortune = e.taxes.prosperityBase + e.taxes.perProsperity * (view?.prosperity ?? 50);
  const taxes = people * (e.taxes.perPersonMonth[type] ?? 0) * fortune;
  const trade = people * (e.trade.perPersonMonth[type] ?? 0) * (0.6 + 0.008 * (view?.prosperity ?? 50));
  const rec = placeOf(state, world, id);
  const water = world.waterOf?.[id];
  const walls = world.war?.sieges ? (world.war.sieges.walls[type] ?? 0) + ((view?.buildings ?? []).includes('walls') ? world.war.sieges.walls.built : 0) : 0;
  return {
    people,
    monthly: Math.round(taxes + trade),
    buildings: [...(view?.buildings ?? [])],
    gold: !!rec?.gold,
    harbour: water?.kind === 'sea' || (water?.navigable && type !== 'village'),
    walls: Math.min(100, walls),
    value: valueOf(state, world, id),
  };
}

// ---- Occupation ----

// An occupied town can be stripped of grain and coin, at a cost in unrest
// and in how it will remember us.
export function canRequisition(state, world, id) {
  if (!C(world) || state.settlements[id] || ownerOf(state, world, id) !== TEMERIA) return { ok: false, reason: 'Only a town we occupy.' };
  const p = placeOf(state, world, id);
  if ((p.requisitioned ?? -Infinity) + C(world).occupation.everyDays > state.day) return { ok: false, reason: 'It was stripped too lately.' };
  return { ok: true, coin: Math.round(p.population * C(world).occupation.coinPerPerson * (p.prosperity / 50)), food: Math.round(p.population * C(world).occupation.food) };
}

export function requisition(state, world, id) {
  const o = C(world).occupation;
  const check = canRequisition(state, world, id);
  const p = placeOf(state, world, id);
  state.treasury += check.coin;
  // The grain goes to the nearest of our own towns.
  const at = world.byId[id];
  let best = null;
  for (const [hid, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    const d = Math.hypot(world.byId[hid].x - at.x, world.byId[hid].y - at.y);
    if (!best || d < best.d) best = { s, d };
  }
  if (best) best.s.stock.food += check.food;
  p.prosperity = clamp(p.prosperity - o.prosperity, 0, 100);
  p.unrest = clamp((p.unrest ?? 20) + o.unrest, 0, 100);
  p.integrationHit = (p.integrationHit ?? 0) + o.integration;
  p.requisitioned = state.day;
  say(state, `Our quartermasters strip ${world.byId[id].name}: ${check.coin} crowns and ${check.food} measures of grain. Its people will not forget it.`);
}

// ---- Decisions ----

export function conquestDecisionText(state, world, d) {
  const name = world.byId[d.town]?.name ?? d.town;
  if (d.kind === 'capture') {
    return {
      kicker: 'A town taken', title: `What of ${name}?`,
      text: `${name} is ours. Spared, it will come round to us soonest. Sacked, it pays at once and hates us for a generation, and the whole North will fear us. Or one of its peoples can be driven out.`,
      choices: d.options.map((o) => optionLabel(state, world, d.town, o)),
    };
  }
  if (d.kind === 'grant') {
    const houses = d.options.slice(1).map((h) => world.houses.houses[h].name);
    return {
      kicker: 'A town gained', title: `Who holds ${name}?`,
      text: `The peace leaves ${name} with Temeria. The crown may keep it as its own demesne, or grant it to a great house, whose loyalty will rise (and the others' envy with it).`,
      choices: ['Keep it as crown land', ...houses.map((h) => `Grant it to ${h}`)],
    };
  }
  const r = cq(state).revolts.find((x) => x.id === d.revolt);
  return {
    kicker: 'A rising', title: `${name} rises against the crown`,
    text: `${r ? r.rebels : 'Many'} of its people have taken up arms${r?.claimant ? `, in the name of their exiled ruler` : ''}. We can crush them, or treat with them: lighter taxes and a charter for their people would end it, at a cost to the crown's Authority.`,
    choices: [`Crush them (${crushOddsWord(state, world, d.town, r)})`, 'Treat with them'],
  };
}

export function resolveConquestDecision(state, world, id, choice, ignored = false) {
  const list = cq(state).decisions;
  const i = list.findIndex((d) => d.id === id);
  if (i < 0) return false;
  const d = list[i];
  list.splice(i, 1);
  if (d.kind === 'capture') {
    // The town may have been retaken before the crown answered.
    if (ownerOf(state, world, d.town) !== TEMERIA) return true;
    const opt = d.options[choice] ?? 'spare';
    if (opt === 'sack') sack(state, world, d.town, TEMERIA);
    else if (opt.startsWith('expel:')) expel(state, world, d.town, TEMERIA, opt.split(':')[1]);
    else {
      spare(state, world, d.town, TEMERIA);
      say(state, `${world.byId[d.town].name} is spared${ignored ? ', for want of other orders' : ''}. Its people go back to their trades under our flag.`);
    }
  } else if (d.kind === 'grant') {
    const s = state.settlements[d.town];
    if (!s) return true;
    const house = d.options[choice];
    if (house && house !== 'crown' && state.houses[house]) {
      const g = C(world).grant;
      s.holder = house;
      state.houses[house].favour += g.loyalty;
      for (const [hid, h] of Object.entries(state.houses)) if (hid !== house) h.grievance += g.envy;
      say(state, `${world.byId[d.town].name} is granted to ${world.houses.houses[house].name}. The other houses note it.`);
    } else say(state, `${world.byId[d.town].name} is kept as crown land.`);
  } else if (d.kind === 'revolt') {
    const r = cq(state).revolts.find((x) => x.id === d.revolt);
    if (!r) return true;
    if (choice === 1) negotiate(state, world, r);
    else crush(state, world, r);
  }
  return true;
}

export function stepConquestDay(state, world) {
  if (!C(world)) return;
  const d = cq(state);
  const waits = { capture: C(world).capture.decisionDays, grant: C(world).grant.decisionDays, revolt: C(world).revolt.decisionDays };
  for (const x of [...d.decisions]) {
    if (state.day - x.day >= waits[x.kind]) resolveConquestDecision(state, world, x.id, 0, true);
  }
}

// A town just made Temerian by a peace or a deal: who is to hold it.
export function askGrant(state, world, id) {
  if (!C(world) || !state.settlements[id]) return;
  const houses = Object.keys(state.houses ?? {}).filter((h) => !state.houses[h].rebel && !state.houses[h].defected);
  cq(state).decisions.push({ id: cq(state).nextId++, kind: 'grant', town: id, day: state.day, options: ['crown', ...houses] });
}

// ---- Integration ----

export function integrationFactor(world, s, key) {
  if (s.integration === undefined || !C(world)) return 1;
  const at = C(world).integration[key];
  return at + (1 - at) * (s.integration / 100);
}

export function integrationUnrest(world, s) {
  if (s.integration === undefined || !C(world)) return 0;
  const i = C(world).integration;
  return Math.max(0, i.unrestBelow - s.integration) * i.unrest;
}

// The parts of a conquered town's monthly change in integration, each with
// a short reason, for its card.
export function integrationParts(state, world, id) {
  const s = state.settlements[id];
  const m = C(world).integration.monthly;
  const out = [];
  if (s?.integration === undefined) return out;
  const add = (text, v) => { if (Math.abs(v) >= 0.05) out.push({ text, value: Math.round(v * 10) / 10 }); };
  add('Time under the crown', m.time);
  const target = world.settlementData[id]?.garrison ?? 0;
  if (target && s.garrison >= target * m.garrisonAt) add('A garrison keeps the peace', m.garrison);
  add(s.prosperity >= 50 ? 'Prosperity' : 'Hard times', (s.prosperity - 50) * m.prosperity);
  if (world.works) {
    // Since M20 the crown wins a town over by mending what war broke there.
    const w = worksSummary(s);
    const mended = w.mean - (s.conquered?.works ?? w.mean);
    if (mended >= 5) add('What the crown has mended there', Math.min(m.buildingMax, (mended / 10) * m.buildingMax));
    if (w.mean < 50) add('Its works left in ruins', -m.buildingMax * Math.min(1, (50 - w.mean) / 30));
  } else {
    const built = s.buildings.filter((b) => !(s.conquered?.found ?? []).includes(b)).length;
    if (built) add('What the crown has built there', Math.min(m.buildingMax, built * m.building));
  }
  const law = (k, o) => state.laws[k]?.option === o;
  const non = 1 - (s.population.human / Math.max(1, totalPopulation(s)));
  if (law('taxation', 'heavy')) add('Heavy taxes', -m.heavyTax);
  if (law('public_order', 'martial')) add('Martial law', -m.harsh);
  if (law('nonhumans', 'expulsion') && non > 0.1) add('Our law against their nonhumans', -m.harsh);
  if (law('nonhumans', 'charter') && non > 0.1) add('Our charter for nonhumans', m.tolerant);
  if (law('old_ways', 'suppressed') && (s.faith.old_ways ?? 0) > 25) add('The old ways suppressed', -m.harsh);
  if (law('patronage', 'tolerance')) add('Tolerance of every faith', m.tolerant);
  if (law('patronage', 'eternal_fire') && (s.faith.eternal_fire ?? 0) < 30) add('The Eternal Fire favoured over their faith', -m.harsh);
  const cl = (state.claimants ?? []).find((c) => c.realm === s.origin);
  if (cl) add(`${claimantName(world, cl)} stirs them from exile`, -m.claimant * (cl.legitimacy / 100) * 2);
  if (s.resettle) add('Settlers from Temeria', C(world).resettle.integration);
  if (s.charter && s.charter > state.day) add('Their charter', m.tolerant);
  return out;
}

function monthlyIntegration(state, world) {
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.integration === undefined || s.occupier) continue;
    if (s.integrationHit) {
      s.integration -= s.integrationHit;
      delete s.integrationHit;
    }
    const delta = integrationParts(state, world, id).reduce((a, x) => a + x.value, 0);
    s.integration = clamp(s.integration + delta, 0, 100);
    // Settlers arrive, and some of the old folk are pushed out.
    if (s.resettle) {
      const r = C(world).resettle;
      s.population.human += Math.round(s.resettle.settlers / r.months);
      s.resettle.months -= 1;
      if (s.resettle.months <= 0) delete s.resettle;
    }
  }
  // Abroad, the same in a lighter form.
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    for (const s of Object.values(realm.settlements)) {
      if (s.integration === undefined) continue;
      const v = C(world).integration.foreignMonthly + (s.prosperity - 50) * C(world).integration.monthly.prosperity;
      s.integration = clamp(s.integration + v, 0, 100);
    }
  }
}

// Paying to bring Temerian settlers into a conquered town: integration
// rises faster, but locals are pushed out, and join the claimant's cause.
export function resettleCost(state, world, id) {
  const r = C(world).resettle;
  return Math.round(r.cost + totalPopulation(state.settlements[id]) * r.costPerPerson);
}

export function canResettle(state, world, id) {
  const s = state.settlements[id];
  if (!C(world) || !s || s.integration === undefined || s.occupier) return { ok: false, reason: 'Only a conquered town of ours.' };
  if (s.resettle) return { ok: false, reason: 'Settlers are already on their way.' };
  if (s.integration >= 90) return { ok: false, reason: 'It needs no settlers.' };
  const cost = resettleCost(state, world, id);
  if (state.treasury - cost < -creditLimit(state, world)) return { ok: false, reason: 'The treasury cannot bear it.' };
  return { ok: true, cost };
}

export function resettle(state, world, id) {
  const r = C(world).resettle;
  const s = state.settlements[id];
  const cost = resettleCost(state, world, id);
  state.treasury -= cost;
  const pop = totalPopulation(s);
  const displaced = Math.round(s.population.human * r.displaced);
  s.population.human -= displaced;
  s.resettle = { months: r.months, settlers: Math.round(pop * r.settlers) };
  const cl = (state.claimants ?? []).find((c) => c.realm === s.origin);
  if (cl) cl.legitimacy = clamp(cl.legitimacy + r.legitimacy, 0, 100);
  cq(state).exodus.push({ from: id, to: kinOf(world, id, 'human').place, people: displaced, kind: 'human', until: state.day + 40 });
  say(state, `Settlers from Temeria set out for ${world.byId[id].name}, ${cost} crowns for their passage and land. ${displaced} of the old folk are turned off theirs.`);
}

// ---- Rebuilding ----

// What was burned in a sack can be rebuilt for half its first cost.
export function canRepair(state, world, id, b) {
  const s = state.settlements[id];
  if (!s || s.occupier || !(s.damaged ?? []).includes(b)) return { ok: false, reason: 'Nothing of that kind lies in ruins there.' };
  if (s.construction) return { ok: false, reason: 'Its builders are busy.' };
  if (s.smoulder && s.smoulder > state.day) return { ok: false, reason: 'The ruins are still smouldering.' };
  const cost = Math.round((world.buildings[b].cost.coin ?? 0) * 0.5);
  if (state.treasury - cost < -creditLimit(state, world)) return { ok: false, reason: 'The treasury cannot bear it.' };
  return { ok: true, cost };
}

export function repair(state, world, id, b) {
  const s = state.settlements[id];
  const def = world.buildings[b];
  const cost = Math.round((def.cost.coin ?? 0) * 0.5);
  state.treasury -= cost;
  state.ledger.construction += cost;
  s.damaged = s.damaged.filter((x) => x !== b);
  s.construction = { building: b, daysLeft: Math.ceil(def.days / 2), days: Math.ceil(def.days / 2) };
  say(state, `Masons start rebuilding the ${def.name.toLowerCase()} at ${world.byId[id].name}: ${cost} crowns.`);
}

// ---- Revolts ----

function monthlyRevolts(state, world, rng) {
  const rv = C(world).revolt;
  const d = cq(state);
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.integration === undefined || s.occupier || d.revolts.some((r) => r.town === id)) continue;
    if (s.integration >= rv.integrationBelow || s.unrest <= rv.unrestAbove) continue;
    const cl = (state.claimants ?? []).find((c) => c.realm === s.origin);
    if (!rng.chance(rv.chance * (cl ? rv.claimantBoost : 1))) continue;
    rise(state, world, rng, id, s.origin, TEMERIA, !!cl);
  }
  // Conquered towns abroad rise against their foreign masters too.
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    if (realm.fallen) continue;
    for (const [id, s] of Object.entries(realm.settlements)) {
      if (s.integration === undefined || s.integration >= rv.integrationBelow || d.revolts.some((r) => r.town === id)) continue;
      if (!rng.chance(rv.foreignChance)) continue;
      rise(state, world, rng, id, s.origin ?? originOf(world, id), rid, (state.claimants ?? []).some((c) => c.realm === s.origin));
    }
  }
  for (const r of [...d.revolts]) tendRevolt(state, world, rng, r);
}

function rise(state, world, rng, id, origin, against, claimant, spread = true) {
  const rv = C(world).revolt;
  const d = cq(state);
  const people = peopleAt(state, world, id);
  const r = { id: d.nextRevolt++, town: id, origin, against, rebels: Math.max(rv.rebelMin, Math.round(people * rv.rebelShare)), since: state.day, held: null, claimant };
  d.revolts.push(r);
  const p = placeOf(state, world, id);
  // Rebels stronger than the garrison take the town; it stops paying.
  if (r.rebels > p.garrison) {
    r.held = state.day;
    p.garrison = Math.round(p.garrison * 0.3);
  }
  const name = world.byId[id].name;
  const whose = origin === TEMERIA ? 'Temeria' : peopleOf(world, origin).name;
  if (against === TEMERIA) {
    say(state, `${name} rises! ${r.rebels} rebels declare for ${claimant ? 'their exiled ruler' : `the old crown of ${sideName(world, origin)}`}${r.held ? ' and hold the town' : ''}.`);
    d.decisions.push({ id: d.nextId++, kind: 'revolt', town: id, revolt: r.id, day: state.day });
  } else abroad(state, `${name} rises against ${sideName(world, against)}: ${r.rebels} ${whose} under arms.`);
  if (!spread) return;
  // The fire spreads to towns of the same people near by.
  const at = world.byId[id];
  const near = against === TEMERIA ? Object.entries(state.settlements) : Object.entries(state.realms[against]?.settlements ?? {});
  for (const [tid, t] of near) {
    if (tid === id || (t.origin ?? originOf(world, tid)) !== origin || (t.integration ?? 100) >= 50) continue;
    if (d.revolts.some((x) => x.town === tid)) continue;
    const q = world.byId[tid];
    if (Math.hypot(q.x - at.x, q.y - at.y) > rv.spreadRange || !rng.chance(rv.spreadChance)) continue;
    rise(state, world, rng, tid, origin, against, claimant, false);
  }
  // The old realm, if it stands, may march to help.
  if (against === TEMERIA && origin !== TEMERIA && state.realms[origin] && !state.realms[origin].fallen && !hostile(state, origin, TEMERIA)
    && (state.neighbours[origin]?.relation ?? 0) < 0 && rng.chance(rv.joinChance) && !treatyBetween(state, origin, TEMERIA, 'nonaggression')) {
    startRevoltWar(state, world, rng, origin, TEMERIA, id);
  }
}

// war.js lends its startWar here. Kept on the function itself: a module
// variable would be read before it exists, through the import cycle.
export function setWarHook(fn) {
  setWarHook.fn = fn;
}
const warHook = (...args) => setWarHook.fn?.(...args);

function startRevoltWar(state, world, rng, attacker, defender, town) {
  if (!setWarHook.fn) return;
  const war = warHook(state, world, rng, attacker, defender, 'revolt');
  if (war) {
    war.aims = { [attacker]: town };
    war.reason = 'claim';
  }
}

export function crushOdds(state, world, id, r) {
  if (!r) return 0;
  const p = placeOf(state, world, id);
  let mine = p.garrison;
  const at = world.byId[id];
  for (const a of state.armies ?? []) {
    if (a.side !== r.against) continue;
    const q = world.byId[a.at];
    if (Math.hypot(q.x - at.x, q.y - at.y) < 150) mine += a.soldiers;
  }
  if (r.against === TEMERIA) {
    for (const c of state.forces?.companies ?? []) {
      const q = world.byId[c.node];
      if (q && !c.army && Math.hypot(q.x - at.x, q.y - at.y) < 150) mine += c.men * 1.5;
    }
    // Nearby garrisons lend a share of their men.
    for (const [tid, t] of Object.entries(state.settlements)) {
      if (tid === id || t.occupier) continue;
      const q = world.byId[tid];
      if (Math.hypot(q.x - at.x, q.y - at.y) < 150) mine += t.garrison * 0.3;
    }
  }
  const theirs = r.rebels * C(world).revolt.crushStrength;
  return mine ** 3 / (mine ** 3 + theirs ** 3);
}

function crushOddsWord(state, world, id, r) {
  const o = crushOdds(state, world, id, r);
  return o > 0.85 ? 'sure' : o > 0.6 ? 'likely' : o > 0.35 ? 'even' : 'unlikely';
}

function crush(state, world, r) {
  const rv = C(world).revolt;
  const s = state.settlements[r.town];
  const name = world.byId[r.town].name;
  // The crown's men either have the numbers or they do not: the odds shown
  // are the odds it acts on.
  if (crushOdds(state, world, r.town, r) >= 0.5) {
    endRevolt(state, r);
    if (s) {
      s.integration = clamp((s.integration ?? 0) + rv.crushIntegration, 0, 100);
      s.unrest = clamp(s.unrest + rv.crushUnrest, 0, 100);
      s.population.human = Math.max(0, s.population.human - Math.round(r.rebels * 0.6));
      s.garrison = Math.max(s.garrison, Math.round(r.rebels * 0.3));
    }
    say(state, `The rising at ${name} is crushed. The ringleaders hang in the square; the town is quiet, and sullen.`);
  } else {
    if (s) s.garrison = Math.round(s.garrison * 0.5);
    r.rebels = Math.round(r.rebels * 0.85);
    say(state, `Our men fail to break the rebels at ${name}. The rising goes on.`);
  }
}

function negotiate(state, world, r) {
  const rv = C(world).revolt;
  const s = state.settlements[r.town];
  endRevolt(state, r);
  if (s) {
    s.integration = clamp((s.integration ?? 0) + rv.negotiateIntegration, 0, 100);
    s.charter = state.day + rv.charterYears * 365;
    s.unrest = clamp(s.unrest - 20, 0, 100);
  }
  state.authority = clamp(state.authority + rv.negotiateAuthority, 0, 100);
  say(state, `The crown treats with the rebels of ${world.byId[r.town].name}: lighter taxes and a charter for their people. They lay down their arms. The lords mutter that the crown has bent.`);
}

function endRevolt(state, r) {
  const d = cq(state);
  d.revolts = d.revolts.filter((x) => x !== r);
  d.decisions = d.decisions.filter((x) => x.revolt !== r.id);
}

// Each month a revolt goes on: an army of its masters standing there puts it
// down; a garrison too weak to retake it lets it hold; a town held for a
// season is free.
function tendRevolt(state, world, rng, r) {
  const rv = C(world).revolt;
  const p = placeOf(state, world, r.town);
  if (!p || realmNow(world, r.town) !== r.against) return endRevolt(state, r);
  const odds = crushOdds(state, world, r.town, r);
  const army = (state.armies ?? []).some((a) => a.side === r.against && a.at === r.town && !a.to);
  if (army && odds > 0.5) {
    if (r.against === TEMERIA) crush(state, world, r);
    else {
      endRevolt(state, r);
      abroad(state, `${sideName(world, r.against)} puts down the rising at ${world.byId[r.town].name}.`);
    }
    return;
  }
  if (r.against !== TEMERIA && odds > 0.7 && rng.chance(0.5)) {
    endRevolt(state, r);
    if (p.integration !== undefined) p.integration = clamp(p.integration - 10, 0, 100);
    return;
  }
  if (!r.held && r.rebels > p.garrison) r.held = state.day;
  if (r.held && state.day - r.held >= rv.holdDays) free(state, world, r);
}

// A town that throws off its masters goes back to its old crown, raising
// its realm again if it had fallen.
function free(state, world, r) {
  endRevolt(state, r);
  const to = r.origin;
  const name = world.byId[r.town].name;
  if (to !== TEMERIA && !state.realms[to]) return;
  if (to !== TEMERIA && state.realms[to].fallen) restoreRealm(state, world, to);
  const s = placeOf(state, world, r.town);
  setOwner(state, world, r.town, to);
  transferTown(state, world, r.town, to, { quiet: true });
  const q = placeOf(state, world, r.town);
  if (q) {
    q.garrison = Math.max(q.garrison, Math.round(r.rebels * 0.5));
    if (q.integration !== undefined) q.integration = 90;
  }
  const text = `${name} is free of ${sideName(world, r.against)}: the rebels have held it a season, and it returns to ${sideName(world, to)}.`;
  if (r.against === TEMERIA || to === TEMERIA) say(state, text);
  else abroad(state, text);
  void s;
}

function restoreRealm(state, world, rid) {
  delete state.realms[rid].fallen;
  state.claimants = (state.claimants ?? []).filter((c) => c.realm !== rid);
  abroad(state, `${sideName(world, rid)} rises again: its exiled ruler returns to a throne.`);
}

// ---- Claimants ----

export function claimantName(world, c) {
  const r = world.neighbours?.realms[c.realm]?.ruler ?? 'The exile';
  return r;
}

function monthlyClaimants(state, world, rng) {
  const k = C(world).claimant;
  for (const c of [...(state.claimants ?? [])]) {
    // Legitimacy fades with the years, faster where the old lands take to
    // their new masters.
    const lands = landsOf(state, world, c.realm);
    const avg = lands.length ? lands.reduce((a, s) => a + (s.integration ?? 50), 0) / lands.length : 100;
    c.legitimacy = clamp(c.legitimacy - (avg > k.fastFadeAbove ? k.fastFadePerYear : k.fadePerYear) / 12, 0, 100);
    if (c.legitimacy < k.goneBelow) {
      state.claimants = state.claimants.filter((x) => x !== c);
      const text = `${claimantName(world, c)} has given up the claim to ${sideName(world, c.realm)}. The exile's court is dispersed.`;
      if (c.against === TEMERIA) say(state, text);
      else abroad(state, text);
      continue;
    }
    if (!c.host || state.realms[c.host]?.fallen) c.host = null;
    // With a strong claim and a willing host, an exile army.
    if (c.host && c.legitimacy >= k.exileArmyAt && !hostile(state, c.host, c.against) && !atWarWithAny(state, c.host) && rng.chance(k.exileArmyChance)) {
      const relation = c.against === TEMERIA ? state.neighbours[c.host]?.relation ?? 0 : -50;
      if (relation < 0 && !treatyBetween(state, c.host, c.against, 'nonaggression') && setWarHook.fn) {
        const capital = world.realms.realms[c.realm]?.capital;
        const war = warHook(state, world, rng, c.host, c.against, 'claimant');
        if (war) {
          war.aims = { [c.host]: capital };
          war.reason = 'claim';
          war.claimant = c.realm;
          if (state.realms[c.host]) state.realms[c.host].army = (state.realms[c.host].army ?? 0) + k.exileArmyMen;
          const text = `${claimantName(world, c)} lands with an exile army, ${sideName(world, c.host)}'s soldiers at his back, to take back ${sideName(world, c.realm)}.`;
          if (c.against === TEMERIA) say(state, text);
          else abroad(state, text);
        }
      }
    }
  }
}

function atWarWithAny(state, rid) {
  return atWar(state, rid);
}

// The towns a claimant still counts as theirs, under whoever holds them now.
function landsOf(state, world, rid) {
  const out = [];
  for (const [id, s] of Object.entries(state.settlements)) if (s.origin === rid) out.push(s);
  for (const realm of Object.values(state.realms ?? {})) for (const [id, s] of Object.entries(realm.settlements)) if ((s.origin ?? originOf(world, id)) === rid && realm !== state.realms[rid]) out.push(s);
  return out;
}

export function pensionCost(state, world, c) {
  const k = C(world).claimant;
  return Math.round(k.pension + c.legitimacy * k.pensionPerLegitimacy);
}

export function canPension(state, world, rid) {
  const c = (state.claimants ?? []).find((x) => x.realm === rid);
  if (!c || c.against !== TEMERIA) return { ok: false, reason: 'No such claimant against us.' };
  const cost = pensionCost(state, world, c);
  if (state.treasury - cost < -creditLimit(state, world)) return { ok: false, reason: 'The treasury cannot bear it.' };
  return { ok: true, cost };
}

export function payPension(state, world, rid) {
  const c = state.claimants.find((x) => x.realm === rid);
  const cost = pensionCost(state, world, c);
  state.treasury -= cost;
  state.claimants = state.claimants.filter((x) => x !== c);
  say(state, `${claimantName(world, c)} takes a pension of ${cost} crowns and renounces the claim to ${sideName(world, rid)}.`);
}

export function canSpyOnClaimant(state, world, rid) {
  const c = (state.claimants ?? []).find((x) => x.realm === rid);
  if (!c || c.against !== TEMERIA) return { ok: false, reason: 'No such claimant against us.' };
  if ((c.spied ?? -Infinity) + 180 > state.day) return { ok: false, reason: 'Our agents are still lying low.' };
  if (state.treasury - C(world).claimant.spyCost < -creditLimit(state, world)) return { ok: false, reason: 'The treasury cannot bear it.' };
  return { ok: true, cost: C(world).claimant.spyCost };
}

// A spy sent against a claimant: it may discredit them, or be caught.
export function spyOnClaimant(state, world, rng, rid) {
  const k = C(world).claimant;
  const c = state.claimants.find((x) => x.realm === rid);
  state.treasury -= k.spyCost;
  c.spied = state.day;
  if (rng.chance(k.spyChance)) {
    c.legitimacy = clamp(c.legitimacy - 30, 0, 100);
    say(state, `Our agents spread word of ${claimantName(world, c)}'s debts and quarrels. The exile's cause loses heart.`);
  } else if (rng.chance(k.spyCaught)) {
    if (c.host && state.neighbours[c.host]) state.neighbours[c.host].relation = clamp(state.neighbours[c.host].relation - 15, -100, 100);
    if (c.host && state.diplomacy) changeTrust(state, world, c.host, TEMERIA, -8);
    c.legitimacy = clamp(c.legitimacy + 5, 0, 100);
    say(state, `Our agent at ${c.host ? sideName(world, c.host) : 'the exile court'} is taken. The claimant makes much of it.`);
  } else say(state, `Our agents find no way into ${claimantName(world, c)}'s household.`);
}

// The host hands the claimant over, or sends them away: a deal-table item.
export function expelClaimant(state, world, host) {
  const c = (state.claimants ?? []).find((x) => x.host === host && x.against === TEMERIA);
  if (!c) return;
  state.claimants = state.claimants.filter((x) => x !== c);
  say(state, `${sideName(world, host)} hands ${claimantName(world, c)} over to the crown. The claim to ${sideName(world, c.realm)} dies with the exile's hopes.`);
}

// ---- The league against Temeria ----

function monthlyFear(state, world, rng) {
  const f = C(world).fear;
  const d = cq(state);
  for (const row of Object.values(d.fear)) for (const k of Object.keys(row)) row[k] = Math.max(0, row[k] - f.decayPerMonth);
  const avg = northFear(state, world);
  const living = livingRealms(state).filter((r) => r !== 'brokilon');
  if (!d.league && avg >= f.leagueAt) {
    const members = living.filter((r) => fearOf(state, r) >= f.leagueMemberAt);
    if (members.length >= 2) {
      d.league = { members, since: state.day };
      say(state, `Fear of Temeria binds the North: ${members.map((r) => sideName(world, r)).join(', ')} swear a league to stand together against Vizima.`);
    }
  } else if (d.league) {
    d.league.members = d.league.members.filter((r) => living.includes(r) && fearOf(state, r) >= f.leagueLeaveBelow);
    for (const r of living) if (!d.league.members.includes(r) && fearOf(state, r) >= f.leagueMemberAt) d.league.members.push(r);
    if (d.league.members.length < 2 || avg < f.leagueLeaveBelow) {
      d.league = null;
      say(state, 'The league against Temeria comes apart: its members fear us less than they distrust one another.');
      return;
    }
    // When fear is extreme and Temeria weakened, the league marches.
    const weak = atWar(state, TEMERIA) || state.stability < f.attackStability;
    if (avg >= f.attackAt && weak && !d.league.members.some((r) => hostile(state, r, TEMERIA)) && rng.chance(f.attackChance) && setWarHook.fn) {
      const [lead, ...rest] = d.league.members;
      const war = warHook(state, world, rng, lead, TEMERIA, 'league');
      if (war) {
        for (const r of rest) if (!war.sides[0].includes(r)) war.sides[0].push(r);
        war.reason = 'league';
        say(state, `The league marches: ${d.league.members.map((r) => sideName(world, r)).join(', ')} declare war on Temeria together.`);
      }
    }
  }
}

// League members stand by one another when Temeria attacks any of them.
export function leagueAllies(state, victim) {
  const l = state.conquest?.league;
  if (!l || !l.members.includes(victim)) return [];
  return l.members.filter((r) => r !== victim);
}

// ---- Great houses that turn their coats ----

function monthlyDefection(state, world, rng) {
  const df = C(world).defection;
  for (const [hid, h] of Object.entries(state.houses ?? {})) {
    if (h.rebel || h.defected || h.loyalty >= df.loyaltyBelow || state.authority >= df.authorityBelow) continue;
    const lands = Object.keys(state.settlements).filter((id) => state.settlements[id].holder === hid && !state.settlements[id].occupier);
    if (!lands.length || lands.includes(world.kingdom.capital)) continue;
    // A neighbour courting them: near their lands, and hostile to the crown.
    let suitor = null;
    for (const rid of livingRealms(state)) {
      if (rid === 'brokilon' || (state.neighbours[rid]?.relation ?? 0) >= df.relationBelow) continue;
      const near = lands.some((id) => (world.foreignByRealm[rid] ?? []).some((t) => Math.hypot(world.byId[t].x - world.byId[id].x, world.byId[t].y - world.byId[id].y) < df.range));
      if (near && (!suitor || state.neighbours[rid].relation < state.neighbours[suitor].relation)) suitor = rid;
    }
    if (!suitor || !rng.chance(df.chance)) continue;
    h.defected = { to: suitor, day: state.day };
    for (const id of lands) {
      setOwner(state, world, id, suitor);
      transferTown(state, world, id, suitor, { quiet: true });
    }
    say(state, `${world.houses.houses[hid].name} turns its coat: its lords swear to ${sideName(world, suitor)}, and take ${lands.map((id) => world.byId[id].name).join(', ')} with them.`);
  }
}

// ---- The month ----

export function monthlyConquest(state, world, rng) {
  if (!C(world)) return;
  cq(state);
  // Smouldering ruins cool; people driven out leave a gap for years.
  for (const s of Object.values(state.settlements)) {
    if (s.smoulder && s.smoulder <= state.day) delete s.smoulder;
    if (s.expelled && s.expelled.until <= state.day) delete s.expelled;
  }
  state.conquest.exodus = state.conquest.exodus.filter((e) => e.until > state.day);
  monthlyIntegration(state, world);
  monthlyRevolts(state, world, rng);
  monthlyClaimants(state, world, rng);
  monthlyFear(state, world, rng);
  monthlyDefection(state, world, rng);
  syncWorld(world, state);
}

export function upgradeConquest(state) {
  state.conquest ??= defaultConquest();
}
