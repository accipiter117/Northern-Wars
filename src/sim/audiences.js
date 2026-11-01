// What the crown can say to a ruler across the audience table besides a
// deal: gifts, denunciations, demands and requests backed by fear, terms
// before war and the reasons for it. And what the rulers do of their own
// accord: ask for audiences with real proposals, tax our caravans when they
// sour on us, and make and break pacts among themselves by the same rules.
import { asksAudience } from './tiers.js';
import { monthlySuzerainty } from './suzerainty.js';
import { openRealmRequest } from './dilemmas.js';
import { nudge, authority } from './meters.js';
import { sendFigure, courtOf } from './figures.js';
import { addDispatch, clamp } from './realm.js';
import { settleOwnership } from './lands.js';
import { creditLimit } from './economy.js';
import { informed } from './realms.js';
import { disbandArmy } from './armies.js';
import { canDeclare, declareCost, declareWar, hostilityTo } from './war.js';
import { TEMERIA, hostile, atWar, warBetween, sideIndex, sideName, ownerOf, valueOf, setOwner, enemiesOf, truceUntil } from './conflict.js';
import {
  D, parties, rulerShort, traitMult, traitSum, hasTrait, agendaOf, trustIn, changeTrust, remember, fearOf, dangerTo, powerOf,
  treatyDef, treatiesOf, treatyBetween, partnerOf, makeTreaty, endTreaty, monthlyTreaties, monthlyTrust, monthlyMemories, setRenewable,
} from './diplomacy.js';
import { proposeDeal, weighDeal, signDeal, describeItem, treatyValue, ourValue } from './deals.js';

const A = (world) => D(world).actions;
const say = (state, text) => addDispatch(state, text, 'abroad');

function cooldown(state, pid, key) {
  return state.diplomacy.cooldowns[pid]?.[key] ?? -Infinity;
}

function setCooldown(state, pid, key, days) {
  (state.diplomacy.cooldowns[pid] ??= {})[key] = state.day + days;
}

function waitLeft(state, pid, key) {
  const until = cooldown(state, pid, key);
  return until > state.day ? until - state.day : 0;
}

// How readily a ruler bends to what the crown asks: fear of our strength,
// liking and trust, against what it costs them and their pride.
export function resolve(state, world, pid, cost) {
  const n = state.neighbours[pid];
  return fearOf(state, world, pid) * D(world).fearBase + (n?.relation ?? 0) * 0.4 + (trustIn(state, world, pid, TEMERIA) - 50) * 0.2
    + traitSum(world, pid, 'fear') - traitSum(world, pid, 'pride') - cost;
}

// ---- Gifts and denunciations ----

export function canGift(state, world, pid, size) {
  const g = A(world).gift;
  if (!state.neighbours[pid]) return { ok: false, reason: 'Unknown realm.' };
  if (!g.sizes.includes(size)) return { ok: false, reason: 'Unknown gift.' };
  if (hostile(state, TEMERIA, pid)) return { ok: false, reason: 'They will take no gift while we are at war.' };
  const left = waitLeft(state, pid, 'gift');
  if (left) return { ok: false, reason: `A gift went only lately (${left} days).` };
  if (state.treasury - size < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true };
}

export function giveGift(state, world, pid, size) {
  const g = A(world).gift;
  const mood = Math.round(g.mood[g.sizes.indexOf(size)] * traitMult(world, pid, 'gift'));
  state.treasury -= size;
  state.ledger.decrees = (state.ledger.decrees ?? 0) + size;
  if (state.realms[pid]) state.realms[pid].treasury += size;
  remember(state, world, pid, 'Gifts from Vizima', mood);
  setCooldown(state, pid, 'gift', g.cooldown);
  say(state, `A gift of ${size} crowns goes to ${sideName(world, pid)}. ${rulerShort(world, pid)} ${mood >= 10 ? 'is well pleased' : 'accepts it'}.`);
}

export function canDenounce(state, world, pid) {
  if (!state.neighbours[pid]) return { ok: false, reason: 'Unknown realm.' };
  const left = waitLeft(state, pid, 'denounce');
  if (left) return { ok: false, reason: `We denounced them only lately (${left} days).` };
  return { ok: true };
}

// Their enemies: realms at war with them, their old rivals, and any who want
// a town they hold.
export function enemiesOfParty(state, world, pid) {
  const out = new Set(enemiesOf(state, pid));
  for (const r of world.war?.rivalries ?? []) {
    if (r.a === pid) out.add(r.b);
    if (r.b === pid) out.add(r.a);
  }
  for (const p of parties(world)) {
    const ag = agendaOf(world, p);
    if (ag?.kind === 'town' && ownerOf(state, world, ag.town) === pid) out.add(p);
  }
  out.delete(TEMERIA);
  out.delete(pid);
  return [...out].filter((p) => state.neighbours[p]);
}

