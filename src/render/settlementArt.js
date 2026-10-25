// Draws settlements as places: houses, buildings, fields and walls laid out
// round their heart (see layout.js), and the small life around them. Each
// settlement's layout is drawn once into its own offscreen canvas and only
// redrawn when something in it changes (a building, the population, the
// season) or the zoom moves to another step, so a busy map stays cheap.
import { planSettlement, houseCount, coreRadius } from './layout.js';
import { getSprite } from './sprites.js';
import './sprites-layout.js';

const MAX_ART = 90;

export function seasonLook(month) {
  if (month >= 3 && month <= 5) return { season: 'spring', snow: false };
  if (month >= 6 && month <= 7) return { season: 'summer', snow: false };
  if (month >= 8 && month <= 10) return { season: 'harvest', snow: false };
  return { season: 'winter', snow: month === 12 || month <= 2 };
}

// Zoom steps half an octave apart, so the art is redrawn only now and then
// while zooming, and never while panning.
function zoomStep(px) {
  return 2 ** (Math.round(Math.log2(px) * 2) / 2);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function createSettlementArt(world, cfg) {
  const plans = new Map();
  const art = new Map();
  const stats = { plans: 0, renders: 0 };

  // What a settlement looks like from the outside, home or abroad.
  function describe(st, data, seed) {
    return {
      id: st.id, x: st.x, y: st.y, type: st.type, people: data.people, production: data.production,
      buildings: data.buildings, construction: data.construction ?? null, seed,
    };
  }

  function planFor(place) {
    // Population only matters in steps: a new house, a wider heart.
    const tier = `${houseCount(cfg, place.type, place.people)}:${Math.round(coreRadius(cfg, place.type, place.people) * 2)}`;
    const key = `${place.buildings.join('+')}|${place.construction ?? ''}|${tier}|${place.seed}`;
    const hit = plans.get(place.id);
    if (hit?.key === key) return hit.plan;
    stats.plans += 1;
    const plan = planSettlement(world, cfg, place);
    plans.set(place.id, { key, plan });
    return plan;
  }

  // Draw a plan into a canvas at `px` pixels per map unit. Compact art
  // squeezes the plan round the settlement's marker for the far view.
  function render(plan, place, px, look, compact, colour) {
    const pad = 6;
    const reach = compact ? 1 : plan.extent;
    const tall = (cfg.landmark[place.type] ?? 4) * 2.2;
    const squeeze = compact ? compact.radius / Math.max(1, plan.radius * px) : 1;
    const sizeK = compact ? Math.max(squeeze, compact.minSize / Math.max(1, cfg.core[place.type].house * px)) : 1;
    const half = compact ? compact.radius * 1.9 + pad : reach * px + pad;
    const top = compact ? half + compact.minSize * 2 : half + tall * px;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(half * 2);
    canvas.height = Math.ceil(top + half);
    const c = canvas.getContext('2d');
    const ox = half;
    const oy = top;
    const at = (v) => v * px * squeeze;
    const opts = { snow: look.snow, season: look.season, type: place.type };
    if (!compact) {
      for (const f of plan.fields) {
        getSprite('structure', f.kind, 'field').draw(c, ox + at(f.x), oy + at(f.y), 0, {
          ...opts, w: f.w * px, h: f.h * px, angle: f.angle, tone: f.tone,
        });
      }
      for (const a of plan.lanes) {
        getSprite('structure', 'lane').draw(c, ox, oy, plan.radius * px * 1.05, { angle: a, paved: plan.paved, width: Math.max(1, px * 0.9) });
      }
    }
    if (plan.walls) getSprite('structure', 'walls').draw(c, ox, oy, at(plan.walls.r), { ...opts, half: 'back' });
    for (const it of plan.items) {
      if (compact && it.kind === 'landmark') continue;
      const size = it.w * px * sizeK;
      const sprite = it.kind === 'house' ? getSprite('structure', 'house')
        : it.kind === 'landmark' ? getSprite('structure', `landmark:${it.sprite}`, `landmark:${place.type}`)
          : it.kind === 'scaffold' ? getSprite('structure', 'scaffold')
            : getSprite('structure', it.sprite, 'workshop');
      sprite.draw(c, ox + at(it.x), oy + at(it.y), size, { ...opts, variant: it.variant, colour });
    }
    if (plan.walls) getSprite('structure', 'walls').draw(c, ox, oy, at(plan.walls.r), { ...opts, half: 'front' });
    stats.renders += 1;
    return { canvas, ox, oy, px };
  }

  // The settlement's art for this zoom: the full layout when close, a
  // compact cluster when far. Returns its footprint radius in pixels.
  function draw(ctx, st, data, seed, view) {
    const place = describe(st, data, seed);
    const plan = planFor(place);
    const full = view.scale >= cfg.zoom.full;
    const px = full ? zoomStep(view.scale * view.dpr) : view.compactPx * view.dpr;
    const key = `${full ? 'f' : 'c'}${px}|${view.look.season}|${view.look.snow}|${plans.get(st.id).key}|${view.colour ?? ''}`;
    let a = art.get(st.id);
    if (a?.key !== key) {
      a = { key, ...render(plan, place, px, view.look, full ? null : { radius: view.compactRadius * view.dpr, minSize: 3.2 * view.dpr }, view.colour) };
      art.delete(st.id);
      art.set(st.id, a);
      if (art.size > MAX_ART) art.delete(art.keys().next().value);
    }
    // Drawn in CSS pixels: the canvas was made at device pixels.
    const k = full ? view.scale * view.dpr / a.px : 1;
    const w = (a.canvas.width * k) / view.dpr;
    const h = (a.canvas.height * k) / view.dpr;
    ctx.drawImage(a.canvas, view.x - (a.ox * k) / view.dpr, view.y - (a.oy * k) / view.dpr, w, h);
    return full ? plan.radius * view.scale : view.compactRadius;
  }

  // Life about the place: smoke, workers going to the fields and the mines,
  // beasts in the pasture, boats at the quay, builders on the scaffolding.
  // Driven by game time, so a paused realm holds still.
  function drawLife(ctx, st, scale, x, y, time, look) {
    const plan = plans.get(st.id)?.plan;
    if (!plan) return;
    const h = hash(st.id);
    const at = (v) => v * scale;
    const unit = scale;
    for (const [i, s] of plan.smoke.slice(0, 24).entries()) {
      getSprite('life', 'smoke').draw(ctx, x + at(s.x), y + at(s.y), unit * (s.big ? 0.9 : 0.6), { phase: (time * 0.6 + h + i * 0.37) % 1, steam: s.steam });
    }
    const workers = cfg.workersPerSite;
    for (const [i, s] of plan.sites.entries()) {
      if (s.kind === 'field' && look.season === 'winter') continue;
      if (s.kind === 'works') {
        for (let j = 0; j < 2; j++) {
          const jig = Math.sin((time * 3 + j) * Math.PI) * unit * 0.3;
          getSprite('life', 'worker').draw(ctx, x + at(s.x) + (j - 0.5) * unit * 1.2 + jig, y + at(s.y) + unit * 0.4, unit * 0.9, { phase: time + j, colour: '#8a6844' });
        }
        continue;
      }
      for (let j = 0; j < workers; j++) {
        const u = (time * 0.25 + h + i * 0.31 + j * 0.5) % 1;
        const tri = u < 0.5 ? u * 2 : 2 - u * 2;
        getSprite('life', 'worker').draw(ctx, x + at(s.x * tri), y + at(s.y * tri), unit * 0.85, { phase: u });
      }
    }
    for (const [i, f] of plan.fields.entries()) {
      if (f.kind !== 'pasture' || look.snow) continue;
      for (let j = 0; j < 3; j++) {
        const wob = Math.sin(time * 0.4 + j * 2.1 + i) * f.w * 0.25;
        getSprite('life', 'sheep').draw(ctx, x + at(f.x + wob), y + at(f.y + (j - 1) * f.h * 0.25), unit * 0.9, { cow: (i + j) % 3 === 0, facing: wob > 0 ? 1 : -1 });
      }
    }
    for (const [i, hd] of (plan.herds ?? []).entries()) {
      if (look.snow) continue;
      for (let j = 0; j < 3; j++) {
        const wob = Math.sin(time * 0.35 + j * 2.3 + i) * hd.w * 0.3;
        getSprite('life', 'sheep').draw(ctx, x + at(hd.x + (j - 1) * hd.w * 0.3 + wob * 0.3), y + at(hd.y + (j % 2) * hd.w * 0.15), unit * (hd.horses ? 1.1 : 0.9), { horse: hd.horses, facing: wob > 0 ? 1 : -1 });
      }
    }
    for (const [i, b] of plan.boats.entries()) {
      getSprite('life', 'boat').draw(ctx, x + at(b.x) + unit * 1.6, y + at(b.y) + unit * 0.8, unit * 1.4, { phase: (time * 0.5 + i * 0.3) % 1 });
    }
  }

  return { draw, drawLife, planOf: (id) => plans.get(id)?.plan ?? null, stats };
}
