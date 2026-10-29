import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
let directory,join,host;
const token='11111111-1111-4111-8111-111111111111';
const sb={rpc:async (fn,args={})=>{try {const values=Object.values(args);const result=await db.query(`select public.${fn}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) as result`,values);return {data:result.rows[0].result,error:null};} catch {return {data:null,error:{message:'database unavailable'}};}}};
before(async()=>{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 for(const p of ['001_bookish_submissions.sql','002_bookish_join.sql','003_bookish_read_next.sql','009_bookish_visibility.sql'])await db.exec(fs.readFileSync(new URL(`../../supabase/sql/${p}`,import.meta.url),'utf8'));
 await db.exec("insert into bookish_city_centers values ('Austin','TX',30.2672,-97.7431)");
 await db.query("insert into bookish_submissions(kind,email,club_ref,payload,status,confirm_token) values ('start','host@example.test','hidden-canary',$1,'confirmed',$2)",[JSON.stringify({club_name:'HTTP Secret Canary',city:'Austin',state:'TX',visibility:'hidden'}),token]);
 await db.exec("insert into bookish_clubs(club_ref,name,city,state,visibility) values ('open-ref','Public club','Austin','TX','open'),('private-ref','Approval club','Austin','TX','private')");
 const module=await import('../../supabase/functions/_shared/club-http.ts');
 directory=module.directoryHandler(sb);join=module.joinHandler(sb);host=module.hostHandler(sb);
});
after(()=>db.close());
test('every public discovery projection excludes hidden facts and has no-store headers',async()=>{
 for(const query of ['', '?format=verified','?format=cities','?format=geojson','?q=HTTP%20Secret%20Canary','?q=hidden-canary']){
  const r=await directory(new Request(`https://local.test/bookish-directory${query}`));
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/no-store/);
  const text=await r.text();assert.ok(!text.includes('HTTP Secret Canary'));assert.ok(!text.includes('hidden-canary'));
 }
});
test('private listing projects only public fields and never arbitrary payload fields',async()=>{
 await db.exec(`update bookish_clubs set public_data='{"venue":"secret address","source_url":"https://example.test/venue","cadence":"private time"}' where club_ref='private-ref'`);
 const j=await (await directory(new Request('https://local.test/'))).json();
 const c=j.clubs.find(c=>c.id==='private-ref');assert.equal(c.name,'Approval club');assert.equal(c.visibility,'private');
 assert.equal(c.cadence,null);assert.equal(JSON.stringify(c).includes('secret address'),false);
});
test('hidden invalid joins and nonexistent joins have identical HTTP responses',async()=>{
 const send=ref=>join(new Request('https://local.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({club_id:ref,email:'reader@example.test',consent:true,elapsed_ms:3000})}));
 const a=await send('hidden-canary'), b=await send('missing-ref');assert.equal(a.status,404);assert.equal(b.status,404);assert.deepEqual(await a.json(),await b.json());
});
test('host settings reject foreign token and apply visibility immediately to discovery',async()=>{
 const send=(cap,action,visibility)=>host(new Request('https://local.test/',{method:'POST',headers:{authorization:`Bearer ${cap}`,'content-type':'application/json'},body:JSON.stringify({club_id:'hidden-canary',action,visibility})}));
 assert.equal((await send('22222222-2222-4222-8222-222222222222','save','open')).status,403);
 assert.equal((await send(token,'save','private')).status,200);
 assert.ok((await (await directory(new Request('https://local.test/'))).json()).clubs.some(c=>c.id==='hidden-canary'));
 await send(token,'save','hidden');assert.equal((await (await directory(new Request('https://local.test/'))).json()).clubs.some(c=>c.id==='hidden-canary'),false);
});
test('public endpoints fail closed on database errors and reject writes or oversized bodies',async()=>{
 const fail=directoryHandlerForFailure();assert.equal((await fail(new Request('https://local.test/'))).status,503);
 assert.equal((await directory(new Request('https://local.test/',{method:'POST'}))).status,405);
 assert.equal((await host(new Request('https://local.test/',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'x'.repeat(9000)}))).status,413);
});
function directoryHandlerForFailure(){return async req=>(await import('../../supabase/functions/_shared/club-http.ts')).directoryHandler({rpc:async()=>({error:{message:'fail'},data:null})})(req);}
test('successful invite joins keep internal email notices and host contact out of the public response',async()=>{
 const {data:inv}=await sb.rpc('bookish_visibility_host',{p_token:token,p_action:'rotate',p_ref:'hidden-canary',p_visibility:null,p_request:null,p_approve:null});
 const {joinHandler}=await import('../../supabase/functions/_shared/club-http.ts');
 const h=joinHandler(sb,async()=>true);
 const response=await h(new Request('https://local.test/',{method:'POST',body:JSON.stringify({club_id:'',invite_code:inv.invite,email:'invite@example.test',consent:true,elapsed_ms:3000})}));
 assert.equal(response.status,200);const j=await response.json();assert.equal(j.status,'joined');
 assert.ok(!JSON.stringify(j).includes('host@example.test'));assert.ok(!('notice' in j));assert.ok(!JSON.stringify(j).includes('HTTP Secret Canary'));
});
test('an unclaimed public calendar club cannot be joined through the hosted-club endpoint',async()=>{
 const send=ref=>join(new Request('https://local.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({club_id:ref,email:'reader@example.test',consent:true,elapsed_ms:3000})}));
 const unclaimed=await send('open-ref'),missing=await send('missing-ref');
 assert.equal(unclaimed.status,404);
 assert.deepEqual(await unclaimed.json(),await missing.json());
});