export function denounce(state, world, pid) {
  const c = A(world).denounce;
  remember(state, world, pid, 'We denounced them before the North', c.mood, { fade: c.fade, cause: 'we denounced them' });
  const pleased = enemiesOfParty(state, world, pid);
  for (const e of pleased) remember(state, world, e, `We denounced ${sideName(world, pid)}`, c.enemies, { fade: c.fade });
  setCooldown(state, pid, 'denounce', c.cooldown);
  say(state, `The crown denounces ${sideName(world, pid)} before every court in the North.${pleased.length ? ` ${pleased.map((p) => sideName(world, p)).join(', ')} ${pleased.length === 1 ? 'is' : 'are'} pleased to hear it.` : ''}`);
}

// ---- Tribute and requests, backed by fear ----

export function tributeAsk(state, world, pid) {
  const potential = powerOf(state, world, pid);
  return Math.max(20, Math.round((potential * 0.02) / 5) * 5);
}

export function canDemandTribute(state, world, pid) {
  if (!state.realms?.[pid]) return { ok: false, reason: 'Unknown realm.' };
  if (hostile(state, TEMERIA, pid)) return { ok: false, reason: 'At war, tribute is won in the peace.' };
  if ((state.tributes ?? []).some((t) => t.from === pid && t.to === TEMERIA)) return { ok: false, reason: 'They already pay us tribute.' };
  const left = waitLeft(state, pid, 'tribute');
  if (left) return { ok: false, reason: `Too soon to ask again (${left} days).` };
  return { ok: true };
}

export function demandTribute(state, world, pid) {
  const c = A(world).tribute;
  const monthly = tributeAsk(state, world, pid);
  setCooldown(state, pid, 'tribute', c.cooldown);
  const r = resolve(state, world, pid, 30 + monthly / 2);
  const name = rulerShort(world, pid);
  if (r >= 0) {
    state.tributes.push({ from: pid, to: TEMERIA, monthly, until: state.day + c.months * 30 });
    remember(state, world, pid, 'We forced tribute from them', -10, { cause: 'we forced tribute from them' });
    say(state, `${name} bows to Temeria's strength: ${sideName(world, pid)} will pay ${monthly} crowns a month for ${c.months} months.`);
    return { ok: true, text: `${name} agrees, with a face like thunder.` };
  }
  remember(state, world, pid, 'We demanded tribute of them', c.refused, { cause: 'we demanded tribute of them' });
  say(state, `${name} refuses Temeria's demand for tribute${fearOf(state, world, pid) < 1 ? ': they do not fear us' : ''}.`);
  return { ok: false, text: `${name} refuses: ${sideName(world, pid)} ${fearOf(state, world, pid) < 1 ? 'does not fear us' : 'will not be bled'}.` };
}

// What the crown can ask a ruler to stop doing, where they are doing it.
export function asksOf(state, world, pid) {
  const out = [];
  if ((state.musters ?? []).some((m) => m.realm === pid)) out.push({ key: 'muster', label: 'Stand down the army on our border' });
  const near = (state.threats?.list ?? []).some((t) => (t.kind === 'raiders' && t.realm === pid) || (t.abroad === pid && borderNear(state, world, t)));
  if (near) out.push({ key: 'raiders', label: 'Stop sheltering raiders' });
  if (state.diplomacy.tolls[pid]) out.push({ key: 'tolls', label: 'Stop taxing our caravans' });
  return out;
}

function borderNear(state, world, t) {
  return Object.keys(state.settlements).some((id) => Math.hypot(world.byId[id].x - t.x, world.byId[id].y - t.y) < 90);
}

export function canAsk(state, world, pid, what) {
  if (!asksOf(state, world, pid).some((a) => a.key === what)) return { ok: false, reason: 'Nothing of the kind to ask.' };
  const left = waitLeft(state, pid, `ask:${what}`);
  if (left) return { ok: false, reason: `We asked only lately (${left} days).` };
  return { ok: true };
}

