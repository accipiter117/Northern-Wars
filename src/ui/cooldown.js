// Cooldown rings (M26 D): every act, power and law change that rests
// between uses wears a ring round its button that fills as it recovers; a
// long press on it says how many days are left (main.js), and one that is
// ready carries a small gold dot.

// Wraps a button: `left` days of `total` still to rest. With nothing left,
// the gold dot shows only if `ready` (the act can actually be done now).
export function cooling(html, left, total, ready = true) {
  if (left > 0 && total > 0) {
    const done = Math.round(100 * (1 - left / total));
    return `<span class="cool-wrap cooling" data-left="${left}" style="--done:${done}%" title="Ready in ${left} day${left === 1 ? '' : 's'}">${html}</span>`;
  }
  return `<span class="cool-wrap${ready ? ' ready' : ''}">${html}</span>`;
}
