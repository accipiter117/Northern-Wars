// Runs every test file under test/. Node 20's test runner does not expand
// globs, so the files are listed here instead. Pass "sim" or "smoke" to run
// one folder.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const folders = process.argv[2] ? [process.argv[2]] : ['sim', 'smoke'];
const files = folders.flatMap((f) =>
  readdirSync(join(ROOT, 'test', f)).filter((n) => n.endsWith('.test.js')).sort().map((n) => join('test', f, n)));
const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: ROOT, stdio: 'inherit' });
process.exit(res.status ?? 1);