export function askStop(state, world, pid, what) {
  const c = A(world).ask;
  setCooldown(state, pid, `ask:${what}`, c.cooldown);
  const cost = c.costs[what] * (what === 'tolls' ? traitMult(world, pid, 'coin') : 1);
  const name = rulerShort(world, pid);
  if (resolve(state, world, pid, cost) < 0) {
    remember(state, world, pid, 'Our demands', c.refused);
    say(state, `${name} refuses Temeria's request.`);
    return { ok: false, text: `${name} refuses.` };
  }
  if (what === 'muster') {
    for (const m of state.musters.filter((x) => x.realm === pid)) {
      const army = state.armies.find((a) => a.id === m.army);
      if (army) disbandArmy(state, world, army, true);
    }
    state.musters = state.musters.filter((m) => m.realm !== pid);
    say(state, `${name} stands down the host gathered on our border.`);
  } else if (what === 'raiders') {
    state.threats.list = state.threats.list.filter((t) => !((t.kind === 'raiders' && t.realm === pid) || (t.abroad === pid && borderNear(state, world, t))));
    state.diplomacy.restrain[pid] = state.day + c.restrainDays;
    say(state, `${name} sends soldiers to clear the raiders' nests on our border, and promises no more for a year.`);
  } else if (what === 'tolls') {
    delete state.diplomacy.tolls[pid];
    say(state, `${name} lifts the tolls on Temerian caravans.`);
  }
  return { ok: true, text: `${name} agrees.` };
}

// ---- Terms before war ----

export function canUltimatum(state, world, pid, demand) {
  if (!state.realms?.[pid]) return { ok: false, reason: 'Unknown realm.' };
  if (hostile(state, TEMERIA, pid)) return { ok: false, reason: 'We are already at war.' };
  if ((state.diplomacy.refused[pid] ?? 0) > state.day) return { ok: false, reason: 'They have already refused our terms.' };
  if (demand.kind === 'pay' && !(demand.amount > 0)) return { ok: false, reason: 'Name a sum.' };
  if (demand.kind === 'cede' && ownerOf(state, world, demand.town) !== pid) return { ok: false, reason: 'That town is not theirs.' };
  if (demand.kind === 'break' && !treatiesOf(state, pid).some((t) => t.id === demand.treaty && partnerOf(t, pid) !== TEMERIA)) return { ok: false, reason: 'No such treaty.' };
  return { ok: true };
}

export function ultimatumCost(state, world, pid, demand) {
  if (demand.kind === 'pay') return demand.amount / 20;
  if (demand.kind === 'cede') return valueOf(state, world, demand.town) * 3 * (world.realms?.realms[pid]?.capital === demand.town ? 4 : 1);
  return 25 + (hasTrait(world, pid, 'honourable') ? 15 : 0);
}

export function ultimatum(state, world, pid, demand) {
  const c = A(world).ultimatum;
  const name = rulerShort(world, pid);
  const r = resolve(state, world, pid, ultimatumCost(state, world, pid, demand));
  if (r < 0) {
    state.diplomacy.refused[pid] = state.day + c.cause;
    remember(state, world, pid, 'Our threats', c.refused, { cause: 'our threats' });
    say(state, `${name} refuses Temeria's terms. The crown has its cause, if it wants war.`);
    return { ok: false, text: `${name} refuses: let Temeria come and take it.` };
  }
  if (demand.kind === 'pay') {
    if (state.realms[pid]) state.realms[pid].treasury -= demand.amount;
    state.treasury += demand.amount;
  } else if (demand.kind === 'cede') {
    setOwner(state, world, demand.town, TEMERIA);
    settleOwnership(state, world);
  }
  else {
    const t = state.diplomacy.treaties.find((x) => x.id === demand.treaty);
    if (t) endTreaty(state, world, t, { broken: true, by: pid, why: 'at Temeria\'s demand' });
  }
  remember(state, world, pid, 'Terms forced on them', -8, { cause: 'the terms we forced on them' });
  say(state, `${name} yields to Temeria's terms rather than face war.`);
  return { ok: true, text: `${name} yields.` };
}

// ---- War and its reasons ----

// Why the crown might go to war with a realm, and whether it can say so.
export function warReasons(state, world, pid) {
  const W = D(world).war.reasons;
  const out = [];
  const held = Object.values(state.settlements).some((s) => s.occupier === pid);
  out.push({ key: 'claim', name: W.claim.name, ok: held, why: held ? 'They hold Temerian towns.' : 'They hold nothing of ours.' });
  const broke = state.diplomacy.broken.find((b) => b.by === pid && b.with === TEMERIA && state.day - b.day <= W.broken.within);
  out.push({ key: 'broken', name: W.broken.name, ok: !!broke, why: broke ? `They broke their ${treatyDef(world, broke.kind).name.toLowerCase()} with us.` : 'They have broken no treaty with us.' });
  const ally = allyAtWarWith(state, pid);
  out.push({ key: 'ally', name: W.ally.name, ok: !!ally, why: ally ? `They are at war with ${sideName(world, ally)}, bound to us by treaty.` : 'No ally of ours is at war with them.' });
  const refused = (state.diplomacy.refused[pid] ?? 0) > state.day;
  out.push({ key: 'ultimatum', name: W.ultimatum.name, ok: refused, why: refused ? 'They refused our terms.' : 'They have refused no terms of ours.' });
  out.push({ key: 'none', name: W.none.name, ok: true, why: 'Every court will see it for what it is.' });
  return out;
}

