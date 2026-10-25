// Draws the map, settlements, labels and ambient units, and answers "what is
// under this finger". The static map is cached in an offscreen canvas and only
// redrawn when the camera moves, so a still map costs little battery.
import { prepareMap, drawMap, COLOURS } from './mapLayer.js';
import { getSprite } from './sprites.js';
import './sprites-buildings.js';
import './sprites-war.js';
import { toScreen, toWorld } from './camera.js';
import { pointInPolygon } from './geometry.js';
import { unitPosition } from '../sim/ambient.js';
import { threatLevel, patrolledSet, patrolRoute, plagueActive } from '../sim/military.js';
import { visionOf, canSee, hasBit } from '../sim/vision.js';
import { travellerPositions } from '../sim/ambient.js';
import { armyPosition } from '../sim/armies.js';
import { TEMERIA, ownerOf, originOf, sideColours } from '../sim/conflict.js';

const ICON_SIZE = { city: 24, town: 17, castle: 15, temple: 15, village: 10 };
const LABEL_FONT = {
  city: 'bold 15px',
  town: '600 13px',
  castle: '12px',
  temple: 'italic 12px',
  village: '11px',
};
// Zoom (relative to fitting the whole map) at which each kind of label appears.
const LABEL_ZOOM = { city: 0, town: 1.5, castle: 1.9, temple: 1.9, village: 2.6 };
const PRIORITY = { city: 0, town: 1, temple: 2, castle: 3, village: 4 };
const SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
const UNIT_SIZE = 14;
const ARMY_SIZE = 26;
// Where building icons sit round a settlement, in degrees (0 is east, -90 is
// north): an inner arc over the top and right, then an outer arc. The left
// side is kept for the garrison and the space below for the name.
const INNER_SLOTS = [-90, -50, -130, -15, 15];
const OUTER_SLOTS = [-70, -110, -30, -150];
const SOLDIERS_PER_FIGURE = 200;
const MAX_FIGURES = 5;
// Threat level at which a bandit camp or a monster's lair shows on the map.
const DANGER = 50;

