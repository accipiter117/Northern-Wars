// No browser pop-ups (M23 A): every question goes through the game's own
// dialog (src/ui/dialog.js), so nothing in src may call the browser's
// confirm, alert or prompt. Methods that merely share the name (a sound
// called confirm, say) are allowed; calls are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../helpers.js';

const CALL = /(?<![.\w$])(?:window\.|globalThis\.|self\.)?(confirm|alert|prompt)\s*\((?![^()]*\)\s*\{)/;

test('nothing in src calls confirm(, alert( or prompt(', async () => {
  const files = (await readdir(join(ROOT, 'src'), { recursive: true })).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 20);
  for (const f of files) {
    const lines = (await readFile(join(ROOT, 'src', f), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      assert.doesNotMatch(line, CALL, `src/${f}:${i + 1}: ${line.trim()}`);
    });
  }
  // The check itself catches what it should.
  for (const bad of ['if (confirm("Sure?")) go();', 'window.alert(x);', 'const n = prompt("Name");']) assert.match(bad, CALL);
  for (const fine of ['confirm(t) {', 'kind.confirm(a);', 'haptic(\'confirm\');', 'ask("Sure?")']) assert.doesNotMatch(fine, CALL);
});
