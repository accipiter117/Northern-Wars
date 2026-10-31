// The great houses. Each holds lands of the crown, keeps its own soldiers
// there and pays the crown only part of what those lands yield. Loyalty
// drifts with the lords' mood, the crown's Standing, the laws a house cares
// about, favours granted and grievances nursed. Disloyal houses make their
// lands restless; a house pushed too far rebels. A crown that loses both its
// Authority and its order for half a year is deposed.
import { nudge, authority, fearCollapse } from './meters.js';
import { sendFigure } from './figures.js';
import { creditLimit } from './economy.js';
import { addDispatch, clamp } from './realm.js';
import { lawStands } from './book.js';
import { totalPopulation } from './state.js';
import { monthlyGuard, guardUnrest, monthlyWants, grantWant, obeys, commandable } from './lords.js';

const say = (state, text) => addDispatch(state, text, 'nobles');

const cfg = (world) => world.houses;

export function defaultHouses(world) {
  const out = {};
  for (const [id, h] of Object.entries(cfg(world).houses)) {
    out[id] = { loyalty: h.loyalty, favour: 0, grievance: 0, ambition: h.ambition, office: false, exemptUntil: null, rebel: null, lastAction: {} };
  }
  return out;
}

export function applyHoldings(state, world) {
  for (const [id, h] of Object.entries(cfg(world).houses)) {
    for (const sid of h.holdings) if (state.settlements[sid]) state.settlements[sid].holder = id;
  }
}

export function holdingsOf(state, houseId) {
  return Object.keys(state.settlements).filter((id) => state.settlements[id].holder === houseId);
}

function traitsOf(world, houseId) {
  return cfg(world).houses[houseId].traits.map((t) => cfg(world).traits[t]);
}

export function housePower(state, world, houseId) {
  let people = 0;
  let soldiers = 0;
  for (const id of holdingsOf(state, houseId)) {
    people += totalPopulation(state.settlements[id]);
    soldiers += state.settlements[id].garrison;
  }
  return { people, soldiers, strength: soldiers + people * cfg(world).rebellion.levyPerPeople };
}

export function loyaltyTarget(state, world, houseId) {
  const c = cfg(world);
  const h = state.houses[houseId];
  let t = c.houses[houseId].loyalty;
  t += (state.opinion.nobles - 50) * c.nobleOpinionWeight;
  t += (authority(state, world) - 50) * c.standingWeight;
  t += h.favour - h.grievance;
  // A loved crown keeps its lords' hearts (M27 B).
  if (c.moods) t += ((state.love ?? 50) - 50) * c.moods.loveLoyalty;
  if (h.office) t += c.officeLoyalty;
  for (const tr of traitsOf(world, houseId)) {
    t += tr.loyalty ?? 0;
    for (const [key, v] of Object.entries(tr.cares ?? {})) {
      if (lawStands(state, key)) t += v;
    }
  }
  return clamp(t, 0, 100);
}

// What share of a settlement's taxes and trade reaches the crown.
export function crownShare(state, world, s) {
  if (s.holder === 'crown' || !state.houses?.[s.holder]) return 1;
  const h = state.houses[s.holder];
  if (h.rebel || (h.exemptUntil !== null && state.day < h.exemptUntil)) return 0;
  return cfg(world).heldTaxShare;
}

// Lords' discontent spreads to the lands they hold, and rebellion more so.
export function holderUnrest(state, world, s) {
  if (s.holder === 'crown' || !state.houses?.[s.holder]) return 0;
  const h = state.houses[s.holder];
  return Math.max(0, 50 - h.loyalty) * cfg(world).unrestPerDisloyalty + (h.rebel ? cfg(world).rebellion.unrest : 0) + guardUnrest(state, world, s);
}

export function stepHousesDay(state, world) {
  const drift = cfg(world).loyaltyDrift;
  for (const id of Object.keys(state.houses)) {
    const h = state.houses[id];
    h.loyalty = clamp(h.loyalty + (loyaltyTarget(state, world, id) - h.loyalty) * drift, 0, 100);
  }
  for (const d of [...state.demands]) {
    if (state.day - d.day >= cfg(world).demandDefaultDays) {
      const choices = world.demands.demands[d.demand].choices;
      resolveDemand(state, world, d.id, Math.max(0, choices.findIndex((c) => c.default)), true);
    }
  }
}