function allyAtWarWith(state, pid) {
  for (const t of treatiesOf(state, TEMERIA)) {
    if (!['defensive', 'alliance', 'protectorate'].includes(t.kind)) continue;
    const ally = partnerOf(t, TEMERIA);
    if (hostile(state, ally, pid)) return ally;
  }
  return null;
}

export function reasonCost(state, world, pid, reason) {
  const W = D(world).war.reasons[reason];
  return Math.round(declareCost(state, world, pid) * (W?.cost ?? 1));
}

export function canDeclareWith(state, world, pid, reason = 'none') {
  const base = canDeclare(state, world, pid);
  if (!base.ok) return base;
  const r = warReasons(state, world, pid).find((x) => x.key === reason);
  if (!r || !r.ok) return { ok: false, reason: r ? r.why : 'Unknown reason.' };
  const cost = reasonCost(state, world, pid, reason);
  if (authority(state, world) < cost) return { ok: false, reason: `Needs Authority of ${cost}: the realm would not follow the crown to war.` };
  return { ok: true, cost };
}

export function declareWithReason(state, world, rng, pid, reason = 'none') {
  const cost = reasonCost(state, world, pid, reason);
  // Every treaty with them ends, broken by us.
  for (const t of treatiesOf(state, pid)) if (partnerOf(t, pid) === TEMERIA) endTreaty(state, world, t, { broken: true, by: TEMERIA, why: 'by going to war' });
  let war;
  if (reason === 'ally') {
    const ally = allyAtWarWith(state, pid);
    war = warBetween(state, ally, pid);
    nudge(state, world, 'love', -Math.min(state.love, cost), 'War declared');
    war.sides[sideIndex(war, ally)].push(TEMERIA);
    state.neighbours[pid].relation = Math.min(state.neighbours[pid].relation, world.war.atWarRelation);
    addDispatch(state, `Temeria goes to war against ${sideName(world, pid)} at the side of ${sideName(world, ally)}.`, 'military');
  } else {
    war = declareWar(state, world, rng, pid, { cost, cause: reason });
  }
  if (reason === 'none') {
    const c = D(world).trust.noCause;
    for (const p of parties(world)) {
      if (p === pid || hostile(state, p, pid)) continue;
      changeTrust(state, world, p, TEMERIA, c * traitMult(world, p, 'breakAll'));
      remember(state, world, p, `Our war on ${sideName(world, pid)} without a cause`, D(world).war.noCauseMood, { cause: `our war on ${sideName(world, pid)} without a cause` });
    }
  }
  return war;
}

// ---- Requests for an audience ----

export function requestText(state, world, q) {
  const name = rulerShort(world, q.realm);
  const realm = sideName(world, q.realm);
  if (q.kind === 'demand') {
    const what = q.items.map((i) => describeItem(world, i, q.realm).toLowerCase()).join(' and ');
    return { title: `${name} makes demands`, text: `${name} demands ${what}, or ${realm} will take it by force.`, choices: ['Give in', 'Refuse'] };
  }
  if (q.kind === 'renegotiate') {
    const pay = q.items[0];
    return { title: `${name} asks to renegotiate`, text: `${name} says the non-aggression pact with ${realm} costs them more than it gives, and asks ${pay.amount} crowns a month for ${pay.months} months to keep it. Refuse, and they will let it lapse.`, choices: ['Pay to keep the pact', 'Let it lapse'] };
  }
  if (q.kind === 'warning') {
    return { title: `${name} sends a warning`, text: `${name} warns that our armies stand too near ${realm}'s border, and asks that they go home.`, choices: ['Pull them back', 'Ignore it'] };
  }
  // Treaties bind both sides: they are proposed, not offered or asked.
  const pacts = q.items.filter((i) => i.kind === 'treaty').map((i) => `a ${describeItem(world, i, q.realm).toLowerCase()}`);
  const want = q.items.filter((i) => i.from === 'us' && i.kind !== 'treaty').map((i) => describeItem(world, i, q.realm).toLowerCase());
  const give = q.items.filter((i) => i.from === 'them' && i.kind !== 'treaty').map((i) => describeItem(world, i, q.realm).toLowerCase());
  const parts = [];
  if (pacts.length) parts.push(`proposes ${pacts.join(' and ')}`);
  if (give.length) parts.push(`offers ${give.join(', ')}`);
  if (want.length) parts.push(`${give.length || pacts.length ? 'and asks' : 'asks'} ${want.join(', ')} in return`);
  return { title: `${name} proposes a deal`, text: `${name} ${parts.join(', ')}.`, choices: ['Accept', 'Refuse'] };
}

