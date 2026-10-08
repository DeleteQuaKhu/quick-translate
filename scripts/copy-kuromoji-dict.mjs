/**
 * Copies kuromoji's gzipped dictionary into `public/kuromoji-dict/`, which is
 * where the offscreen document fetches it from (`npm run dict:ja`).
 *
 * It stays out of git and out of the default build because it is ~17 MB, more
 * than ten times the rest of the extension.
 */

import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'node_modules', '@patdx', 'kuromoji', 'dict');
const target = join(root, 'public', 'kuromoji-dict');

await mkdir(target, { recursive: true });

let copied = 0;
for (const file of await readdir(source)) {
  if (!file.endsWith('.dat.gz')) continue;
  await cp(join(source, file), join(target, file));
  copied += 1;
}

console.log(`Copied ${copied} kuromoji dictionary files to ${target}`);
