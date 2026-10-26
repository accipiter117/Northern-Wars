// The Battle card and the siege panel (M19): both sides' men, spirit and
// losses, a bar showing who is winning, the reserve, the events so far, and
// the crown's two orders; a siege's walls, food, camp and orders.
import {
  TEMERIA, sideName, sideColours, formatDate, battleOdds, lineOf, canBattleOrder, stormOdds, wallsOf, attritionOf,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr, cardHead } from './card.js';

const PHASES = { skirmish: 'Skirmish: the archers trade volleys', melee: 'The melee', rout: 'Rout and pursuit' };
const WEATHER = { rain: 'rain', snow: 'snow', clear: 'clear skies' };
const GROUND = { open: 'open ground', forest: 'woodland', hills: 'hill country', mountains: 'the mountains', marsh: 'marshland' };

export function battleTitle(world, f) {
  return `The battle near ${f.place}`;
}

export function battleCard(app, id) {
  const { world, state } = app;
  const f = (state.fights ?? []).find((x) => x.id === id);
  if (!f) return '<div data-part="head"><p class="sub">The battle is over. Its report is in the Chronicle.</p></div>';
  const ours = f.sides.indexOf(TEMERIA);
  const me = ours >= 0 ? ours : 0;
  const odds = f.over ? (f.over.winner === me ? 1 : f.over.winner === null ? 0.5 : 0) : battleOdds(state, world, f, me);
  const side = (i) => {
    const [field] = sideColours(world, f.sides[i]);
    const line = lineOf(state, f, i);
    return `<div class="bside" style="--side:${field}">
      <h4>${escapeHtml(sideName(world, f.sides[i]))}</h4>
      <dl class="stats">
        <div><dt>In the line</dt><dd>${number(Math.round(line))}</dd></div>
        <div><dt>In reserve</dt><dd>${f.reserve[i] >= 1 ? number(Math.round(f.reserve[i])) : f.committed[i] ? 'Committed' : 'None'}</dd></div>
        <div><dt>Fallen or fled</dt><dd>${number(Math.round(f.lost[i]))}</dd></div>
      </dl>
      <div class="gauge-row"><div class="lbl"><span>Spirit</span><span>${Math.max(0, Math.round(f.spirit[i]))}</span></div>
        <div class="gauge${f.spirit[i] < 30 ? ' bad' : ''}"><span style="width:${Math.max(0, Math.min(100, f.spirit[i]))}%"></span></div></div>
    </div>`;
  };
  const commit = ours >= 0 && !f.over ? canBattleOrder(state, world, f.id, 'commit') : null;
  const orders = ours >= 0 && !f.over ? `<div data-part="orders"><h3>Orders</h3><div class="build-list">
      <button type="button" class="build" ${orderAttr({ type: 'battle', battle: f.id, order: 'commit' })} ${commit.ok ? '' : 'disabled'}>
        <span class="build-name">Commit the reserve</span><span class="build-blurb">More men in the line now: better odds, heavier losses.</span>
        <span class="build-cost">${commit.ok ? `${number(Math.round(f.reserve[ours]))} men` : escapeHtml(commit.reason)}</span></button>
      <button type="button" class="build danger" ${orderAttr({ type: 'battle', battle: f.id, order: 'retreat' }, 'Sound the retreat and give up the field?')}>
        <span class="build-name">Sound the retreat</span><span class="build-blurb">Save what remains. The withdrawal costs more once the lines have closed, and more again against horse.</span></button>
    </div></div>` : '';
  const events = f.events.map((e) => `<li>${escapeHtml(e.text)}</li>`).join('');
  const verdict = f.over ? (f.over.winner === null ? 'The armies have parted.' : `${escapeHtml(sideName(world, f.sides[f.over.winner]))} holds the field.`) : escapeHtml(PHASES[f.phase]);
  return `${cardHead({
    status: `<span>Day ${f.round} of the fighting, since ${formatDate(f.day)}, on ${GROUND[f.ground] ?? f.ground}, under ${WEATHER[f.weather]}. ${verdict}</span>`,
    chips: [],
  })}
  <div data-part="balance" class="balance">
    <div class="balance-bar" role="img" aria-label="Who is winning"><span style="width:${Math.round(odds * 100)}%;background:${sideColours(world, f.sides[me])[0]}"></span><i style="background:${sideColours(world, f.sides[1 - me])[0]}"></i></div>
    <p class="sub">${f.over ? '' : `As our captains reckon it, ${Math.round(odds * 100)}% that ${escapeHtml(sideName(world, f.sides[me]))} carries the day.`}</p>
  </div>
  <div data-part="sides" class="bsides">${side(me)}${side(1 - me)}</div>
  ${orders}
  <div data-part="events"><h3>The fighting so far</h3>${events ? `<ul class="bevents">${events}</ul>` : '<p class="sub">The armies are drawing up.</p>'}</div>`;
}