export function monthlyHouses(state, world, rng) {
  const c = cfg(world);
  let sum = 0;
  for (const [id, h] of Object.entries(state.houses)) {
    h.favour *= c.favourDecay;
    h.grievance *= c.grievanceDecay;
    const bold = c.moods ? 1 + Math.max(0, (state.love ?? 50) - 50) * c.moods.loveAmbition : 1;
    const rate = traitsOf(world, id).reduce((m, t) => m * (t.ambition ?? 1), 1) * bold;
    h.ambition = clamp(h.ambition + c.ambitionPerMonth * rate, 0, 100);
    sum += h.loyalty;
  }
  // The lords' mood feeds the realm's Unrest (meters.js), not a meter of its own.
  void sum;
  // What the lords give and want (M27 A and B).
  monthlyGuard(state, world, rng);
  monthlyWants(state, world, rng);
  rebellions(state, world, rng);
  monthlyDemand(state, world, rng);
  deposition(state, world);
}

// ---- Demands ----

function nearbyCrownLand(state, world, houseId) {
  const held = new Set(holdingsOf(state, houseId));
  const out = [];
  for (const id of held) {
    for (const { to } of world.adjacency[id]) {
      const s = state.settlements[to];
      const type = world.byId[to].type;
      if (s.holder === 'crown' && (type === 'village' || type === 'castle') && to !== world.kingdom.capital && !out.includes(to)) out.push(to);
    }
  }
  return out;
}

function monthlyDemand(state, world, rng) {
  // One open demand from all the houses at a time (M27 B), softer under a
  // feared crown.
  if (state.demands.length) return;
  const calm = cfg(world).moods ? Math.max(0, 1 - (state.fear ?? 0) * cfg(world).moods.fearCalm) : 1;
  if (!rng.chance(cfg(world).demandChance * calm)) return;
  const offices = Object.values(state.houses).filter((h) => h.office).length;
  const options = [];
  for (const [hid, h] of Object.entries(state.houses)) {
    if (h.rebel || state.demands.some((d) => d.house === hid)) continue;
    for (const [did, d] of Object.entries(world.demands.demands)) {
      let w = d.weight * (0.5 + h.ambition / 50);
      for (const t of traitsOf(world, hid)) w *= t.demands?.[did] ?? 1;
      const extra = {};
      if (d.needsTarget) {
        const land = nearbyCrownLand(state, world, hid);
        if (!land.length) continue;
        extra.target = rng.pick(land);
      }
      if (d.needsOffice && (h.office || offices >= cfg(world).maxOffices)) continue;
      if (did === 'exemption' && h.exemptUntil !== null && state.day < h.exemptUntil) continue;
      if (d.needsRival) {
        const rivals = Object.keys(state.houses).filter((r) => r !== hid);
        extra.rival = rng.pick(rivals);
      }
      options.push({ hid, did, w, extra });
    }
  }
  if (!options.length) return;
  let roll = rng.next() * options.reduce((a, o) => a + o.w, 0);
  const pick = options.find((o) => (roll -= o.w) < 0) ?? options[options.length - 1];
  state.demands.push({ id: state.nextDemandId++, house: pick.hid, demand: pick.did, day: state.day, ...pick.extra });
}

export function demandText(world, pending) {
  const d = world.demands.demands[pending.demand];
  const h = cfg(world).houses[pending.house];
  const fill = (t) => t
    .replaceAll('{lord}', h.lord)
    .replaceAll('{house}', h.name)
    .replaceAll('{target}', pending.target ? world.byId[pending.target].name : '')
    .replaceAll('{rival}', pending.rival ? cfg(world).houses[pending.rival].name : '');
  return { title: d.title, text: fill(d.text), choices: d.choices.map((c) => fill(c.label)), house: h.name };
}

