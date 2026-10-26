// The model crowns the balance tools and tests play: a steward who builds
// earners and keeps the peace, a spendthrift who builds on credit, a
// tyrant, and the plain answering of whatever the realm asks.
import {
  applyAction, canBuild, canDecree, threatLevel, warsOf, peaceTerms, crownArmies, canOpenRoute, routeValue, ledgerNet,
  canRecruit, sightedThreats, bestCompanyFor, parties, treatyBetween, weighDeal, counterOffer, ourValue, hostile, describeItem,
  strengthOf, canDeclareWith, ownerOf, atWar, canRequisition,
} from '../src/sim/index.js';

export function makeCrowns(world) {
  const act = (s, a) => {
    const out = applyAction(s, world, a);
    return out.error ? s : out.state;
  };

  // Answers every waiting decision: the steward takes the first (usually the
  // generous) choice when it can afford it, otherwise the default.
  function answer(s, generous) {
    for (const [list, type] of [['events', 'event'], ['demands', 'demand'], ['envoys', 'envoy'], ['petitions', 'petition']]) {
      for (const p of [...s[list]]) {
        const choice = generous && s.treasury > 1500 ? 0 : -1;
        if (choice >= 0) s = act(s, { type, id: p.id, choice });
      }
    }
    return s;
  }

  // A sensible crown at war: one army to hold the capital, peace on the best
  // terms the enemy will take, and no part in other people's wars.
  function warPolicy(s, treat = 'spare') {
    for (const d of [...s.warDecisions]) {
      const choice = d.kind === 'call' ? 1 : 0;
      s = act(s, { type: 'warDecision', id: d.id, choice });
    }
    s = conquests(s, treat);
    const wars = warsOf(s, 'temeria');
    if (wars.length && !crownArmies(s).length) {
      s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: true, companies: 0, marshal: 'vestibor', stance: 'cautious' });
    }
    for (const w of wars) {
      for (const key of ['tribute', 'keep', 'white']) {
        const t = peaceTerms(s, world, w).list.find((x) => x.key === key);
        if (t.accept) { s = act(s, { type: 'peace', war: w.id, terms: key }); break; }
      }
    }
    if (!warsOf(s, 'temeria').length) for (const a of crownArmies(s)) s = act(s, { type: 'disband', army: a.id });
    return s;
  }

  // Earners, the dearest and best first, then the buildings that guard and
  // calm the realm; and in turn with them, the fields, mills and granaries
  // that feed it.
  const EARNERS = [
    'goldmine', 'tollbridge', 'quarter', 'market', 'silvermine', 'hostel', 'weavers', 'pasture', 'shipyard', 'alchemist', 'brewery',
    'fishery', 'tannery', 'inn', 'workshop', 'saltpans', 'stud', 'distillery', 'charcoal', 'smithy', 'weaponsmith', 'lodge', 'harbour',
    'guildhall', 'walls', 'shrine', 'hospice', 'lumber', 'quarry', 'mine',
  ];
  const FOOD = ['fields', 'mill', 'granary'];

  // Audiences: a trade pact with every realm that trades, a non-aggression
  // pact with any that might invade, each signed when the ruler accepts it as
  // it stands or for a modest price; rulers' own proposals taken when they
  // pay, demands refused, warnings heeded.
  function diplomacy(s, month) {
    for (const q of [...(s.diplomacy?.requests ?? [])]) {
      const choice = q.kind === 'warning' ? 0 : q.kind === 'demand' ? 1 : ourValue(s, world, q.realm, q.items) >= 0 ? 0 : 1;
      s = act(s, { type: 'request', id: q.id, choice });
    }
    if (month % 6 !== 3 || !s.diplomacy) return s;
    for (const pid of parties(world)) {
      if (hostile(s, 'temeria', pid)) continue;
      for (const treaty of ['trade', 'nonaggression']) {
        if (treatyBetween(s, 'temeria', pid, treaty)) continue;
        if (treaty === 'trade' && !world.neighbours.realms[pid]?.trade) continue;
        const ask = [{ kind: 'treaty', from: 'us', treaty }];
        const c = counterOffer(s, world, pid, ask);
        if (!c.items) continue;
        const price = c.items.filter((i) => i.kind === 'coin').reduce((a, i) => a + i.amount, 0);
        if (price > 300 || s.treasury - price < 800) continue;
        s = act(s, { type: 'deal', realm: pid, items: c.items });
      }
    }
    return s;
  }

  // What becomes of a town taken (M19): the steward spares it, keeps it as
  // crown land and treats with rebels it cannot surely crush; the tyrant
  // sacks, drives out the elves and crushes every rising.
  function conquests(s, treat) {
    for (const d of [...(s.conquest?.decisions ?? [])]) {
      let choice = 0;
      if (d.kind === 'capture') {
        const want = treat === 'harsh' ? (d.options.includes('expel:elf') && d.town.length % 2 ? 'expel:elf' : 'sack') : 'spare';
        choice = Math.max(0, d.options.indexOf(want));
      } else if (d.kind === 'revolt') {
        choice = treat === 'harsh' ? 0 : 1;
      }
      s = act(s, { type: 'conquestDecision', id: d.id, choice });
    }
    return s;
  }

  // Now and then the steward picks a fight it can win: the weakest
  // neighbour it has a reason against, a town of theirs near the border,
  // and a peace that keeps it. Then it wins the town over: settlers when it
  // can afford them, and building there like anywhere else.
  function campaign(s, month) {
    if (month < 60 || month % 6 !== 0) return s;
    const wars = warsOf(s, 'temeria');
    if (!wars.length && s.treasury > 12000 && !(s.conquest?.revolts ?? []).length) {
      let best = null;
      for (const pid of parties(world)) {
        if (!s.realms[pid] || pid === 'brokilon' || hostile(s, 'temeria', pid)) continue;
        const reason = ['claim', 'broken', 'refused'].find((r) => canDeclareWith(s, world, pid, r).ok);
        if (!reason) continue;
        const ratio = strengthOf(s, world, 'temeria') / strengthOf(s, world, pid);
        if (ratio >= 1.5 && (!best || ratio > best.ratio)) best = { pid, reason, ratio };
      }
      if (best) {
        s = act(s, { type: 'declare', realm: best.pid, reason: best.reason });
        if (hostile(s, 'temeria', best.pid)) {
          s = act(s, { type: 'raise', muster: 'vizima', levy: 'half', nobles: true, companies: 3, marshal: 'vestibor', stance: 'bold' });
          const a = crownArmies(s)[0];
          const target = (world.foreignByRealm[best.pid] ?? []).filter((id) => world.realms.realms[best.pid].capital !== id)
            .sort((x, y) => Math.min(...Object.keys(s.settlements).map((h) => Math.hypot(world.byId[h].x - world.byId[x].x, world.byId[h].y - world.byId[x].y)))
              - Math.min(...Object.keys(s.settlements).map((h) => Math.hypot(world.byId[h].x - world.byId[y].x, world.byId[h].y - world.byId[y].y))))[0];
          if (a && target) s = act(s, { type: 'army', army: a.id, order: 'siege', target, stance: 'bold' });
        }
      }
    }
    // Strip what we occupy while the war lasts.
    for (const w of wars) for (const t of w.taken) if (canRequisition(s, world, t.id).ok && s.treasury < 3000) s = act(s, { type: 'requisition', settlement: t.id });
    // Settlers for a sullen conquest, when the treasury allows.
    for (const [id, t] of Object.entries(s.settlements)) {
      if (t.integration !== undefined && t.integration < 40 && !t.resettle && s.treasury > 15000) s = act(s, { type: 'resettle', settlement: id });
    }
    return s;
  }

  function steward(s, month, spend) {
    s = answer(s, true);
    s = diplomacy(s, month);
    s = warPolicy(s);
    s = campaign(s, month);
    // Open the most lucrative trade route the crown can, before building.
    if (month % 6 === 1 && s.treasury > 900) {
      const ends = world.geography.settlements.filter((x) => x.type === 'town' || x.type === 'city').map((x) => x.id);
      let best = null;
      for (const a of ends) for (const b of ends) {
        if (a >= b || !canOpenRoute(s, world, a, b).ok) continue;
        const v = routeValue(s, world, { from: a, to: b }).value;
        if (!best || v > best.v) best = { a, b, v };
      }
      if (best) s = act(s, { type: 'route', from: best.a, to: best.b });
    }
    for (let i = 0; i < (spend ? 3 : 1); i++) {
      let built = false;
      const order = (month + i) % 2 ? [...FOOD, ...EARNERS] : [...EARNERS, ...FOOD];
      for (const b of order) {
        for (const st of world.geography.settlements) {
          const c = canBuild(s, world, st.id, b);
          if (c.ok && (spend || (!c.borrow && s.treasury > 1200))) { s = act(s, { type: 'build', settlement: st.id, building: b }); built = true; break; }
        }
        if (built) break;
      }
    }
    if (month === 2) {
      s = act(s, { type: 'law', law: 'bounties', option: 'witchers' });
    }
    if (month === 6 && canDecree(s, world, 'nonhumans', 'charter').ok) s = act(s, { type: 'law', law: 'nonhumans', option: 'charter' });
    s = keepThePeace(s, month);
    // Keep the lords sweet.
    for (const id of Object.keys(s.houses)) {
      if (s.houses[id].loyalty < 35) s = act(s, { type: 'house', house: id, kind: 'honours' });
    }
    return s;
  }

  // A modest standing army that grows with the realm's income: light horse
  // riding the worst roads, foot and archers standing ready in the towns
  // nearest danger; sighted camps hunted down when the odds are good, and
  // witchers hired for beasts too dangerous for the companies.
  const FORCE = ['lightcav', 'menatarms', 'archers', 'lightcav', 'menatarms', 'crossbows', 'archers', 'menatarms', 'lightcav', 'menatarms'];
  function keepThePeace(s, month) {
    const h = s.ledger.history;
    const income = h.length ? h.reduce((a, m) => a + ledgerNet(m).in, 0) / h.length : 1100;
    const want = Math.min(FORCE.length, 2 + Math.floor(income / 500));
    const danger = (id) => Math.max(threatLevel(s, world, id, 'bandits'), threatLevel(s, world, id, 'monsters'));
    const worst = Object.keys(s.settlements).filter((id) => !s.settlements[id].occupier).sort((a, b) => danger(b) - danger(a));
    if (month % 2 === 0 && s.forces.companies.length < want && s.treasury > 1500) {
      // The next kind on the list that can be raised somewhere (crossbows
      // need barracks), muster in the crown town nearest the worst danger.
      let kind = null;
      let towns = [];
      for (const k of FORCE.slice(s.forces.companies.length).concat(FORCE)) {
        towns = Object.keys(s.settlements).filter((id) => canRecruit(s, world, id, k).ok);
        if (towns.length) { kind = k; break; }
      }
      const hot = world.byId[worst[s.forces.companies.length % 4]];
      towns.sort((a, b) => Math.hypot(world.byId[a].x - hot.x, world.byId[a].y - hot.y) - Math.hypot(world.byId[b].x - hot.x, world.byId[b].y - hot.y));
      if (kind) {
        s = act(s, { type: 'recruit', settlement: towns[0], kind });
        const c = s.forces.companies.at(-1);
        if (c && c.station === towns[0] && c.order.kind === 'station') {
          const patrols = s.forces.companies.filter((x) => x.order.kind === 'patrol').length;
          if (kind === 'lightcav' && patrols < 2) {
            const road = worst.find((id) => !s.forces.companies.some((x) => x.order.from === id)) ?? worst[0];
            const to = world.adjacency[road][0]?.to;
            if (to) s = act(s, { type: 'company', id: c.id, order: { kind: 'patrol', from: road, to } });
          } else s = act(s, { type: 'company', id: c.id, order: { kind: 'respond', radius: 150 } });
        }
      }
    }
    // Hunt what has been seen, when the odds are good; witchers for the worst beasts.
    for (const t of sightedThreats(s)) {
      if (!['bandits', 'monsters'].includes(t.kind)) continue;
      if (s.forces.companies.some((c) => c.task?.threat === t.id) || s.threats.contracts.some((c) => c.threat === t.id)) continue;
      const best = bestCompanyFor(s, world, t);
      if (best && best.odds.chance >= 0.65) s = act(s, { type: 'company', id: best.c.id, order: { kind: 'hunt', threat: t.id } });
      else if (t.kind === 'monsters' && s.treasury > 2500) s = act(s, { type: 'witcher', threat: t.id });
    }
    return s;
  }

  function tyrant(s, month) {
    s = answer(s, false);
    s = warPolicy(s, 'harsh');
    const laws = [['taxation', 'heavy'], ['noble_privilege', 'taxed'], ['public_order', 'martial'], ['patronage', 'eternal_fire'], ['nonhumans', 'expulsion'], ['court', 'frugal']];
    const [law, option] = laws[month % laws.length];
    s = act(s, { type: 'law', law, option });
    for (const id of Object.keys(s.houses)) if (month % 12 === 0) s = act(s, { type: 'house', house: id, kind: 'fine' });
    return s;
  }

  return { answer, steward, tyrant };
}
