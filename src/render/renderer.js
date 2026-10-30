// Draws the map, settlements, labels and ambient units, and answers "what is
// under this finger". The static map is cached in an offscreen canvas and only
// redrawn when the camera moves, so a still map costs little battery.
import { prepareMap, drawMap, COLOURS, territoryPaths } from './mapLayer.js';
import { territoryOwners } from '../sim/territory.js';
import { drawBattle, drawSiege, smoke, drawRebels } from './war-art.js';
import { createBoardLayer, boardness } from './board.js';
import { spacesOf } from '../sim/works.js';
import { createTiles } from './tiles.js';
import { getSprite } from './sprites.js';
import './sprites-buildings.js';
import './sprites-war.js';
import { createSettlementArt, seasonLook } from './settlementArt.js';
import { prepareCountryside } from './countryside.js';
import { dateOf } from '../sim/calendar.js';
import { totalPopulation } from '../sim/state.js';
import { houseCount } from './layout.js';
import { toScreen, toWorld, worldBounds } from './camera.js';
import { pointInPolygon } from './geometry.js';
import { unitPosition } from '../sim/ambient.js';
import { witcherOnRoad } from '../sim/threats.js';
import { worksLife } from '../sim/worklife.js';
import { plagueActive } from '../sim/military.js';
import { drawForces, pickForces } from './forces-layer.js';
import './sprites-forces.js';
import { visionOf, canSee, hasBit } from '../sim/vision.js';
import { travellerPositions } from '../sim/ambient.js';
import { armyPosition, daysToArrive } from '../sim/armies.js';
import { figurePosition } from '../sim/figures.js';
import { lineOf } from '../sim/battle.js';
import { roadPath } from '../sim/world.js';
import { TEMERIA, ownerOf, originOf, sideColours, hostile } from '../sim/conflict.js';

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
const SOLDIERS_PER_FIGURE = 200;
const MAX_FIGURES = 5;

