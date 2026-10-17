import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAccountDeletion, revokeAppleGrant } from '../../supabase/functions/_shared/account-deletion.ts';
const emailUser={id:'reader-id',app_metadata:{app:'bookish'},identities:[{provider:'email'}]};
const request=(body={},token='real-user-token')=>new Request('https://example.com/delete',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
function deps(user=emailUser) {
 const calls=[];
 return {calls,getUser:async token=>token==='real-user-token'?user:null,
 deleteUser:async id=>{calls.push(id);},revokeApple:async()=>{},};
}
test('deletion derives identity from verified session, never the supplied user ID',async()=>{
 const d=deps(); const r=await handleAccountDeletion(request({user_id:'someone-else'}),d);
 assert.equal(r.status,200); assert.deepEqual(d.calls,['reader-id']);
});
test('missing and invalid sessions cannot delete accounts',async()=>{
 for(const req of [new Request('https://example.com/delete',{method:'POST'}),request({},'invalid')]) {
 const d=deps(); assert.equal((await handleAccountDeletion(req,d)).status,401);assert.deepEqual(d.calls,[]);
 }
});
test('linked Apple accounts require a fresh grant and failed revocation preserves the account',async()=>{
 const d=deps({id:'apple-reader',app_metadata:{app:'bookish'},identities:[{provider:'apple',identity_data:{sub:'apple-sub'}}]});
 assert.equal((await handleAccountDeletion(request(),d)).status,400);
 d.revokeApple=async()=>{throw new Error('vendor down, secret details');};
 const r=await handleAccountDeletion(request({apple_authorization_code:'fresh-code'}),d);
 assert.equal(r.status,503); assert.deepEqual(d.calls,[]); assert.equal((await r.text()).includes('secret'),false);
});
test('Apple revocation is bound to verified identity and precedes hard deletion',async()=>{
 const d=deps({id:'apple-reader',app_metadata:{app:'bookish'},identities:[{provider:'apple',identity_data:{sub:'apple-sub'}}]});
 d.revokeApple=async(code,sub)=>{assert.equal(code,'fresh-code');assert.equal(sub,'apple-sub');d.calls.push('revoked');};
 assert.equal((await handleAccountDeletion(request({apple_authorization_code:'fresh-code'}),d)).status,200);
 assert.deepEqual(d.calls,['revoked','apple-reader']);
});
test('failed hard deletion returns a retryable error and non-POST requests are rejected',async()=>{
 const d=deps(); d.deleteUser=async()=>{throw Error('private db details');};
 const r=await handleAccountDeletion(request(),d); assert.equal(r.status,503);assert.equal((await r.text()).includes('private db'),false);
 assert.equal((await handleAccountDeletion(new Request('https://example.com/delete'),d)).status,405);
});
test('Apple token exchange validates the subject before token revocation',async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const key=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
 const config={clientId:'com.bookish.test',teamId:'TEAM',keyId:'KEY',privateKey:`-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`};
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push(url);const form=new URLSearchParams(options.body);
  const parts=form.get('client_secret').split('.');
  assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts.slice(0,2).join('.'))),true);
  if(url.endsWith('/token'))return Response.json({id_token:'x.'+Buffer.from(JSON.stringify({sub:'other-user',aud:config.clientId,iss:'https://appleid.apple.com',exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.x',refresh_token:'private-token'});
  throw Error('Must not revoke another user');
 };
 await assert.rejects(revokeAppleGrant('fresh-code','apple-sub',config,fetcher));
 assert.deepEqual(calls,['https://appleid.apple.com/auth/token']);
});

test('Apple grant exchange and revocation use the same client and fresh returned token',async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
 const config={clientId:'com.bookish.test',teamId:'TEAM',keyId:'KEY',privateKey:`-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`};
 for(const status of [200,503]) {
  const calls=[];
  const fetcher=async(url,options)=>{
   const form=new URLSearchParams(options.body);calls.push({url,form});
   if(url.endsWith('/token'))return Response.json({id_token:'x.'+Buffer.from(JSON.stringify({sub:'correct-user',aud:'com.bookish.test',iss:'https://appleid.apple.com',exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.x',refresh_token:'fresh-refresh-token'});
   return new Response(null,{status});
  };
  if(status===200)await revokeAppleGrant('fresh-code','correct-user',config,fetcher);
  else await assert.rejects(revokeAppleGrant('fresh-code','correct-user',config,fetcher));
  assert.equal(calls[1].url,'https://appleid.apple.com/auth/revoke');
  assert.equal(calls[1].form.get('token'),'fresh-refresh-token');
  assert.equal(calls[1].form.get('client_id'),'com.bookish.test');
  assert.equal(calls[0].form.get('code'),'fresh-code');
 }
});

test('shared Fictora identity is refused before Apple revocation or Auth deletion',async()=>{
 const d=deps({id:'fictora-reader',app_metadata:{app:'fictora'},identities:[{provider:'apple',identity_data:{sub:'shared-sub'}}]});
 d.revokeApple=async()=>{d.calls.push('revoked');};
 const r=await handleAccountDeletion(request({apple_authorization_code:'fresh-code'}),d);
 assert.equal(r.status,403);
 assert.deepEqual(d.calls,[]);
});
