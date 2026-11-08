// Generates review files only. Never connects to any database or reads secrets.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const target='tkrsrnlasinmlftkcufi';
const state='bookish_release_20261101.state';
const maxBytes=200_000;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const slug=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const guard=`do $guard$ begin
 if current_setting('bookish.target_ref',true) is distinct from '${target}' then
  raise exception 'Confirm the Bookish dedicated project ${target} and set bookish.target_ref first.';
 end if;
 if to_regclass('auth.users') is null or to_regclass('auth.identities') is null then
  raise exception 'Expected Supabase Auth schema is missing.';
 end if;
end $guard$;`;
const header=`-- REVIEW PACKET ONLY. No hosted deployment has occurred.
-- Dedicated Bookish project: ${target}. Do not run against any other project.
-- Confirm the Dashboard target, then prefix EVERY execution/session with:
-- set bookish.target_ref='${target}';
-- The setting is an operator confirmation, not independent project detection.
-- Run all chunks in order while Bookish intake is paused. Retain normal backups.
`;
const acl=`-- Explicit privileges do not depend on hosted default privileges.
do $acl$ declare r record;begin
 for r in select tablename from pg_tables where schemaname='public' and tablename like 'bookish\\_%' escape '\\' loop
  execute format('alter table public.%I enable row level security',r.tablename);
  execute format('revoke all on public.%I from public,anon',r.tablename);
  execute format('grant select,insert,update,delete on public.%I to service_role',r.tablename);
 end loop;
end $acl$;`;
const secretRPC=`-- Vault is provisioned by Supabase, including its encryption key management.
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;
-- Plaintext is reachable only through the narrow service RPC, never direct API roles.
revoke all on schema vault from public,anon,authenticated,service_role;
revoke all on all tables in schema vault from public,anon,authenticated,service_role;
create or replace function public.bookish_get_secret(p_name text) returns text
 language plpgsql stable security definer set search_path='' as $secret$
declare value text;
begin
 if p_name is null or p_name not in (
  'BOOKISH_SITE_URL','BOOKISH_EMAIL_FROM','RESEND_API_KEY',
  'BOOKISH_APPLE_CLIENT_ID','BOOKISH_APPLE_TEAM_ID','BOOKISH_APPLE_KEY_ID',
  'BOOKISH_APPLE_PRIVATE_KEY','BOOKISH_TERMS_URL','BOOKISH_PRIVACY_URL',
  'BOOKISH_MODERATION_EMAIL'
 ) then raise exception 'Bookish secret name is not allowed.' using errcode='22023';end if;
 select s.decrypted_secret into value from vault.decrypted_secrets s where s.name=p_name;
 return value;
end $secret$;
revoke all on function public.bookish_get_secret(text) from public,anon,authenticated,service_role;
grant execute on function public.bookish_get_secret(text) to service_role;
comment on function public.bookish_get_secret(text) is 'Bookish edge configuration only. Service role execution, exact allowlist, null when missing. Never log returned values.';
`;
const sourceNames=fs.readdirSync(path.join(root,'supabase/sql')).filter(n=>/^0(0[1-9]|10)_/.test(n)).sort();
function schemaSQL(){
 const sources=sourceNames.map(name=>{
  let sql=read(`supabase/sql/${name}`).replace(/^\s*(?:begin|commit);\s*$/gm,'');
  // Source files remain historical references. The dedicated review packet has
  // no dependency on another product, shared migration history, or legacy rows.
  sql=sql.replace(/^--[^\n]*(?:shared project|shared\n|Fictora|shared Auth|001–004)[^\n]*\n/gm,'');
  sql=sql.replace(/^-- Run as raw SQL[^\n]*\n-- project's migration history\. Idempotent\.\n/gm,'-- Idempotent schema for the dedicated Bookish project.\n');
  sql=sql.replace(/^-- kept out of the shared[^\n]*\n/gm,'');
  return `-- SOURCE: supabase/sql/${name}\n${sql.trim()}\n`;
 }).join('\n');
 return `create schema if not exists bookish_release_20261101;
revoke all on schema bookish_release_20261101 from public,anon,authenticated,service_role;
create table if not exists ${state}(version text primary key,applied_at timestamptz);
alter table ${state} enable row level security;
revoke all on all tables in schema bookish_release_20261101 from public,anon,authenticated,service_role;
${sources}\n${secretRPC}\n${acl}`;
}
function batches(rows,statement){
 const result=[];let batch=[];
 for(const row of rows){
  if(batch.length && Buffer.byteLength(statement([...batch,row]))>175_000){result.push(statement(batch));batch=[];}
  batch.push(row);
 }
 if(batch.length)result.push(statement(batch));
 return result;
}
export function buildPacket(){
 const centers=new Map();
 for(const [key,v] of Object.entries(json('data/ref/places.json'))){
  if(!Number.isFinite(v[0])||!Number.isFinite(v[1])||Math.abs(v[0])>90||Math.abs(v[1])>180)continue;
  const state=key.slice(0,2),id=`${v[2].toLowerCase()}|${state}`;
  if(!centers.has(id))centers.set(id,{city:v[2],state,lat:v[0],lng:v[1]});
 }
 const directory=json('data/clubs.json').map(c=>({ref:c.id,name:c.name,city:c.city,state:c.state,public_data:{genres:c.genres,cadence:c.cadence,format:c.format,source_name:c.source_name,source_url:c.source_url,last_seen:c.last_seen,city_path:`/book-clubs/${slug(c.city)}-${c.state.toLowerCase()}/`}}));
 const bodies=[schemaSQL(),
  ...batches([...centers.values()],rows=>`-- Geographic seed: city centers only, never street coordinates.
insert into public.bookish_city_centers(city,state,lat,lng)
 select city,state,lat,lng from jsonb_to_recordset(${literal(rows)}) as x(city text,state text,lat double precision,lng double precision)
 on conflict(city,state) do nothing;`),
  ...batches(directory,rows=>`-- Seed only missing public calendars. Preserve every existing host choice.
insert into public.bookish_clubs(club_ref,name,city,state,visibility,listed,public_data)
 select ref,name,city,state,'open',true,public_data from jsonb_to_recordset(${literal(rows)}) as x(ref text,name text,city text,state text,public_data jsonb)
 on conflict(club_ref) where club_ref is not null do nothing;`)];
 const markers=bodies.map((_,i)=>`dedicated-chunk-${String(i+1).padStart(2,'0')}`);
 const steps=bodies.map((body,i)=>`${i?`do $order$ begin
 if to_regclass('${state}') is null then raise exception 'Apply earlier Bookish chunks first.';end if;
 if not exists(select 1 from ${state} where version='${markers[i-1]}') then raise exception 'Apply earlier Bookish chunks first.';end if;
end $order$;\n`:''}${body}\ninsert into ${state} values('${markers[i]}',now()) on conflict(version) do nothing;`);
 const files={'apply.sql':`${header}-- Full alternative: one transaction with the same ordered chunk bodies.\nbegin;\n${guard}\n${steps.join('\n\n')}\ncommit;\n`};
 steps.forEach((step,i)=>{
  const name=`apply-${String(i+1).padStart(2,'0')}.sql`;
  files[name]=`${header}-- Chunk ${i+1}/${steps.length}. Reapplying preserves live rows.\nbegin;\n${guard}\n${step}\ncommit;\n`;
  if(Buffer.byteLength(files[name])>maxBytes)throw new Error(`${name} exceeds ${maxBytes} bytes. Split the schema deliberately before release.`);
 });
 return {files,centers:centers.size,clubs:directory.length};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const packet=buildPacket();
 for(const name of ['apply-20.sql','preflight.sql','rollback.sql'])packet.files[name]=read(`supabase/packets/${name}`);
 const out=path.join(root,'.cache/dedicated-sql');
 if(process.argv.includes('--check')){
  for(const [name,sql] of Object.entries(packet.files))if(read(`.cache/dedicated-sql/${name}`)!==sql)throw new Error(`Regenerate .cache/dedicated-sql/${name}`);
  // Chunk 20 is the hand-authored post-deployment hardening migration.
  const actual=fs.readdirSync(out).filter(n=>/^apply-\d\d\.sql$/.test(n)&&n!=='apply-20.sql');
  if(actual.length!==Object.keys(packet.files).filter(n=>/^apply-\d\d\.sql$/.test(n)&&n!=='apply-20.sql').length)throw new Error('Unexpected stale SQL chunk');
  console.log('Dedicated SQL generation is reproducible.');
 }else{
  fs.mkdirSync(out,{recursive:true});
  // Regenerate only the packet files; keep other local review artifacts.
  for(const name of Object.keys(packet.files))if(fs.existsSync(path.join(out,name)))fs.unlinkSync(path.join(out,name));
  for(const [name,sql] of Object.entries(packet.files))fs.writeFileSync(path.join(out,name),sql);
  console.log(`Prepared full SQL plus ${Object.keys(packet.files).filter(n=>/^apply-\d\d\.sql$/.test(n)).length} chunks, ${packet.centers} city centers, and ${packet.clubs} calendars. No database connection was made.`);
 }
}
