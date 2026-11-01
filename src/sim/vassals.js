// Vassal kings as lords abroad (M29 C), on the great houses' model (M27): a
// vassal king has loyalty and ambition, one want at a time, and a card with
// what he gives and the crown's hand. He pays tribute, sends his kingdom's
// companies when called and guards his own lands; in return his suzerain
// owes him protection. A disloyal vassal can be courted away by a rival, or
// rise for his independence, and once beaten he comes before a Judgement:
// depose him for a pliant heir, annex his kingdom, pardon him, or execute
// him (a cost to Temeria's name in every court).
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { TEMERIA, sideName, hostile, atWar, warBetween, ownerOf, setOwner, enemiesOf } from './conflict.js';
import { suzerainOf, tierOf } from './tiers.js';
import { makeVassal, greatPowers, roomFor, distance } from './suzerainty.js';
import { realmPotential, startWar, applyPeace } from './war.js';
import { changeTrust, rulerShort } from './diplomacy.js';
import { affinity } from './audiences.js';
import { settleOwnership } from './lands.js';
import { addFear } from './conquest.js';

const V = (world) => world.diplomacy?.vassals;
const say = (state, text) => addDispatch(state, text, 'abroad');
// The ruler as the subject of a sentence: "the ruler of Sodden" where the
// name is a council ("The Sodden lords"), else the king's own name.
export function who(world, rid, start = false) {
  const r = rulerShort(world, rid);
  if (!/^The /.test(r)) return r;
  return `${start ? 'The' : 'the'} ruler of ${sideName(world, rid)}`;
}

const living = (state, rid) => !!state.realms?.[rid] && !state.realms[rid].fallen;

export function ourVassals(state) {
  return Object.keys(state.realms ?? {}).filter((r) => living(state, r) && suzerainOf(state, r) === TEMERIA);
}

// The vassal's record, filled in for a protectorate treaty from before M29.
export function vassalOf(state, world, rid) {
  const realm = state.realms?.[rid];
  if (!realm || !suzerainOf(state, rid)) return null;
  realm.vassal ??= { since: state.day, route: 'protection', loyalty: clamp(50 + (state.neighbours?.[rid]?.relation ?? 0) / 2, 10, 90), ambition: 20 };
  return realm.vassal;
}

// ---- What he gives ----

export function tributeOf(state, world, rid) {
  const v = vassalOf(state, world, rid);
  if (!v || v.rebel || world.realms?.realms[rid]?.protectorateOnly) return 0;
  const c = V(world);
  const income = Math.max(0, state.realms[rid].income ?? 0);
  const willing = clamp((v.loyalty - c.tribute.noneBelow) / (c.tribute.fullAbove - c.tribute.noneBelow), 0, 1);
  return Math.round(income * c.tribute.share * (v.tributeMult ?? 1) * willing);
}

export function vassalRetinue(state, world, rid) {
  const v = vassalOf(state, world, rid);
  if (!v || v.rebel) return 0;
  const c = V(world);
  if (v.loyalty < c.retinue.refuseBelow) return 0;
  const share = v.loyalty >= c.retinue.fullAbove ? 1 : 0.5;
  return Math.round(realmPotential(state, world, rid) * c.retinue.share * share);
}

export function vassalGives(state, world, rid) {
  const t = tributeOf(state, world, rid);
  const men = vassalRetinue(state, world, rid);
  const mahakam = world.realms?.realms[rid]?.protectorateOnly;
  return {
    tribute: mahakam ? 'Pays no tribute (a protectorate, not a subject)' : t ? `Tribute about ${Math.round(t / 5) * 5} crowns a month` : 'Pays no tribute',
    retinue: men ? `Would send about ${Math.round(men / 10) * 10} men when called${mahakam ? ' (dwarven companies)' : ''}` : 'Would send no men',
    guard: (vassalOf(state, world, rid)?.loyalty ?? 0) >= V(world).guardAbove ? 'Guards its own lands' : 'Lets trouble fester in its lands',
  };
}

// ---- What he wants ----

const KINDS = ['land', 'command', 'help', 'honours', 'tribute'];