export function createRenderer(canvas, world, cam) {
  const prep = prepareMap(world);
  const ctx = canvas.getContext('2d');
  // Three cached layers, laid one on another each frame: the painted map
  // (redrawn only when the camera moves or a neighbour's colour changes),
  // the fog of war over foreign lands (redrawn each day as watchers move),
  // and the settlements, dressing and labels on top (redrawn when what
  // stands in a settlement, or what can be seen of one, changes).
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');
  const fog = document.createElement('canvas');
  const fctx = fog.getContext('2d');
  const cache = document.createElement('canvas');
  const cctx = cache.getContext('2d');
  // One pixel per grid cell of explored ground, scaled up softly as the fog.
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  let baseDirty = true;
  let fogDirty = true;
  const stats = { base: 0, overlay: 0, fog: 0 };
  const foreignOrdered = [...(world.foreign ?? [])].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
  let dpr = 1;
  let dirty = true;
  let lastSelected = null;
  const ordered = [...world.geography.settlements].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);

  function resize(w, h) {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const c of [canvas, base, fog, cache]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    dirty = true;
    baseDirty = true;
    fogDirty = true;
  }

  const zoomRel = () => cam.scale / cam.contain;
  // Icons shrink as the view pulls back over the whole North, so the far view
  // reads as a map rather than a heap of markers.
  const iconSize = (type) => ICON_SIZE[type] * Math.min(1.5, Math.max(zoomRel() < 1 ? 0.45 : 0.8, Math.sqrt(zoomRel() / 2)));

  // Neighbouring lands warm to green or sour to red with their relation,
  // bucketed so the cached map only redraws when the colour visibly changes.
  let tintKey = '';
  let tints = {};
  function updateTints(state) {
    const buckets = Object.entries(state.neighbours).map(([id, n]) => [id, Math.round(n.relation / 10)]);
    const key = buckets.map(([id, b]) => `${id}${b}`).join() + ownKey;
    if (key === tintKey) return;
    tintKey = key;
    tints = {};
    for (const [id, b] of buckets) {
      if (b >= 2) tints[id] = `rgba(80, 130, 60, ${Math.min(0.3, b * 0.03)})`;
      if (b <= -2) tints[id] = `rgba(150, 40, 30, ${Math.min(0.3, -b * 0.03)})`;
    }
    dirty = true;
    baseDirty = true;
  }

  // The cached map redraws when what stands in a settlement changes: its
  // buildings, works, the size of its garrison or whether it is paid.
  let infraState = null;
  let infraThreats = {};
  let infraKey = '';
  let threatKey = '';
  // What the crown can see today, worked out once per day of the realm.
  let vision = null;
  let maskKey = '';
  function updateVision(state) {
    if (!world.grid || !state.realms) return;
    vision = visionOf(state, world, travellerPositions(state, world));
    fogDirty = true;
    const explored = state.ambient.intel?.explored ?? [];
    const key = explored.join(',');
    if (key !== maskKey) {
      maskKey = key;
      const g = world.grid;
      mask.width = g.cols;
      mask.height = g.rows;
      const img = mctx.createImageData(g.cols, g.rows);
      for (let i = 0; i < g.cols * g.rows; i++) {
        const seen = hasBit(explored, i);
        img.data[i * 4] = seen ? 48 : 26;
        img.data[i * 4 + 1] = seen ? 41 : 21;
        img.data[i * 4 + 2] = seen ? 33 : 15;
        img.data[i * 4 + 3] = seen ? 120 : 242;
      }
      mctx.putImageData(img, 0, 0);
    }
  }

  function drawFog() {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fog.width, fog.height);
    fogDirty = false;
    if (!vision) return;
    stats.fog += 1;
    const s = cam.scale * dpr;
    fctx.setTransform(s, 0, 0, s, dpr * (cam.viewW / 2 - cam.x * cam.scale), dpr * (cam.viewH / 2 - cam.y * cam.scale));
    const g = world.grid;
    // Fog lies only over land: the sea is no secret.
    fctx.save();
    const land = new Path2D();
    for (const n of prep.neighbours) for (const p of n.paths) land.addPath(p);
    fctx.clip(land);
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(mask, g.x0, g.y0, g.cols * g.cell, g.rows * g.cell);
    fctx.restore();
    // Lift the fog wherever someone of ours is watching, softly at the edges.
    fctx.globalCompositeOperation = 'destination-out';
    for (const c of vision.circles) {
      const grad = fctx.createRadialGradient(c.x, c.y, c.r * 0.6, c.x, c.y, c.r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.fillStyle = grad;
      fctx.beginPath();
      fctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.fillStyle = '#000';
    for (const rid of vision.realms) for (const p of prep.neighbours.find((n) => n.id === rid)?.paths ?? []) fctx.fill(p);
    fctx.fill(prep.temeria);
    fctx.globalCompositeOperation = 'source-over';
  }

  function exploredAt(x, y) {
    const g = world.grid;
    const bits = infraState?.ambient?.intel?.explored;
    if (!g || !bits) return true;
    const col = Math.floor((x - g.x0) / g.cell);
    const row = Math.floor((y - g.y0) / g.cell);
    return col >= 0 && row >= 0 && col < g.cols && row < g.rows && hasBit(bits, row * g.cols + col);
  }

  // Foreign settlements as the crown knows them: live when in sight, as last
  // seen when fogged, and not at all when never seen.
  let foreignView = {};
  function updateForeign(state) {
    foreignView = {};
    if (!vision) return '';
    const intel = state.ambient.intel;
    const parts = [];
    for (const st of foreignOrdered) {
      const live = state.realms[st.realm]?.settlements[st.id];
      const visible = canSee(world, vision, st.x, st.y);
      const snap = visible && live
        ? { population: live.population, garrison: live.garrison, buildings: live.buildings, construction: live.construction?.building ?? null, prosperity: live.prosperity, owner: live.owner ?? st.realm }
        : intel?.seen[st.id];
      if (!snap) continue;
      foreignView[st.id] = { visible, ...snap };
      parts.push(`${st.id}:${visible ? 1 : 0}:${snap.buildings.join('+')}:${snap.construction ?? ''}:${figures(snap.garrison)}:${snap.owner ?? ''}`);
    }
    updateOwnership(state);
    return parts.join('|');
  }

  // Towns that have changed hands, as the crown knows them: ours as they
  // are, foreign ones as last seen. Each casts its new master's colour over
  // the country round it, so the borders seem to move.
  let ownKey = '';
  let owned = [];
  function updateOwnership(state) {
    owned = [];
    for (const id of Object.keys(state.settlements)) {
      const owner = ownerOf(state, world, id);
      if (owner !== TEMERIA) owned.push({ id, owner });
    }
    for (const st of foreignOrdered) {
      const owner = foreignView[st.id]?.owner;
      if (owner && owner !== st.realm) owned.push({ id: st.id, owner });
    }
    const key = owned.map((o) => `${o.id}>${o.owner}`).join();
    if (key !== ownKey) {
      ownKey = key;
      baseDirty = true;
      dirty = true;
    }
  }

  const WASH = { city: 90, town: 70, castle: 60, village: 50, temple: 45 };
  function drawOwnership(c) {
    for (const { id, owner } of owned) {
      const st = world.byId[id];
      const r = WASH[st.type];
      const [field] = sideColours(world, owner);
      const grad = c.createRadialGradient(st.x, st.y, 0, st.x, st.y, r);
      grad.addColorStop(0, hexAlpha(field, 0.45));
      grad.addColorStop(0.7, hexAlpha(field, 0.25));
      grad.addColorStop(1, hexAlpha(field, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(st.x, st.y, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  function updateInfra(state) {
    if (state === infraState) return;
    infraState = state;
    updateVision(state);
    const foreignKey = updateForeign(state);
    // Danger marks are reckoned once a month (or when patrols change), so a
    // threat hovering near the line does not make the map flicker and redraw.
    const tk = `${Math.floor(state.day / 30)}|${(state.patrols ?? []).map((p) => p.id).join()}|${JSON.stringify(state.laws?.bounties ?? '')}`;
    if (tk !== threatKey && state.patrols) {
      threatKey = tk;
      infraThreats = {};
      const patrolled = patrolledSet(state, world);
      for (const id of Object.keys(state.settlements)) {
        infraThreats[id] = {
          bandits: threatLevel(state, world, id, 'bandits', patrolled) >= DANGER,
          monsters: threatLevel(state, world, id, 'monsters', patrolled) >= DANGER,
        };
      }
    }
    const marks = (id, s) => `${infraThreats[id]?.bandits ? 'b' : ''}${infraThreats[id]?.monsters ? 'm' : ''}${plagueActive(state, s) ? 'p' : ''}${(s.raided ?? 0) > state.day ? 'r' : ''}`;
    const key = (state.patrols ?? []).map((p) => `${p.from}>${p.to}`).join() + Object.entries(state.settlements)
      .map(([id, s]) => `${id}:${s.buildings.join('+')}:${s.construction?.building ?? ''}:${figures(s.garrison)}:${s.troubled > 0 ? 1 : 0}:${s.holder}:${s.occupier ?? ''}:${state.houses?.[s.holder]?.rebel ? 'r' : ''}:${marks(id, s)}`)
      .join('|') + (state.unpaid ? '!' : '') + foreignKey;
    if (key !== infraKey) {
      infraKey = key;
      dirty = true;
    }
  }

  // A lord's lands fly his colours; a rebel's banner is slashed in red.
  function bannerFor(s) {
    if (s.banner) return s.banner;
    if (s.occupier) return { colours: sideColours(world, s.occupier) };
    const house = world.houses?.houses[s.holder];
    if (!house) return {};
    return { colours: house.colours, rebel: !!infraState.houses?.[s.holder]?.rebel };
  }

  function drawInfrastructure(c, st, s, unpaid) {
    const p = toScreen(cam, st.x, st.y);
    const k = iconSize(st.type) / ICON_SIZE[st.type];
    const iconR = iconSize(st.type) / 2;
    const bsize = 13 * k;
    const icons = s.buildings.filter((b) => b !== 'walls');
    if (s.construction) icons.push('scaffold');
    icons.forEach((b, i) => {
      const outer = i >= INNER_SLOTS.length;
      const deg = outer ? OUTER_SLOTS[(i - INNER_SLOTS.length) % OUTER_SLOTS.length] : INNER_SLOTS[i];
      const rad = (deg * Math.PI) / 180;
      const dist = iconR + bsize / 2 + 2 + (outer ? bsize + 1 : 0);
      getSprite('building', b, 'scaffold').draw(c, p.x + Math.cos(rad) * dist, p.y + Math.sin(rad) * dist, bsize);
    });
    const n = figures(s.garrison);
    const banner = bannerFor(s);
    // The crown pays only its own soldiers, so only they go grey when pay stops.
    const grey = unpaid && s.holder === 'crown';
    if (n || banner.colours) {
      const size = 9 * k;
      const step = size * 0.6;
      const x0 = p.x - iconR - 4 * k;
      for (let i = 0; i < n; i++) {
        getSprite('military', 'soldier').draw(c, x0 - i * step, p.y + 3 * k, size, { unpaid: grey, coat: banner.colours?.[0] });
      }
      getSprite('military', 'banner').draw(c, x0 - n * step - 2 * k, p.y, 14 * k, { unpaid: grey, ...banner });
    }
  }

  // Ordered patrol routes: a band of crown blue along the road.
  function drawPatrols(c) {
    if (!infraState?.patrols?.length) return;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const p of infraState.patrols) {
      const route = patrolRoute(world, p);
      c.beginPath();
      route.forEach((id, i) => (i ? c.lineTo(world.byId[id].x, world.byId[id].y) : c.moveTo(world.byId[id].x, world.byId[id].y)));
      c.strokeStyle = 'rgba(35, 54, 94, 0.45)';
      c.lineWidth = 6 / cam.scale;
      c.stroke();
    }
    c.restore();
  }

  function drawMarkers(c, st, s, p, r) {
    const marks = [];
    if (plagueActive(infraState, s)) marks.push('plague');
    if ((s.raided ?? 0) > infraState.day) marks.push('raid');
    if (s.troubled > 0) marks.push('riot');
    if (infraThreats[st.id]?.bandits) marks.push('bandits');
    if (infraThreats[st.id]?.monsters) marks.push('monsters');
    marks.slice(0, 3).forEach((m, i) => getSprite('marker', m).draw(c, p.x + r * 0.7 + i * 16, p.y - r - 6, m === 'riot' ? 20 : 16));
  }

  function drawStatic(selectedId) {
    const s = cam.scale * dpr;
    const worldTransform = [s, 0, 0, s, dpr * (cam.viewW / 2 - cam.x * cam.scale), dpr * (cam.viewH / 2 - cam.y * cam.scale)];
    if (baseDirty) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, base.width, base.height);
      bctx.setTransform(...worldTransform);
      drawMap(bctx, prep, world, 1 / cam.scale, tints);
      drawOwnership(bctx);
      baseDirty = false;
      stats.base += 1;
    }
    stats.overlay += 1;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, cache.width, cache.height);
    cctx.setTransform(...worldTransform);
    drawPatrols(cctx);

    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRegionLabels(cctx);
    const z = zoomRel();
    const shown = (st) => z >= LABEL_ZOOM[st.type] || st.id === selectedId;
    for (const st of ordered.slice().reverse()) {
      const p = toScreen(cam, st.x, st.y);
      if (shown(st) && infraState?.settlements[st.id].buildings.includes('walls')) {
        getSprite('building', 'walls').draw(cctx, p.x, p.y, iconSize(st.type) + 6);
      }
      getSprite('settlement', st.id, st.type).draw(cctx, p.x, p.y, iconSize(st.type), { capital: st.id === world.kingdom.capital });
      if (infraState && shown(st)) drawInfrastructure(cctx, st, infraState.settlements[st.id], infraState.unpaid);
      // Trouble shows at every zoom: it is news the crown should not miss.
      if (infraState) drawMarkers(cctx, st, infraState.settlements[st.id], p, iconSize(st.type) / 2);
    }
    drawForeign(cctx, z);
    drawSettlementLabels(cctx, selectedId);
  }

  function drawForeign(c, z) {
    for (const st of foreignOrdered.slice().reverse()) {
      const f = foreignView[st.id];
      if (!f) continue;
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -60 || p.y < -60 || p.x > cam.viewW + 60 || p.y > cam.viewH + 60) continue;
      // Remembered places are drawn faded: this is how they were, not how they are.
      c.globalAlpha = f.visible ? 1 : 0.55;
      if (z >= LABEL_ZOOM[st.type] && f.buildings.includes('walls')) getSprite('building', 'walls').draw(c, p.x, p.y, iconSize(st.type) + 6);
      getSprite('settlement', st.id, st.type).draw(c, p.x, p.y, iconSize(st.type), { capital: world.realms?.realms[st.realm]?.capital === st.id });
      if (z >= LABEL_ZOOM[st.type]) {
        const colours = sideColours(world, f.owner ?? st.realm);
        drawInfrastructure(c, st, {
          buildings: f.buildings, construction: f.construction ? { building: f.construction } : null,
          garrison: f.garrison, holder: 'foreign', banner: colours ? { colours } : {},
        }, false);
      }
      c.globalAlpha = 1;
    }
  }

  function drawRegionLabels(c) {
    const z = zoomRel();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const n of prep.neighbours) {
      const p = toScreen(cam, n.label.x, n.label.y);
      c.font = `600 ${Math.round(12 + Math.min(6, z * 1.5))}px ${SERIF}`;
      // A pale halo keeps realm names readable over parchment and fog alike.
      c.fillStyle = 'rgba(52, 40, 28, 0.75)';
      spaced(c, n.name.toUpperCase(), p.x, p.y, 3, 'rgba(236, 224, 194, 0.55)');
    }
    if (z >= 1.8) {
      c.font = `italic 12px ${SERIF}`;
      c.fillStyle = 'rgba(43, 33, 22, 0.7)';
      for (const t of prep.terrain) {
        // Foreign country is only named once someone has seen it.
        if (t.realm && !exploredAt(t.label.x, t.label.y)) continue;
        const p = toScreen(cam, t.label.x, t.label.y);
        haloText(c, t.name, p.x, p.y + 16);
      }
      c.fillStyle = 'rgba(34, 64, 76, 0.85)';
      for (const r of prep.rivers) {
        const p = toScreen(cam, r.label.x, r.label.y);
        c.save();
        c.translate(p.x, p.y);
        let a = r.label.angle;
        if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
        c.rotate(a);
        haloText(c, r.name, 0, -8);
        c.restore();
      }
    }
    // The realm's own name, faint across the heartland when zoomed out.
    if (z < 2.2) {
      const p = toScreen(cam, 520, 470);
      c.font = `600 ${Math.round(18 + z * 4)}px ${SERIF}`;
      c.fillStyle = 'rgba(110, 29, 22, 0.35)';
      spaced(c, world.kingdom.name.toUpperCase(), p.x, p.y, 8);
    }
  }

  function drawSettlementLabels(c, selectedId) {
    const z = zoomRel();
    const placed = [];
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineJoin = 'round';
    const known = foreignOrdered.filter((st) => foreignView[st.id]);
    const capitals = new Set([world.kingdom.capital, ...Object.values(world.realms?.realms ?? {}).map((r) => r.capital)]);
    for (const st of [...ordered, ...known]) {
      if (z < LABEL_ZOOM[st.type] && st.id !== selectedId) continue;
      // Pulled right back, only capitals keep their names.
      if (z < 0.8 && !capitals.has(st.id) && st.id !== selectedId) continue;
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -80 || p.y < -40 || p.x > cam.viewW + 80 || p.y > cam.viewH + 40) continue;
      c.font = `${LABEL_FONT[st.type]} ${SERIF}`;
      const w = c.measureText(st.name).width;
      const y = p.y + iconSize(st.type) / 2 + 2;
      const box = { x0: p.x - w / 2 - 2, x1: p.x + w / 2 + 2, y0: y, y1: y + 15 };
      if (st.id !== selectedId && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      c.strokeStyle = 'rgba(236, 224, 194, 0.9)';
      c.lineWidth = 3.5;
      c.strokeText(st.name, p.x, y);
      const remembered = foreignView[st.id] && !foreignView[st.id].visible;
      c.fillStyle = st.id === world.kingdom.capital ? COLOURS.border : remembered ? 'rgba(43, 33, 22, 0.55)' : COLOURS.ink;
      c.fillText(st.name, p.x, y);
    }
  }

  // A frame identical to the last (paused, nothing selected changing, camera
  // still) is skipped, so a paused game costs next to no battery.
  let lastFrame = null;
  function draw(state, frac, selection) {
    const selectedId = selection?.settlement ?? null;
    updateTints(state);
    updateInfra(state);
    const frame = { state, frac, unit: selection?.unit ?? null, army: selection?.army ?? null, selectedId };
    if (!dirty && selectedId === lastSelected && lastFrame && lastFrame.state === frame.state
      && lastFrame.frac === frame.frac && lastFrame.unit === frame.unit && lastFrame.army === frame.army) return;
    lastFrame = frame;
    if (dirty || selectedId !== lastSelected) {
      drawStatic(selectedId);
      dirty = false;
      lastSelected = selectedId;
    }
    if (fogDirty) drawFog();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(fog, 0, 0);
    ctx.drawImage(cache, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (selectedId) {
      const st = world.byId[selectedId];
      const p = toScreen(cam, st.x, st.y);
      ring(ctx, p.x, p.y, iconSize(st.type) / 2 + 6);
    }

    for (const u of state.ambient.units) {
      const w = unitPosition(world, u, u.pos + u.speed * frac);
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -20 || p.y < -20 || p.x > cam.viewW + 20 || p.y > cam.viewH + 20) continue;
      if (!unitInSight(w)) continue;
      const facing = Math.cos(w.angle) >= 0 ? 1 : -1;
      const colours = u.realm && u.kind !== 'export' ? world.realms?.realms[u.realm]?.colours : null;
      getSprite('unit', u.kind, u.kind === 'abroad' ? 'foreign' : u.kind === 'abroad_patrol' ? 'patrol' : u.kind === 'export' ? 'caravan' : u.kind)
        .draw(ctx, p.x, p.y - 4, UNIT_SIZE, { facing, colours });
      if (selection?.unit === u.id) ring(ctx, p.x, p.y - 4, UNIT_SIZE / 2 + 5);
    }
    drawWar(state, frac, selection);
  }

  // Battlefields of the last days, sieges, and the armies themselves. The
  // crown sees its own armies everywhere, and foreign ones only in sight.
  function drawWar(state, frac, selection) {
    if (!state.armies) return;
    for (const b of state.battles) {
      if (state.day - b.day > 12 || !unitInSight(b)) continue;
      const p = toScreen(cam, b.x, b.y);
      getSprite('marker', 'battle').draw(ctx, p.x + 10, p.y - 14, 18);
    }
    for (const a of state.armies) {
      if (!a.siege || !unitInSight(world.byId[a.at])) continue;
      const st = world.byId[a.at];
      const p = toScreen(cam, st.x, st.y);
      getSprite('marker', 'siege').draw(ctx, p.x, p.y, iconSize(st.type) + 22, { colours: sideColours(world, a.side), progress: a.siege.progress });
    }
    for (const a of state.armies) {
      const w = armyAt(a, frac);
      if (!w) continue;
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -30 || p.y < -30 || p.x > cam.viewW + 30 || p.y > cam.viewH + 30) continue;
      const facing = Math.cos(w.angle) >= 0 ? 1 : -1;
      const size = ARMY_SIZE * Math.max(0.75, Math.min(1.2, Math.sqrt(zoomRel())));
      getSprite('army', a.side, 'host').draw(ctx, p.x, p.y - 6, size, {
        colours: sideColours(world, a.side), figures: Math.ceil(a.soldiers / 600), facing, dim: a.retreating,
      });
      if (selection?.army === a.id) ring(ctx, p.x, p.y - 6, size / 2 + 6);
    }
  }

  function armyAt(a, frac) {
    const w = armyPosition(world, a, a.to ? (a.speed ?? 0) * frac : 0);
    // Several armies at one place stand side by side rather than on top.
    if (!a.to) {
      const here = infraState?.armies?.filter((b) => !b.to && b.at === a.at) ?? [];
      const i = here.findIndex((b) => b.id === a.id);
      if (i > 0) w.x += i * 14 / cam.scale;
      w.y -= 10 / cam.scale;
    }
    if (a.side !== TEMERIA && !unitInSight(w)) return null;
    return w;
  }

  function armyScreen(state, id, frac) {
    const a = state.armies?.find((x) => x.id === id);
    const w = a && armyAt(a, frac);
    return w ? toScreen(cam, w.x, w.y) : null;
  }

  // Traffic abroad shows only where the crown can see it.
  function unitInSight(w) {
    return !vision || canSee(world, vision, w.x, w.y);
  }

  // Nearest thing under the finger wins, with settlements favoured: carts
  // crowd the roads into towns, and a tap on a town means the town.
  function pick(sx, sy, state, frac) {
    let best = null;
    // An army is a deliberate thing to tap, so it wins over what lies under it.
    for (const a of state.armies ?? []) {
      const w = armyAt(a, frac);
      if (!w) continue;
      const p = toScreen(cam, w.x, w.y);
      const d = Math.hypot(p.x - sx, p.y - 6 - sy);
      if (d < 22 && (!best || d < best.d)) best = { d, hit: { army: a.id } };
    }
    if (best) return best.hit;
    for (const u of state.ambient.units) {
      const w = unitPosition(world, u, u.pos + u.speed * frac);
      if (!unitInSight(w)) continue;
      const p = toScreen(cam, w.x, w.y);
      const d = Math.hypot(p.x - sx, p.y - 4 - sy);
      if (d < 20 && (!best || d < best.d)) best = { d, hit: { unit: u.id } };
    }
    for (const st of world.geography.settlements) {
      const p = toScreen(cam, st.x, st.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      // Buildings and soldiers round a settlement count as part of it.
      const dressed = zoomRel() >= LABEL_ZOOM[st.type] && infraState
        && (infraState.settlements[st.id].buildings.length || figures(infraState.settlements[st.id].garrison));
      const reach = Math.max(22, iconSize(st.type) / 2 + 8) + (dressed ? 20 : 0);
      const score = d * 0.5;
      if (d < reach && (!best || score < best.d)) best = { d: score, hit: { settlement: st.id } };
    }
    for (const st of foreignOrdered) {
      if (!foreignView[st.id]) continue;
      const p = toScreen(cam, st.x, st.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      const score = d * 0.5;
      if (d < Math.max(22, iconSize(st.type) / 2 + 8) && (!best || score < best.d)) best = { d: score, hit: { foreign: st.id } };
    }
    if (best) return best.hit;
    // Nothing close: perhaps a tap on a neighbouring land.
    const w = toWorld(cam, sx, sy);
    if (pointInPolygon(w.x, w.y, world.geography.temeria)) return null;
    for (const [id, n] of Object.entries(world.geography.neighbours)) {
      if (n.shapes.some((sh) => pointInPolygon(w.x, w.y, sh))) return { neighbour: id };
    }
    return null;
  }

  function unitScreen(state, id, frac) {
    const u = state.ambient.units.find((x) => x.id === id);
    if (!u) return null;
    const w = unitPosition(world, u, u.pos + u.speed * frac);
    // A unit that has passed into the fog is, as far as the crown knows, gone.
    if (!unitInSight(w)) return null;
    return toScreen(cam, w.x, w.y);
  }

  return {
    resize, draw, pick, unitScreen, armyScreen, stats,
    invalidate: () => { dirty = true; baseDirty = true; fogDirty = true; },
    canSeePoint: (x, y) => !vision || canSee(world, vision, x, y),
    foreignInfo: (id) => foreignView[id] ?? null,
  };
}

// Soldier figures shown beside a settlement: one per 200 men, at most five,
// and at least one for any real garrison.
function figures(garrison) {
  if (garrison < 50) return 0;
  return Math.min(MAX_FIGURES, Math.max(1, Math.round(garrison / SOLDIERS_PER_FIGURE)));
}

function ring(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 236, 170, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = COLOURS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function haloText(c, text, x, y) {
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(236, 224, 194, 0.85)';
  c.lineWidth = 3;
  c.strokeText(text, x, y);
  c.fillText(text, x, y);
}

function spaced(c, text, x, y, gap, halo = null) {
  const widths = [...text].map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let cx = x - total / 2;
  const align = c.textAlign;
  c.textAlign = 'left';
  [...text].forEach((ch, i) => {
    if (halo) {
      c.strokeStyle = halo;
      c.lineWidth = 3;
      c.lineJoin = 'round';
      c.strokeText(ch, cx, y);
    }
    c.fillText(ch, cx, y);
    cx += widths[i] + gap;
  });
  c.textAlign = align;
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