export function createRenderer(canvas, world, cam, layoutCfg) {
  const prep = prepareMap(world);
  // The countryside (M23 D), placed once; how it looks follows the season,
  // sacks and hunger, and Battery saver.
  const countryside = prepareCountryside(world, prep);
  let countryLook = { season: 'spring', snow: false, burnt: new Set(), bare: new Set(), thin: false };
  let countryKey = '';
  // The static map, cut into tiles at a few levels of detail (tiles.js).
  // Lines keep their on-screen weight at every level; the far levels draw
  // fewer marks.
  const tiles = createTiles({
    paint: (ctx, view, L) => {
      const zoom = L / dpr;
      drawMap(ctx, prep, world, dpr / L, tints, view, zoom < 0.45 ? 0 : zoom < 0.9 ? 1 : 2, world.foreign ? territoryOwners(world) : null, { cs: countryside, look: countryLook });
    },
  });
  const art = createSettlementArt(world, layoutCfg);
  // How far each settlement's ground reaches on screen, for labels and taps.
  let footprint = {};
  function artView(p, st, colour) {
    return {
      scale: cam.scale, dpr, x: p.x, y: p.y, look: seasonLook(dateOf(infraState.day).month),
      compactPx: 1, compactRadius: iconSize(st.type) * 0.75 + 3, colour,
    };
  }
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
  // The three layers are canvases of their own behind the map canvas. A pan
  // slides them with a CSS transform, which the browser does on the
  // graphics chip; the map canvas on top holds only what moves.
  for (const layer of [base, fog, cache]) {
    layer.className = 'map-backdrop';
    layer.setAttribute('aria-hidden', 'true');
    canvas.parentNode?.insertBefore(layer, canvas);
  }
  // The board of the North, over everything, faded in as the camera pulls back.
  const board = createBoardLayer(canvas.parentNode ?? document.body, world);
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  let baseDirty = true;
  let fogDirty = true;
  let fogPending = false;
  let lastFog = 0;
  const FOG_EVERY_MS = 400;
  const FOG_RES = 0.5;
  const stats = { base: 0, overlay: 0, fog: 0, relayer: 0, draws: 0 };
  let foreignOrdered = [...(world.foreign ?? [])].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
  let dpr = 1;
  let dirty = true;
  let lastSelected = null;
  let ordered = [...world.geography.settlements].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
  // Towns change realm for good (M19): the lists of ours and theirs follow.
  let landsVersion = world.landsVersion;
  function followLands() {
    if (landsVersion === world.landsVersion) return;
    landsVersion = world.landsVersion;
    foreignOrdered = [...(world.foreign ?? [])].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
    ordered = [...world.geography.settlements].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
    infraState = null;
    // The borders follow the towns: the painted map is drawn afresh.
    tiles.clear();
    baseDirty = true;
    dirty = true;
  }

  // The cached layers are drawn a margin larger than the screen, so a pan
  // only slides them; they are redrawn when the zoom changes or the pan
  // runs past the margin. `lc` is the camera they were drawn from.
  let margin = 0;
  let lc = null;
  function resize(w, h) {
    // Two device pixels per CSS pixel is as sharp as a phone needs, and spares
    // the battery the rest.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    margin = Math.round(Math.max(w, h) * 0.25);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    for (const c of [base, fog, cache]) {
      // The fog is soft, so it is drawn at half the resolution.
      const res = c === fog ? dpr * FOG_RES : dpr;
      c.width = Math.round((w + margin * 2) * res);
      c.height = Math.round((h + margin * 2) * res);
      c.style.width = `${w + margin * 2}px`;
      c.style.height = `${h + margin * 2}px`;
    }
    lc = null;
    tiles.clear();
    board.resize(w, h, dpr);
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
    tiles.clear();
    dirty = true;
    baseDirty = true;
  }

  // The cached map redraws when what stands in a settlement changes: its
  // buildings, works, the size of its garrison or whether it is paid.
  let infraState = null;
  let infraKey = '';
  // What the crown can see today, worked out once per day of the realm.
  let vision = null;
  let maskKey = '';
  function updateVision(state) {
    if (!world.grid || !state.realms) return;
    vision = visionOf(state, world, travellerPositions(state, world));
    // Watchers move a little each day; the fog follows them a few times a
    // second at most, which the eye cannot tell from every day.
    fogPending = true;
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
        // The crown has maps: the lie of the land shows through even where
        // no one of ours has been; only what stands there now is hidden.
        img.data[i * 4 + 3] = seen ? 60 : 118;
      }
      mctx.putImageData(img, 0, 0);
    }
  }

  function drawFog() {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fog.width, fog.height);
    fogDirty = false;
    if (!vision) return;
    // Nothing to fog when no foreign land is in reach of the layer.
    const half = { x: (cam.viewW / 2 + margin) / cam.scale, y: (cam.viewH / 2 + margin) / cam.scale };
    const view = { x0: cam.x - half.x, x1: cam.x + half.x, y0: cam.y - half.y, y1: cam.y + half.y };
    if (!prep.neighbours.some((n) => n.boxes.some((b) => b.x1 > view.x0 && b.x0 < view.x1 && b.y1 > view.y0 && b.y0 < view.y1))) return;
    stats.fog += 1;
    const fd = dpr * FOG_RES;
    const s = cam.scale * fd;
    fctx.setTransform(s, 0, 0, s, fd * (margin + cam.viewW / 2 - cam.x * cam.scale), fd * (margin + cam.viewH / 2 - cam.y * cam.scale));
    const g = world.grid;
    // Fog lies only over land: the sea is no secret.
    fctx.save();
    const land = new Path2D();
    for (const n of prep.lands) for (const p of n.paths) land.addPath(p);
    fctx.clip(land);
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(mask, g.x0, g.y0, g.cols * g.cell, g.rows * g.cell);
    fctx.restore();
    // Lift the fog wherever someone of ours is watching, softly at the edges.
    fctx.globalCompositeOperation = 'destination-out';
    for (const c of vision.circles) {
      if (c.x + c.r < view.x0 || c.x - c.r > view.x1 || c.y + c.r < view.y0 || c.y - c.r > view.y1) continue;
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
    // And over the land the crown has won (M19).
    const t = territoryOwners(world);
    if (t.any) {
      const won = territoryPaths(t).fills.temeria;
      if (won) fctx.fill(won);
    }
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

  // A town occupied in a war (M19): its occupier's colour hatched over the
  // country round it, so it reads as held, not owned.
  const WASH = { city: 90, town: 70, castle: 60, village: 50, temple: 45 };
  function drawOwnership(c) {
    for (const { id, owner } of owned) {
      const st = world.byId[id];
      const r = WASH[st.type];
      const [field] = sideColours(world, owner);
      const grad = c.createRadialGradient(st.x, st.y, 0, st.x, st.y, r);
      grad.addColorStop(0, hexAlpha(field, 0.3));
      grad.addColorStop(1, hexAlpha(field, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(st.x, st.y, r, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.clip();
      c.strokeStyle = hexAlpha(field, 0.55);
      c.lineWidth = 3;
      c.beginPath();
      for (let k = -r * 2; k <= r * 2; k += 9) {
        c.moveTo(st.x + k - r, st.y - r);
        c.lineTo(st.x + k + r, st.y + r);
      }
      c.stroke();
      c.restore();
    }
  }

  // The countryside's look: the season, fields burnt round towns sacked or
  // smouldering, bare round hungry ones. The tiles are redrawn only when it
  // changes.
  function updateCountry(state) {
    const look = seasonLook(dateOf(state.day).month);
    const burnt = new Set();
    const bare = new Set();
    for (const [id, s] of Object.entries(state.settlements)) {
      if ((s.smoulder ?? 0) > state.day || (s.sacked ?? 0) > state.day) burnt.add(id);
      else if ((s.hunger ?? 0) > 0.2) bare.add(id);
    }
    for (const realm of Object.values(state.realms ?? {})) {
      for (const [id, s] of Object.entries(realm.settlements ?? {})) if ((s.smoulder ?? 0) > state.day) burnt.add(id);
    }
    const key = `${look.season}${look.snow}|${[...burnt].sort()}|${[...bare].sort()}|${saver}`;
    if (key === countryKey) return;
    countryKey = key;
    countryLook = { season: look.season, snow: look.snow, burnt, bare, thin: saver };
    tiles.clear();
    baseDirty = true;
    dirty = true;
  }

  function updateInfra(state) {
    if (state === infraState) return;
    infraState = state;
    updateCountry(state);
    updateVision(state);
    const foreignKey = updateForeign(state);
    const marks = (id, s) => `${plagueActive(state, s) ? 'p' : ''}${(s.raided ?? 0) > state.day ? 'r' : ''}`;
    const key = (state.forces?.companies ?? []).filter((x) => !x.army && x.order.kind === 'patrol').map((x) => `${x.order.from}>${x.order.to}`).join() + (state.routes ?? []).map((r) => `${r.from}>${r.to}${r.closed ? 'x' : ''}`).join() + Object.entries(state.settlements)
      .map(([id, s]) => `${id}:${houseCount(layoutCfg, world.byId[id].type, totalPopulation(s))}:${s.buildings.join('+')}:${s.construction?.building ?? ''}:${figures(s.garrison)}:${s.troubled > 0 ? 1 : 0}:${s.holder}:${s.occupier ?? ''}:${state.houses?.[s.holder]?.rebel ? 'r' : ''}:${marks(id, s)}`)
      .join('|') + (state.unpaid ? '!' : '') + foreignKey + seasonLook(dateOf(state.day).month).season + seasonLook(dateOf(state.day).month).snow;
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

  // The garrison beside a settlement, at the west edge of its ground.
  function drawInfrastructure(c, st, s, unpaid, reach) {
    const p = toScreen(cam, st.x, st.y);
    const k = iconSize(st.type) / ICON_SIZE[st.type];
    const iconR = Math.max(iconSize(st.type) / 2, reach ?? 0);
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

  // Roads the crown's companies patrol: a band of crown blue along the road.
  function drawPatrols(c) {
    const roads = (infraState?.forces?.companies ?? []).filter((x) => !x.army && x.order.kind === 'patrol');
    if (!roads.length) return;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const p of roads) {
      const route = roadPath(world, p.order.from, p.order.to) ?? [];
      c.beginPath();
      route.forEach((id, i) => (i ? c.lineTo(world.byId[id].x, world.byId[id].y) : c.moveTo(world.byId[id].x, world.byId[id].y)));
      c.strokeStyle = 'rgba(35, 54, 94, 0.45)';
      c.lineWidth = 6 / cam.scale;
      c.stroke();
    }
    c.restore();
  }

  // Crown trade routes: a faint gold thread along the road, grey while closed.
  function drawRoutes(c) {
    if (!infraState?.routes?.length) return;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.setLineDash([10 / cam.scale, 6 / cam.scale]);
    for (const r of infraState.routes) {
      const path = roadPath(world, r.from, r.to, true);
      if (!path) continue;
      c.beginPath();
      path.forEach((id, i) => (i ? c.lineTo(world.byId[id].x, world.byId[id].y) : c.moveTo(world.byId[id].x, world.byId[id].y)));
      c.strokeStyle = r.closed ? 'rgba(90, 80, 70, 0.4)' : 'rgba(196, 150, 40, 0.55)';
      c.lineWidth = 4 / cam.scale;
      c.stroke();
    }
    c.restore();
  }

  function drawMarkers(c, st, s, p, r) {
    const marks = [];
    if (plagueActive(infraState, s)) marks.push('plague');
    if ((s.raided ?? 0) > infraState.day) marks.push('raid');
    if (s.troubled > 0) marks.push('riot');
    marks.slice(0, 3).forEach((m, i) => getSprite('marker', m).draw(c, p.x + r * 0.7 + i * 16, p.y - r - 6, m === 'riot' ? 20 : 16));
  }

  const layerTransform = () => {
    const s = cam.scale * dpr;
    return [s, 0, 0, s, dpr * (margin + cam.viewW / 2 - cam.x * cam.scale), dpr * (margin + cam.viewH / 2 - cam.y * cam.scale)];
  };

  // The painted map, from tiles. When some fine tiles are still to come it
  // stays dirty, and the next frames fill them in.
  function drawBase() {
    const worldTransform = layerTransform();
    {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, base.width, base.height);
      bctx.setTransform(...worldTransform);
      const half = { x: (cam.viewW / 2 + margin) / cam.scale, y: (cam.viewH / 2 + margin) / cam.scale };
      // Beyond the edge of the world is open sea: one fill, no tiles.
      const b = worldBounds(world);
      const view = { x0: Math.max(b.x0, cam.x - half.x), x1: Math.min(b.x1, cam.x + half.x), y0: Math.max(b.y0, cam.y - half.y), y1: Math.min(b.y1, cam.y + half.y) };
      bctx.fillStyle = COLOURS.sea;
      bctx.fillRect(cam.x - half.x, cam.y - half.y, half.x * 2, half.y * 2);
      bctx.imageSmoothingEnabled = true;
      const complete = tiles.draw(bctx, view, cam.scale * dpr);
      drawOwnership(bctx);
      // Fine tiles not yet drawn come in over the next frames.
      baseDirty = !complete;
      stats.base += 1;
    }
  }

  function drawStatic(selectedId) {
    const worldTransform = layerTransform();
    if (baseDirty) drawBase();
    stats.overlay += 1;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, cache.width, cache.height);
    cctx.setTransform(...worldTransform);
    drawPatrols(cctx);
    drawRoutes(cctx);

    cctx.setTransform(dpr, 0, 0, dpr, dpr * margin, dpr * margin);
    drawRegionLabels(cctx);
    const z = zoomRel();
    const shown = (st) => z >= LABEL_ZOOM[st.type] || st.id === selectedId;
    footprint = {};
    const full = cam.scale >= layoutCfg.zoom.full;
    for (const st of ordered.slice().reverse()) {
      const p = toScreen(cam, st.x, st.y);
      const s = infraState?.settlements[st.id];
      const onScreen = p.x > -160 - margin && p.y > -160 - margin && p.x < cam.viewW + 160 + margin && p.y < cam.viewH + 160 + margin;
      let reach = iconSize(st.type) / 2;
      // Houses, buildings and fields round the settlement: the whole layout
      // when close, a compact cluster round its marker when far.
      if (s && onScreen && (full || shown(st) || st.type === 'city' || st.type === 'town')) {
        reach = Math.max(reach, art.draw(cctx, st, {
          people: totalPopulation(s), production: s.production, buildings: s.buildings, construction: s.construction?.building,
        }, infraState.seed, artView(p, st, s.occupier ? sideColours(world, s.occupier)[0] : null)));
      }
      if (!full) getSprite('settlement', st.id, st.type).draw(cctx, p.x, p.y, iconSize(st.type), { capital: st.id === world.kingdom.capital });
      footprint[st.id] = reach;
      if (s && shown(st)) drawInfrastructure(cctx, st, s, infraState.unpaid, full ? reach : null);
      // Trouble shows at every zoom: it is news the crown should not miss.
      if (s) drawMarkers(cctx, st, s, p, full ? reach * 0.6 : iconSize(st.type) / 2);
    }
    drawForeign(cctx, z);
    drawSettlementLabels(cctx, selectedId);
  }

  // What a foreign place works, from the country round it: villages by the
  // woods cut timber, in the hills quarry stone, in the mountains mine iron.
  const WORK = { forest: 'timber', hills: 'stone', mountains: 'iron' };
  function foreignWork(st) {
    if (st.type !== 'village') return 'other';
    return WORK[world.terrainOf[st.id]] ?? 'food';
  }

  // Towns the crown knows only from its maps: where they stand and what
  // they are called, nothing of how they fare.
  const distantOrdered = [...(world.distantTowns ?? [])].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
  function drawMapped(c, st) {
    const p = toScreen(cam, st.x, st.y);
    if (p.x < -60 - margin || p.y < -60 - margin || p.x > cam.viewW + 60 + margin || p.y > cam.viewH + 60 + margin) return;
    c.globalAlpha = 0.45;
    getSprite('settlement', st.id, st.type).draw(c, p.x, p.y, iconSize(st.type) * 0.85, {});
    c.globalAlpha = 1;
    footprint[st.id] = iconSize(st.type) * 0.42;
  }

  function drawForeign(c, z) {
    for (const st of distantOrdered.slice().reverse()) if (z >= LABEL_ZOOM[st.type] * 0.8 || st.type === 'city') drawMapped(c, st);
    for (const st of foreignOrdered.slice().reverse()) {
      const f = foreignView[st.id];
      if (!f) {
        if (z >= LABEL_ZOOM[st.type] * 0.8 || st.type === 'city') drawMapped(c, st);
        continue;
      }
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -60 - margin || p.y < -60 - margin || p.x > cam.viewW + 60 + margin || p.y > cam.viewH + 60 + margin) continue;
      // Remembered places are drawn faded: this is how they were, not how they are.
      c.globalAlpha = f.visible ? 1 : 0.55;
      const full = cam.scale >= layoutCfg.zoom.full;
      const colours = sideColours(world, f.owner ?? st.realm);
      let reach = iconSize(st.type) / 2;
      if (full || z >= LABEL_ZOOM[st.type] || st.type === 'city') {
        reach = Math.max(reach, art.draw(c, st, {
          people: f.population, production: foreignWork(st), buildings: f.buildings, construction: f.construction,
        }, infraState.seed, artView(p, st, colours[0])));
      }
      if (!full) getSprite('settlement', st.id, st.type).draw(c, p.x, p.y, iconSize(st.type), { capital: world.realms?.realms[st.realm]?.capital === st.id });
      footprint[st.id] = reach;
      if (z >= LABEL_ZOOM[st.type]) {
        drawInfrastructure(c, st, { garrison: f.garrison, holder: 'foreign', banner: colours ? { colours } : {} }, false, full ? reach : null);
      }
      c.globalAlpha = 1;
    }
  }

  function drawRegionLabels(c) {
    const z = zoomRel();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const inView = (p, pad = 120) => p.x > -pad - margin && p.y > -pad - margin && p.x < cam.viewW + pad + margin && p.y < cam.viewH + pad + margin;
    regionBoxes = [];
    const box = (p, text, size, gap) => {
      const w = text.length * (size * 0.72 + gap);
      regionBoxes.push({ x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - size * 0.7, y1: p.y + size * 0.7 });
    };
    // The heartland's own name is kept clear first: no neighbour writes over
    // Temeria.
    const home = toScreen(cam, 520, 470);
    if (z < 2.2) box(home, world.kingdom.name, 18 + z * 4, 8);
    // The biggest lands are named first; a smaller one whose name would
    // run into theirs waits until the view is close enough.
    for (const n of [...prep.lands].sort((a, b) => b.size - a.size)) {
      const p = toScreen(cam, n.label.x, n.label.y);
      if (!inView(p, 200)) continue;
      const size = n.beyond ? 10 + Math.min(5, z * 1.3) : 12 + Math.min(6, z * 1.5);
      const w = n.name.length * (size * 0.72 + (n.beyond ? 2 : 3));
      const mine = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - size * 0.7, y1: p.y + size * 0.7 };
      if (regionBoxes.some((b) => mine.x0 < b.x1 && mine.x1 > b.x0 && mine.y0 < b.y1 && mine.y1 > b.y0)) continue;
      // The lands beyond our dealings are named smaller and fainter, and
      // the smallest only when close enough to read.
      if (n.beyond) {
        if (n.size < 60 && z < 1.2) continue;
        c.font = `italic 600 ${Math.round(10 + Math.min(5, z * 1.3))}px ${SERIF}`;
        box(p, n.name, 10 + Math.min(5, z * 1.3), 2);
        c.fillStyle = 'rgba(52, 40, 28, 0.5)';
        spaced(c, n.name.toUpperCase(), p.x, p.y, 2, 'rgba(236, 224, 194, 0.45)');
        continue;
      }
      c.font = `600 ${Math.round(12 + Math.min(6, z * 1.5))}px ${SERIF}`;
      box(p, n.name, 12 + Math.min(6, z * 1.5), 3);
      // A pale halo keeps realm names readable over parchment and fog alike.
      c.fillStyle = 'rgba(52, 40, 28, 0.75)';
      spaced(c, n.name.toUpperCase(), p.x, p.y, 3, 'rgba(236, 224, 194, 0.55)');
    }
    // The crown has maps: country and rivers are named everywhere, the
    // great ranges and rivers from further out than the rest.
    c.font = `italic 12px ${SERIF}`;
    c.fillStyle = 'rgba(43, 33, 22, 0.7)';
    for (const t of prep.terrain) {
      if (z < (t.size >= 1.6 ? 0.9 : 1.8)) continue;
      const p = toScreen(cam, t.label.x, t.label.y);
      if (!inView(p)) continue;
      haloText(c, t.name, p.x, p.y + 16);
    }
    c.fillStyle = 'rgba(34, 64, 76, 0.85)';
    for (const r of prep.rivers) {
      if (z < (r.main ? 0.7 : 1.5)) continue;
      riverName(c, r);
    }
    // The realm's own name, faint across the heartland when zoomed out.
    if (z < 2.2) {
      c.font = `600 ${Math.round(18 + z * 4)}px ${SERIF}`;
      c.fillStyle = 'rgba(110, 29, 22, 0.35)';
      spaced(c, world.kingdom.name.toUpperCase(), home.x, home.y, 8);
    }
  }

  // Where the realms' names stand, so towns abroad do not write over them.
  let regionBoxes = [];

  // A river's name set along its curve, over the middle of its course.
  function riverName(c, r) {
    const pts = r.pts.map(([x, y]) => toScreen(cam, x, y));
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = lens.at(-1);
    c.font = `italic ${r.main ? 14 : 12}px ${SERIF}`;
    const text = r.main ? r.name.split('').join(' ') : r.name;
    const width = c.measureText(text).width;
    if (total < width * 1.4) return;
    // Read left to right, whichever way the river runs.
    const forward = pts.at(-1).x >= pts[0].x;
    const at = (d) => {
      const dd = forward ? d : total - d;
      let i = 1;
      while (i < lens.length - 1 && lens[i] < dd) i++;
      const t = (dd - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
      const a = pts[i - 1];
      const b = pts[i];
      let angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (!forward) angle += Math.PI;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
    };
    // Several times along a long river seen whole, once along a short one.
    const copies = Math.max(1, Math.min(3, Math.floor(total / (width * 6))));
    for (let k = 0; k < copies; k++) {
      let d = (total * (k + 1)) / (copies + 1) - width / 2;
      const mid = at(d + width / 2);
      if (mid.x < -margin || mid.y < -margin || mid.x > cam.viewW + margin || mid.y > cam.viewH + margin) continue;
      for (const ch of text) {
        const w = c.measureText(ch).width;
        const p = at(d + w / 2);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.angle);
        haloText(c, ch, 0, -7);
        c.restore();
        d += w;
      }
    }
  }

  const state0 = (st) => !!infraState?.settlements[st.id];
  function drawSettlementLabels(c, selectedId) {
    const z = zoomRel();
    const placed = [];
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineJoin = 'round';
    const known = foreignOrdered.filter((st) => foreignView[st.id]);
    // Then the towns known only from maps, fainter, where there is room.
    const mapped = [...foreignOrdered.filter((st) => !foreignView[st.id]), ...distantOrdered];
    const mappedSet = new Set(mapped.map((st) => st.id));
    const capitals = new Set([world.kingdom.capital, ...Object.values(world.realms?.realms ?? {}).map((r) => r.capital)]);
    for (const st of [...ordered, ...known, ...mapped]) {
      if (z < LABEL_ZOOM[st.type] && st.id !== selectedId) continue;
      // Pulled right back, only capitals keep their names.
      if (z < 0.8 && !capitals.has(st.id) && st.id !== selectedId) continue;
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -80 - margin || p.y < -40 - margin || p.x > cam.viewW + 80 + margin || p.y > cam.viewH + 40 + margin) continue;
      c.font = `${LABEL_FONT[st.type]} ${SERIF}`;
      const w = c.measureText(st.name).width;
      const y = p.y + Math.max(iconSize(st.type) / 2, (footprint[st.id] ?? 0) * 1.08) + 2;
      const box = { x0: p.x - w / 2 - 2, x1: p.x + w / 2 + 2, y0: y, y1: y + 15 };
      if (st.id !== selectedId && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      // A foreign town gives way to its realm's own name; Temeria's never do.
      if (!state0(st) && st.id !== selectedId && regionBoxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      c.strokeStyle = 'rgba(236, 224, 194, 0.9)';
      c.lineWidth = 3.5;
      c.strokeText(st.name, p.x, y);
      const remembered = foreignView[st.id] && !foreignView[st.id].visible;
      c.fillStyle = st.id === world.kingdom.capital ? COLOURS.border : mappedSet.has(st.id) ? 'rgba(43, 33, 22, 0.42)' : remembered ? 'rgba(43, 33, 22, 0.55)' : COLOURS.ink;
      c.fillText(st.name, p.x, y);
    }
  }

  // A frame identical to the last (paused, nothing selected changing, camera
  // still) is skipped, so a paused game costs next to no battery.
  let lastFrame = null;
  // What on screen moves of itself (M22 A): animated war (smoke, battles,
  // sieges, risings) and ambient life, counted on the last full draw, so the
  // loop knows whether a paused map needs any frames at all.
  let live = { war: 0, life: 0 };
  let lifeDrawn = 0;
  let saver = false;
  let idleT = null;
  function draw(state, frac, selection, { tick = null } = {}) {
    const selectedId = selection?.settlement ?? null;
    followLands();
    updateTints(state);
    updateInfra(state);
    const frame = { state, frac, unit: selection?.unit ?? null, army: selection?.army ?? null, company: selection?.company ?? null, threat: selection?.threat ?? null, realm: selection?.realm ?? null, selectedId, x: cam.x, y: cam.y, scale: cam.scale };
    if (!dirty && !baseDirty && !fogDirty && !fogPending && selectedId === lastSelected && lastFrame && lastFrame.state === frame.state
      && lastFrame.frac === frame.frac && lastFrame.unit === frame.unit && lastFrame.army === frame.army && lastFrame.company === frame.company && lastFrame.threat === frame.threat && lastFrame.realm === frame.realm
      && lastFrame.x === frame.x && lastFrame.y === frame.y && lastFrame.scale === frame.scale && tick === null) return;
    lastFrame = frame;
    stats.draws += 1;
    // A paused map drawn at the gentle rate keeps its life stirring by the
    // clock on the wall, not the realm's (which has stopped).
    idleT = tick;
    live = { war: 0, life: 0 };
    lifeDrawn = 0;
    // A new zoom, or a pan past the margin, redraws every layer from here.
    if (fogPending && performance.now() - lastFog > FOG_EVERY_MS) {
      fogPending = false;
      fogDirty = true;
    }
    if (!lc || lc.scale !== cam.scale || Math.abs(lc.x - cam.x) * cam.scale > margin * 0.9 || Math.abs(lc.y - cam.y) * cam.scale > margin * 0.9) {
      lc = { x: cam.x, y: cam.y, scale: cam.scale };
      stats.relayer += 1;
      dirty = true;
      baseDirty = true;
      fogDirty = true;
    }
    // On the board the settlements' layer is hidden, so it waits to be
    // redrawn until the camera comes back in; only the land and fog follow.
    const onBoard = boardness(cam) >= 0.99;
    withLayerCam(() => {
      if (onBoard) {
        if (baseDirty) drawBase();
      } else if (dirty || selectedId !== lastSelected) {
        drawStatic(selectedId);
        dirty = false;
        lastSelected = selectedId;
      } else if (baseDirty) drawBase();
      if (fogDirty) {
        drawFog();
        lastFog = performance.now();
      }
    });
    // Slide the backdrop by however far the camera has panned since, to the
    // nearest device pixel.
    const ox = Math.round((lc.x - cam.x) * cam.scale * dpr) / dpr - margin;
    const oy = Math.round((lc.y - cam.y) * cam.scale * dpr) / dpr - margin;
    const shift = `translate(${ox}px, ${oy}px)`;
    if (base.style.transform !== shift) for (const layer of [base, fog, cache]) layer.style.transform = shift;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // One map, two levels (M20 D): the settlements, their life and the
    // things that move fade out as the board of the North fades in.
    const b = boardness(cam);
    // Fully opaque, the opacity is cleared rather than set, so the layer is
    // composited exactly as it was before the board existed.
    const fade = b > 0 ? String(Math.round((1 - b) * 100) / 100) : '';
    if (cache.style.opacity !== fade) cache.style.opacity = fade;
    board.draw(state, cam, b, { selected: selection?.realm ?? null, orders: state.orders?.list ?? [] });
    if (b >= 0.99) return;
    ctx.globalAlpha = 1 - b;
    drawLifeLayer(state, frac);
    if (b < 0.3) drawPips(state);
    if (selectedId) {
      const st = world.byId[selectedId];
      const p = toScreen(cam, st.x, st.y);
      ring(ctx, p.x, p.y, Math.max(iconSize(st.type) / 2, footprint[selectedId] ?? 0) + 6);
    }

    const forceView = { ctx, cam, world, zoom: zoomRel(), selection, frac };
    drawForces(forceView, state, 'ground');
    for (const u of state.ambient.units) {
      // Battery saver (M22 A): half the travellers.
      if (saver && u.id % 2) continue;
      const w = unitPosition(world, u, u.pos + u.speed * frac);
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -20 || p.y < -20 || p.x > cam.viewW + 20 || p.y > cam.viewH + 20) continue;
      if (!unitInSight(w)) continue;
      live.life += 1;
      // Paused, a traveller still stirs a little on the spot.
      if (idleT !== null) p.y += Math.sin(idleT * 5 + u.id) * 0.8;
      const facing = Math.cos(w.angle) >= 0 ? 1 : -1;
      const colours = u.realm && u.kind !== 'export' ? world.realms?.realms[u.realm]?.colours : null;
      getSprite('unit', u.kind, u.kind === 'abroad' ? 'foreign' : u.kind === 'abroad_patrol' ? 'patrol' : u.kind === 'export' || u.kind === 'deal' ? 'caravan' : u.kind === 'exile' ? 'refugee' : u.kind)
        .draw(ctx, p.x, p.y - 4, UNIT_SIZE, { facing, colours, good: u.good });
      // Stopped on the road where a band holds it.
      if (u.held) {
        ctx.beginPath();
        ctx.arc(p.x + 6, p.y - 12, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#8b1e1e';
        ctx.fill();
      }
      if (selection?.unit === u.id) ring(ctx, p.x, p.y - 4, UNIT_SIZE / 2 + 5);
    }
    // Witchers on contract (M22 B): a lone rider out to the lair, the fight
    // there, and the ride home.
    for (const c of state.threats?.contracts ?? []) {
      const w = witcherOnRoad(state, world, c, frac);
      if (!w) continue;
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -20 || p.y < -20 || p.x > cam.viewW + 20 || p.y > cam.viewH + 20) continue;
      if (w.phase === 'fight') live.war += 1;
      else live.life += 1;
      getSprite('unit', 'witcher').draw(ctx, p.x, p.y - 4, UNIT_SIZE * 1.1, { facing: w.facing, fighting: w.phase === 'fight', t: idleT ?? performance.now() / 1000 });
      if (selection?.witcher === c.threat) ring(ctx, p.x, p.y - 4, UNIT_SIZE / 2 + 5);
    }
    // Figures on the road (M23 C): envoys, spies, couriers, lords and
    // commanders, each on an errand of the crown's or a foreign court's.
    for (const f of state.figures ?? []) {
      const w = figurePosition(world, f, state.day + frac);
      if (f.side !== TEMERIA && !unitInSight(w)) continue;
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -20 || p.y < -20 || p.x > cam.viewW + 20 || p.y > cam.viewH + 20) continue;
      live.life += 1;
      const house = f.kind === 'lord' ? Object.values(world.houses?.houses ?? {}).find((h) => h.lord === f.name) : null;
      getSprite('unit', 'figure').draw(ctx, p.x, p.y - 4, UNIT_SIZE * 1.05, { kind: f.kind, facing: Math.cos(w.angle) >= 0 ? 1 : -1, colours: house?.colours ?? sideColours(world, f.side) });
      if (selection?.figure === f.id) ring(ctx, p.x, p.y - 4, UNIT_SIZE / 2 + 5);
    }
    drawWar(state, frac, selection);
    drawForces(forceView, state, 'tokens');
    ctx.globalAlpha = 1;
  }

  // Each Temerian place's works as small pips beside it (M20 D): working,
  // short of hands, damaged, being mended.
  const PIP = { ok: '#8fbf62', short: '#7f9bc4', damaged: '#c0392b', repairing: '#e0a040' };
  // Each place's pips change at most once a day, so they are worked out once
  // per state and kept for every frame drawn from it.
  let pipState = null;
  let pipKinds = new Map();
  function pipsOf(state, id) {
    if (pipState !== state) {
      pipState = state;
      pipKinds = new Map();
    }
    let kinds = pipKinds.get(id);
    if (!kinds) {
      kinds = spacesOf(state, world, id).flatMap((sp) => sp.works).slice(0, 10)
        .map((w) => (w.repair ? 'repairing' : w.cond < 50 ? 'damaged' : w.staff < 70 ? 'short' : 'ok'));
      pipKinds.set(id, kinds);
    }
    return kinds;
  }
  function drawPips(state) {
    if (zoomRel() < 1.2) return;
    for (const st of world.geography.settlements) {
      const s = state.settlements[st.id];
      if (!s || s.occupier) continue;
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -40 || p.y < -40 || p.x > cam.viewW + 40 || p.y > cam.viewH + 40) continue;
      const kinds = pipsOf(state, st.id);
      if (!kinds.length) continue;
      const r = Math.max(iconSize(st.type) / 2, (footprint[st.id] ?? 0) * 0.7) + 5;
      const n = kinds.length;
      for (let i = 0; i < n; i++) {
        const kind = kinds[i];
        const x = p.x + r + 2 + (i % 5) * 6;
        const y = p.y - 6 + Math.floor(i / 5) * 6;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = PIP[kind];
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(29, 22, 16, 0.8)';
        ctx.stroke();
      }
    }
  }

  // The layers are drawn as seen from the camera they were started from.
  function withLayerCam(fn) {
    const { x, y } = cam;
    cam.x = lc.x;
    cam.y = lc.y;
    try {
      fn();
    } finally {
      cam.x = x;
      cam.y = y;
    }
  }

  // Smoke, workers, beasts and boats round the settlements in view, only
  // when close enough to see them.
  // Life at the works (M22 B), worked out once per state for each of our
  // places and kept for every frame drawn from it.
  let lifeState = null;
  let lifeOf = new Map();
  function worksLifeOf(state, id) {
    if (lifeState !== state) {
      lifeState = state;
      lifeOf = new Map();
    }
    let l = lifeOf.get(id);
    if (!l) {
      l = { ...worksLife(state, world, id) };
      // Townsfolk in our towns and cities (M23 D).
      const type = world.byId[id].type;
      const s = state.settlements[id];
      if ((type === 'city' || type === 'town') && s && !s.occupier) {
        const fear = (state.dread ?? 0) > 60 ? 0.4 : 1;
        const cold = seasonLook(dateOf(state.day).month).snow ? 0.6 : 1;
        l.folk = Math.round(Math.min(12, totalPopulation(s) / 1500) * fear * cold);
      }
      lifeOf.set(id, l);
    }
    return l;
  }
  // At most this many figures at the works on screen at once; half under
  // Battery saver. Only drawn zoomed in far enough to see them.
  const LIFE_CAP = 240;
  function drawLifeLayer(state, frac) {
    if (cam.scale < layoutCfg.zoom.life) return;
    const look = seasonLook(dateOf(state.day).month);
    const time = state.day + frac;
    const budget = { left: saver ? LIFE_CAP / 2 : LIFE_CAP, half: saver };
    for (const st of [...ordered, ...foreignOrdered]) {
      const ours = !!state.settlements[st.id] && !state.settlements[st.id].occupier;
      if (!state.settlements[st.id] && !foreignView[st.id]?.visible) continue;
      const p = toScreen(cam, st.x, st.y);
      if (p.x < -120 || p.y < -120 || p.x > cam.viewW + 120 || p.y > cam.viewH + 120) continue;
      art.drawLife(ctx, st, cam.scale, p.x, p.y, time, look, ours ? worksLifeOf(state, st.id) : null, budget);
    }
    lifeDrawn = (saver ? LIFE_CAP / 2 : LIFE_CAP) - budget.left;
  }

  // Battlefields of the last days, sieges, and the armies themselves. The
  // crown sees its own armies everywhere, and foreign ones only in sight.
  function drawWar(state, frac, selection) {
    if (!state.armies) return;
    // Smouldering towns, and towns in revolt (M19).
    for (const [id, s] of Object.entries(state.settlements)) {
      if (!(s.smoulder > state.day)) continue;
      const st = world.byId[id];
      const p = toScreen(cam, st.x, st.y);
      smoke(ctx, p.x, p.y - 4, iconSize(st.type) * 0.8);
      live.war += 1;
    }
    for (const realm of Object.values(state.realms ?? {})) {
      for (const [id, s] of Object.entries(realm.settlements)) {
        if (!(s.smoulder > state.day) || !unitInSight(world.byId[id])) continue;
        const p = toScreen(cam, world.byId[id].x, world.byId[id].y);
        smoke(ctx, p.x, p.y - 4, iconSize(world.byId[id].type) * 0.8);
        live.war += 1;
      }
    }
    for (const r of state.conquest?.revolts ?? []) {
      const st = world.byId[r.town];
      if (!st || (r.against !== TEMERIA && !unitInSight(st))) continue;
      const p = toScreen(cam, st.x, st.y);
      drawRebels(ctx, p.x + iconSize(st.type) * 0.4, p.y - iconSize(st.type) * 0.3, 14, sideColours(world, r.origin === TEMERIA ? TEMERIA : r.origin), r.id);
      live.war += 1;
    }
    for (const b of state.battles) {
      if (state.day - b.day > 12 || !unitInSight(b)) continue;
      const p = toScreen(cam, b.x, b.y);
      getSprite('marker', 'battle').draw(ctx, p.x + 10, p.y - 14, 18);
    }
    // Sieges (M19): the camp round the town, its walls as they stand.
    for (const a of state.armies) {
      if (!a.siege || !unitInSight(world.byId[a.at])) continue;
      const st = world.byId[a.at];
      const p = toScreen(cam, st.x, st.y);
      const r = Math.max(iconSize(st.type) / 2 + 8 * Math.min(1.6, Math.max(0.8, Math.sqrt(zoomRel()))), (footprint[st.id] ?? 0) * 1.05);
      if (a.siege.wallsMax !== undefined) {
        drawSiege(ctx, p.x, p.y, r, { colours: sideColours(world, a.side), men: a.soldiers, walls: a.siege.walls, wallsMax: a.siege.wallsMax, breached: a.siege.wallsMax > 0 && a.siege.walls <= 0, seed: a.id });
        live.war += 1;
      } else getSprite('marker', 'siege').draw(ctx, p.x, p.y, iconSize(st.type) + 22, { colours: sideColours(world, a.side), progress: a.siege.progress });
    }
    // Battles in progress, and the rout for a day or two after.
    for (const f of state.fights ?? []) {
      if (!unitInSight({ x: f.x, y: f.y })) continue;
      const p = toScreen(cam, f.x, f.y);
      if (p.x < -60 || p.y < -60 || p.x > cam.viewW + 60 || p.y > cam.viewH + 60) continue;
      const size = 34 * Math.max(0.8, Math.min(1.5, Math.sqrt(zoomRel())));
      const men = [0, 1].map((i) => lineOf(state, f, i) + f.reserve[i]);
      live.war += 1;
      drawBattle(ctx, p.x, p.y - 8, size, {
        colours: f.sides.map((sd) => sideColours(world, sd)), men, phase: f.phase, over: !!f.over, loser: f.over ? 1 - f.over.winner : null, seed: f.id,
      });
      if (selection?.battle === f.id) ring(ctx, p.x, p.y - 8, size);
    }
    for (const a of state.armies) {
      if (a.battle) continue;
      const w = armyAt(a, frac);
      if (!w) continue;
      const p = toScreen(cam, w.x, w.y);
      if (p.x < -30 || p.y < -30 || p.x > cam.viewW + 30 || p.y > cam.viewH + 30) continue;
      const facing = Math.cos(w.angle) >= 0 ? 1 : -1;
      const size = ARMY_SIZE * Math.max(0.75, Math.min(1.2, Math.sqrt(zoomRel())));
      // An army led by a lord's marshal marches under his house's colours.
      const house = a.side === TEMERIA ? world.houses?.houses[world.war.marshals[a.marshal]?.house] : null;
      if (a.to && a.dest && world.byId[a.dest]) {
        const d = toScreen(cam, world.byId[a.dest].x, world.byId[a.dest].y);
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(d.x, d.y);
        ctx.strokeStyle = a.side === TEMERIA ? 'rgba(35, 54, 94, 0.5)' : 'rgba(110, 30, 20, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        // How long until it arrives, at its destination (our armies only:
        // where a foreign army is bound is not ours to know).
        if (a.side === TEMERIA) {
          const n = daysToArrive(state, world, a);
          ctx.font = '600 11px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = '#23365e';
          haloText(ctx, n === 1 ? '1 day' : `${n} days`, d.x, d.y - 34);
        }
      }
      const colours = house?.colours ?? sideColours(world, a.side);
      // A column sized by its men (M23 C): a figure for every 400, wagons
      // for a large army, dust on the march; at night, while it marches, it
      // camps by the road. Battery saver draws a shorter column.
      const night = a.to && frac >= 0.78;
      if (night) getSprite('army', a.side, 'camp').draw(ctx, p.x, p.y - 4, size * 1.1, { colours, tents: Math.ceil(a.soldiers / 1200) + 1 });
      else {
        getSprite('army', a.side, 'column').draw(ctx, p.x, p.y - 6, size, {
          colours, figures: Math.round(a.soldiers / 400), max: saver ? 6 : 12, angle: a.to ? Math.atan2(Math.sin(w.angle), Math.cos(w.angle)) : (facing > 0 ? 0 : Math.PI),
          marching: !!a.to, dust: !saver, wagons: a.soldiers >= 4000 ? 2 : a.soldiers >= 1500 ? 1 : 0, dim: a.retreating, seed: a.id,
        });
      }
      // Foraging parties out from an army living off an enemy's land.
      if (!a.siege && !a.to && hostile(state, a.side, ownerOf(state, world, a.at)) && ownerOf(state, world, a.at) !== a.side) {
        for (let i = 0; i < (saver ? 1 : 2); i++) {
          const ang = ((state.day * 37 + a.id * 101 + i * 173) % 360) * (Math.PI / 180);
          const fx = p.x + Math.cos(ang) * size * 1.3;
          const fy = p.y + Math.sin(ang) * size * 0.7;
          getSprite('military', 'soldier').draw(ctx, fx, fy, size * 0.42, { coat: colours[0] });
          getSprite('military', 'soldier').draw(ctx, fx + size * 0.2, fy + size * 0.06, size * 0.42, { coat: colours[0] });
        }
      }
      if (zoomRel() >= 2.2) armyDetail(ctx, p.x, p.y + size * 0.35, a.soldiers, a.morale);
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
    // On the board a tap picks a realm (M20 D).
    if (boardness(cam) >= 0.5) {
      const rid = board.pick(cam, sx, sy);
      return rid ? { realm: rid } : null;
    }
    // The crown's companies and what they hunt are deliberate things to tap.
    const force = pickForces({ ctx, cam, world, zoom: zoomRel(), frac }, state, sx, sy);
    if (force) return force;
    let best = null;
    // A battle on the field opens its card.
    for (const f of state.fights ?? []) {
      if (!unitInSight({ x: f.x, y: f.y })) continue;
      const p = toScreen(cam, f.x, f.y);
      const d = Math.hypot(p.x - sx, p.y - 8 - sy);
      if (d < 34 && (!best || d < best.d)) best = { d, hit: { battle: f.id } };
    }
    if (best) return best.hit;
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
    for (const c of state.threats?.contracts ?? []) {
      const w = witcherOnRoad(state, world, c, frac);
      if (!w) continue;
      const p = toScreen(cam, w.x, w.y);
      const d = Math.hypot(p.x - sx, p.y - 4 - sy);
      if (d < 20 && (!best || d < best.d)) best = { d, hit: { witcher: c.threat } };
    }
    for (const f of state.figures ?? []) {
      const w = figurePosition(world, f, state.day + frac);
      if (f.side !== TEMERIA && !unitInSight(w)) continue;
      const p = toScreen(cam, w.x, w.y);
      const d = Math.hypot(p.x - sx, p.y - 4 - sy);
      if (d < 20 && (!best || d < best.d)) best = { d, hit: { figure: f.id } };
    }
    for (const st of world.geography.settlements) {
      const p = toScreen(cam, st.x, st.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      // Buildings and soldiers round a settlement count as part of it.
      const dressed = zoomRel() >= LABEL_ZOOM[st.type] && infraState
        && (infraState.settlements[st.id].buildings.length || figures(infraState.settlements[st.id].garrison));
      const reach = Math.max(22, iconSize(st.type) / 2 + 8, (footprint[st.id] ?? 0) * 0.9) + (dressed ? 20 : 0);
      const score = d * 0.5;
      if (d < reach && (!best || score < best.d)) best = { d: score, hit: { settlement: st.id } };
    }
    for (const st of distantOrdered) {
      const p = toScreen(cam, st.x, st.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < 18 && (!best || d * 0.6 < best.d)) best = { d: d * 0.6, hit: { distant: st.id } };
    }
    for (const st of foreignOrdered) {
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
    resize, draw, pick,
    // Anything on screen that moves of itself: 'war' (smoke, battles), 'life'
    // (travellers on the roads), or null.
    lively: () => (live.war ? 'war' : live.life ? 'life' : null),
    setSaver(on) {
      saver = !!on;
      dirty = true;
      if (infraState) updateCountry(infraState);
    },
    get countryStats() { return { marks: countryside.marks.length, look: { season: countryLook.season, burnt: countryLook.burnt.size, bare: countryLook.bare.size, thin: countryLook.thin } }; },
    // Layers still to finish (tiles filled in over several frames, the fog
    // waiting its turn): the loop keeps asking for frames until they are.
    unfinished: () => dirty || baseDirty || fogDirty || fogPending,
    // For browser tests: what is left to draw and what moves on screen.
    get flags() { return { dirty, baseDirty, fogDirty, fogPending, live, lifeDrawn }; },
    unitScreen, armyScreen, stats, artStats: art.stats, planOf: art.planOf,
    get boardness() { return boardness(cam); },
    get tileStats() { return { size: tiles.size, drawn: tiles.stats.drawn, pending: baseDirty }; },
    invalidate: () => { dirty = true; baseDirty = true; fogDirty = true; },
    // The camera jumped (centred on a place): draw the cached layers round
    // where it landed, so the next pan has the whole margin to slide in.
    recentre: () => { lc = null; },
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

function armyDetail(ctx, x, y, men, morale) {
  ctx.font = '600 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(236, 224, 194, 0.9)';
  ctx.lineWidth = 3;
  ctx.strokeText(String(Math.round(men)), x, y);
  ctx.fillStyle = '#2b2116';
  ctx.fillText(String(Math.round(men)), x, y);
  ctx.fillStyle = 'rgba(43, 33, 22, 0.6)';
  ctx.fillRect(x - 12, y + 12, 24, 3);
  ctx.fillStyle = morale > 60 ? '#5f8f3a' : morale > 35 ? '#c9a03a' : '#9a3324';
  ctx.fillRect(x - 12, y + 12, (24 * Math.max(0, Math.min(100, morale))) / 100, 3);
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
