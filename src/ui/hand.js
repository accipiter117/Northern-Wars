// The Crown's hand (M34 B): every act the crown can take that has a cost or
// a rest, in one list. Ready ones float to the top with a gold dot; resting
// ones wear their ring and the days left. The top bar's hand button counts
// the ready ones. Acts that need a town go to the town where they matter
// most; a town's own card still offers that town's acts.
import {
  canAct, actRest, ACT_NAMES, threatUnrest, canFaithAct, faithRest, faithLevel, crownFaith,
  canCall, OPERATIONS, opTargets, exposureOf, canOperate, closedSeams, sideName,
} from '../sim/index.js';
import { orderAttr } from './card.js';
import { cooling } from './cooldown.js';
import { escapeHtml, number } from './format.js';
import { townFor } from './faith.js';

export const HAND_GROUPS = [
  ['people', 'The people'],
  ['faith', 'Faith'],
  ['book', 'The Book'],
  ['spies', 'Spies'],
  ['realm', 'The realm'],
];

// The kinds of act the hand gathers, for the audit (M34 E): every act with
// a rest belongs here.
export const HAND_KINDS = {
  people: ['feast', 'progress', 'hang', 'gibbets', 'pardon'],
  book: ['granaries', 'mage', 'witchhunt'],
  calls: ['harvest', 'levy'],
};

const live = (state) => Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier);

// Where a town act matters most.
function townForAct(state, world, kind) {
  const towns = live(state);
  if (kind === 'hang' || kind === 'pardon') return [...towns].sort((a, b) => state.settlements[b].unrest - state.settlements[a].unrest)[0];
  if (kind === 'gibbets') return [...towns].sort((a, b) => threatUnrest(state, world, b) - threatUnrest(state, world, a))[0];
  if (kind === 'granaries') return [...towns].sort((a, b) => (state.settlements[b].hunger ?? 0) - (state.settlements[a].hunger ?? 0))[0];
  return towns.find((id) => canAct(state, world, kind, id).ok) ?? towns[0];
}

function actLine(world, kind) {
  const a = world.meters.acts[kind];
  return {
    feast: `${number(a.coin)} crowns. Love +${a.love}, and the lords pleased.`,
    progress: `${number(a.coin)} crowns, a month away from court. Love and calm in the ${a.towns} greatest towns.`,
    hang: `Fear +${a.fear}, the town quiet, Love ${a.love}.`,
    gibbets: `${number(a.coin)} crowns. Fear each month they stand; the roads calmer.`,
    pardon: `The town's unrest ${a.unrest}, Love +${a.love}.`,
    granaries: `${number(a.coin)} crowns. No one there goes hungry.`,
    mage: `${number(a.coin)} crowns. Ends plague there, or the nearest beast lair.`,
    witchhunt: `${number(a.coin)} crowns. Clears the Scoia'tael from the district; Fear +${a.fear}.`,
  }[kind];
}

