// What a long press on the map offers. A town of ours: a ring of quick
// actions (Works, Recruit, Garrison, Trade route, Open card). A crown
// company or army: its orders. A threat: send the nearest suitable company.
// Anything foreign: what is known of it. Open land: what is here.
import {
  TEMERIA, describeArmy, describeUnit, groundAt, threatLevel, routeEndOk, bestCompanyFor, sideName, ownerOf, threatPos,
} from '../sim/index.js';
import { pointInPolygon } from '../sim/geometry.js';
import { escapeHtml, number, describeLevel } from './format.js';
import { threatLabel } from './forces.js';

const GROUND = { open: 'Open country', forest: 'Woodland', marsh: 'Marsh', hills: 'Hills', mountains: 'Mountains' };
const DANGER = ['Safe', 'Watchful', 'Dangerous', 'Perilous', 'Lawless'];

// The named stretch of country under a point, if any.
function zoneAt(world, x, y) {
  for (const [kind, zones] of Object.entries(world.geography.terrain)) {
    const z = zones.find((v) => pointInPolygon(x, y, v.shape));
    if (z) return { kind, name: z.name };
  }
  return null;
}

export function realmAt(world, x, y) {
  const g = world.geography;
  if (pointInPolygon(x, y, g.temeria)) return { id: TEMERIA, name: world.kingdom.name };
  for (const [id, n] of Object.entries(g.neighbours)) {
    if (n.shapes.some((sh) => pointInPolygon(x, y, sh))) return { id, name: n.name };
  }
  for (const [id, n] of Object.entries(g.lands ?? {})) {
    if (n.shapes.some((sh) => pointInPolygon(x, y, sh))) return { id, name: n.name, beyond: true };
  }
  return null;
}

// "What's here": the ground, whose land it is, the nearest place and how
// dangerous the country round it is.
export function whatsHere(world, state, x, y) {
  const realm = realmAt(world, x, y);
  const zone = zoneAt(world, x, y);
  const ground = zone ? `${GROUND[zone.kind] ?? zone.kind}: ${zone.name}` : GROUND[groundAt(world, x, y)] ?? 'Open country';
  const lines = [];
  if (!realm) return { title: 'Open water', lines: ['No realm holds it. Only boats come here.'] };
  lines.push(`${escapeHtml(ground)}, in ${escapeHtml(realm.name)}${realm.beyond ? ' (beyond our dealings for now)' : ''}.`);
  let near = null;
  for (const st of [...world.geography.settlements, ...(world.foreign ?? [])]) {
    const d = Math.hypot(st.x - x, st.y - y);
    if (!near || d < near.d) near = { id: st.id, d };
  }
  if (near) lines.push(`${Math.round(near.d)} miles from ${escapeHtml(world.byId[near.id].name)}.`);
  if (near && state.settlements[near.id] && !state.settlements[near.id].occupier) {
    const b = threatLevel(state, world, near.id, 'bandits');
    const m = threatLevel(state, world, near.id, 'monsters');
    lines.push(`Bandits: ${describeLevel(b, DANGER).toLowerCase()}. Beasts: ${describeLevel(m, DANGER).toLowerCase()}.`);
  }
  const close = (state.threats?.list ?? []).filter((t) => (t.sighted || t.campSeen) && Math.hypot(threatPos(t).x - x, threatPos(t).y - y) < 40);
  if (close.length) lines.push(`Sighted near: ${close.map((t) => escapeHtml(threatLabel(world, t))).join(', ')}.`);
  return { title: 'What’s here', lines };
}

