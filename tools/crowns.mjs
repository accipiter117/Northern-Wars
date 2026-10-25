// The model crowns the balance tools and tests play: a steward who builds
// earners and keeps the peace, a spendthrift who builds on credit, a
// tyrant, and the plain answering of whatever the realm asks.
import {
  applyAction, canBuild, canDecree, threatLevel, patrolCapacity, warsOf, peaceTerms, crownArmies, canOpenRoute, routeValue,
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
    // Patrol the most dangerous roads while soldiers allow.
    if (month % 12 === 3) {
      const worst = Object.keys(s.settlements)
        .map((id) => ({ id, t: Math.max(threatLevel(s, world, id, 'bandits'), threatLevel(s, world, id, 'monsters')) }))
        .sort((a, b) => b.t - a.t);
      for (const { id } of worst.slice(0, 4)) {
        if (s.patrols.length >= Math.min(6, patrolCapacity(s, world))) break;
        const near = world.adjacency[id][0]?.to;
        if (near) s = act(s, { type: 'patrol', from: id, to: near });
      }
    }
    // Keep the lords sweet.
    for (const id of Object.keys(s.houses)) {
      if (s.houses[id].loyalty < 35) s = act(s, { type: 'house', house: id, kind: 'honours' });
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
