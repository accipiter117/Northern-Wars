export const number = (n) => Math.round(n).toLocaleString('en-GB');

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Plain words for 0 to 100 meters, so cards read like a steward's report.
export function describeLevel(value, words) {
  const i = Math.min(words.length - 1, Math.floor((value / 100) * words.length));
  return words[i];
}
