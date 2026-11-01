import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=new URL('../../',import.meta.url);
test('deployed website and iOS bundles contain no club snapshots, ids, or static club facts',()=>{
 const sample=JSON.parse(fs.readFileSync(new URL('data/clubs.json',root)))[0];
 function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())visit(p);else if(/\.(html|json|geojson|xml)$/.test(p)){const text=fs.readFileSync(p,'utf8');assert.ok(!text.includes(sample.id),`static club id in ${p}`);assert.ok(!text.includes(sample.name),`static club name in ${p}`);}}}
 visit(new URL('dist/',root).pathname);
 assert.deepEqual(JSON.parse(fs.readFileSync(new URL('dist/data/clubs.json',root))),[]);
 assert.deepEqual(JSON.parse(fs.readFileSync(new URL('dist/data/clubs.geojson',root))).features,[]);
 assert.deepEqual(JSON.parse(fs.readFileSync(new URL('app/public/data/clubs.json',root))),[]);
});
