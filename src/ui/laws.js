import {
  opinionTargets, authority, onProgress, bookLaws, signed, lawEnactment, inkLeft, restLeft, canSignLaw, canRepeal, repealCost, lawOpinion,
} from '../sim/index.js';
import { escapeHtml, describeLevel } from './format.js';
import { icon } from './icons.js';
import { chips, orderAttr } from './card.js';
import { cooling } from './cooldown.js';
import { form } from './memory.js';

const MOOD_WORDS = ['Hostile', 'Resentful', 'Indifferent', 'Content', 'Devoted'];

// The Book of Laws (M26 A): how each group regards the crown, the ink still
// drying, then one chapter at a time as two columns, its rival paths side by
// side. A law signed carries a seal; one that cannot be signed yet is
// dimmed with the reason; tapping one that can shows what it will do, what
// it costs and who will cheer or grumble, and signs it after asking once.
export function lawsHtml(app) {
  const { world, state, memory } = app;
  if (!world.book) return '<p class="sub">No Book of Laws in this world.</p>';
  const f = form(memory, 'book', { chapter: 'order', open: null });
  const chapters = Object.entries(world.book.chapters);
  if (!world.book.chapters[f.chapter]) f.chapter = chapters[0][0];
  const ink = inkLeft(state);
  const taking = Object.keys(state.book?.signed ?? {}).filter((id) => lawEnactment(state, world, id) < 1);
  const status = [
    ink > 0 ? `<b data-part="ink">The ink is drying: ${ink} day${ink === 1 ? '' : 's'} before another law can be signed.</b>` : '<span data-part="ink">The ink is dry: a law may be signed.</span>',
    taking.length ? `${taking.length} law${taking.length === 1 ? '' : 's'} still taking hold.` : '',
    onProgress(state) ? 'The king is away on progress: no laws until he is home.' : '',
  ].filter(Boolean).join(' ');
  const tabs = `<div class="chips book-chapters" data-form="book">${chapters.map(([id, ch]) => {
    const n = Object.values(ch.paths).reduce((a, p) => a + p.laws.filter((l) => signed(state, l.id)).length, 0);
    return `<button type="button" class="chip${id === f.chapter ? ' on' : ''}" aria-pressed="${id === f.chapter}" data-set="chapter:${id}" data-chapter="${id}">${escapeHtml(ch.name)}${n ? ` <small>${n}</small>` : ''}</button>`;
  }).join('')}</div>`;
  const ch = world.book.chapters[f.chapter];
  const cols = Object.entries(ch.paths).map(([pid, p]) => pathHtml(app, f, pid, p)).join('');
  return `
    <div data-part="estates"><p class="status"><span>${status} Authority now ${Math.floor(authority(state, world))}.</span></p>${estatesHtml(world, state)}</div>
    ${tabs}
    <div data-part="book" class="book" data-form="book">${cols}</div>`;
}

function estatesHtml(world, state) {
  const target = opinionTargets(state, world);
  return chips(Object.entries(world.groups.groups).map(([g, info]) => {
    const v = state.opinion[g];
    const gap = target[g] - v;
    const trend = gap > 2 ? ' <small class="up">▲</small>' : gap < -2 ? ' <small class="down">▼</small>' : '';
    return { label: info.name, value: `${describeLevel(v, MOOD_WORDS)}${trend}`, tone: v < 30 ? 'bad' : v >= 60 ? 'good' : '' };
  }));
}

function pathHtml(app, f, pid, path) {
  const { state } = app;
  const depth = path.laws.filter((l) => signed(state, l.id)).length;
  return `<div class="book-path${depth ? ' taken' : ''}" data-path="${pid}">
    <h4>${escapeHtml(path.name)}${path.leans ? ` <small>(${escapeHtml(path.leans)})</small>` : ''}</h4>
    ${path.laws.map((law, i) => lawCard(app, f, law, i + 1)).join('')}
  </div>`;
}

const names = (world, gs) => gs.map((g) => world.groups.groups[g]?.name ?? g).join(', ');

