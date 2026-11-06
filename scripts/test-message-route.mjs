import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../src/message-route.js',import.meta.url),'utf8');
const id='10000000-0000-4000-8000-000000000001';
function run(path,base='',search='',hash=''){const targets=[];vm.runInNewContext(code,{document:{documentElement:{dataset:{base}}},location:{pathname:path,search,hash,replace:url=>targets.push(url)}});return targets;}
test('native resource URLs fall back to the app with resource identity only',()=>{
 for(const kind of ['take','vote','meeting'])assert.deepEqual(run(`/imessage/v2/${kind}/${id}`),[`/app/#message=${kind}/${id}`]);
 assert.deepEqual(run(`/bookish/imessage/v2/take/${id}`,'/bookish'),[`/bookish/app/#message=take/${id}`]);
});
test('invalid routes and token-bearing aliases never redirect into the app',()=>{
 for(const path of ['/elsewhere',`/imessage/v2/take/${id}/extra`,`/imessage/v2/take/%31${id.slice(1)}`,`/imessage/v2/author/${id}`])assert.deepEqual(run(path),[]);
 assert.deepEqual(run(`/imessage/v2/take/${id}`,'','?access_token=secret'),[]);assert.deepEqual(run(`/imessage/v2/take/${id}`,'','','#secret'),[]);
});
