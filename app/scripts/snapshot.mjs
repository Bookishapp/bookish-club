import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), out = path.join(root, 'app/public');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (p, v) => { fs.mkdirSync(path.dirname(path.join(out,p)), { recursive: true }); fs.writeFileSync(path.join(out,p), JSON.stringify(v)); };
// Club data is never bundled: visibility can change after an app ships.
write('data/clubs.json', []);
write('data/books.json', read('data/books.json').books.map(({id,t,a,pages,ol,cover,moods,series}) => ({id,t,a,p:pages,ol,c:cover,m:moods,...(series?{s:series}:{})})));
write('data/community.json', {national:[],city:[],state:[],next:[]});
write('data/snapshot.json', {clubs:0,discovery:'live only'});
for (const name of ['manrope-400_800.woff2','youngserif-400.woff2','unbounded-400_900.woff2']) fs.copyFileSync(path.join(root,'public/fonts',name),path.join(out,'fonts',name));
for (const name of ['wordmark-320.webp','bg-oxblood-m.webp','bg-oxblood-d.webp','tx-paper-900.webp']) fs.copyFileSync(path.join(root,'public/img',name),path.join(out,'img',name));
fs.writeFileSync(path.join(out,'theme.css'), fs.readFileSync(path.join(root,'src/theme.css'),'utf8').replaceAll('__BASE__',''));
console.log('Bundled book catalog and artwork. Club discovery requires a fresh server response.');
