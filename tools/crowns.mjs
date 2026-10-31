// The model crowns the balance tools and tests play: a steward who builds
// earners and keeps the peace, a spendthrift who builds on credit, a
// tyrant, a careless crown, and the plain answering of whatever the realm
// asks.
import {
  applyAction, canBuild, canDecree, threatLevel, warsOf, peaceTerms, crownArmies, canOpenRoute, routeValue, ledgerNet,
  canRecruit, sightedThreats, bestCompanyFor, parties, treatyBetween, weighDeal, counterOffer, ourValue, hostile, describeItem,
  strengthOf, canDeclareWith, ownerOf, atWar, canRequisition, valueOf, canRepairWorks, canCall, winterOutlook, foodYield, foodNeed, foodCapacity,
  LABOUR_KINDS, MARKET_GOODS, partnerTrade, canBorrow, mercenaryOffer, holdingsOf, canHouseAction, canAct, canSignLaw, canFaithAct,
} from '../src/sim/index.js';

export function makeCrowns(world) {
  const act = (s, a) => {
    const out = applyAction(s, world, a);
    return out.error ? s : out.state;
  };

  // The Book of Laws (M26): sign the next law along the given paths, in
  // order, whenever the ink is dry and the treasury can bear it. Each entry
  // is [chapter, path], with the faith of the crown's choice and the highest
  // tier wanted if given.
  function signAlong(s, paths, floor = 2000) {
    for (const [chapter, path, choice, upto = 3] of paths) {
      const next = world.book?.chapters[chapter]?.paths[path]?.laws.slice(0, upto).find((l) => !s.book?.signed?.[l.id]);
      if (!next) continue;
      const c = canSignLaw(s, world, next.id, next.choose === 'faith' ? choice : null);
      if (c.ok && s.treasury - next.cost > floor) return act(s, { type: 'sign', law: next.id, ...(next.choose === 'faith' ? { choice } : {}) });
      if (!c.ok && !c.locked) return s;
    }
    return s;
  }

  // Develop a faith (M26 C): endow its temples where it is strongest, send
  // preachers, keep its festival and make the pilgrimage, and use its powers
  // when they are ready and there is call for them.
  function tendFaith(s, f, floor = 3000) {
    if (!world.devotion) return s;
    const towns = Object.keys(s.settlements).filter((id) => !s.settlements[id].occupier && ['town', 'city'].includes(world.byId[id].type))
      .sort((a, b) => (s.settlements[b].faith?.[f] ?? 0) - (s.settlements[a].faith?.[f] ?? 0));
    const tryAct = (kind, town = null) => {
      if (s.treasury < floor || !canFaithAct(s, world, kind, f, town).ok) return false;
      s = act(s, { type: 'faith', kind, faith: f, ...(town ? { settlement: town } : {}) });
      return true;
    };
    tryAct('festival') || tryAct('endow', towns[0]) || tryAct('preachers', towns[1] ?? towns[0]) || tryAct('pilgrimage');
    // Powers: whatever is ready and has a use.
    for (const p of Object.keys(world.devotion.faiths[f].powers ?? {})) {
      if (['blessing', 'belleteyn'].includes(p)) tryAct(p);
      else for (const id of Object.keys(s.settlements)) if (tryAct(p, id)) break;
    }
    return s;
  }

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
  function warPolicy(s, treat = 'spare', keepArmy = false) {
    for (const d of [...s.warDecisions]) {
      let choice = d.kind === 'call' ? 1 : 0;
      // An offered peace that would leave our towns with them is refused,
      // unless the war has dragged on a year.
      if (d.kind === 'offer') {
        const w = s.wars.find((x) => x.id === d.war);
        const lose = w && w.taken.some((t) => t.from === 'temeria' && ownerOf(s, world, t.id) !== 'temeria');
        if (w && (d.terms.towns !== 'white' || d.terms.tribute) && lose && s.day - w.since < 360) choice = 1;
      }
      s = act(s, { type: 'warDecision', id: d.id, choice });
    }
    s = conquests(s, treat);
    const wars = warsOf(s, 'temeria');
    if (wars.length && !crownArmies(s).length) {
      s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: true, companies: 0, marshal: 'vestibor', stance: 'cautious' });
    }
    // At peace, a war army goes home: its pay is no longer worth it (M21).
    if (!wars.length && keepArmy !== true) for (const a of crownArmies(s)) if (!a.keep) s = act(s, { type: 'disband', army: a.id });
    for (const w of wars) {
      // Holding towns of theirs, keep them; otherwise take their coin.
      const held = (side) => w.taken.filter((t) => ownerOf(s, world, t.id) === side && t.from !== side).reduce((a, t) => a + valueOf(s, world, t.id), 0);
      const holding = held('temeria') > w.sides.flat().filter((r) => r !== 'temeria').reduce((a, r) => a + held(r), 0);
      // A war of our own making goes on until we hold what we came for, or a year.
      if (w.sides[0][0] === 'temeria' && !holding && s.day - w.since < 360) continue;
      // Behind, never settle for each keeping what it holds.
      // ('tribute' keeps what each holds too).
      // After a year of it, any peace will do.
      const weary = s.day - w.since >= 360;
      for (const key of holding || weary ? ['tribute', 'keep', 'white'] : ['white']) {
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
        // Peace is worth paying for: up to a twentieth of a full treasury.
        if (price > Math.max(300, Math.min(3000, s.treasury * 0.05)) || s.treasury - price < 800) continue;
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
  function campaign(s, month, purse = 12000) {
    const wars = warsOf(s, 'temeria');
    // One campaign every eight years at most, from the eighth year on, and
    // never while a neighbour masses on the border.
    const quiet = !(s.musters ?? []).some((m) => (m.against ?? 'temeria') === 'temeria');
    if (month >= 96 && month % 96 === 0 && !wars.length && quiet && s.treasury > purse && !(s.conquest?.revolts ?? []).length) {
      let best = null;
      for (const pid of parties(world)) {
        if (!s.realms[pid] || pid === 'brokilon' || hostile(s, 'temeria', pid)) continue;
        const reason = ['claim', 'broken', 'refused', 'none'].find((r) => canDeclareWith(s, world, pid, r).ok);
        if (!reason) continue;
        const ours = Object.values(s.settlements).reduce((a, t) => a + (t.occupier ? 0 : t.garrison), 0) * 0.5 + s.forces.companies.reduce((a, c) => a + c.men, 0);
        const ratio = ours / strengthOf(s, world, pid);
        if (ratio >= 3 && (!best || ratio > best.ratio)) best = { pid, reason, ratio };
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
    // Trade (M21): sell what the realm has to spare to partners who want
    // it, buy what it lacks from partners who offer it; before M21, open
    // the most lucrative trade route.
    if (world.market) {
      if (month % 3 === 1) s = trade(s);
      // A town's focus (M21 C): the iron towns lean to the mines and smiths.
      if (month === 0 && world.labour?.focus) {
        for (const st of world.geography.settlements) {
          if (s.settlements[st.id]?.production === 'iron' && ['town', 'city'].includes(st.type)) {
            const out = applyAction(s, world, { type: 'focus', settlement: st.id, focus: 'iron' });
            if (!out.error) s = out.state;
          }
        }
      }
      // The spendthrift borrows when the coffers run low.
      if (spend && s.treasury < 800 && canBorrow(s, world, 5000).ok) s = act(s, { type: 'loan', sum: 5000 });
    } else if (month % 6 === 1 && s.treasury > 900) {
      const ends = world.geography.settlements.filter((x) => x.type === 'town' || x.type === 'city').map((x) => x.id);
      let best = null;
      for (const a of ends) for (const b of ends) {
        if (a >= b || !canOpenRoute(s, world, a, b).ok) continue;
        const v = routeValue(s, world, { from: a, to: b }).value;
        if (!best || v > best.v) best = { a, b, v };
      }
      if (best) s = act(s, { type: 'route', from: best.a, to: best.b });
    }
    if (world.spaces) s = mend(s, spend);
    if (world.labour) s = labour(s);
    for (let i = 0; i < (world.spaces ? 0 : spend ? 3 : 1); i++) {
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
    // The King's Justice and Charity, with Melitele (M26).
    s = signAlong(s, [['order', 'justice'], ['people', 'charity'], ['faith', 'one_faith', 'melitele', 1]]);
    s = tendFaith(s, 'melitele', 4000);
    // A frugal court (M24 C) while the people love the crown enough to bear
    // it, the customary one again if Love runs low.
    const court = s.laws.court?.option;
    if (s.love > 50 && court === 'customary' && canDecree(s, world, 'court', 'frugal').ok) s = act(s, { type: 'law', law: 'court', option: 'frugal' });
    else if (s.love < 35 && court === 'frugal' && canDecree(s, world, 'court', 'customary').ok) s = act(s, { type: 'law', law: 'court', option: 'customary' });
    s = keepThePeace(s, month);
    // Win the people's love (M24 B): a feast in winter and a royal progress
    // in summer, when the treasury can bear them.
    if (world.meters?.acts) {
      if (month % 12 === 0 && s.treasury > 3000 && canAct(s, world, 'feast').ok) s = act(s, { type: 'act', kind: 'feast' });
      if (month % 12 === 6 && s.treasury > 4000 && canAct(s, world, 'progress').ok) s = act(s, { type: 'act', kind: 'progress' });
    }
    // Keep the lords sweet (M27 B): feed each one's want where it can be
    // had at peace (honours, justice, a village of the crown's), and honour
    // any who still waver.
    for (const id of Object.keys(s.houses)) {
      const want = s.houses[id].want;
      if (want?.kind === 'honours' || (want && s.houses[id].loyalty < 35)) s = act(s, { type: 'house', house: id, kind: 'honours' });
      else if (want?.kind === 'justice') s = act(s, { type: 'house', house: id, kind: 'redress' });
      else if (want?.kind === 'land' && world.byId[want.target]?.type !== 'town') s = act(s, { type: 'house', house: id, kind: 'grant', settlement: want.target });
    }
    return s;
  }

  // The steward's trade (M21): each good's monthly surplus goes to the
  // partners that want it, largest first, and what is short is bought from
  // partners that offer it; a deal that could not be filled is cut back.
  function trade(s) {
    const r = s.market?.report;
    if (!r || !Object.keys(r).length) return s;
    const spare = Object.fromEntries(MARKET_GOODS.map((g) => [g, r[g]?.balance ?? 0]));
    const partners = Object.keys(world.geography.neighbours).filter((rid) => s.realms?.[rid] && !s.realms[rid].fallen)
      .map((rid) => ({ rid, p: partnerTrade(s, world, rid) })).filter((x) => x.p && x.p.capacity >= world.market.deals.minQty)
      .sort((a, b) => b.p.capacity - a.p.capacity);
    for (const d of Object.values(s.market.deals)) {
      if (d.sell) spare[d.sell.good] -= d.sell.qty;
      if (d.buy) spare[d.buy.good] += d.buy.qty;
    }
    for (const { rid, p } of partners) {
      const cur = s.market.deals[rid];
      let sell = cur?.sell ?? null;
      let buy = cur?.buy ?? null;
      if (sell && cur.sent !== undefined && cur.sent < sell.qty * 0.7) {
        spare[sell.good] += sell.qty - cur.sent;
        sell = cur.sent >= world.market.deals.minQty ? { good: sell.good, qty: cur.sent } : null;
      }
      if (!sell) {
        const g = p.wants.find((w) => spare[w] >= world.market.deals.minQty);
        if (g) {
          sell = { good: g, qty: Math.min(p.capacity, Math.floor(spare[g])) };
          spare[g] -= sell.qty;
        }
      }
      if (!buy) {
        const g = p.offers.find((o) => spare[o] <= -world.market.deals.minQty);
        if (g) {
          buy = { good: g, qty: Math.min(p.capacity, Math.floor(-spare[g])) };
          spare[g] += buy.qty;
        }
      }
      if ((sell || buy) && (sell !== cur?.sell || buy !== cur?.buy)) s = act(s, { type: 'trade', realm: rid, sell, buy });
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

  // Since M20 the crown mends instead of building: the steward rebuilds
  // what is badly worn while the treasury allows, patches what it cannot
  // yet afford, and keeps the repair crews busy; the spendthrift rebuilds
  // everything on credit.
  function mend(s, spend) {
    for (const d of [...(s.works?.decisions ?? [])]) {
      const rebuild = canRepairWorks(s, world, d.town, d.works, 'rebuild');
      const choice = rebuild.ok && (spend || (!rebuild.borrow && s.treasury - rebuild.coin > 1500)) ? 0
        : canRepairWorks(s, world, d.town, d.works, 'patch').ok && s.treasury > 800 ? 1 : 2;
      s = act(s, { type: 'worksDecision', id: d.id, choice });
    }
    // Then the worst of the rest, while crews are free.
    const busy = Object.values(s.settlements).reduce((a, t) => a + Object.keys(t.repair ?? {}).length, 0);
    let free = Math.max(0, (world.works?.crews ?? 4) - busy);
    const worn = [];
    for (const [id, t] of Object.entries(s.settlements)) {
      if (t.occupier) continue;
      for (const b of t.buildings) if ((t.cond?.[b] ?? 100) < 75 && !t.repair?.[b]) worn.push({ id, b, c: t.cond?.[b] ?? 100 });
    }
    worn.sort((x, y) => x.c - y.c);
    for (const w of worn) {
      if (free <= 0) break;
      const c = canRepairWorks(s, world, w.id, w.b, 'rebuild');
      if (!c.ok || (!spend && (c.borrow || s.treasury - c.coin < 2500))) continue;
      s = act(s, { type: 'repair', settlement: w.id, building: w.b, kind: 'rebuild' });
      free -= 1;
    }
    return s;
  }

  // The steward's hands (M20 C): the winter turn standing, a harvest muster
  // when the grain will not see the winter out, and hands moved each month
  // from whatever stands idle to whatever is short.
  function labour(s) {
    if (!s.labour) return s;
    if (!s.labour.winterTurn) s = act(s, { type: 'call', call: 'winter' });
    const o = winterOutlook(s, world, { foodYield, foodNeed, foodCapacity });
    if (o.short && canCall(s, world, 'harvest').ok) s = act(s, { type: 'call', call: 'harvest' });
    const r = s.labour.report;
    if (!r) return s;
    const short = (k) => (r[k].need > 0 ? r[k].staffed / r[k].need : 1);
    const want = LABOUR_KINDS.filter((k) => !['repairs', 'levies', 'fields'].includes(k) && r[k].need > 0 && short(k) < 0.9)
      .sort((a, b) => short(a) - short(b))[0];
    const idle = LABOUR_KINDS.filter((k) => !['repairs', 'levies', 'fields'].includes(k) && s.labour.split[k] > 2 && (r[k].need === 0 || r[k].idle > r[k].hands * 0.3))
      .sort((a, b) => r[b].idle - r[a].idle)[0];
    if (want && idle && want !== idle) {
      const split = { ...s.labour.split };
      split[want] += 1;
      split[idle] -= 1;
      s = act(s, { type: 'labour', split });
    }
    // Enough crews for what needs mending, never fewer than four.
    const worn = Object.values(s.settlements).reduce((a, t) => a + t.buildings.filter((b) => (t.cond?.[b] ?? 100) < 75).length, 0);
    if (worn > 8 && s.labour.split.repairs < 8 && s.labour.split.crafts > 15) {
      const split = { ...s.labour.split };
      split.repairs += 1;
      split.crafts -= 1;
      s = act(s, { type: 'labour', split });
    }
    // Grain short for the winter: more hands to the fields, from the crafts.
    if (o.short && s.labour.split.fields < 60 && s.labour.split.crafts > 12) {
      const split = { ...s.labour.split };
      split.fields += 2;
      split.crafts -= 2;
      s = act(s, { type: 'labour', split });
    }
    return s;
  }

  function tyrant(s, month) {
    s = answer(s, false);
    // The tyrant raises the levies every other season, whatever the works lose.
    if (world.labour && month % 6 === 0 && canCall(s, world, 'levy').ok) s = act(s, { type: 'call', call: 'levy' });
    // The tyrant leaves what breaks.
    for (const d of [...(s.works?.decisions ?? [])]) s = act(s, { type: 'worksDecision', id: d.id, choice: 2 });
    s = warPolicy(s, 'harsh');
    // The tyrant goes looking for plunder whenever its coffers allow.
    s = campaign(s, month, -8000);
    const laws = [['tax_towns', 'heavy'], ['tax_peasants', 'heavy'], ['tax_nobles', 'heavy'], ['court', 'frugal']];
    const [law, option] = laws[month % laws.length];
    if (s.laws[law]?.option !== option) s = act(s, { type: 'law', law, option });
    // The Iron Hand and One faith, the Fire's (M26).
    s = signAlong(s, [['order', 'iron'], ['faith', 'one_faith', 'eternal_fire']], 0);
    s = tendFaith(s, 'eternal_fire', 1000);
    for (const id of Object.keys(s.houses)) if (month % 12 === 0) s = act(s, { type: 'house', house: id, kind: 'fine' });
    // It rules by Fear (M24 B): the ringleaders in the angriest town hang,
    // gibbets go up where the roads are worst, and a house sends a hostage.
    if (world.meters?.acts) {
      const live = Object.keys(s.settlements).filter((id) => !s.settlements[id].occupier);
      const angry = live.sort((a, b) => s.settlements[b].unrest - s.settlements[a].unrest)[0];
      if (angry && canAct(s, world, 'hang', angry).ok) s = act(s, { type: 'act', kind: 'hang', settlement: angry });
      if (month % 3 === 1) {
        const road = live.find((id) => canAct(s, world, 'gibbets', id).ok && ['city', 'town'].includes(world.byId[id].type));
        if (road) s = act(s, { type: 'act', kind: 'gibbets', settlement: road });
      }
      if (month % 6 === 2) {
        const hid = Object.keys(s.houses).find((id) => canHouseAction(s, world, id, 'hostages').ok);
        if (hid) s = act(s, { type: 'house', house: hid, kind: 'hostages' });
      }
    }
    // Twice a year (M22 D) it strips a lord of a holding, whatever the
    // towns and the other houses think: the crown that runs high Unrest.
    if (month % 6 === 3) {
      for (const id of Object.keys(s.houses)) {
        const sid = holdingsOf(s, id).find((x) => canHouseAction(s, world, id, 'strip', x).ok);
        if (sid) { s = act(s, { type: 'house', house: id, kind: 'strip', settlement: sid }); break; }
      }
    }
    return s;
  }

  // The warlord (M21): a steward's economy, a war every three years against
  // the weakest neighbour it can, everything it can muster (the whole levy,
  // the lords, every mercenary company to be had), sacks for the loot, Heavy
  // taxes and the bank while the war lasts.
  function warlord(s, month) {
    s = answer(s, true);
    s = warPolicy(s, 'harsh');
    if (world.market && month % 3 === 1) s = trade(s);
    if (world.spaces) s = mend(s, false);
    if (world.labour) s = labour(s);
    const wars = warsOf(s, 'temeria');
    const taxes = wars.length ? 'heavy' : 'fair';
    for (const law of ['tax_towns', 'tax_peasants']) if (s.laws[law]?.option !== taxes) s = act(s, { type: 'law', law, option: taxes });
    if (wars.length && s.treasury < 2000) for (const sum of [10000, 5000, 2000]) if (canBorrow(s, world, sum).ok) { s = act(s, { type: 'loan', sum }); break; }
    if (month >= 24 && month % 36 === 0 && !wars.length) {
      let best = null;
      for (const pid of parties(world)) {
        if (!s.realms[pid] || pid === 'brokilon' || hostile(s, 'temeria', pid)) continue;
        const reason = ['claim', 'broken', 'refused', 'none'].find((r) => canDeclareWith(s, world, pid, r).ok);
        if (!reason) continue;
        const ratio = 4000 / Math.max(1, strengthOf(s, world, pid));
        if (!best || ratio > best.ratio) best = { pid, reason, ratio };
      }
      if (best) {
        s = act(s, { type: 'declare', realm: best.pid, reason: best.reason });
        if (hostile(s, 'temeria', best.pid)) {
          const mercs = Object.keys(world.war.raise.mercenaries?.companies ?? {}).filter((id) => mercenaryOffer(s, world, id).ok);
          const units = s.forces.companies.filter((c) => !c.task && !c.army).map((c) => c.id);
          s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: true, mercs: mercs.slice(0, 1), units, marshal: 'vestibor', stance: 'bold' });
          const a = crownArmies(s)[0];
          const target = (world.foreignByRealm[best.pid] ?? [])
            .sort((x, y) => Math.min(...Object.keys(s.settlements).map((h) => Math.hypot(world.byId[h].x - world.byId[x].x, world.byId[h].y - world.byId[x].y)))
              - Math.min(...Object.keys(s.settlements).map((h) => Math.hypot(world.byId[h].x - world.byId[y].x, world.byId[h].y - world.byId[y].y))))[0];
          if (a && target) s.pendingSiege = { army: a.id, target };
        }
      }
    }
    // Once the levies are in, plunder first (M24 D): a raid across their
    // villages and towns to pay for the war, then the siege.
    if (s.pendingSiege) {
      const p = s.pendingSiege;
      const a = crownArmies(s).find((x) => x.id === p.army);
      if (!a) delete s.pendingSiege;
      else if (!(a.gatherUntil > s.day) && !p.raided && world.war.raid) {
        s = act(s, { type: 'army', army: a.id, order: 'raid', target: ownerOf(s, world, p.target), stance: 'bold' });
        s.pendingSiege = { ...p, raided: true };
      } else if (!(a.gatherUntil > s.day) && a.order !== 'raid') {
        s = act(s, { type: 'army', army: a.id, order: 'siege', target: p.target, stance: 'bold' });
        delete s.pendingSiege;
      }
    }
    for (const w of wars) for (const t of w.taken) if (canRequisition(s, world, t.id).ok) s = act(s, { type: 'requisition', settlement: t.id });
    // What it takes, it sacks for the loot (M24 D).
    for (const d of [...(s.conquest?.decisions ?? [])]) if (d.kind === 'capture') s = act(s, { type: 'conquestDecision', id: d.id, choice: d.options.indexOf('sack') });
    // It pays for its wars with plunder (M24 D): an army standing idle in a
    // war rides out to raid the enemy, and at home its companies hunt
    // outlaws and beasts for their purses, with bounties on.
    for (const a of crownArmies(s)) {
      const foe = wars.flatMap((w) => w.sides.flat()).find((p) => p !== 'temeria' && hostile(s, 'temeria', p));
      if (foe && !a.to && !a.siege && !a.raiding && a.order !== 'raid' && !(a.gatherUntil > s.day) && !s.pendingSiege) {
        s = act(s, { type: 'army', army: a.id, order: 'raid', target: foe, stance: 'bold' });
      }
    }
    if (month === 2) s = act(s, { type: 'law', law: 'bounties', option: 'witchers' });
    s = keepThePeace(s, month);
    return s;
  }

  // The steward with a standing army (M21): its usual policy, and the
  // crown's companies (professional soldiers, who take no hands from the
  // works) recruited until they number about 3,000 men.
  const STANDING = ['militia', 'archers', 'menatarms', 'militia', 'archers', 'crossbows', 'menatarms', 'lightcav'];
  function standing(s, month) {
    s = steward(s, month, false);
    const towns = world.geography.settlements.filter((x) => x.type !== 'village' && x.type !== 'temple').map((x) => x.id);
    for (let i = 0; i < 4; i++) {
      const men = s.forces.companies.reduce((a, c) => a + c.men, 0);
      if (men >= 3000 || s.treasury < 2500) break;
      const kind = STANDING[(month + i) % STANDING.length];
      const at = towns.find((id) => canRecruit(s, world, id, kind).ok);
      if (!at) break;
      s = act(s, { type: 'recruit', settlement: at, kind });
    }
    return s;
  }

  // The careless crown (M24 C): it keeps the peace and answers the realm
  // generously, but never trades, never moves its hands from where they
  // stand, never prospects, and patches what breaks rather than mending it.
  function careless(s, month) {
    s = answer(s, true);
    s = diplomacy(s, month);
    s = warPolicy(s);
    for (const d of [...(s.works?.decisions ?? [])]) s = act(s, { type: 'worksDecision', id: d.id, choice: 1 });
    s = keepThePeace(s, month);
    return s;
  }

  return { answer, steward, tyrant, warlord, standing, careless };
}