export function resolveDemand(state, world, demandId, choice, ignored = false) {
  const i = state.demands.findIndex((d) => d.id === demandId);
  if (i < 0) return false;
  const pending = state.demands[i];
  const c = world.demands.demands[pending.demand].choices[choice];
  if (!c) return false;
  state.demands.splice(i, 1);
  const o = c.ops;
  const h = state.houses[pending.house];
  const proud = traitsOf(world, pending.house).reduce((m, t) => m * (t.refusal ?? 1), 1);
  if (o.favour) h.favour += o.favour;
  if (o.grievance) h.grievance += o.grievance * proud;
  if (o.ambition) h.ambition = clamp(h.ambition + o.ambition, 0, 100);
  if (o.treasury) state.treasury += o.treasury;
  if (o.love) nudge(state, world, 'love', o.love, 'Answers to the great houses');
  if (o.exempt) h.exemptUntil = state.day + o.exempt;
  if (o.office) h.office = true;
  if (o.grant && pending.target && state.settlements[pending.target].holder === 'crown') state.settlements[pending.target].holder = pending.house;
  if (pending.rival) {
    if (o.rivalGrievance) state.houses[pending.rival].grievance += o.rivalGrievance;
    if (o.rivalFavour) state.houses[pending.rival].favour += o.rivalFavour;
  }
  if (o.othersGrievance) {
    for (const [id, other] of Object.entries(state.houses)) if (id !== pending.house) other.grievance += o.othersGrievance;
  }
  const t = demandText(world, pending);
  const filled = t.choices[choice];
  say(state, ignored
    ? `${t.title} (${t.house}): no answer came from the throne, so it was taken as "${filled.toLowerCase()}".`
    : `${t.title} (${t.house}): the crown chose to ${filled.toLowerCase()}.`);
  return true;
}

// ---- Crown actions on a house ----

