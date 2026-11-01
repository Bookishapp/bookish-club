// Package the same app used by iOS under the website's /app/ route.
// Account and shared club availability depends on deployed Bookish services.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const site = (process.env.SITE_URL || 'https://meetbookish.com').replace(/\/$/, '');
const base = new URL(site).pathname.replace(/\/$/, '') + '/app/';
execFileSync('npm', ['run', 'build', '--', '--base', base, '--outDir', 'web-dist'], {cwd:path.join(root,'app'),stdio:'inherit'});
const out = path.join(root, 'dist/app');
fs.cpSync(path.join(root,'app/web-dist'), out, {recursive:true});
// Use the current site feeds, rather than a stale native snapshot.
for (const name of ['clubs', 'books', 'community']) {
  fs.copyFileSync(path.join(root,`dist/data/${name}.json`), path.join(out,`data/${name}.json`));
}
console.log(`Packaged Bookish web app at ${base}`);
