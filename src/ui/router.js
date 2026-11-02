// Every screen the panel can show, by route: the five tabs (each with its
// sub-tabs) and the cards opened from them or from the map.
import { escapeHtml } from './format.js';
import { battleCard, battleTitle } from './battle.js';
import { segs, section } from './card.js';
import { setOpen } from './memory.js';
import { realmTab, meterCard, repairOrderHtml } from './realmTab.js';
import { pendingDecisions, inboxHtml } from './inbox.js';
import { stewardHtml } from './steward.js';
import { lawsHtml } from './laws.js';
import { noblesHtml, houseCard, swatch, depositionHtml, vassalCard } from './nobles.js';
import { faithHtml, freshPowers } from './faith.js';
import { spiesHtml } from './spies.js';
import { handHtml } from './hand.js';
import { crownStyle, suzerainOf, ourVassals, sideName, vassalOf } from '../sim/index.js';
import { ledgerHtml, chronicleHtml } from './menu.js';
import { industryHtml } from './trade.js';
import { marketHtml, taxesHtml } from './market.js';
import { forcesHtml, threatsHtml, companyCard, threatCard, threatLabel } from './forces.js';
import { garrisonsHtml } from './military.js';
import { warHtml, armyCard } from './war.js';
import { neighboursHtml, intelListHtml, envoysHtml, realmCard, foreignCardHtml, pactsHtml } from './neighbours.js';
import { townCard } from './townCard.js';
import { helpHtml } from './hints.js';
import { boardCard, boardTitle, ordersHtml } from './board.js';

// Fourteen sub-screens (M34 C), where there were twenty.
export const SUBS = {
  // Labour stays first, as M23 B set it: the realm's most-used screen.
  realm: [['labour', 'Labour'], ['overview', 'Overview']],
  court: [['inbox', 'Decisions'], ['laws', 'Book of Laws'], ['faith', 'Faith'], ['houses', 'Lords and vassals']],
  treasury: [['ledger', 'Ledger'], ['trade', 'Trade and mines']],
  military: [['forces', 'Forces'], ['threats', 'Threats'], ['war', 'War']],
  diplomacy: [['realms', 'Rulers'], ['envoys', 'Audiences and pacts'], ['spies', 'Spies']],
};

// The old sub-screens and where they live now, for deep links and saved
// navigation (M34 C). The Court's Spies moved to Diplomacy.
const MOVED = {
  'realm:places': 'realm:overview',
  'court:spies': 'diplomacy:spies',
  'treasury:taxes': 'treasury:ledger',
  'treasury:industry': 'treasury:trade',
  'treasury:routes': 'treasury:trade',
  'military:garrisons': 'military:forces',
  'diplomacy:pacts': 'diplomacy:envoys',
  'diplomacy:intel': 'diplomacy:spies',
};

// Where a tab and sub-screen live now: "treasury:taxes" gives
// "treasury:ledger"; an unknown sub-screen gives the tab's first.
export function canonicalTab(where) {
  const moved = MOVED[where] ?? where;
  const [tab, sub] = moved.split(':');
  if (!SUBS[tab]) return moved;
  return `${tab}:${SUBS[tab].some(([id]) => id === sub) ? sub : SUBS[tab][0][0]}`;
}

// The fold an old link means, opened when it is followed.
const FOLDS = {
  'treasury:taxes': 'taxes',
  'treasury:industry': 'mines',
  'treasury:routes': 'mines',
  'military:garrisons': 'garrisons',
  'diplomacy:pacts': 'pacts',
  'diplomacy:intel': 'embassies',
};
export function goWhere(memory, where) {
  const to = canonicalTab(where);
  const fold = FOLDS[where];
  if (fold) setOpen(memory, `tab:${to.split(':')[0]}`, fold, true);
  return to;
}

// Old ids in saved navigation, mapped to their new homes (M34 C).
export function mendSubs(memory) {
  for (const tab of Object.keys(SUBS)) {
    const at = memory.sub?.[tab];
    if (!at) continue;
    const [t, s] = canonicalTab(`${tab}:${at}`).split(':');
    if (t === tab) memory.sub[tab] = s;
    else memory.sub[tab] = SUBS[tab][0][0];
  }
}

const TAB_TITLES = { court: 'The Court', treasury: 'Treasury', military: 'Military', diplomacy: 'Diplomacy' };

// Small counts shown on sub-tabs, so what waits is never hidden one level down.
function subBadges(app, tab) {
  const { state, world } = app;
  if (tab === 'court') return { inbox: pendingDecisions(state, world, app.acked()).length, faith: freshPowers(state, world, app.memory.faithSeen ?? 0) };
  if (tab === 'military') return { threats: app.looseThreats(), war: state.warDecisions?.length ?? 0 };
  if (tab === 'diplomacy') return { envoys: state.envoys.length + (state.diplomacy?.requests.length ?? 0) };
  return {};
}

