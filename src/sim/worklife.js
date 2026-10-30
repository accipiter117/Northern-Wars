// Life at the works (M22 B): what the map shows working at each of a place's
// works, read from the realm and never written back. Each works shows a few
// figures by its kind, more when it is fully manned and fewer when short of
// hands; the fields follow the seasons (ploughing, tending, harvesting, and
// empty in winter); the water closes in winter and in storms; a damaged works
// shows no one, only a scorch mark, and one under repair shows its builders.
import { dateOf } from './calendar.js';
import { spacesOf } from './works.js';
import { kindOfWorks } from './labour.js';

const ACT = { woods: 'fell', mines: 'dig', pastures: 'herd', fishing: 'boat' };

// For one of our places: { [works]: { kind, activity, figures, scorched, builders } },
// with `fields` for the farmland round it.
export function worksLife(state, world, id) {
  const cfg = world.labour?.life;
  const s = state.settlements[id];
  if (!cfg || !s || s.occupier) return {};
  const month = dateOf(state.day).month;
  const closed = cfg.waterClosed.includes(month) || (state.labour?.closed ?? 0) > state.day;
  const out = {};
  const manned = (staff) => Math.min(1.5, Math.max(0, (staff ?? 100) / 100));
  for (const sp of spacesOf(state, world, id)) {
    for (const w of sp.works) {
      const kind = kindOfWorks(world, w.b);
      // The mill grinds out of sight; the fields are the farmland below.
      if (!kind || !(kind in cfg.figures) || w.b === 'mill') continue;
      if (w.repair) {
        out[w.b] = { kind, activity: 'build', figures: cfg.builders, scorched: false, builders: cfg.builders };
        continue;
      }
      if (w.cond < cfg.damagedBelow) {
        // Burned or broken: a scorch mark. A works never yet opened (a new
        // gold mine) simply stands idle.
        out[w.b] = { kind, activity: null, figures: 0, scorched: !!w.why, builders: 0 };
        continue;
      }
      let activity = ACT[kind] ?? null;
      if (kind === 'fields') activity = Object.entries(cfg.fields).find(([, ms]) => ms.includes(month))?.[0] ?? null;
      // Field hands are counted for the farmland as a whole (below).
      if (kind === 'fields') w.staff = s.farmStaff ?? w.staff;
      if (kind === 'pastures' && cfg.shearing.includes(month)) activity = 'shear';
      if (kind === 'fishing' && closed) activity = null;
      const figures = activity ? Math.round(cfg.figures[kind] * manned(w.staff)) : 0;
      out[w.b] = { kind, activity: figures ? activity : null, figures, scorched: false, builders: 0 };
    }
  }
  // The farmland round the place, worked by its field hands: the fields
  // works where it stands, otherwise the place's own plots.
  if (!out.fields) {
    const plough = Object.entries(cfg.fields).find(([, ms]) => ms.includes(month))?.[0] ?? null;
    const n = plough ? Math.round(cfg.figures.fields * manned(s.farmStaff)) : 0;
    out.fields = { kind: 'fields', activity: n ? plough : null, figures: n, scorched: false, builders: 0 };
  }
  return out;
}
