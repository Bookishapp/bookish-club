import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountClient } from '../src/account.ts';
const session={access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:'reader',email:'reader@example.com'}};
test('email verification creates an in-memory session and authorizes RPCs',async()=>{
 const calls:any[]=[];const client=new AccountClient(async(path,body,token)=>{calls.push({path,body,token});return path.endsWith('bookish-auth')?{ok:true,session}: {id:'reader'};});
 await client.verify('reader@example.com','123456');assert.equal(client.user?.id,'reader');await client.rpc('bookish_my_account');assert.equal(calls[1].token,'access');
});
test('expired sessions refresh once before concurrent private reads',async()=>{
 let now=0,refreshes=0;const client=new AccountClient(async(path,body)=>{if(path.endsWith('bookish-auth')){if(body.action==='refresh')refreshes++;return {ok:true,session:{...session,expires_in:60}};}return [];},()=>now);
 await client.verify('reader@example.com','123456');now=61_000;await Promise.all([client.rpc('one'),client.rpc('two')]);assert.equal(refreshes,1);
});
test('failed refresh clears identity and never sends the private request',async()=>{
 let fail=false;const client=new AccountClient(async(path,body)=>{if(body?.action==='refresh'&&fail)throw Error('expired');return {ok:true,session:{...session,expires_in:1}};},()=>fail?2000:0);
 await client.verify('reader@example.com','123456');fail=true;await assert.rejects(client.rpc('private'));assert.equal(client.user,null);
});
test('logout clears local identity even if server is unavailable',async()=>{
 const client=new AccountClient(async(_path,body)=>{if(body.action==='logout')throw Error('offline');return {ok:true,session};});await client.verify('reader@example.com','123456');await client.signOut();assert.equal(client.user,null);
});
test('password access uses the scoped auth action and never signs up an identity',async()=>{
 const calls:any[]=[];const client=new AccountClient(async(path,body)=>{calls.push({path,body});return {ok:true,session};});
 await client.password('demo@example.test','a-private-password');assert.equal(client.user?.id,'reader');assert.equal(calls[0].body.action,'password');assert.equal(calls[0].path,'/functions/v1/bookish-auth');
});
test('signing out during refresh cannot restore the session',async()=>{
 let now=0,release:(value:any)=>void=()=>{};const client=new AccountClient(async(_path,body)=>body.action==='refresh'?await new Promise(resolve=>{release=resolve;}):{ok:true,session:{...session,expires_in:1}},()=>now);
 await client.verify('reader@example.com','123456');now=2000;const pending=client.rpc('private');await Promise.resolve();await client.signOut();release({ok:true,session});await assert.rejects(pending);assert.equal(client.user,null);
});
test('a revoked authenticated request clears identity',async()=>{
 const client=new AccountClient(async(path)=>{if(path.includes('/rpc/'))throw Object.assign(Error('revoked'),{status:401});return {ok:true,session};});await client.verify('reader@example.com','123456');await assert.rejects(client.rpc('private'),/Sign in again/);assert.equal(client.user,null);
});
