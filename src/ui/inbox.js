// Every decision waiting on the crown, in one list: war first, then by how
// little time is left. None of them opens by itself over what the player is
// doing; each is answered where it stands in the list. The few that cannot
// wait (war declared on Temeria, a siege, a rebellion, a deposition) also
// raise a banner across the top.
import {
  TEMERIA, eventText, demandText, envoyText, petitionText, warDecisionText, sideName, hostile, requestText, rulerShort,
} from '../sim/index.js';
import { escapeHtml } from './format.js';
import { orderAttr } from './card.js';

const defaultOf = (list) => Math.max(0, list.findIndex((c) => c.default));

// The decisions waiting now, most pressing first. `acked` is how many
// depositions the player has already seen through.
export function pendingDecisions(state, world, acked = Infinity) {
  const out = [];
  const left = (since, wait) => Math.max(0, wait - (state.day - since));
  if (state.depositions.length > acked) {
    out.push({ key: 'deposition', kind: 'deposition', urgent: true, daysLeft: null, kicker: 'The end of a reign', title: 'The crown is deposed' });
  }
  for (const d of state.warDecisions ?? []) {
    const t = warDecisionText(state, world, d);
    out.push({
      key: `warDecision:${d.id}`, kind: 'warDecision', id: d.id, urgent: d.kind === 'declared', daysLeft: left(d.day, world.war.peace.offerDefaultDays),
      kicker: t.kicker, title: t.title, text: t.text, choices: t.choices, fallback: d.kind === 'call' ? 1 : 0,
    });
  }
  for (const p of state.events ?? []) {
    const t = eventText(world, p);
    out.push({ key: `event:${p.id}`, kind: 'event', id: p.id, daysLeft: left(p.day, world.military.eventDefaultDays), kicker: `News from ${t.place}`, ...t, fallback: defaultOf(world.events.events[p.event].choices) });
  }
  for (const p of state.demands ?? []) {
    const t = demandText(world, p);
    out.push({ key: `demand:${p.id}`, kind: 'demand', id: p.id, house: p.house, daysLeft: left(p.day, world.houses.demandDefaultDays), kicker: `A demand from ${t.house}`, ...t, fallback: defaultOf(world.demands.demands[p.demand].choices) });
  }
  for (const p of state.envoys ?? []) {
    const t = envoyText(world, p);
    out.push({ key: `envoy:${p.id}`, kind: 'envoy', id: p.id, realm: p.realm, daysLeft: left(p.day, world.neighbours.envoyDefaultDays), kicker: `An envoy from ${world.geography.neighbours[p.realm].name}`, ...t, fallback: defaultOf(world.envoys.envoys[p.envoy].choices) });
  }
  // Rulers asking for an audience, with a proposal, a demand or a warning.
  for (const q of state.diplomacy?.requests ?? []) {
    const t = requestText(state, world, q);
    out.push({
      key: `request:${q.id}`, kind: 'request', id: q.id, realm: q.realm, deal: q.kind === 'deal' ? q.items : null, daysLeft: left(q.day, world.diplomacy.requests.expireDays),
      kicker: `${rulerShort(world, q.realm)} of ${world.geography.neighbours[q.realm].name} asks an audience`, ...t, fallback: 1,
    });
  }
  for (const p of state.petitions ?? []) {
    const t = petitionText(world, p);
    out.push({ key: `petition:${p.id}`, kind: 'petition', id: p.id, daysLeft: left(p.day, world.culture.petitionDefaultDays), kicker: `A petition from ${t.place}`, ...t, fallback: defaultOf(world.petitions.petitions[p.petition].choices) });
  }
  return out.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (a.daysLeft ?? -1) - (b.daysLeft ?? -1));
}

// One decision, answerable in place.
export function decisionHtml(d, { compact = false } = {}) {
  let choices;
  let text = d.text ?? '';
  if (d.kind === 'deposition') {
    text = 'The great houses met at Vizima and agreed, for once, on one thing. A regency council already holds the crown.';
    choices = `<button type="button" data-regency><b>Continue under a regency</b><br><small>The realm stays as it is. The council restores some Authority.</small></button>
      <button type="button" class="danger" data-new-reign><b>Start a new reign</b><br><small>A fresh Temeria.</small></button>
      <button type="button" data-go="deposition">The reign in full</button>`;
  } else {
    choices = d.choices.map((label, i) => `<button type="button" data-choice="${i}" ${orderAttr({ type: d.kind, id: d.id, choice: i })}>${escapeHtml(label)}${i === d.fallback ? ' <small>(taken if unanswered)</small>' : ''}</button>`).join('');
    // A ruler's proposal can be bargained over at the deal table.
    if (d.kind === 'request') choices += `<button type="button" data-audience="${d.realm}"${d.deal ? ` data-audience-deal='${escapeHtml(JSON.stringify(d.deal))}'` : ''}>${d.deal ? 'Hear them out' : 'Grant an audience'}</button>`;
  }
  const soon = d.daysLeft !== null && d.daysLeft <= 5;
  const left = d.daysLeft === null ? '' : `<span class="left${soon ? ' soon' : ''}">${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left</span>`;
  return `<div class="decision${d.urgent ? ' urgent-dec' : ''}" data-decision="${d.key}">
    <div class="decision-top"><span class="envoy-from">${escapeHtml(d.kicker)}</span>${left}</div>
    <h4>${escapeHtml(d.title)}</h4>
    ${compact ? '' : `<p>${escapeHtml(text)}</p>`}
    <div class="choices">${choices}</div>
  </div>`;
}

export function inboxHtml(list, { empty = 'Nothing waits on the crown.' } = {}) {
  if (!list.length) return `<div data-part="inbox"><p class="sub">${empty}</p></div>`;
  return `<div data-part="inbox-note"><p class="sub">Unanswered, each takes the choice marked when its time runs out.</p></div>
    ${list.map((d) => `<div data-part="dec-${d.key}">${decisionHtml(d)}</div>`).join('')}`;
}

// What deserves a banner across the top: things that cannot wait.
export function urgentItems(state, world, acked) {
  const out = [];
  if (state.depositions.length > acked) out.push({ key: `deposed:${state.depositions.length}`, text: 'The crown is deposed. A regency council holds Vizima.', go: 'inbox' });
  for (const d of state.warDecisions ?? []) {
    if (d.kind === 'declared') out.push({ key: `declared:${d.id}`, text: `${warDecisionText(state, world, d).title}. Answer at court.`, go: 'inbox' });
  }
  for (const a of state.armies ?? []) {
    const s = a.siege && state.settlements[a.at];
    if (s && !s.occupier && a.side !== TEMERIA && hostile(state, TEMERIA, a.side)) {
      out.push({ key: `siege:${a.id}:${a.at}`, text: `${world.byId[a.at].name} is besieged by ${sideName(world, a.side)}.`, go: `town:${a.at}` });
    }
  }
  for (const [id, h] of Object.entries(state.houses ?? {})) {
    if (h.rebel) out.push({ key: `rebel:${id}:${h.rebel.since}`, text: `${world.houses.houses[id].name} is in open rebellion.`, go: `house:${id}` });
  }
  return out;
}
