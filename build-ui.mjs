import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
await mkdir('assets/vendor', { recursive: true });
const result = await build({ entryPoints: ['ui-effects.js'], bundle: true, format: 'iife', platform: 'browser', target: 'chrome144', outfile: 'assets/vendor/ui-effects.js', minify: true, legalComments: 'linked', metafile: true });
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs).filter(file => file.includes('node_modules'))) {
  let dir = path.dirname(path.resolve(input));
  while (dir !== path.dirname(dir)) {
    try { const pkg = JSON.parse(await readFile(path.join(dir,'package.json'),'utf8')); if (pkg.name) { packages.set(pkg.name,dir); break; } } catch {}
    dir = path.dirname(dir);
  }
}
const notices = [];
for (const [pkg, dir] of packages) {
  let license;
  for (const name of ['LICENSE.md','LICENSE','LICENSE.txt']) {
    try { license = await readFile(path.join(dir,name), 'utf8'); break; } catch {}
  }
  if (!license) throw new Error(`Missing license notice for ${pkg}`);
  notices.push(`## ${pkg}\n\n${license}`);
}
await writeFile('assets/vendor/THIRD-PARTY-NOTICES.txt', notices.join('\n\n'));
