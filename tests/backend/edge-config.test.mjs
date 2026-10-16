import { test } from 'node:test';
import assert from 'node:assert/strict';
import { houseRulesResponse } from '../../supabase/functions/_shared/house-rules.ts';
import { authAdmin } from '../../supabase/functions/_shared/auth-admin.ts';
test('house rules require working configuration before presenting terms',()=>{
 const req=new Request('https://example.com/rules');
 assert.equal(houseRulesResponse(req,{termsUrl:'',privacyUrl:'',contactEmail:''}).status,503);
 const response=houseRulesResponse(req,{termsUrl:'https://meetbookish.com/terms/',privacyUrl:'https://meetbookish.com/privacy/',contactEmail:'help@example.com'});
 assert.equal(response.status,200);
});
test('Supabase auth adapter verifies the bearer token and hard-deletes only the supplied verified ID',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(options.method==='GET')return Response.json({id:'verified-reader',identities:[{provider:'email'}]});
  return Response.json({});
 };
 const admin=authAdmin('https://project.supabase.co','server-secret',fetcher);
 assert.equal((await admin.getUser('session-token')).id,'verified-reader');
 await admin.deleteUser('verified-reader');
 assert.equal(calls[0].url,'https://project.supabase.co/auth/v1/user');
 assert.equal(calls[0].options.headers.authorization,'Bearer session-token');
 assert.equal(calls[1].url,'https://project.supabase.co/auth/v1/admin/users/verified-reader');
 assert.equal(calls[1].options.headers.authorization,'Bearer server-secret');
 assert.equal(calls[1].options.method,'DELETE');
 assert.deepEqual(JSON.parse(calls[1].options.body),{should_soft_delete:false});
});
test('Supabase auth adapter fails closed for rejected sessions and failed admin operations',async()=>{
 const admin=authAdmin('https://project.supabase.co','server-secret',async()=>new Response('private details',{status:401}));
 assert.equal(await admin.getUser('bad-token'),null);
 await assert.rejects(admin.deleteUser('verified-reader'),/incomplete/);
});