function newRequest(state, world, pid, kind, items) {
  const q = { id: state.diplomacy.nextId++, realm: pid, kind, items, day: state.day };
  state.diplomacy.requests.push(q);
  // Their envoy's last stretch to Vizima (M23 C).
  const court = courtOf(world, pid);
  if (court) sendFigure(state, world, { kind: 'envoy', side: pid, from: court, to: world.kingdom.capital, days: 4 });
  setCooldown(state, pid, 'request', D(world).requests.cooldown);
  return q;
}

function armiesNear(state, world, pid) {
  return (state.armies ?? []).filter((a) => a.side === TEMERIA && (world.foreignByRealm[pid] ?? []).some((id) => {
    const p = world.byId[a.at];
    return Math.hypot(p.x - world.byId[id].x, p.y - world.byId[id].y) < D(world).mood.armyRange;
  }));
}

// Each month a ruler or two may ask for an audience: a demand when they are
// strong and hostile, a warning when our armies crowd their border, otherwise
// a deal of their own devising.
export function monthlyRequests(state, world, rng) {
  const c = D(world).requests;
  for (const pid of parties(world)) {
    if (!state.realms?.[pid] || !state.neighbours[pid]) continue;
    if (state.diplomacy.requests.some((q) => q.realm === pid) || cooldown(state, pid, 'request') > state.day) continue;
    if (hostile(state, TEMERIA, pid) && (state.day - (warBetween(state, TEMERIA, pid)?.since ?? state.day)) / 30 < world.war.peace.minMonths) continue;
    // A petty king keeps his distance from a great one (M29 A): unless
    // relations are warm, he sends a short request rather than an envoy, and
    // comes in person only with a very good offer.
    if (!asksAudience(state, world, pid)) {
      if (hostile(state, TEMERIA, pid)) continue;
      const items = rng.chance(c.chance) ? proposeDeal(state, world, pid) : null;
      if (items?.length && asksAudience(state, world, pid, ourValue(state, world, pid, items))) {
        newRequest(state, world, pid, 'deal', items);
        continue;
      }
      if (rng.chance(D(world).tiers.requestChance * c.chance * 4)) {
        openRealmRequest(state, world, rng, pid);
        setCooldown(state, pid, 'request', c.cooldown);
      }
      continue;
    }
    const chance = c.chance * (hasTrait(world, pid, 'greedy') || hasTrait(world, pid, 'ambitious') ? 1.3 : 1);
    if (!rng.chance(chance)) continue;
    if (!hostile(state, TEMERIA, pid) && hostilityTo(state, world, pid) > 0.4 && fearOf(state, world, pid) < 1 && (hasTrait(world, pid, 'ambitious') || hasTrait(world, pid, 'greedy'))) {
      const ag = agendaOf(world, pid);
      const items = ag?.kind === 'town' && ownerOf(state, world, ag.town) === TEMERIA
        ? [{ kind: 'town', from: 'us', town: ag.town }]
        : [{ kind: 'coin', from: 'us', amount: Math.round((300 + powerOf(state, world, pid) * 0.1) / 50) * 50 }];
      newRequest(state, world, pid, 'demand', items);
      continue;
    }
    // A realm in debt brings real proposals (M18): a loan at interest, goods
    // for crowns, and in deep trouble a town for coin.
    const st = world.strategy;
    if (st && !hostile(state, TEMERIA, pid) && state.realms[pid].treasury < st.debt.loanAt) {
      const items = debtProposal(state, world, pid);
      if (items) {
        newRequest(state, world, pid, 'deal', items);
        continue;
      }
    }
    if (!hostile(state, TEMERIA, pid) && armiesNear(state, world, pid).length && !treatyBetween(state, TEMERIA, pid, 'access')) {
      newRequest(state, world, pid, 'warning', []);
      continue;
    }
    const items = proposeDeal(state, world, pid);
    if (items?.length) newRequest(state, world, pid, 'deal', items);
  }
}

function debtProposal(state, world, pid) {
  const st = world.strategy.debt;
  const realm = state.realms[pid];
  const need = Math.max(300, Math.round(-realm.treasury / 100) * 100);
  if (realm.treasury < st.townAt) {
    // A village for coin: the smallest place they hold.
    const town = (world.foreignByRealm[pid] ?? []).filter((id) => ownerOf(state, world, id) === pid && world.byId[id].type === 'village')
      .sort((a, b) => valueOf(state, world, a) - valueOf(state, world, b))[0];
    if (town) return [{ kind: 'town', from: 'them', town }, { kind: 'coin', from: 'us', amount: Math.max(need, valueOf(state, world, town) * 150) }];
  }
  const makes = world.industry?.abroadMakes[pid] ?? [];
  const good = Object.entries(world.diplomacy.goods).find(([, d]) => makes.includes(d.made ?? d.store))?.[0];
  if (good && (realm.income ?? 0) > 0) return [{ kind: 'goods', from: 'them', good, qty: world.diplomacy.goods[good].unit, months: 6 }, { kind: 'coin', from: 'us', amount: need }];
  // A loan: crowns now, repaid with a fifth more over a year.
  const monthly = Math.ceil((need * 1.2) / 12);
  if (monthly > Math.max(0, realm.income ?? 0) * st.spareShare) return null;
  return [{ kind: 'coin', from: 'us', amount: need }, { kind: 'monthly', from: 'them', amount: monthly, months: 12 }];
}