function pickWant(state, world, rid, rng) {
  const c = V(world).wants;
  const w = Object.fromEntries(KINDS.map((k) => [k, c.kinds[k].weight]));
  const town = townFor(state, world, rid);
  if (!town) w.land = 0;
  const foe = foeOf(state, world, rid);
  if (!foe) w.help = 0;
  if (world.realms?.realms[rid]?.protectorateOnly) w.tribute = 0;
  let roll = rng.next() * KINDS.reduce((a, k) => a + w[k], 0);
  const kind = KINDS.find((k) => (roll -= w[k]) < 0) ?? 'honours';
  return { kind, since: state.day, ...(kind === 'land' ? { town } : {}), ...(kind === 'help' ? { foe } : {}) };
}

// A town of his that Temeria holds, which he would have back.
export function townFor(state, world, rid) {
  return (world.foreignByRealm[rid] ?? []).find((id) => ownerOf(state, world, id) === TEMERIA) ?? null;
}

// The neighbour he most fears or hates, to be helped against.
function foeOf(state, world, rid) {
  const foes = enemiesOf(state, rid).filter((r) => r !== TEMERIA);
  return foes[0] ?? null;
}

export function vassalWantText(state, world, rid) {
  const v = vassalOf(state, world, rid);
  const want = v?.want;
  if (!want) return null;
  const king = who(world, rid, true);
  switch (want.kind) {
    case 'land': return { title: `Wants ${world.byId[want.town]?.name ?? 'a town'} back`, text: `${king} asks for ${world.byId[want.town]?.name ?? 'a town'}, taken from his kingdom, to be returned.`, how: 'Grant him the town.' };
    case 'command': return { title: 'Wants a command', text: `${king} asks to lead his men beside the crown's in its next war.`, how: 'Call his men to one of your armies.' };
    case 'help': return { title: `Wants help against ${sideName(world, want.foe)}`, text: `${king} is at war with ${sideName(world, want.foe)} and asks his suzerain to stand by him.`, how: `Go to war with ${sideName(world, want.foe)}.` };
    case 'tribute': return { title: 'Wants lighter tribute', text: `${king} says the tribute bleeds his kingdom dry and asks for it to be eased.`, how: 'Ease his tribute.' };
    default: return { title: 'Wants honours', text: `${king} expects to be received at Vizima with honour.`, how: 'Bestow honours.' };
  }
}

function grant(state, world, rid, why) {
  const v = vassalOf(state, world, rid);
  const c = V(world).wants;
  const turned = Math.min(v.ambition, c.convert);
  v.ambition = clamp(v.ambition - turned, 0, 100);
  v.loyalty = clamp(v.loyalty + turned, 0, 100);
  v.want = null;
  v.wantAfter = state.day + c.gap;
  say(state, `${who(world, rid, true)}${/^The ruler/.test(who(world, rid, true)) ? '' : ` of ${sideName(world, rid)}`} is granted ${why}. His kingdom's loyalty to Temeria grows.`);
}

// ---- The crown's hand ----

const ACTIONS = ['honours', 'summon', 'tribute', 'ease', 'hostage', 'town'];

export function canVassalAction(state, world, rid, kind) {
  const v = suzerainOf(state, rid) === TEMERIA ? vassalOf(state, world, rid) : null;
  const a = V(world)?.actions[kind];
  if (!v || !a || !ACTIONS.includes(kind)) return { ok: false, reason: 'Not our vassal.' };
  if (v.rebel) return { ok: false, reason: 'He is in arms against us.' };
  const last = v.acted?.[kind];
  if (last !== undefined && state.day - last < (a.cooldown ?? V(world).cooldown)) return { ok: false, reason: `Too soon (${(a.cooldown ?? V(world).cooldown) - (state.day - last)} days).` };
  if (a.coin && state.treasury < a.coin) return { ok: false, reason: `Needs ${a.coin} crowns.` };
  if (kind === 'tribute' && world.realms?.realms[rid]?.protectorateOnly) return { ok: false, reason: 'The dwarves pay no tribute, and will not start now.' };
  if (kind === 'town' && !townFor(state, world, rid)) return { ok: false, reason: 'We hold no town of his to give.' };
  if (kind === 'ease' && (v.tributeMult ?? 1) <= a.least) return { ok: false, reason: 'His tribute is as light as it goes.' };
  return { ok: true };
}

