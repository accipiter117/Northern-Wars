import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadWorld } from '../src/sim/index.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function nodeWorld() {
  return loadWorld(async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8')));
}