// Every row the hand holds now: those ready, and those resting. Acts not
// yet possible (a law unsigned, nothing to strike) stay off it.
export function handRows(app) {
  const { state, world } = app;
  const rows = [];
  const push = (r) => { if (r.ready || r.left > 0) rows.push(r); };
  // The people and the Book: the acts of the Love and Fear cards, and those
  // the Book of Laws unlocks.
  for (const [group, kinds] of [['people', HAND_KINDS.people], ['book', HAND_KINDS.book]]) {
    for (const kind of kinds) {
      if (!world.meters?.acts?.[kind]) continue;
      const atTown = !['feast', 'progress'].includes(kind);
      const town = atTown ? townForAct(state, world, kind) : null;
      const check = canAct(state, world, kind, town);
      if (check.locked) continue;
      const rest = actRest(state, world, kind, town);
      push({
        group, key: `act:${kind}`, name: `${ACT_NAMES[kind]}${town ? ` at ${world.byId[town].name}` : ''}`, line: actLine(world, kind),
        ready: check.ok, left: rest.left, total: rest.total, reason: check.reason,
        action: { type: 'act', kind, ...(town ? { settlement: town } : {}) },
      });
    }
  }
  // Faith: the powers each faith has opened, and the acts that develop the
  // crown's own faith (or the strongest, if the crown has none).
  const dev = world.devotion;
  if (dev && state.faiths) {
    const strongest = Object.keys(dev.faiths).sort((a, b) => (state.faiths.devotion[b] ?? 0) - (state.faiths.devotion[a] ?? 0))[0];
    const tended = crownFaith(state) ?? strongest;
    for (const [f, fa] of Object.entries(dev.faiths)) {
      const kinds = Object.entries(fa.powers ?? {}).filter(([, pw]) => faithLevel(state, world, f) >= pw.level).map(([k]) => k);
      if (f === tended) kinds.push('endow', 'preachers', 'festival', 'pilgrimage');
      for (const kind of kinds) {
        const def = fa.powers?.[kind] ?? dev.acts[kind];
        const needsTown = ['endow', 'preachers', 'purge', 'circle', 'healers', 'order'].includes(kind);
        const town = needsTown ? townFor(app, kind, f) : null;
        if (needsTown && !town) continue;
        const check = canFaithAct(state, world, kind, f, town);
        const left = faithRest(state, world, kind, f);
        const name = kind === 'festival' ? `Keep ${fa.festival.name}` : kind === 'pilgrimage' ? `Pilgrimage to ${fa.holy.name}` : `${def.name}${['endow', 'preachers'].includes(kind) ? ` (${fa.short})` : ''}`;
        push({
          group: 'faith', key: `faith:${kind}:${f}`, name: `${name}${town ? ` at ${world.byId[town].name}` : ''}`,
          line: `${def.coin ? `${number(def.coin)} crowns. ` : ''}${def.text ?? ''}`, ready: check.ok, left, total: def.cooldown ?? 0, reason: check.reason,
          action: { type: 'faith', kind, faith: f, ...(town ? { settlement: town } : {}) },
        });
      }
    }
  }
  // Spies: the deepest work each network allows, realm by realm.
  const ops = world.spies?.operations;
  if (ops && state.spycraft) {
    for (const rid of Object.keys(state.realms ?? {})) {
      const d = state.spycraft.nets?.temeria?.[rid] ?? 0;
      const kind = [...OPERATIONS].reverse().find((k) => d >= ops.kinds[k].at && opTargets(state, world, rid, k).length);
      if (!kind) continue;
      const t = opTargets(state, world, rid, kind)[0];
      const check = canOperate(state, world, rid, kind, t.id);
      const left = Math.max(0, (state.spycraft.cooldown?.[rid] ?? 0) - state.day);
      push({
        group: 'spies', key: `spy:${rid}`, name: `${OP_NAMES[kind]} in ${sideName(world, rid)}: ${t.label.toLowerCase()}`,
        line: `${number(ops.kinds[kind].coin)} crowns, ${Math.round(exposureOf(state, world, rid, kind) * 100)}% risk. ${t.line}`,
        ready: check.ok, left, total: ops.cooldown, reason: check.reason, final: true,
        action: { type: 'spyOp', realm: rid, kind, target: t.id },
      });
    }
  }
  // The realm: the royal calls, and old gold workings to reopen.
  for (const call of HAND_KINDS.calls) {
    const c = world.labour?.calls?.[call];
    if (!c) continue;
    const check = canCall(state, world, call);
    const left = Math.max(0, (state.labour?.calls?.[call]?.until ?? 0) - state.day);
    if (!check.ok && left === 0) continue;
    push({ group: 'realm', key: `call:${call}`, name: c.name, line: `${c.coin ? `${number(c.coin)} crowns. ` : ''}${c.blurb ?? c.text ?? ''}`, ready: check.ok, left, total: c.days ?? 0, reason: check.reason, action: { type: 'call', call } });
  }
  // The two richest; the Mines screen holds the rest.
  for (const m of closedSeams(state, world).sort((x, y) => y.monthly - x.monthly).slice(0, 2)) {
    push({ group: 'realm', key: `seam:${m.settlement}`, name: `Reopen ${m.name.replace(/^The /, 'the ')}`, line: `About ${number(m.coin)} crowns and two months, then about ${number(m.monthly)} crowns a month.`, ready: true, left: 0, total: 0, action: { type: 'repair', settlement: m.settlement, building: 'goldmine', kind: 'rebuild' } });
  }
  return rows;
}

const OP_NAMES = { bribe: 'Bribe', stir: 'Stir a rising', sabotage: 'Sabotage', assassinate: 'Assassinate' };

export function readyCount(app) {
  return handRows(app).filter((r) => r.ready).length;
}

export function handHtml(app) {
  const rows = handRows(app);
  if (!rows.length) return '<div data-part="hand"><p class="sub">Nothing the crown can do now has a cost or a rest. The Book of Laws and the faiths open more.</p></div>';
  const ready = rows.filter((r) => r.ready).length;
  const groups = HAND_GROUPS.map(([g, label]) => {
    const list = rows.filter((r) => r.group === g).sort((a, b) => Number(b.ready) - Number(a.ready) || a.left - b.left);
    if (!list.length) return '';
    return `<div data-part="hand-${g}"><h3>${escapeHtml(label)}</h3><div class="build-list">${list.map(rowHtml).join('')}</div></div>`;
  }).join('');
  return `<div data-part="hand"><p class="sub">${ready ? `${ready} ready now` : 'Nothing ready now'}; the rest are resting, each with the days left on its ring.</p>${groups}</div>`;
}

function rowHtml(r) {
  const btn = `<button type="button" class="build${r.ready ? ' hand-ready' : ''}" data-hand="${escapeHtml(r.key)}" ${orderAttr(r.action, `${r.name}?`, { final: !!r.final })} ${r.ready ? '' : 'disabled'}>
    <span class="build-name">${escapeHtml(r.name)}</span>
    <span class="build-cost">${escapeHtml(r.ready ? r.line : (r.left > 0 ? `Ready in ${r.left} day${r.left === 1 ? '' : 's'}. ${r.line}` : r.reason ?? r.line))}</span></button>`;
  return cooling(btn, r.left, r.total, r.ready);
}