export function vassalAction(state, world, rid, kind) {
  const v = vassalOf(state, world, rid);
  const a = V(world).actions[kind];
  (v.acted ??= {})[kind] = state.day;
  if (a.coin) state.treasury -= a.coin;
  const king = who(world, rid, true);
  const mahakam = !!world.realms?.realms[rid]?.protectorateOnly;
  if (kind === 'honours') {
    v.loyalty = clamp(v.loyalty + a.loyalty, 0, 100);
    say(state, `${king} of ${sideName(world, rid)} is received at Vizima with honours.`);
    if (v.want?.kind === 'honours') grant(state, world, rid, 'the honours he wanted');
  } else if (kind === 'summon') {
    v.ambition = clamp(v.ambition + a.ambition, 0, 100);
    v.loyalty = clamp(v.loyalty + (mahakam ? V(world).mahakamMeddle : a.loyalty), 0, 100);
    say(state, `${king} of ${sideName(world, rid)} is summoned to Vizima and kept there a season.${mahakam ? ' The elders call it meddling.' : ''}`);
  } else if (kind === 'tribute') {
    v.tributeMult = (v.tributeMult ?? 1) + a.more;
    v.loyalty = clamp(v.loyalty + a.loyalty, 0, 100);
    say(state, `Temeria demands more tribute of ${sideName(world, rid)}. ${king} pays, and seethes.`);
  } else if (kind === 'ease') {
    v.tributeMult = Math.max(a.least, (v.tributeMult ?? 1) - a.less);
    v.loyalty = clamp(v.loyalty + a.loyalty, 0, 100);
    say(state, `Temeria eases the tribute of ${sideName(world, rid)}.`);
    if (v.want?.kind === 'tribute') grant(state, world, rid, 'lighter tribute');
  } else if (kind === 'hostage') {
    v.hostageUntil = state.day + a.days;
    v.loyalty = clamp(v.loyalty + (mahakam ? V(world).mahakamMeddle : a.loyalty), 0, 100);
    nudge(state, world, 'fear', a.fear, 'A vassal king\'s heir held at Vizima');
    say(state, `${king} of ${sideName(world, rid)} sends his heir to Vizima as a hostage for his kingdom's faith.`);
  } else if (kind === 'town') {
    const town = townFor(state, world, rid);
    setOwner(state, world, town, rid);
    settleOwnership(state, world);
    v.loyalty = clamp(v.loyalty + a.loyalty, 0, 100);
    say(state, `Temeria hands ${world.byId[town].name} back to ${sideName(world, rid)}.`);
    if (v.want?.kind === 'land') grant(state, world, rid, world.byId[town].name);
  }
}

// ---- The month ----