function tabScreen(app, tab) {
  mendSubs(app.memory);
  if (tab === 'realm') return realmTab(app);
  const sub = app.memory.sub[tab];
  // What a merged screen gathers below its own, each in a fold of its own.
  const fold = (id, title, html, count = null) => section(app.memory, `tab:${tab}`, id, title, html, { count });
  const badges = subBadges(app, tab);
  const list = SUBS[tab].map(([id, label]) => [id, label, badges[id] || 0]);
  let html = '';
  if (tab === 'court') {
    if (sub === 'laws') html = lawsHtml(app);
    else if (sub === 'houses') html = noblesHtml(app) + fold('vassals', 'Vassal kings', vassalsHtml(app), ourVassals(app.state).length || null);
    else if (sub === 'faith') {
      html = faithHtml(app);
      if (app.memory.faithSeen !== app.state.day) {
        app.memory.faithSeen = app.state.day;
        app.badges?.();
      }
    }
    else html = stewardHtml(app) + inboxHtml(pendingDecisions(app.state, app.world, app.acked()));
  } else if (tab === 'treasury') {
    if (sub === 'trade') html = marketHtml(app) + fold('mines', 'Mines, gold and industry', industryHtml(app));
    else html = stewardHtml(app) + ledgerHtml(app) + fold('taxes', 'Taxes and loans', taxesHtml(app)) + fold('repairs', 'The standing order for repairs', repairOrderHtml(app.state));
  } else if (tab === 'military') {
    if (sub === 'threats') html = threatsHtml(app);
    else if (sub === 'war') html = warHtml(app);
    else html = forcesHtml(app) + fold('garrisons', 'Garrisons', garrisonsHtml(app));
  } else if (tab === 'diplomacy') {
    if (sub === 'spies') html = spiesHtml(app) + fold('embassies', 'Embassies and agents abroad', intelListHtml(app));
    else if (sub === 'envoys') html = envoysHtml(app) + fold('pacts', 'Pacts and the web of alliances', pactsHtml(app));
    else html = neighboursHtml(app);
  }
  // Foltest's style heads the Court, growing with each title won (M29 A).
  const style = tab === 'court' ? `<p class="crown-style" data-part="style">${escapeHtml(crownStyle(app.state, app.world))}</p>` : '';
  return { title: TAB_TITLES[tab], html: `${style}${segs(list, sub)}${html}` };
}

// The vassal kings, beside the great houses (M34 C): each opens its card.
function vassalsHtml(app) {
  const { state, world } = app;
  const list = ourVassals(state);
  if (!list.length) return '';
  return `<div class="rows" data-part="vassal-kings">${list.map((rid) => {
    const v = vassalOf(state, world, rid);
    return `<button type="button" class="row realm-row" data-vassal="${rid}" data-go="vassal:${rid}"><span class="row-main"><span class="row-name">${escapeHtml(sideName(world, rid))}</span>
      <span class="row-sub">Loyalty ${Math.round(v?.loyalty ?? 0)}</span></span></button>`;
  }).join('')}</div>`;
}

const gone = (title, what) => ({ title, html: `<div data-part="head"><p class="sub">${what}</p></div>` });

export function renderRoute(app, route) {
  const { world, state } = app;
  const [kind, arg] = route.split(/:(.*)/s);
  switch (kind) {
    case 'tab': return tabScreen(app, arg);
    case 'town': return world.byId[arg] && state.settlements[arg] ? { title: escapeHtml(world.byId[arg].name), html: townCard(app, arg) } : gone('Gone', 'No such place.');
    case 'vassal': return state.realms?.[arg] && suzerainOf(state, arg) === 'temeria' ? { title: escapeHtml(world.geography.neighbours[arg]?.name ?? arg), html: vassalCard(app, arg) } : gone('Gone', 'No longer our vassal.');
    case 'house': return world.houses.houses[arg] && state.houses[arg] ? { title: `${swatch(world, arg)} ${escapeHtml(world.houses.houses[arg].name)}`, html: houseCard(app, arg) } : gone('Gone', 'No such house.');
    case 'board': return state.realms?.[arg] && !state.realms[arg].fallen ? { title: boardTitle(app, arg), html: boardCard(app, arg) } : gone('Gone', 'No such realm.');
    case 'orders': return { title: 'The month\'s orders', html: ordersHtml(app) };
    case 'realm': return world.neighbours.realms[arg] ? { title: escapeHtml(world.geography.neighbours[arg].name), html: realmCard(app, arg) } : gone('Gone', 'No such realm.');
    case 'foreign': {
      const view = app.foreignView(arg);
      return view ? { title: escapeHtml(world.byId[arg].name), html: foreignCardHtml(world, state, arg, view) } : gone(escapeHtml(world.byId[arg]?.name ?? 'Unknown'), 'Our watchers have never seen it.');
    }
    case 'company': {
      const c = state.forces.companies.find((x) => x.id === Number(arg));
      return { title: escapeHtml(c?.name ?? 'Gone'), html: companyCard(app, Number(arg)) };
    }
    case 'threat': {
      const t = state.threats.list.find((x) => x.id === Number(arg));
      return { title: escapeHtml(t ? threatLabel(world, t) : 'Gone'), html: threatCard(app, Number(arg)) };
    }
    case 'battle': {
      const f = (state.fights ?? []).find((x) => x.id === Number(arg));
      return { title: escapeHtml(f ? battleTitle(world, f) : 'The battle'), html: battleCard(app, Number(arg)) };
    }
    case 'army': {
      const a = state.armies.find((x) => x.id === Number(arg));
      return { title: escapeHtml(a?.name ?? 'Gone'), html: armyCard(app, Number(arg)) };
    }
    case 'meter': return meterCard(app, arg);
    case 'chronicle': return { title: 'Chronicle', html: chronicleHtml(state, app.memory.forms.chronicle?.filter ?? 'all') };
    case 'help': return { title: 'Help', html: helpHtml(app) };
    // Every act with a cost or a rest, in one list (M34 B).
    case 'hand': return { title: 'The crown\'s hand', html: handHtml(app) };
    case 'deposition': {
      const d = state.depositions.at(-1);
      return d ? { title: 'The crown is deposed', html: `<div data-part="head">${depositionHtml(d)}</div>` } : gone('Deposition', 'The crown has never been deposed.');
    }
    default: return gone('Lost', 'Nothing here.');
  }
}
