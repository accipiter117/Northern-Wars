import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadWorld } from '../src/sim/index.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function nodeWorld() {
  return loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
}

// Laws of the Book (M26) put in force directly, already taken hold, for
// tests: "id", or "id:faith" for the faith of the crown.
export function signLaws(state, world, ...ids) {
  for (const entry of ids) {
    const [id, choice] = entry.split(':');
    state.book.signed[id] = { day: state.day - world.book.enactDays, ...(choice ? { choice } : {}) };
    if (choice) state.book.faith = choice;
  }
  return state;
}