export function resolveRequest(state, world, id, choice, ignored = false) {
  const i = state.diplomacy.requests.findIndex((q) => q.id === id);
  if (i < 0) return false;
  const q = state.diplomacy.requests[i];
  state.diplomacy.requests.splice(i, 1);
  const name = rulerShort(world, q.realm);
  const realm = sideName(world, q.realm);
  if (q.kind === 'demand') {
    if (choice === 0 && !ignored) {
      for (const it of q.items) {
        if (it.kind === 'coin') {
          state.treasury -= it.amount;
          if (state.realms[q.realm]) state.realms[q.realm].treasury += it.amount;
        } else if (it.kind === 'town') setOwner(state, world, it.town, q.realm);
      }
      settleOwnership(state, world);
      remember(state, world, q.realm, 'We gave in to their demands', 6);
      say(state, `The crown gives ${realm} what it demands. ${name} is satisfied, for now.`);
    } else {
      remember(state, world, q.realm, 'We refused their demands', D(world).requests.demandRefused, { cause: 'we refused their demands' });
      say(state, `${ignored ? `No answer went to ${realm}` : `The crown refuses ${realm}'s demands`}. ${name} will not forget it.`);
    }
  } else if (q.kind === 'renegotiate') {
    const t = treatyBetween(state, TEMERIA, q.realm, 'nonaggression');
    if (choice === 0 && !ignored && t) {
      state.diplomacy.deals.push({ id: state.diplomacy.nextId++, with: q.realm, since: state.day, items: q.items.map((i) => ({ ...i, left: i.months })), short: 0 });
      say(state, `The crown pays ${realm} to keep the peace between us.`);
    } else if (t) {
      // Lapsed by agreement, not broken: no trust is lost.
      endTreaty(state, world, t);
      remember(state, world, q.realm, 'We would not pay for our pact', -5);
      say(state, `Our non-aggression pact with ${realm} lapses. ${name} is free to choose war, if it wants it.`);
    }
  } else if (q.kind === 'warning') {
    if (choice === 0 && !ignored) {
      for (const a of armiesNear(state, world, q.realm)) {
        a.order = 'defend';
        a.target = world.kingdom.capital;
      }
      remember(state, world, q.realm, 'We heeded their warning', 4);
      say(state, `Our armies on ${realm}'s border are called home.`);
    } else {
      remember(state, world, q.realm, 'We ignored their warning', -8, { cause: 'we ignored their warning' });
      say(state, `${name}'s warning goes unheeded.`);
    }
  } else if (choice === 0 && !ignored) {
    const w = weighDeal(state, world, q.realm, q.items);
    if (w.verdict !== 'Acceptable') {
      say(state, `${name} no longer stands by the offer.`);
      return true;
    }
    signDeal(state, world, q.realm, q.items);
  } else if (!ignored) say(state, `The crown declines ${name}'s proposal.`);
  return true;
}

export function stepRequestsDay(state, world) {
  const wait = D(world).requests.expireDays;
  for (const q of [...state.diplomacy.requests]) if (state.day - q.day >= wait) resolveRequest(state, world, q.id, 1, true);
}

// ---- Tolls ----

function monthlyTolls(state, world, rng) {
  const c = D(world).tolls;
  for (const pid of parties(world)) {
    const n = state.neighbours[pid];
    if (!n) continue;
    if (state.diplomacy.tolls[pid] && n.relation >= 10) {
      delete state.diplomacy.tolls[pid];
      if (informed(state, world, pid)) say(state, `${sideName(world, pid)} lifts its tolls on our caravans.`);
    } else if (!state.diplomacy.tolls[pid] && n.relation < c.below && (hasTrait(world, pid, 'greedy') || hasTrait(world, pid, 'opportunist')) && rng.chance(c.chance)) {
      state.diplomacy.tolls[pid] = true;
      say(state, `${sideName(world, pid)} lays new tolls on Temerian caravans at its border.`);
    }
  }
}

// ---- Pacts between the realms themselves ----

// How warmly two foreign realms regard each other.
export function affinity(state, world, a, b) {
  const c = D(world).aiPacts;
  let v = 0;
  if ((world.war?.rivalries ?? []).some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) v += c.rivalry;
  v += treatiesOf(state, a).filter((t) => partnerOf(t, a) === b).length * c.treaty;
  v += (state.warHistory ?? []).filter((w) => state.day - w.until < 3650 && sideIndex(w, a) >= 0 && sideIndex(w, b) >= 0 && sideIndex(w, a) !== sideIndex(w, b)).length * c.war;
  if (hostile(state, a, b)) v += c.war * 2;
  const ea = new Set(enemiesOf(state, a));
  if (enemiesOf(state, b).some((e) => ea.has(e))) v += c.sharedEnemy;
  v += ((trustIn(state, world, a, b) + trustIn(state, world, b, a)) / 2 - 50) * c.trustWeight;
  return v;
}

// The pact two foreign realms would sign today, if any: the closest bond
// their affinity, fears and trust allow, worth it to both.
export function wantedPact(state, world, a, b) {
  const c = D(world).aiPacts;
  let aff = affinity(state, world, a, b);
  // Soft balancing (M18): two realms that both fear the crown's might
  // draw together, above all for mutual defence.
  const sp = world.strategy?.pacts;
  const feared = sp && powerOf(state, world, TEMERIA) > sp.fearAt * Math.max(powerOf(state, world, a), powerOf(state, world, b));
  if (feared) aff += sp.fearOfTemeria;
  const wants = [];
  const pd = treatyDef(world, 'protectorate');
  for (const [big, small] of [[a, b], [b, a]]) {
    if (pd.small.includes(small) && !pd.small.includes(big) && aff >= 20 && dangerTo(state, world, small) > 0.6 && powerOf(state, world, big) >= powerOf(state, world, small) * pd.power) wants.push(['protectorate', big, small]);
  }
  if (aff >= c.allianceAt) wants.push(['alliance', a, b]);
  if (aff >= c.defensiveAt) wants.push(['defensive', a, b]);
  if (aff >= c.tradeAt && world.neighbours.realms[a]?.trade && world.neighbours.realms[b]?.trade) wants.push(['trade', a, b]);
  // Only rivals, or a realm that fears the other, bother with a pact
  // against war.
  const rivals = (world.war?.rivalries ?? []).some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  const ratio = powerOf(state, world, a) / powerOf(state, world, b);
  if (aff >= c.nonaggressionAt && (rivals || ratio > 2.5 || ratio < 1 / 2.5)) wants.push(['nonaggression', a, b]);
  for (const [kind, x, y] of wants) {
    if (treatyBetween(state, x, y, kind)) continue;
    // No re-signing a pact of the same kind soon after one was broken.
    if ((state.diplomacy.pactCooldown?.[pactKey(x, y, kind)] ?? 0) > state.day) continue;
    const def = treatyDef(world, kind);
    if (trustIn(state, world, x, y) < def.minTrust || trustIn(state, world, y, x) < def.minTrust) continue;
    if (treatyValue(state, world, x, y, kind) <= 0 || treatyValue(state, world, y, x, kind) <= 0) continue;
    return [kind, x, y];
  }
  return null;
}

// The North does not begin without bonds (M18): at the start of a reign the
// pacts the realms would sign already stand, quietly, so the first years
// are not one long round of signings.
export function seedPacts(state, world) {
  if (!state.diplomacy || !world.strategy) return;
  const ids = parties(world).filter((p) => state.realms?.[p]);
  const chronicle = state.chronicle.length;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const want = wantedPact(state, world, ids[i], ids[j]);
      if (!want) continue;
      const t = makeTreaty(state, world, want[0], want[1], want[2], want[0] === 'protectorate' ? { terms: { monthly: treatyDef(world, 'protectorate').tribute } } : {});
      // Signed long ago: their terms run out at different times.
      t.since -= 365 * ((i * 7 + j * 3) % 4);
      t.until = t.since + Math.round(treatyDef(world, want[0]).years * 365);
      if (t.until <= state.day) t.until = state.day + 365;
    }
  }
  state.chronicle.length = chronicle;
  state.diplomacy.log = [];
}

