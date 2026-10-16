import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), out = path.join(root, 'app/public');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (p, v) => { fs.mkdirSync(path.dirname(path.join(out,p)), { recursive: true }); fs.writeFileSync(path.join(out,p), JSON.stringify(v)); };
const generated = fs.existsSync(path.join(root, 'dist/data/clubs.json'));
const clubs = generated ? read('dist/data/clubs.json') : read('data/clubs.json').map(c => ({ ...c, verified: false }));
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
for (const c of clubs) c.city_path ||= `/book-clubs/${slug(c.city)}-${c.state.toLowerCase()}/`;
// Do not copy raw collector records. data/clubs.json is the site's privacy-filtered input.
write('data/clubs.json', clubs.map(({id,name,city,state,genres,vibe,cadence,format,source_name,source_url,last_seen,lat,lng,verified,city_path}) => ({id,name,city,state,genres,vibe,cadence,format,source_name,source_url,last_seen,lat,lng,verified: verified === true,city_path})));
write('data/books.json', read('data/books.json').books.map(({id,t,a,pages,ol,cover,moods,series}) => ({id,t,a,p:pages,ol,c:cover,m:moods,...(series?{s:series}:{})})));
write('data/community.json', fs.existsSync(path.join(root,'dist/data/community.json')) ? read('dist/data/community.json') : { national:[],city:[],state:[],next:[] });
write('data/snapshot.json', { builtAt: new Date().toISOString(), verifiedSource: generated ? 'site build' : 'unverified local directory', clubs:clubs.length });
for (const name of ['manrope-400_800.woff2','youngserif-400.woff2','unbounded-400_900.woff2']) fs.copyFileSync(path.join(root,'public/fonts',name),path.join(out,'fonts',name));
for (const name of ['wordmark-320.webp','bg-oxblood-m.webp','bg-oxblood-d.webp','tx-paper-900.webp']) fs.copyFileSync(path.join(root,'public/img',name),path.join(out,'img',name));
fs.writeFileSync(path.join(out,'theme.css'), fs.readFileSync(path.join(root,'src/theme.css'),'utf8').replaceAll('__BASE__',''));
console.log(`Bundled ${clubs.length} city-level clubs and the existing Open Library catalog (${generated ? 'generated site feed' : 'local input; verified flags await launch refresh'}).`);
