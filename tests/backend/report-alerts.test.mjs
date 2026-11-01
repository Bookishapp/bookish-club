import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportAlertsHandler} from '../../supabase/functions/_shared/report-alerts.ts';
const key='fixture-worker-key-that-is-long-enough';
const id='12345678-1234-4234-8234-123456789abc';
const req=(body={action:'pending'},secret=key,method='POST')=>new Request('https://local.test/alerts',{method,headers:{'x-bookish-worker-key':secret},...(method==='POST'?{body:JSON.stringify(body)}:{})});
test('report worker fails closed for absent configuration and invalid keys before reading the queue',async()=>{
 let called=false;const queue=async()=>{called=true;return {data:[],error:null};};
 for(const configured of [undefined,key]){
  const handler=reportAlertsHandler({key:async()=>configured,queue});
  assert.equal((await handler(req({},'wrong'))).status,configured?401:503);
 }
 assert.equal(called,false);
});
test('authorized pending action passes a validated cursor, strips identities, and keeps responses uncached',async()=>{
 const seen=[];const handler=reportAlertsHandler({key:async()=>key,queue:async after=>{seen.push(after);return {data:[{id,kind:'club',target_id:id,club_id:id,reason:'Unsafe',due_at:'2026-11-02T00:00:00Z',reporter_id:'secret',email:'private@example.test'}],error:null};}});
 const response=await handler(req({action:'pending',after:id}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const result=await response.json();assert.equal(result.reports[0].id,id);assert.ok(!JSON.stringify(result).includes('private@example.test'));assert.ok(!JSON.stringify(result).includes('reporter_id'));assert.deepEqual(seen,[id]);assert.equal(result.next,null);
 assert.equal((await handler(req({action:'pending'}))).status,200);assert.deepEqual(seen,[id,null]);
});
test('worker rejects other methods, malformed actions and cursors, and queue failures',async()=>{
 let count=0;const handler=reportAlertsHandler({key:async()=>key,queue:async()=>{count++;return {data:null,error:{message:'secret details'}};}});
 assert.equal((await handler(req({},key,'GET'))).status,405);
 for(const body of [{action:'resolve'},{action:'pending',after:'bad'},null,[]])assert.equal((await handler(req(body))).status,400);
 assert.equal(count,0);const response=await handler(req());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret details'));
});
test('full worker page supplies the last ID as its continuation cursor',async()=>{
 const handler=reportAlertsHandler({key:async()=>key,queue:async()=>({data:Array.from({length:100},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,kind:'club',target_id:id,club_id:id,reason:'Report',due_at:'2026-11-02T00:00:00Z'})),error:null})});
 const result=await(await handler(req())).json();assert.equal(result.next,'00000000-0000-4000-8000-000000000099');
});
