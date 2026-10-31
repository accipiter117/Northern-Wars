// What the faiths and the Book show on the map close up (M26 E): a pure
// list of marks the renderer draws, so which marks stand is tested in Node.
// Each mark names a place (and for things on the road, where it is bound
// and how far along it is, 0 to 1).
import { signed } from './book.js';
import { faithLevel } from './faiths.js';
import { dateOf } from './calendar.js';

const HOSPICE_SHARE = 40;
const GROVE_SHARE = 35;

export function faithMarks(state, world) {
  const out = [];
  const F = state.faiths;
  const cfg = world.devotion;
  const capital = world.kingdom.capital;
  const ours = Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier && world.byId[id]);
  const firstRoad = (id) => world.adjacency[id]?.[0]?.to ?? null;

  if (F && cfg) {
    // A purge's pyres smoulder for some days in the square.
    if ((F.pyre?.until ?? 0) > state.day && world.byId[F.pyre.town]) out.push({ kind: 'pyre', place: F.pyre.town });
    // Sacred groves where the Old Ways hold the people; stone circles once
    // the druids have their power.
    const oldLv = faithLevel(state, world, 'old_ways');
    if (oldLv >= 1) {
      for (const id of ours) {
        if ((state.settlements[id].faith?.old_ways ?? 0) >= GROVE_SHARE) out.push({ kind: 'grove', place: id, stones: oldLv >= 3 });
      }
    }
    // Melitele's banners over her hospices, and over every town where most
    // follow her once her hospices are a perk (level 2) or a law.
    const meliteleLv = faithLevel(state, world, 'melitele');
    const hospiceLaw = signed(state, 'hospices');
    for (const id of ours) {
      const s = state.settlements[id];
      const big = ['town', 'city', 'temple'].includes(world.byId[id].type);
      if (s.buildings?.includes('hospice') || (big && (hospiceLaw || meliteleLv >= 2) && (s.faith?.melitele ?? 0) >= HOSPICE_SHARE)) {
        out.push({ kind: 'hospice', place: id });
      }
    }
    // A festival kept this year walks in procession while its season lasts.
    const date = dateOf(state.day);
    for (const [f, fa] of Object.entries(cfg.faiths)) {
      if (F.festivals?.[f] !== date.year || !fa.festival.months.includes(date.month)) continue;
      for (const id of [capital, fa.holy.place]) {
        if (world.byId[id] && firstRoad(id)) out.push({ kind: 'procession', place: id, toward: firstRoad(id), faith: f, t: 0.35 });
      }
    }
    // The king's train on the road to the holy place and home again.
    const p = F.pilgrimage;
    const days = cfg.acts.pilgrimage.days;
    if (p && p.until > state.day && world.byId[p.place]) {
      const done = 1 - (p.until - state.day) / days;
      const out2 = done < 0.5;
      out.push({ kind: 'pilgrims', place: out2 ? capital : p.place, toward: out2 ? p.place : capital, faith: p.faith, t: Math.min(1, (out2 ? done : done - 0.5) * 2) });
    }
  }

  // The Book on the map: the king's riders on the roads round the towns,
  // and gibbets standing at the capital's crossroads under public
  // executions.
  if (state.book) {
    if (signed(state, 'riders')) {
      for (const id of ours) {
        if (!['town', 'city'].includes(world.byId[id].type)) continue;
        // Each town's riders go out and back along its roads over a fortnight.
        const roads = world.adjacency[id] ?? [];
        roads.slice(0, 2).forEach((e, i) => {
          const phase = ((state.day + i * 7 + id.length * 3) % 14) / 14;
          out.push({ kind: 'riders', place: id, toward: e.to, t: 0.15 + 0.5 * (phase < 0.5 ? phase * 2 : 2 - phase * 2) });
        });
      }
    }
    if (signed(state, 'executions') && world.byId[capital]) out.push({ kind: 'gibbets', place: capital });
  }
  return out;
}
