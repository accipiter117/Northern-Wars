import { threatPos, armyPosition } from '../sim/index.js';

// Where an order sends someone (M24 follow-up), so the camera can glide
// there and the player can watch it happen: the quarry a company or a
// witcher is sent after, the place an army marches on, the town whose
// levy is called, the road an escort takes. Read from the realm as it
// stood before the order. Null for orders that send no one.
export function focusOf(state, world, action) {
  const place = (id) => (world.byId[id] ? { x: world.byId[id].x, y: world.byId[id].y } : null);
  const threat = (id) => {
    const t = state.threats?.list.find((x) => x.id === Number(id));
    return t ? threatPos(t) : null;
  };
  const army = (id) => {
    const a = state.armies?.find((x) => x.id === Number(id));
    return a ? armyPosition(world, a) : null;
  };
  const between = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a ?? b);
  switch (action.type) {
    case 'company': {
      const o = action.order ?? {};
      if (o.kind === 'hunt') return o.threat ? threat(o.threat) : army(o.army);
      if (o.kind === 'patrol') return between(place(o.from), place(o.to));
      if (o.kind === 'escort') {
        const r = state.routes?.find((x) => x.id === o.route);
        return r ? between(place(r.from), place(r.to)) : null;
      }
      return null;
    }
    case 'witcher':
      return threat(action.threat);
    case 'army':
      if (action.order === 'hunt') return threat(action.target);
      if (action.order === 'join') return army(action.target);
      if (action.order === 'siege' || action.order === 'defend') return place(action.target);
      return army(action.army);
    case 'muster':
      return place(action.settlement);
    case 'petition': {
      // A petition answered by sending someone (an escort for pilgrims).
      const p = state.petitions?.find((x) => x.id === action.id);
      const c = p && world.petitions?.petitions[p.petition]?.choices[action.choice];
      return c?.effects?.escort ? between(place(p.place), place(c.effects.escort)) : null;
    }
    default:
      return null;
  }
}