function aiPacts(state, world, rng) {
  const c = D(world).aiPacts;
  const ids = parties(world).filter((p) => state.realms?.[p]);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (hostile(state, a, b) || !rng.chance(c.chance)) continue;
      const want = wantedPact(state, world, a, b);
      if (want) makeTreaty(state, world, want[0], want[1], want[2], want[0] === 'protectorate' ? { terms: { monthly: treatyDef(world, 'protectorate').tribute } } : {});
    }
  }
  // Pacts that no longer suit one side are broken: soonest by opportunists,
  // or once the goodwill behind them is gone.
  const sp = world.strategy?.pacts;
  for (const t of [...state.diplomacy.treaties]) {
    if (t.a === TEMERIA || t.b === TEMERIA) continue;
    // A pact stands its minimum term, short of war (M18).
    if (sp && state.day - t.since < sp.minYears * 365) continue;
    const breaker = hasTrait(world, t.b, 'opportunist') ? t.b : t.a;
    const sour = affinity(state, world, t.a, t.b) < (sp ? sp.breakBelow : c.breakBelow);
    const fickle = hasTrait(world, breaker, 'opportunist');
    if (!sour && !fickle) continue;
    if (rng.chance(c.breakChance * (fickle ? traitMult(world, breaker, 'breakChance') : 1) * (sour ? 3 : 1))) {
      endTreaty(state, world, t, { broken: true, by: breaker, why: sour ? 'as old quarrels return' : 'when it no longer pays' });
      if (sp) (state.diplomacy.pactCooldown ??= {})[pactKey(t.a, t.b, t.kind)] = state.day + sp.cooldownYears * 365;
    }
  }
}