function lawCard(app, f, law, tier) {
  const { world, state } = app;
  const isSigned = signed(state, law.id);
  const open = f.open === law.id;
  if (isSigned) {
    const k = lawEnactment(state, world, law.id);
    const choice = state.book.signed[law.id].choice;
    const repeal = canRepeal(state, world, law.id);
    const cost = repealCost(state, world, law.id);
    const costLine = `Love ${cost.love}${cost.fear ? `, Fear ${cost.fear}` : ''}, Unrest +${cost.unrest} at once${cost.angered.length ? `; ${names(world, cost.angered)} take it hard` : ''}.`;
    return `<div class="book-law signed" data-book-law="${law.id}">
      <span class="seal" aria-label="Signed">${icon('crown')}</span>
      <span class="bl-tier">${tier}</span><b>${escapeHtml(law.name)}</b>${choice ? ` <small>(${escapeHtml(world.groups.groups[choice]?.name ?? choice)})</small>` : ''}
      <p class="bl-head">${escapeHtml(law.headline)}</p>
      ${k < 1 ? `<p class="bl-taking">Taking hold: ${Math.round(k * 100)}%</p>` : ''}
      ${cooling(`<button type="button" class="act danger small" data-repeal="${law.id}" ${repeal.ok ? orderAttr({ type: 'repeal', law: law.id }, `Repeal ${law.name}? ${costLine}`, { final: true }) : 'disabled'}>
        <span class="act-label">Repeal</span><span class="act-sub">${escapeHtml(repeal.ok ? costLine : repeal.reason)}</span></button>`, restLeft(state, world, law.id), world.book.lawCooldown, false)}
    </div>`;
  }
  const check = canSignLaw(state, world, law.id, law.choose === 'faith' ? world.book.faiths[0] : null);
  if (check.locked) {
    return `<div class="book-law locked" data-book-law="${law.id}" aria-disabled="true">
      <span class="bl-tier">${tier}</span><b>${escapeHtml(law.name)}</b>
      <p class="bl-head">${escapeHtml(law.headline)}</p>
      <p class="bl-why">${icon('lock')} ${escapeHtml(check.reason)}</p></div>`;
  }
  const head = `<button type="button" class="book-law open-able${open ? ' open' : ''}" data-book-law="${law.id}" data-set="open:${open ? 'null' : law.id}">
    <span class="bl-tier">${tier}</span><b>${escapeHtml(law.name)}</b>
    <span class="bl-head">${escapeHtml(law.headline)}</span></button>`;
  if (!open) return head;
  const opinion = lawOpinion(world, law.id, law.choose === 'faith' ? null : null);
  const cheer = Object.entries(opinion).filter(([, v]) => v > 0).map(([g]) => g);
  const grumble = Object.entries(opinion).filter(([, v]) => v < 0).map(([g]) => g);
  const meters = Object.entries(law.meters ?? {}).filter(([, v]) => v).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v > 0 ? '+' : ''}${v}`).join(', ');
  const cost = `${law.cost ? `${law.cost} crowns` : 'No coin'}; needs Authority ${law.authority}`;
  const signs = law.choose === 'faith'
    ? world.book.faiths.map((fid) => signButton(state, world, law, fid, `Sign for ${world.groups.groups[fid]?.name ?? fid}`)).join('')
    : signButton(state, world, law, null, 'Sign it into the Book');
  return `<div class="book-law detail" data-book-law="${law.id}">
    <button type="button" class="bl-close" data-set="open:null" aria-label="Close">${icon('up')}</button>
    <span class="bl-tier">${tier}</span><b>${escapeHtml(law.name)}</b>
    <p class="bl-head">${escapeHtml(law.headline)}</p>
    <p class="sub">${escapeHtml(law.blurb)}</p>
    <p class="build-cost">${escapeHtml(cost)}.${meters ? ` At once: ${escapeHtml(meters)}.` : ''}</p>
    ${cheer.length ? `<p class="mood-good">Cheered by ${escapeHtml(names(world, cheer))}.</p>` : ''}
    ${grumble.length ? `<p class="mood-bad">Grumbled at by ${escapeHtml(names(world, grumble))}.</p>` : ''}
    ${law.choose === 'faith' ? '<p class="sub">Choose the faith the crown takes for its own.</p>' : ''}
    ${signs}
  </div>`;
}

function signButton(state, world, law, choice, label) {
  const check = canSignLaw(state, world, law.id, choice);
  const action = { type: 'sign', law: law.id, ...(choice ? { choice } : {}) };
  // The ink and the law's own rest, whichever is longer, ring the button.
  const ink = inkLeft(state);
  const rest = restLeft(state, world, law.id);
  const [left, total] = ink >= rest ? [ink, world.book.inkDays] : [rest, world.book.lawCooldown];
  return cooling(`<button type="button" class="act primary" data-sign="${law.id}${choice ? `:${choice}` : ''}" ${check.ok ? orderAttr(action, `Sign ${law.name} into the Book of Laws?`, { final: true }) : 'disabled'}>
    <span class="act-label">${escapeHtml(label)}</span><span class="act-sub">${escapeHtml(check.ok ? law.headline : check.reason)}</span></button>`, left, total, check.ok);
}
