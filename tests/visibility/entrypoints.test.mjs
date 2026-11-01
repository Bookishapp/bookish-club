// Load the actual deployed entrypoint files. Replace only Supabase transport;
// their SQL, triggers, handlers, and HTTP serialization all execute locally.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url).pathname;
const ident=s=>{assert.match(s,/^[a-z_][a-z_0-9]*$/i);return `"${s}"`;};
function transport(db){
 return {rpc:async(fn,args={})=>{try{const r=await db.query(`select public.${ident(fn)}(${Object.keys(args).map((k,i)=>`${ident(k)} => $${i+1}`).join(',')}) value`,Object.values(args));return{data:r.rows[0].value,error:null};}catch(e){return{data:null,error:{message:e.message}};}},
 from(table){let operation='select',values={},cols='*',filters=[],count=false;
 const b={select(c='*',o={}){cols=c;count=o.head||false;return b;},update(v){operation='update';values=v;return b;},insert(v){operation='insert';values=v;return b;},eq(k,v){filters.push([k,'=',v]);return b;},neq(k,v){filters.push([k,'<>',v]);return b;},gte(k,v){filters.push([k,'>=',v]);return b;},order(){return b;},limit(){return b;},single(){return b;},maybeSingle(){return b;},
 then(resolve,reject){const run=async()=>{try{const args=[],bind=v=>(args.push(v),`$${args.length}`),projection=cols.split(',').map(x=>x==='*'?'*':ident(x.trim())).join(',');
 let sql;if(operation==='insert')sql=`insert into public.${ident(table)} (${Object.keys(values).map(ident)}) values (${Object.values(values).map(bind)}) returning ${projection}`;
 else {sql=operation==='update'?`update public.${ident(table)} set ${Object.entries(values).map(([k,v])=>`${ident(k)}=${bind(v)}`).join(',')}`:`select ${count?'count(*)::int n':projection} from public.${ident(table)}`;if(filters.length)sql+=` where ${filters.map(([k,op,v])=>`${ident(k)}${op}${bind(v)}`).join(' and ')}`;if(operation==='update')sql+=` returning ${projection}`;}
 const result=await db.query(sql,args);return{data:operation==='insert'?result.rows[0]:result.rows,error:null,count:count?result.rows[0].n:null};}catch(e){return{data:null,error:{message:e.message}};}};return run().then(resolve,reject);}};return b;}};
}
async function edge(name,sb){
 let handler;const context=vm.createContext({Request,Response,Headers,URL,URLSearchParams,crypto,TextEncoder,Uint8Array,Date,console:{log(){},error(){}},fetch(){throw new Error('External network is forbidden in tests');},Deno:{env:{get:k=>k==='BOOKISH_SITE_URL'?'https://meetbookish.com':k==='SUPABASE_URL'?'https://local.test':undefined},serve:fn=>{handler=fn;}}});
 const cache=new Map();
 async function load(file){if(cache.has(file))return cache.get(file);if(file==='npm:@supabase/supabase-js@2'){const m=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>sb);},{context});cache.set(file,m);return m;}
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file,'utf8')),{context,identifier:file});cache.set(file,m);await m.link((specifier,parent)=>load(specifier.startsWith('npm:')?specifier:path.resolve(path.dirname(parent.identifier),specifier)));return m;}
 const mod=await load(path.join(root,`supabase/functions/${name}/index.ts`));await mod.evaluate();assert.equal(typeof handler,'function');return handler;
}
test('all actual public entrypoints reject hidden lookup and leak no hidden facts or private notices',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const f of ['001_bookish_submissions.sql','002_bookish_join.sql','003_bookish_read_next.sql','009_bookish_visibility.sql'])await db.exec(fs.readFileSync(path.join(root,`supabase/sql/${f}`),'utf8'));
  await db.exec("insert into bookish_city_centers values ('Austin','TX',30.2672,-97.7431);insert into bookish_submissions(kind,email,club_ref,payload,status) values ('start','host@example.test','entry-hidden','{\"club_name\":\"Entry Secret Canary\",\"city\":\"Austin\",\"state\":\"TX\",\"visibility\":\"hidden\"}','confirmed')");
  const sb=transport(db),request=(url,body)=>new Request(`https://local.test/${url}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
  const cases=[['bookish-directory',request('')],['bookish-verified',request('')],['bookish-community',request('')],['bookish-confirm',request('?token=22222222-2222-4222-8222-222222222222')],['bookish-join-respond',request('?token=22222222-2222-4222-8222-222222222222&action=approve')],['bookish-club-settings',request('',{club_id:'entry-hidden',action:'get'})],['bookish-join',request('',{club_id:'entry-hidden',email:'reader@example.test',elapsed_ms:3000,consent:true})],['bookish-submit',request('',{kind:'start',club_name:'Submitted Hidden Canary',city:'Austin',state:'TX',visibility:'hidden',email:'new@example.test',elapsed_ms:3000,consent:true})]];
  for(const [name,req] of cases){const h=await edge(name,sb),r=await h(req),text=await r.text();assert.ok(!text.includes('Entry Secret Canary'),name);assert.ok(!text.includes('entry-hidden'),name);assert.ok(!text.includes('host@example.test'),name);assert.ok(!text.includes('decision_token'),name);assert.ok(r.status<500,`${name}: ${r.status}`);}
  const join=await edge('bookish-join',sb),j=await join(request('',{club_id:'entry-hidden',email:'reader@example.test',elapsed_ms:3000,consent:true}));assert.equal(j.status,404);
 }catch(e){throw new Error(e.message);}finally{await db.close();}
});
