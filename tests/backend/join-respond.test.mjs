import {test} from 'node:test';
import assert from 'node:assert/strict';
import {joinRespondHandler} from '../../supabase/functions/_shared/join-respond.ts';
const token='12345678-1234-4234-8234-123456789abc';
const base='https://local.test/functions/v1/bookish-join-respond';
function fixture(){const calls=[];let mails=0;return {calls,get mails(){return mails;},handler:joinRespondHandler({decide:async(t,a)=>{calls.push([t,a]);return {data:{ok:true,status:a?'approved':'declined',notice:{kind:'decision',to:'reader@example.test',club:'Club',approved:a}},error:null};},notify:async()=>{mails++;return true;},siteUrl:async()=> 'https://meetbookish.com'})};}
async function form(handler,action='approve'){
 const response=await handler(new Request(`${base}?token=${token}&action=${action}`));
 assert.equal(response.status,302);assert.equal(response.headers.get('content-type'),null);
 const redirect=new URL(response.headers.get('location'));
 assert.equal(redirect.origin,'https://meetbookish.com');assert.equal(redirect.pathname,'/join/confirm/');
 assert.equal(redirect.search,'');
 const body=new URLSearchParams(redirect.hash.slice(1));body.set('confirm','yes');
 return {body:body.toString()};
}
function post(f,headers={}){return new Request(base,{method:'POST',headers:{origin:'https://meetbookish.com','content-type':'application/x-www-form-urlencoded',...headers},body:f.body});}
test('email scanner GETs and HEAD never approve, decline, or notify',async()=>{
 const f=fixture();await form(f.handler);await form(f.handler,'decline');
 assert.equal((await f.handler(new Request(base,{method:'HEAD'}))).status,405);
 assert.deepEqual(f.calls,[]);assert.equal(f.mails,0);
});
for(const action of ['approve','decline'])test(`only a deliberate same-site POST ${action} acts and redirects`,async()=>{
 const f=fixture();const page=await form(f.handler,action);const response=await f.handler(post(page));
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),`https://meetbookish.com/join/done/?result=${action==='approve'?'approved':'declined'}`);
 assert.deepEqual(f.calls,[[token,action==='approve']]);assert.equal(f.mails,1);
});
test('missing confirmation, cross-site POST, bad tokens, and JSON cannot decide',async()=>{
 const f=fixture();const page=await form(f.handler);
 for(const headers of [{origin:'https://attacker.test'},{origin:''},{'content-type':'application/json'}]){
  assert.ok([400,403,415].includes((await f.handler(post(page,headers))).status));
 }
 for(const body of ['token=bad&action=approve&confirm=yes',page.body+'&action=decline',page.body.replace('action=approve','action=other'),page.body.replace('&confirm=yes','')])assert.equal((await f.handler(post({...page,body}))).status,400);
 assert.deepEqual(f.calls,[]);assert.equal(f.mails,0);
});
test('database failures cannot send notices or claim success, and failed notices do not erase a saved decision',async()=>{
 let mailed=false;
 const failed=joinRespondHandler({decide:async()=>({data:null,error:{message:'private'}}),notify:async()=>{mailed=true;},siteUrl:async()=> 'https://meetbookish.com'});
 const response=await failed(post(await form(failed)));assert.equal(response.status,503);assert.equal(mailed,false);assert.ok(!(await response.text()).includes('private'));
 const saved=joinRespondHandler({decide:async()=>({data:{ok:true,status:'approved',notice:{kind:'decision',to:'reader@example.test',club:'Club'}},error:null}),notify:async()=>{throw Error('delivery');},siteUrl:async()=> 'https://meetbookish.com'});
 assert.equal((await saved(post(await form(saved)))).status,303);
});