export function canHouseAction(state, world, houseId, kind, settlementId) {
  const c = cfg(world);
  const h = state.houses[houseId];
  const a = c.actions[kind];
  if (!h || !a) return { ok: false, reason: 'Unknown.' };
  if (h.rebel && kind !== 'honours') return { ok: false, reason: 'The house is in rebellion.' };
  const last = h.lastAction[kind];
  if (['honours', 'summon', 'levies', 'fine', 'hostages', 'redress'].includes(kind) && last !== undefined && state.day - last < c.cooldownDays) {
    return { ok: false, reason: `Too soon (${c.cooldownDays - (state.day - last)} days).` };
  }
  // Acting against a house angers the realm (M22 D); not while it boils.
  if (a.unrest && state.unrest + a.unrest > 90) return { ok: false, reason: 'The realm is in too much of an uproar to risk it.' };
  if (a.coin && state.treasury - a.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  if (kind === 'summon' && !obeys(state, world, houseId)) return { ok: false, reason: 'The lord would not come: the crown\'s Authority is too weak.' };
  if (kind === 'redress' && h.grievance < 1 && h.want?.kind !== 'justice') return { ok: false, reason: 'No grievance to set right.' };
  if (kind === 'command') {
    if (h.want?.kind !== 'command') return { ok: false, reason: 'The lord has not asked for a command.' };
    if (!commandable(state).length) return { ok: false, reason: 'Raise an army first: the lord can take one led by a captain.' };
  }
  if (kind === 'grant') {
    const s = state.settlements[settlementId];
    if (!s || s.holder !== 'crown') return { ok: false, reason: 'Only crown land can be granted.' };
    const type = world.byId[settlementId].type;
    if (settlementId === world.kingdom.capital || type === 'city' || type === 'temple') return { ok: false, reason: 'That stays with the crown.' };
  }
  if (kind === 'strip') {
    const s = state.settlements[settlementId];
    if (!s || s.holder !== houseId) return { ok: false, reason: 'Not theirs to lose.' };
    if (settlementId === c.houses[houseId].seat) return { ok: false, reason: 'A house cannot be stripped of its seat.' };
  }
  return { ok: true };
}

export function houseAction(state, world, houseId, kind, settlementId) {
  const c = cfg(world);
  const a = c.actions[kind];
  const h = state.houses[houseId];
  const def = c.houses[houseId];
  h.lastAction[kind] = state.day;
  if (a.unrest) nudge(state, world, 'unrest', a.unrest / 2, 'The crown pressing the great houses');
  if (a.coin) state.treasury -= a.coin;
  if (kind === 'honours') {
    h.favour += a.favour;
    say(state, `${def.lord} is honoured at court with a chain of office and a seat at the king's table.`);
    if (h.want?.kind === 'honours') grantWant(state, world, houseId);
  } else if (kind === 'summon') {
    h.ambition = clamp(h.ambition + a.ambition, 0, 100);
    h.favour += a.favour + (state.laws.court?.option === 'splendid' ? a.splendidFavour : 0);
    sendFigure(state, world, { kind: 'lord', from: def.seat, to: world.kingdom.capital, name: def.lord, about: 'summoned to court' });
    say(state, `${def.lord} is summoned to Vizima and kept close for a season.`);
  } else if (kind === 'levies') {
    let raised = 0;
    for (const id of holdingsOf(state, houseId)) {
      const n = Math.floor(state.settlements[id].garrison * a.share);
      state.settlements[id].garrison -= n;
      raised += n;
    }
    state.settlements[world.kingdom.capital].garrison += raised;
    h.grievance += a.grievance;
    sendFigure(state, world, { kind: 'lord', from: def.seat, to: world.kingdom.capital, name: def.lord, about: `bringing ${raised} men at the crown's demand` });
    say(state, `${def.name} sends ${raised} men to Vizima at the crown's demand, with poor grace.`);
  } else if (kind === 'hostages') {
    // A child of the house kept at court (M24 B): the lords fear the crown
    // more, and resent it.
    h.grievance += a.grievance;
    h.ambition = clamp(h.ambition + a.ambition, 0, 100);
    nudge(state, world, 'fear', a.fear, 'Hostages from the great houses');
    sendFigure(state, world, { kind: 'lord', from: def.seat, to: world.kingdom.capital, name: `A child of ${def.name}`, about: 'a hostage for the house\'s good behaviour' });
    say(state, `${def.name} sends a son to court as a hostage for its good behaviour. The other houses take note.`);
  } else if (kind === 'fine') {
    const fine = Math.max(a.min, Math.round(housePower(state, world, houseId).people * a.perPerson));
    state.treasury += fine;
    const greedy = traitsOf(world, houseId).reduce((m, t) => m * (t.fineGrievance ?? 1), 1);
    h.grievance += a.grievance * greedy;
    say(state, `${def.name} is fined ${fine} crowns for its insolence, and pays.`);
  } else if (kind === 'grant') {
    state.settlements[settlementId].holder = houseId;
    h.favour += a.favour;
    h.ambition = clamp(h.ambition + a.ambition, 0, 100);
    say(state, `${world.byId[settlementId].name} is granted to ${def.name}.`);
    if (h.want?.kind === 'land') grantWant(state, world, houseId, `${world.byId[settlementId].name}`);
  } else if (kind === 'redress') {
    h.grievance = 0;
    say(state, `The crown hears ${def.lord}'s complaints and sets them right.`);
    if (h.want?.kind === 'justice') grantWant(state, world, houseId);
  } else if (kind === 'command') {
    const army = commandable(state)[0];
    army.lordOf = houseId;
    army.captain = def.lord;
    grantWant(state, world, houseId, `command of ${army.name}`);
  } else if (kind === 'strip') {
    state.settlements[settlementId].holder = 'crown';
    h.grievance += a.grievance;
    for (const [id, other] of Object.entries(state.houses)) if (id !== houseId) other.grievance += a.othersGrievance;
    say(state, `${def.name} is stripped of ${world.byId[settlementId].name}. Every lord in Temeria takes note.`);
  }
}

// ---- Rebellion ----

function crownStrength(state, world) {
  let soldiers = 0;
  for (const s of Object.values(state.settlements)) if (s.holder === 'crown') soldiers += s.garrison;
  return soldiers * world.houses.rebellion.crownCommitted * (state.unpaid ? 0.5 : 1);
}

function rebellions(state, world, rng) {
  const r = cfg(world).rebellion;
  const name = (id) => cfg(world).houses[id].name;
  for (const [id, h] of Object.entries(state.houses)) {
    const feared = cfg(world).moods ? Math.max(0, 1 - (state.fear ?? 0) * cfg(world).moods.fearCalm) : 1;
    if (!h.rebel && h.loyalty < r.below && rng.chance(r.chance * feared)) {
      h.rebel = { since: state.day, months: 0 };
      say(state, `${name(id)} has risen in rebellion. Its banners fly over its castles and its levies bar the roads.`);
      for (const [oid, o] of Object.entries(state.houses)) {
        if (oid !== id && !o.rebel && o.loyalty < r.joinBelow && rng.chance(r.joinChance)) {
          o.rebel = { since: state.day, months: 0 };
          say(state, `${name(oid)} joins the rising.`);
        }
      }
    }
  }
  const rebels = Object.keys(state.houses).filter((id) => state.houses[id].rebel);
  if (!rebels.length) return;
  for (const id of rebels) {
    const h = state.houses[id];
    h.rebel.months += 1;
    nudge(state, world, 'love', -r.trustPerMonth, 'A great house in rebellion');
    if (h.loyalty > r.endsAbove) {
      h.rebel = null;
      say(state, `${name(id)} lays down its arms and sends hostages to Vizima. The rising is over.`);
    }
  }
  const still = rebels.filter((id) => state.houses[id].rebel);
  if (!still.length) return;
  const months = Math.max(...still.map((id) => state.houses[id].rebel.months));
  if (months < r.decideAfter) return;
  const theirs = still.reduce((a, id) => a + housePower(state, world, id).strength, 0);
  if (crownStrength(state, world) >= theirs * r.crownWinsAt) {
    for (const id of still) {
      const h = state.houses[id];
      for (const sid of holdingsOf(state, id)) if (sid !== cfg(world).houses[id].seat) state.settlements[sid].holder = 'crown';
      Object.assign(h, { rebel: null, loyalty: 35, favour: 0, grievance: 0, ambition: 0, office: false });
      say(state, `The crown's soldiers break ${name(id)}. Its lands are forfeit, all but its seat, and its lord bends the knee.`);
    }
    nudge(state, world, 'love', 4, 'A rising crushed');
    nudge(state, world, 'fear', 12, 'A rising crushed');
  } else if (months >= r.concedeAfter) {
    for (const id of still) {
      const h = state.houses[id];
      const land = nearbyCrownLand(state, world, id)[0];
      if (land) state.settlements[land].holder = id;
      Object.assign(h, { rebel: null, favour: h.favour + 30, grievance: 0 });
      say(state, `Too weak to win, the crown makes terms with ${name(id)}${land ? ` and cedes ${world.byId[land].name}` : ''}.`);
    }
    nudge(state, world, 'love', -8, 'Terms made with rebels');
    fearCollapse(state, world, world.meters?.fear.revoltWon ?? 0, 'A rising that won its terms');
  }
}

// ---- Deposition and regency ----

function deposition(state, world) {
  const d = cfg(world).deposition;
  const rising = Object.values(state.houses).some((h) => h.rebel);
  // A bad month adds to the crisis; a good one only eases it, so a crown
  // cannot escape by scraping through one month in six.
  // M24 B: very low Authority and very high Unrest together, month after month.
  void rising;
  if (authority(state, world) < d.authorityBelow && state.unrest > d.unrestAbove) state.crisisMonths += 1;
  else state.crisisMonths = Math.max(0, state.crisisMonths - 1);
  if (state.crisisMonths === Math.ceil(d.months / 2)) {
    say(state, 'In the great halls the lords speak openly of a regency.');
  }
  if (state.crisisMonths < d.months) return;
  const pop = Object.values(state.settlements).reduce((a, s) => a + totalPopulation(s), 0);
  const summary = { reign: state.reign.number, from: state.reign.since, to: state.day, popStart: state.reign.popStart, popEnd: pop, treasury: Math.round(state.treasury), decrees: state.reign.decrees, built: state.reign.built, riots: state.reign.riots, pogroms: state.reign.pogroms };
  state.depositions.push(summary);
  state.love = d.regencyLove;
  state.crisisMonths = 0;
  for (const h of Object.values(state.houses)) h.grievance /= 2;
  state.reign = { number: state.reign.number + 1, since: state.day, popStart: pop, decrees: 0, built: 0, riots: 0, pogroms: 0 };
  say(state, 'The great houses have deposed the crown. A regency council rules in Vizima in the name of the heir.');
}

export function newReign(state, day) {
  const pop = Object.values(state.settlements).reduce((a, s) => a + totalPopulation(s), 0);
  return { number: 1, since: day, popStart: pop, decrees: 0, built: 0, riots: 0, pogroms: 0 };
}