export function monthlyVassals(state, world, rng) {
  const c = V(world);
  if (!c || !state.realms) return;
  state.vassalNews ??= { warnings: [], nextId: 1 };
  for (const rid of Object.keys(state.realms)) {
    if (!living(state, rid) || !suzerainOf(state, rid)) continue;
    const lord = suzerainOf(state, rid);
    const v = vassalOf(state, world, rid);
    if (v.rebel) continue;
    // Loyalty drifts toward its target; ambition grows.
    const target = clamp(c.loyalty.base + (lord === TEMERIA ? (state.neighbours[rid]?.relation ?? 0) : affinity(state, world, rid, lord)) * c.loyalty.relationWeight
      - ((v.tributeMult ?? 1) - 1) * c.loyalty.tributeWeight - v.ambition * c.loyalty.ambitionWeight, 0, 100);
    v.loyalty = clamp(v.loyalty + (target - v.loyalty) * c.loyalty.drift, 0, 100);
    v.ambition = clamp(v.ambition + c.ambitionPerMonth, 0, 100);
    // An AI suzerain now and then honours its vassal, cooling his ambition.
    if (lord !== TEMERIA && rng.chance(c.aiHonours.chance)) v.ambition = clamp(v.ambition - c.aiHonours.ambition, 0, 100);
    // Tribute to his suzerain.
    const t = tributeOf(state, world, rid);
    if (t > 0) {
      state.realms[rid].treasury -= t;
      if (lord === TEMERIA) {
        state.treasury += t;
        state.ledger.vassals = (state.ledger.vassals ?? 0) + t;
      } else if (state.realms[lord]) state.realms[lord].treasury += t;
    }
    // He guards his own lands: a camp or lair there broken now and then.
    if (v.loyalty >= c.guardAbove && rng.chance(c.guardChance)) {
      const t2 = (state.threats?.list ?? []).find((x) => x.abroad === rid);
      if (t2) state.threats.list = state.threats.list.filter((x) => x !== t2);
    }
    // Protection owed: attacked, he expects his suzerain at his side.
    for (const foe of enemiesOf(state, rid)) {
      if (foe === lord) continue;
      const war = warBetween(state, rid, foe);
      v.owed ??= {};
      if (!war || v.owed[war.id]) continue;
      if (state.day - war.since < c.protection.graceDays) continue;
      v.owed[war.id] = true;
      if (hostile(state, lord, foe)) {
        v.loyalty = clamp(v.loyalty + c.protection.answered, 0, 100);
      } else {
        v.loyalty = clamp(v.loyalty + c.protection.ignored, 0, 100);
        for (const other of Object.keys(state.realms)) {
          if (other !== rid && suzerainOf(state, other) === lord && state.realms[other].vassal) state.realms[other].vassal.loyalty = clamp(state.realms[other].vassal.loyalty + c.protection.othersNotice, 0, 100);
        }
        if (lord === TEMERIA) addDispatch(state, `${sideName(world, rid)} was attacked by ${sideName(world, foe)}, and Temeria did not come. ${who(world, rid, true)} will not forget it; nor will our other vassals.`, 'abroad');
      }
    }
    // His want, once settled, and a war want granted by war itself.
    if (lord === TEMERIA) {
      if (!v.want && state.day >= (v.wantAfter ?? 0)) v.want = pickWant(state, world, rid, rng);
      else if (v.want?.kind === 'help' && hostile(state, TEMERIA, v.want.foe)) grant(state, world, rid, 'Temeria\'s swords against his foe');
      else if (v.want && state.day - v.want.since > c.wants.lapseDays) {
        v.want = null;
        v.wantAfter = state.day + c.wants.gap;
        v.ambition = clamp(v.ambition + c.wants.unmet, 0, 100);
      }
    }
    // Courted away by a rival great power.
    if (v.loyalty < c.court.below) {
      // A rival within reach, with room for another vassal.
      const rival = greatPowers(state, world).filter((p) => p !== lord && !hostile(state, p, rid) && p !== TEMERIA
        && roomFor(state, world, p) && distance(world, rid, p) <= world.diplomacy.suzerainty.ai.reach)
        .sort((a, b) => affinity(state, world, rid, b) - affinity(state, world, rid, a))[0];
      if (rival && rng.chance(c.court.chance)) {
        if (!v.courted) {
          v.courted = { by: rival, day: state.day };
          if (lord === TEMERIA) state.vassalNews.warnings.push({ id: state.vassalNews.nextId++, realm: rid, by: rival, day: state.day });
        } else if (state.day - v.courted.day >= c.court.warnDays && v.loyalty < c.court.below) {
          const from = lord;
          makeVassal(state, world, rid, rival, 'courted', c.court.loyalty);
          if (from === TEMERIA) addDispatch(state, `${sideName(world, rid)} goes over to ${sideName(world, rival)}. Its king took their gold and their promises.`, 'abroad');
          continue;
        }
      }
    } else if (v.courted && v.loyalty >= c.court.below + 10) v.courted = null;
    // Rebellion: disloyal and hungry, and no heir held at his suzerain's court.
    if (lord === TEMERIA && v.loyalty < c.revolt.below && v.ambition > c.revolt.ambitionAbove && (v.hostageUntil ?? 0) <= state.day && !atWar(state, TEMERIA) && rng.chance(c.revolt.chance)) {
      v.rebel = { since: state.day };
      startWar(state, world, rng, rid, TEMERIA, 'independence');
      addDispatch(state, `${who(world, rid, true)}${/^The ruler/.test(who(world, rid, true)) ? '' : ` of ${sideName(world, rid)}`} throws off Temeria's yoke and declares his kingdom free. It is war.`, 'abroad');
    }
  }
  state.vassalNews.warnings = state.vassalNews.warnings.filter((w) => state.day - w.day < c.court.warnDays && suzerainOf(state, w.realm) === TEMERIA);
}