// Build the answer to a long press at canvas point (x, y). `ctx` carries
// what the map needs: the renderer's pick, navigation and orders.
export function longPress(app, ctx, x, y) {
  const { world, state } = app;
  const hit = ctx.pick(x, y);
  const page = ctx.toPage(x, y);
  const name = (id) => world.byId[id]?.name ?? id;

  if (hit?.settlement && state.settlements[hit.settlement] && !state.settlements[hit.settlement].occupier) {
    const id = hit.settlement;
    const list = [
      { label: 'Works', icon: 'hammer', run: () => ctx.openTown(id, 'works') },
      { label: 'Recruit', icon: 'sword', run: () => ctx.openTown(id, 'military', 'recruit') },
      { label: 'Garrison', icon: 'shield', run: () => ctx.openTown(id, 'military') },
    ];
    if (world.trade && routeEndOk(state, world, id).ok) list.push({ label: 'Trade route', icon: 'scroll', run: () => app.startPick({ kind: 'route', from: id }) });
    list.push({ label: 'Open card', icon: 'castle', run: () => ctx.openTown(id) });
    return ctx.ring(x, y, name(id), list);
  }
  if (hit?.company) {
    const c = state.forces.companies.find((v) => v.id === hit.company);
    if (!c) return null;
    if (c.army) return ctx.ring(x, y, c.name, [{ label: 'Open card', icon: 'castle', run: () => app.nav.push(`company:${c.id}`) }]);
    const order = (kind) => () => app.startPick({ kind, company: c.id });
    const list = [
      { label: 'Station', icon: 'castle', run: order('station') },
      { label: 'Patrol', icon: 'realm', run: order('patrol') },
      { label: 'Escort', icon: 'scroll', run: () => app.nav.push(`company:${c.id}`) },
      { label: 'Hunt', icon: 'target', run: order('hunt') },
      { label: 'Respond', icon: 'shield', run: () => app.order({ type: 'company', id: c.id, order: { kind: 'respond', radius: c.order.radius ?? world.forces.respond.default } }) },
    ];
    return ctx.ring(x, y, c.name, list);
  }
  if (hit?.threat) {
    const t = state.threats.list.find((v) => v.id === hit.threat);
    if (!t) return null;
    const best = bestCompanyFor(state, world, t);
    const list = [{ label: 'Open card', icon: 'target', run: () => app.nav.push(`threat:${t.id}`) }];
    if (best) list.unshift({ label: 'Send nearest', icon: 'sword', run: () => app.sendNearest(t.id) });
    return ctx.ring(x, y, threatLabel(world, t), list);
  }
  if (hit?.army) {
    const a = state.armies.find((v) => v.id === hit.army);
    if (!a) return null;
    if (a.side === TEMERIA) {
      return ctx.ring(x, y, a.name, [
        { label: 'Hold', icon: 'castle', run: () => app.startPick({ kind: 'hold', army: a.id }) },
        { label: 'Besiege', icon: 'target', run: () => app.startPick({ kind: 'siege', army: a.id }) },
        { label: 'Open card', icon: 'sword', run: () => app.nav.push(`army:${a.id}`) },
      ]);
    }
    return ctx.peek(page.x, page.y, escapeHtml(a.name), `<p>${escapeHtml(describeArmy(state, world, a))}.</p><p class="sub">${escapeHtml(sideName(world, a.side))}.</p>`);
  }
  if (hit?.foreign || (hit?.settlement && state.settlements[hit.settlement]?.occupier)) {
    const id = hit.foreign ?? hit.settlement;
    // A ruler's seat: an audience is one touch away.
    const seatOf = Object.entries(world.realms?.realms ?? {}).find(([, r]) => r.capital === id)?.[0];
    if (seatOf && world.diplomacy?.rulers[seatOf] && ownerOf(state, world, id) === seatOf) {
      return ctx.ring(x, y, world.byId[id].name, [
        { label: 'Audience', icon: 'crown', run: () => app.audience(seatOf) },
        { label: 'Open card', icon: 'scroll', run: () => app.nav.push(`foreign:${id}`) },
        { label: 'Realm', icon: 'dove', run: () => app.nav.push(`realm:${seatOf}`) },
      ]);
    }
    const view = app.foreignView(id) ?? (state.settlements[id] && { visible: true, population: 0 });
    const st = world.byId[id];
    if (!view) {
      return ctx.peek(page.x, page.y, escapeHtml(st.name), `<p>${escapeHtml(sideName(world, ownerOf(state, world, id)))}. Our watchers have never seen it.</p>`);
    }
    const known = view.population ? `<p>About ${number(view.population)} people${view.garrison ? `, about ${number(view.garrison)} soldiers` : ''}.</p>` : '';
    return ctx.peek(page.x, page.y, escapeHtml(st.name), `<p>${escapeHtml(sideName(world, ownerOf(state, world, id)))}. ${view.visible ? 'In sight now.' : 'As last seen.'}</p>${known}`,
      [{ label: 'Open card', run: () => app.nav.push(state.settlements[id] ? `town:${id}` : `foreign:${id}`) }]);
  }
  if (hit?.distant) {
    const t = world.distantTowns.find((v) => v.id === hit.distant);
    if (t) return ctx.peek(page.x, page.y, escapeHtml(t.name), `<p>A ${t.type} of ${escapeHtml(world.lands[t.land]?.name ?? t.land)}, beyond the realms the crown deals with. Our maps show where it stands; no more.</p>`);
  }
  if (hit?.unit) {
    const u = state.ambient.units.find((v) => v.id === hit.unit);
    if (u) return ctx.peek(page.x, page.y, 'On the road', `<p>${escapeHtml(describeUnit(world, u))}</p>`);
  }
  const w = ctx.toWorld(x, y);
  const here = whatsHere(world, state, w.x, w.y);
  return ctx.peek(page.x, page.y, here.title, here.lines.map((l) => `<p>${l}</p>`).join(''));
}
