import { renderStoreDownloads, STORE_CSS } from './store-downloads.mjs';
import { checkStorePages } from './check-store-pages.mjs';
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
// Keep the install block outside the app root so route renders preserve it.
// This packaging step never changes the native app bundle.
const shell = path.join(out, 'index.html');
const siteBase = new URL(site).pathname.replace(/\/$/, '');
fs.writeFileSync(shell, fs.readFileSync(shell, 'utf8')
  .replace('</head>', `<style>${STORE_CSS}
body > .store-downloads{margin-bottom:calc(100px + env(safe-area-inset-bottom))}</style></head>`)
  .replace('</body>', `${renderStoreDownloads(siteBase)}</body>`));
// Use the current site feeds, rather than a stale native snapshot.
for (const name of ['clubs', 'books', 'community']) {
  fs.copyFileSync(path.join(root,`dist/data/${name}.json`), path.join(out,`data/${name}.json`));
}
console.log(`Packaged Bookish web app at ${base}`);

checkStorePages(path.join(root, "dist"));