const pactKey = (a, b, kind) => `${[a, b].sort().join('|')}|${kind}`;

// Would two foreign realms sign this pact again today? Then it runs on.
setRenewable((state, world, t) => {
  const c = D(world).aiPacts;
  const at = { alliance: c.allianceAt, defensive: c.defensiveAt, trade: c.tradeAt, nonaggression: c.nonaggressionAt, protectorate: 20, access: 99 }[t.kind] ?? 99;
  return !hostile(state, t.a, t.b) && affinity(state, world, t.a, t.b) - c.treaty >= at - 10;
});

// ---- Calls to arms, by treaty ----

// A war has begun: every party bound by treaty to either side is called.
// Foreign rulers answer by their temper and trust; the crown is asked.
export function treatyCalls(state, world, rng, war) {
  const attacker = war.sides[0][0];
  const defender = war.sides[1][0];
  for (const [side, victim, attacking] of [[1, defender, false], [0, attacker, true]]) {
    for (const t of treatiesOf(state, victim)) {
      const partner = partnerOf(t, victim);
      if (partner === TEMERIA || sideIndex(war, partner) >= 0) continue;
      if (!state.realms?.[partner] || (world.war?.noWar ?? []).includes(partner)) continue;
      if (!bound(t, partner, victim, attacking)) continue;
      const enemy = war.sides[1 - side][0];
      if (treatyBetween(state, partner, enemy, 'nonaggression') || truceUntil(state, partner, enemy) > state.day) continue;
      if (rng.chance(joinChance(state, world, partner, victim))) {
        war.sides[side].push(partner);
        const text = `${sideName(world, partner)} honours its ${treatyDef(world, t.kind).name.toLowerCase()}: its banners march with ${sideName(world, victim)}.`;
        if (victim === TEMERIA || informed(state, world, partner)) addDispatch(state, text, victim === TEMERIA ? 'military' : 'abroad');
      } else {
        endTreaty(state, world, t, { broken: true, by: partner, why: 'by refusing the call to arms' });
      }
    }
  }
}

function bound(t, partner, victim, attacking) {
  if (t.kind === 'alliance') return true;
  if (attacking) return false;
  if (t.kind === 'defensive') return true;
  return t.kind === 'protectorate' && t.a === partner;
}

function joinChance(state, world, pid, caller) {
  const j = D(world).join;
  let c = j.default;
  for (const tr of ['honourable', 'cautious', 'opportunist']) if (hasTrait(world, pid, tr)) c = j[tr];
  return clamp(c * clamp(trustIn(state, world, pid, caller) / 55, 0.5, 1.15), 0.05, 0.99);
}

// The crown's treaty partner at war: is Temeria bound to it?
export function crownBound(state, partner, attacking) {
  for (const x of treatiesOf(state, TEMERIA)) if (partnerOf(x, TEMERIA) === partner && bound(x, TEMERIA, partner, attacking)) return x;
  return null;
}

// ---- The month and the day ----

export function monthlyDiplomacy(state, world, rng) {
  if (!state.diplomacy || !D(world)) return;
  monthlyTreaties(state, world);
  monthlyTrust(state, world);
  monthlyMemories(state);
  for (const [pid, s] of Object.entries(state.diplomacy.sight)) if (s.theirs <= state.day && s.ours <= state.day) delete state.diplomacy.sight[pid];
  monthlyTolls(state, world, rng);
  aiPacts(state, world, rng);
  // Petty kings seek protectors; great powers press them (M29 B).
  monthlySuzerainty(state, world, rng);
  monthlyRequests(state, world, rng);
}

export function stepDiplomacyDay(state, world) {
  if (!state.diplomacy || !D(world)) return;
  stepRequestsDay(state, world);
}

export { atWar };
