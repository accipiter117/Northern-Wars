// Every screen the panel can show, by route: the five tabs (each with its
// sub-tabs) and the cards opened from them or from the map.
import { escapeHtml } from './format.js';
import { battleCard, battleTitle } from './battle.js';
import { segs } from './card.js';
import { realmTab, meterCard } from './realmTab.js';
import { pendingDecisions, inboxHtml } from './inbox.js';
import { stewardHtml } from './steward.js';
import { lawsHtml } from './laws.js';
import { noblesHtml, houseCard, swatch, depositionHtml } from './nobles.js';
import { faithHtml, freshPowers } from './faith.js';
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

export const SUBS = {
  realm: [['labour', 'Labour'], ['overview', 'Overview'], ['places', 'Places']],
  court: [['inbox', 'Decisions'], ['laws', 'Laws'], ['houses', 'Great houses'], ['faith', 'Faith']],
  treasury: [['ledger', 'Ledger'], ['taxes', 'Taxes and loans'], ['trade', 'Trade'], ['industry', 'Mines and industry']],
  military: [['forces', 'Forces'], ['threats', 'Threats'], ['garrisons', 'Garrisons'], ['war', 'War']],
  diplomacy: [['realms', 'Rulers'], ['pacts', 'Pacts'], ['envoys', 'Audiences'], ['intel', 'Spies and embassies']],
};

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
  if (tab === 'realm') return realmTab(app);
  const sub = app.memory.sub[tab];
  const badges = subBadges(app, tab);
  const list = SUBS[tab].map(([id, label]) => [id, label, badges[id] || 0]);
  let html = '';
  if (tab === 'court') {
    if (sub === 'laws') html = lawsHtml(app);
    else if (sub === 'houses') html = noblesHtml(app);
    else if (sub === 'faith') {
      html = faithHtml(app);
      if (app.memory.faithSeen !== app.state.day) {
        app.memory.faithSeen = app.state.day;
        app.badges?.();
      }
    }
    else html = stewardHtml(app) + inboxHtml(pendingDecisions(app.state, app.world, app.acked()));
  } else if (tab === 'treasury') {
    if (sub === 'trade' || sub === 'routes') html = marketHtml(app);
    else if (sub === 'taxes') html = taxesHtml(app);
    else if (sub === 'industry') html = industryHtml(app);
    else html = stewardHtml(app) + ledgerHtml(app);
  } else if (tab === 'military') {
    if (sub === 'threats') html = threatsHtml(app);
    else if (sub === 'garrisons') html = garrisonsHtml(app);
    else if (sub === 'war') html = warHtml(app);
    else html = forcesHtml(app);
  } else if (tab === 'diplomacy') {
    if (sub === 'intel') html = intelListHtml(app);
    else if (sub === 'envoys') html = envoysHtml(app);
    else if (sub === 'pacts') html = pactsHtml(app);
    else html = neighboursHtml(app);
  }
  return { title: TAB_TITLES[tab], html: `${segs(list, sub)}${html}` };
}

const gone = (title, what) => ({ title, html: `<div data-part="head"><p class="sub">${what}</p></div>` });

export function renderRoute(app, route) {
  const { world, state } = app;
  const [kind, arg] = route.split(/:(.*)/s);
  switch (kind) {
    case 'tab': return tabScreen(app, arg);
    case 'town': return world.byId[arg] && state.settlements[arg] ? { title: escapeHtml(world.byId[arg].name), html: townCard(app, arg) } : gone('Gone', 'No such place.');
    case 'house': return world.houses.houses[arg] ? { title: `${swatch(world, arg)} ${escapeHtml(world.houses.houses[arg].name)}`, html: houseCard(app, arg) } : gone('Gone', 'No such house.');
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
    case 'deposition': {
      const d = state.depositions.at(-1);
      return d ? { title: 'The crown is deposed', html: `<div data-part="head">${depositionHtml(d)}</div>` } : gone('Deposition', 'The crown has never been deposed.');
    }
    default: return gone('Lost', 'Nothing here.');
  }
}