// A siege, from the besiegers' side: walls, food, the camp, and orders.
export function siegeHtml(world, state, a) {
  const s = a.siege;
  if (!s) return '';
  const p = state.settlements[a.at] ?? state.realms[world.realmOf[a.at]]?.settlements[a.at];
  const ours = a.side === TEMERIA;
  const o = stormOdds(state, world, a);
  const kind = s.wallsMax >= 80 ? 'Stone walls' : s.wallsMax > 0 ? 'Timber walls' : 'No walls';
  const events = (s.events ?? []).map((e) => `<li>${escapeHtml(e.text)}</li>`).join('');
  return `<div data-part="siege" class="siege"><h3>The siege of ${escapeHtml(world.byId[a.at].name)}</h3>
    <div class="gauge-row"><div class="lbl"><span>${kind}</span><span>${s.wallsMax ? `${Math.round(s.walls)} of ${s.wallsMax}` : 'Open to assault'}</span></div>
      <div class="gauge${s.walls < 20 ? ' bad' : ''}"><span style="width:${s.wallsMax ? Math.round((100 * s.walls) / s.wallsMax) : 0}%"></span></div></div>
    <dl class="stats">
      <div><dt>Garrison</dt><dd>${number(Math.round(p?.garrison ?? 0))}</dd></div>
      <div><dt>Food left</dt><dd>${s.food > 0 ? `${number(s.food)} days` : 'None: they starve'}</dd></div>
      <div><dt>Days of siege</dt><dd>${s.days}</dd></div>
      <div><dt>Lost to sickness</dt><dd>${number(Math.round(s.sick))}</dd></div>
      <div><dt>Sallies</dt><dd>${s.sallies}</dd></div>
      ${s.reliefSeen ? `<div><dt>Relief</dt><dd class="down">An army is coming</dd></div>` : ''}
    </dl>
    ${s.terms ? '<p class="warn">They offer to surrender on terms. Answer at court.</p>' : ''}
    ${ours ? `<div class="build-list">
      <button type="button" class="build" ${orderAttr({ type: 'siege', army: a.id, order: 'storm' }, `Storm the walls? About ${o.loss} men will fall if it is taken, ${o.failLoss} if it fails.`)}>
        <span class="build-name">Storm the walls</span><span class="build-blurb">${Math.round(o.odds * 100)}% to take it. Expect about ${number(o.loss)} dead if it falls, ${number(o.failLoss)} if thrown back.</span></button>
      <button type="button" class="build" ${orderAttr({ type: 'siege', army: a.id, order: 'starve' })} ${s.hold ? 'disabled' : ''}>
        <span class="build-name">Starve them out</span><span class="build-blurb">${s.hold ? 'Our marshal will not storm unless told to.' : 'Sit tight and let hunger do the work; sickness thins our camp meanwhile.'}</span></button>
      <button type="button" class="build danger" ${orderAttr({ type: 'siege', army: a.id, order: 'lift' }, 'Lift the siege and march away?')}>
        <span class="build-name">Lift the siege</span></button>
    </div>` : ''}
    ${events ? `<ul class="bevents">${events}</ul>` : ''}</div>`;
}

// What field attrition has cost an army this past month, and why.
export function attritionHtml(a) {
  const w = attritionOf(a);
  const total = Object.values(w).reduce((x, y) => x + y, 0);
  if (total < 1) return '';
  const names = { supply: 'supply', winter: 'winter', disease: 'disease', desertion: 'desertion' };
  const parts = Object.entries(w).filter(([, v]) => v >= 1).map(([k, v]) => `${names[k]} ${number(Math.round(v))}`).join(', ');
  return `<p class="sub">Lost in the last month outside battle: ${number(Math.round(total))} men (${parts}).</p>`;
}

// For the town card of a Crown town under siege: what the defenders face.
export function defendedSiegeHtml(world, state, id) {
  const a = (state.armies ?? []).find((x) => x.siege && x.at === id && x.side !== TEMERIA);
  if (!a) return '';
  const s = a.siege;
  return `<p class="warn">Walls ${s.wallsMax ? `${Math.round(s.walls)} of ${s.wallsMax}` : 'none'}; food for ${Math.max(0, s.food)} days; the besiegers have lost ${number(Math.round(s.sick))} to sickness.</p>`;
}

export { wallsOf };
