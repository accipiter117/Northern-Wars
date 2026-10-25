// The model crowns the balance tools and tests play: a steward who builds
// earners and keeps the peace, a spendthrift who builds on credit, a
// tyrant, and the plain answering of whatever the realm asks.
import {
  applyAction, canBuild, canDecree, threatLevel, warsOf, peaceTerms, crownArmies, canOpenRoute, routeValue, ledgerNet,
  canRecruit, sightedThreats, bestCompanyFor,
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
  function warPolicy(s) {
    for (const d of [...s.warDecisions]) {
      const choice = d.kind === 'call' ? 1 : 0;
      s = act(s, { type: 'warDecision', id: d.id, choice });
    }
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

  function steward(s, month, spend) {
    s = answer(s, true);
    s = warPolicy(s);
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
    const laws = [['taxation', 'heavy'], ['noble_privilege', 'taxed'], ['public_order', 'martial'], ['patronage', 'eternal_fire'], ['nonhumans', 'expulsion'], ['court', 'frugal']];
    const [law, option] = laws[month % laws.length];
    s = act(s, { type: 'law', law, option });
    for (const id of Object.keys(s.houses)) if (month % 12 === 0) s = act(s, { type: 'house', house: id, kind: 'fine' });
    return s;
  }

  return { answer, steward, tyrant };
}