// ---- Independence and its Judgement ----

// Each day: a rebel vassal whose capital has fallen to us is brought to
// judgement.
export function stepVassalsDay(state, world) {
  if (!V(world) || !state.realms) return;
  // A judgement left unspoken: the council sets a pliant heir.
  for (const j of [...(state.vassalJudgements ?? [])]) if (state.day - j.day >= V(world).judgement.days) judgeVassal(state, world, j.id, 0);
  for (const rid of Object.keys(state.realms)) {
    const v = state.realms[rid].vassal;
    if (!v?.rebel || suzerainOf(state, rid) !== TEMERIA) continue;
    const capital = world.realms.realms[rid]?.capital;
    const captured = (state.captives ?? []).some((c) => c.side === rid && c.by === TEMERIA && c.king);
    if ((capital && ownerOf(state, world, capital) === TEMERIA) || captured) {
      (state.vassalJudgements ??= []).push({ id: (state.nextVassalJudgementId = (state.nextVassalJudgementId ?? 0) + 1), realm: rid, day: state.day });
      v.rebel = null;
      v.captive = true;
      const war = warBetween(state, rid, TEMERIA);
      if (war) applyPeace(state, world, war, { towns: 'keep' });
      addDispatch(state, `${sideName(world, rid)}'s capital falls and ${who(world, rid)} is taken. He waits on Temeria's judgement.`, 'abroad');
    }
  }
}

export const VASSAL_JUDGEMENTS = ['depose', 'annex', 'pardon', 'execute'];

export function vassalJudgementEffects(state, world, j) {
  const c = V(world).judgement;
  const name = sideName(world, j.realm);
  return {
    depose: `Depose him and set a pliant heir: ${name} stays our vassal under a new king, loyal (${c.depose.loyalty}) and unambitious.`,
    annex: `Annex ${name} as crown land: its towns become Temeria's (to be won over in time), and its title passes to the crown for ever.`,
    pardon: `Pardon him: he returns grateful (loyalty ${c.pardon.loyalty}); our other vassals see a soft suzerain (their ambition +${c.pardon.othersAmbition}).`,
    execute: `Execute him: Fear at home +${c.execute.fear} and our other vassals fall into line, but every crown's trust in Temeria falls by ${-c.execute.trust} and the great powers grow wary of us.`,
  };
}

