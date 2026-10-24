// localStorage can throw (private browsing, full quota), so every call is guarded
// and failures come back as a plain message instead of breaking the game.
const KEY = 'northern-wars.save';

export function writeSave(text) {
  try {
    localStorage.setItem(KEY, text);
    return null;
  } catch {
    return 'The save could not be written. Your browser may be in private mode or out of space.';
  }
}

export function readSave() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
