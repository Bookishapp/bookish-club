import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
export const host='91000000-0000-0000-0000-000000000001',reader='91000000-0000-0000-0000-000000000002',other='91000000-0000-0000-0000-000000000003',outside='91000000-0000-0000-0000-000000000004';
export async function fixture({migrations=true}={}){
 const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec("set bookish.target_ref='tkrsrnlasinmlftkcufi';create schema bookish_release_20261101;create table bookish_release_20261101.state(version text primary key);insert into bookish_release_20261101.state values('dedicated-chunk-20');create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);");
 for(const dir of (migrations?['supabase/sql','supabase/migrations']:['supabase/sql'])){
 if(dir==='supabase/migrations')await db.exec('alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;alter default privileges in schema bookish_private grant all on tables to public,anon,authenticated,service_role;alter default privileges in schema bookish_private grant execute on functions to anon,authenticated,service_role;');
 for(const n of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(`${dir}/${n}`,'utf8'));
 }
 async function as(u,s,p=[]){await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[u]);try{return await q(s,p);}finally{await db.exec('reset role');}}
 const rpc=async(u,n,p=[])=>(await as(u,`select public.${n}(${p.map((_,i)=>'$'+(i+1)).join(',')}) as v`,p))[0].v;
 const service=async(n,p=[])=>{await db.exec('set role service_role');try{return(await q(`select public.${n}(${p.map((_,i)=>'$'+(i+1)).join(',')}) as v`,p))[0].v;}finally{await db.exec('reset role');}};
 for(const [i,id] of [host,reader,other,outside].entries()){await q(`insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{"app":"bookish"}')`,[id,`tea${i}@example.test`]);await rpc(id,'bookish_accept_terms',['2026-10-15',true]);}
 const club=await rpc(host,'bookish_create_club',['Tea readers','Austin','TX']);const invite=await rpc(host,'bookish_create_invite',[club,10,7]);for(const u of [reader,other])await rpc(u,'bookish_redeem_invite',[invite]);
 await rpc(host,'bookish_set_current_book',[club,'fourth-wing']);
 const post=(u,body='A thought about the book',page=20,dnf=false,parent=null)=>rpc(u,'bookish_create_take',[club,'fourth-wing',body,page,dnf,parent]);
 const feed=(u,parent=null)=>rpc(u,'bookish_tea_feed',[club,'fourth-wing',parent,100,0]);
 return {db,q,as,rpc,service,club,post,feed};
}