export function judgeVassal(state, world, id, choice) {
  const i = (state.vassalJudgements ?? []).findIndex((x) => x.id === id);
  if (i < 0) return false;
  const kind = VASSAL_JUDGEMENTS[choice];
  if (!kind) return false;
  const j = state.vassalJudgements.splice(i, 1)[0];
  const rid = j.realm;
  const c = V(world).judgement;
  const v = vassalOf(state, world, rid) ?? (state.realms[rid].vassal = {});
  v.captive = false;
  const others = ourVassals(state).filter((r) => r !== rid).map((r) => vassalOf(state, world, r));
  const name = sideName(world, rid);
  if (kind === 'depose') {
    Object.assign(v, { loyalty: c.depose.loyalty, ambition: c.depose.ambition, want: null, tributeMult: 1, courted: null });
    addDispatch(state, `${who(world, rid, true)} is deposed. A pliant heir takes the throne of ${name}, and swears himself Temeria's man.`, 'abroad');
  } else if (kind === 'annex') {
    const title = world.diplomacy.tiers?.titles?.[rid];
    for (const id2 of world.foreignByRealm[rid] ?? []) if (ownerOf(state, world, id2) === rid) setOwner(state, world, id2, TEMERIA);
    delete state.realms[rid].suzerain;
    delete state.realms[rid].vassal;
    settleOwnership(state, world);
    if (title) {
      state.titles ??= [];
      if (!state.titles.includes(title)) state.titles.push(title);
    }
    addDispatch(state, `${name} is annexed: its towns are Temeria's now, and the king of Temeria takes its crown${title ? ` as ${title}` : ''}.`, 'abroad');
  } else if (kind === 'pardon') {
    Object.assign(v, { loyalty: c.pardon.loyalty, ambition: Math.max(0, (v.ambition ?? 0) - 30), want: null });
    for (const o of others) o.ambition = clamp(o.ambition + c.pardon.othersAmbition, 0, 100);
    addDispatch(state, `Temeria pardons ${who(world, rid)}${/^the ruler/.test(who(world, rid)) ? '' : ` of ${name}`}. He kneels, grateful, and keeps his throne.`, 'abroad');
  } else {
    nudge(state, world, 'fear', c.execute.fear, 'A rebel vassal king beheaded');
    for (const o of others) {
      o.loyalty = clamp(o.loyalty + c.execute.othersLoyalty, 0, 100);
      o.ambition = clamp(o.ambition - c.execute.othersAmbition, 0, 100);
    }
    for (const r of Object.keys(state.realms)) if (r !== rid && living(state, r)) changeTrust(state, world, r, TEMERIA, c.execute.trust);
    // The great powers grow wary: fear of Temeria rises across the North.
    addFear(state, world, TEMERIA, world.realms.realms[rid].capital, c.execute.fearAbroad);
    Object.assign(v, { loyalty: c.execute.heirLoyalty, ambition: 5, want: null, tributeMult: 1, courted: null });
    addDispatch(state, `${who(world, rid, true)}${/^The ruler/.test(who(world, rid, true)) ? '' : ` of ${name}`} is beheaded at Vizima for his treason. Every court in the North takes note, and none kindly.`, 'abroad');
  }
  return true;
}

// Answering the warning that a vassal is being courted.
export function answerCourting(state, world, id, choice) {
  const list = state.vassalNews?.warnings ?? [];
  const w = list.find((x) => x.id === id);
  if (!w) return false;
  state.vassalNews.warnings = list.filter((x) => x !== w);
  const v = vassalOf(state, world, w.realm);
  const c = V(world).court;
  if (choice === 0 && state.treasury >= c.matchCoin) {
    state.treasury -= c.matchCoin;
    v.loyalty = clamp(v.loyalty + c.matchLoyalty, 0, 100);
    v.courted = null;
    addDispatch(state, `Temeria outbids ${sideName(world, w.by)} for ${sideName(world, w.realm)}'s faith.`, 'abroad');
  } else if (choice === 1) {
    v.loyalty = clamp(v.loyalty + c.warnLoyalty, 0, 100);
    v.hostageUntil = Math.max(v.hostageUntil ?? 0, state.day + c.warnHostageDays);
    nudge(state, world, 'fear', 2, 'A vassal warned');
    addDispatch(state, `Temeria warns ${who(world, w.realm)} what becomes of kings who change masters, and takes his heir to Vizima.`, 'abroad');
  }
  return true;
}

export { tierOf };

// The vassals' men in a muster (when the lords are called): his kingdom's
// companies, and his want of a command granted.
export function vassalMuster(state, world) {
  const out = {};
  for (const rid of ourVassals(state)) {
    const men = vassalRetinue(state, world, rid);
    if (men > 0) out[rid] = men;
  }
  return out;
}

export function vassalsCalled(state, world, called) {
  for (const rid of Object.keys(called)) {
    const v = vassalOf(state, world, rid);
    if (v?.want?.kind === 'command') grant(state, world, rid, 'a place beside the crown\'s army');
  }
}
