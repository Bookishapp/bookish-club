import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const sql = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const token = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const call = async (fn, args) => (await db.query(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`, args)).rows[0].value;
before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;');
  for (const p of ['001_bookish_submissions.sql','002_bookish_join.sql','003_bookish_read_next.sql']) await db.exec(sql(`supabase/sql/${p}`));
  // This pre-existing service-role function grant was verified read-only in production.
  await db.exec('grant execute on function bookish_privacy_floor() to service_role');
  const migration = new URL('../../supabase/sql/009_bookish_visibility.sql', import.meta.url);
  if (fs.existsSync(migration)) await db.exec(fs.readFileSync(migration,'utf8'));
  if(fs.existsSync(migration))await db.exec("insert into bookish_city_centers values ('Austin','TX',30.2672,-97.7431)");
});
after(() => db.close());
test('visibility column defaults to private and rejects unknown values', async () => {
  const {rows} = await db.query("insert into bookish_clubs(name) values ('Default club') returning visibility");
  assert.equal(rows[0].visibility,'private');
  await assert.rejects(db.query("insert into bookish_clubs(name,visibility) values ('Bad','PUBLIC')"));
});
test('confirmed host creation requires a visibility and does not publish hidden facts', async () => {
  await assert.rejects(db.query("insert into bookish_submissions(kind,email,club_ref,payload,status) values ('start','host@example.test','no-choice','{\"club_name\":\"Missing\",\"city\":\"Austin\",\"state\":\"TX\"}','confirmed')"));
  await db.query(`insert into bookish_submissions(kind,email,club_ref,payload,status,confirm_token) values ('start','host@example.test','secret-ref',$1,'confirmed',$2)`, [JSON.stringify({club_name:'Secret Canary',city:'Austin',state:'TX',visibility:'hidden'}),token]);
  assert.equal(JSON.stringify(await call('bookish_visibility_directory',[])).includes('Secret Canary'),false);
  assert.equal(JSON.stringify(await call('bookish_visibility_directory',[])).includes('secret-ref'),false);
  assert.equal((await call('bookish_visibility_host',[token,'get','secret-ref',null,null,null])).club.visibility,'hidden');
  await assert.rejects(call('bookish_visibility_host',[foreign,'save','secret-ref','open',null,null]));
});
test('anon and authenticated cannot read raw hidden clubs, invite codes, or requests', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of ['bookish_clubs','bookish_submissions','bookish_invites','bookish_join_requests','bookish_join_attempts']) await assert.rejects(db.query(`select * from ${table}`));
      await assert.rejects(call('bookish_visibility_host',[token,'get','secret-ref',null,null,null]));
      await assert.rejects(call('bookish_visibility_join',['secret-ref','reader@example.test','','','',`rls-${role}`]));
    } finally { await db.exec('reset role'); }
  }
});
test('hidden joins are indistinguishable from missing clubs without a valid invite', async () => {
  const hidden = await call('bookish_visibility_join',['secret-ref','reader@example.test','','','', 'hidden-attempt']);
  const absent = await call('bookish_visibility_join',['absent-ref','reader@example.test','','','', 'absent-attempt']);
  assert.deepEqual(hidden,absent);
  assert.equal(hidden.error,'unavailable');
});
test('host rotation invalidates old codes, permits hidden joins, and enforces use limits', async () => {
  const a=await call('bookish_visibility_host',[token,'rotate','secret-ref',null,null,null]);
  assert.match(a.invite,/^[A-Z2-9]{12}$/);
  const b=await call('bookish_visibility_host',[token,'rotate','secret-ref',null,null,null]);
  assert.notEqual(a.invite,b.invite);
  assert.equal((await call('bookish_visibility_join',['secret-ref','old@example.test','','',a.invite,'old'])).error,'unavailable');
  await db.query('update bookish_invites set max_uses=1 where code=$1',[b.invite]);
  assert.equal((await call('bookish_visibility_join',['secret-ref','yes@example.test','','',b.invite,'new'])).status,'joined');
  assert.equal((await call('bookish_visibility_join',['secret-ref','no@example.test','','',b.invite,'full'])).error,'unavailable');
});
test('open joins immediately, private waits for the host, and hiding cancels pending requests', async () => {
  await call('bookish_visibility_host',[token,'save','secret-ref','open',null,null]);
  assert.equal((await call('bookish_visibility_join',['secret-ref','open@example.test','','','','open'])).status,'joined');
  await call('bookish_visibility_host',[token,'save','secret-ref','private',null,null]);
  const listing = await call('bookish_visibility_directory',[]);
  assert.equal(listing.find(x=>x.id==='secret-ref').visibility,'private');
  assert.equal((await call('bookish_visibility_join',['secret-ref','pending@example.test','','','','private'])).status,'pending');
  const inbox=await call('bookish_visibility_host',[token,'get','secret-ref',null,null,null]);
  const request=inbox.requests.find(x=>x.email==='pending@example.test');
  assert.ok(request);
  await call('bookish_visibility_host',[token,'decide','secret-ref',null,request.id,true]);
  assert.equal((await db.query('select status from bookish_join_requests where id=$1',[request.id])).rows[0].status,'approved');
  await call('bookish_visibility_join',['secret-ref','cancel@example.test','','','','cancel']);
  const {rows:[pending]}=await db.query("select decision_token from bookish_join_requests where email='cancel@example.test'");
  await call('bookish_visibility_host',[token,'save','secret-ref','hidden',null,null]);
  assert.equal((await call('bookish_visibility_decide',[pending.decision_token,true])).ok,false);
  assert.equal((await call('bookish_visibility_directory',[])).some(x=>x.id==='secret-ref'),false);
});
test('a later confirmed claim cannot steal the current host capability', async () => {
  await db.query(`insert into bookish_submissions(kind,email,club_ref,payload,status,confirm_token) values ('claim','attacker@example.test','secret-ref',$1,'confirmed',$2)`,[JSON.stringify({club_name:'Leaked Canary',club_city:'Austin',visibility:'open'}),foreign]);
  await assert.rejects(call('bookish_visibility_host',[foreign,'get','secret-ref',null,null,null]));
  assert.equal((await call('bookish_visibility_directory',[])).some(x=>x.id==='secret-ref'),false);
});
test('rate limiting includes invalid hidden invite attempts', async () => {
  for(let i=0;i<5;i++) await call('bookish_visibility_join',['secret-ref',`guess${i}@example.test`,'','','WRONGCODE','guess-ip']);
  assert.equal((await call('bookish_visibility_join',['secret-ref','guess5@example.test','','','WRONGCODE','guess-ip'])).error,'rate_limited');
});

test('RLS itself hides raw rows even if a client SELECT grant is accidentally added',async()=>{
 await db.exec('grant select on bookish_clubs,bookish_invites,bookish_join_attempts to anon,authenticated');
 try{for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{for(const table of ['bookish_clubs','bookish_invites','bookish_join_attempts'])assert.deepEqual((await db.query(`select * from ${table}`)).rows,[]);}finally{await db.exec('reset role');}}}
 finally{await db.exec('revoke select on bookish_clubs,bookish_invites,bookish_join_attempts from anon,authenticated');}
});
test('hiding removes clubs from every public community aggregate before the privacy floor is computed',async()=>{
 await db.exec("insert into bookish_books(id,title,authors) values ('canary-book','Canary Book',array['Writer'])");
 for(let i=0;i<3;i++){
  const {rows:[c]}=await db.query("insert into bookish_clubs(club_ref,name,city,state,visibility) values ($1,'Aggregate Canary','Austin','TX','open') returning id",[`aggregate-${i}`]);
  await db.query("insert into bookish_members(club_id,user_id) values ($1,gen_random_uuid()),($1,gen_random_uuid())",[c.id]);
  await db.query("insert into bookish_club_books(club_id,book_id,status,finished_at) values ($1,'canary-book','finished',current_date)",[c.id]);
 }
 await db.exec('set role service_role');
 try{assert.equal((await db.query("select clubs from bookish_book_stats where book_id='canary-book'")).rows[0].clubs,3);}finally{await db.exec('reset role');}
 await db.exec("update bookish_clubs set visibility='hidden' where club_ref='aggregate-0'");
 for(const view of ['bookish_book_stats','bookish_city_book','bookish_state_book','bookish_book_next'])assert.deepEqual((await db.query(`select * from ${view}`)).rows,[]);
 assert.equal((await db.query('select count(*)::int as n from bookish_active_clubs')).rows[0].n,2);
});
test('a hidden invite code works by itself without exposing a club reference first',async()=>{
 const invite=await call('bookish_visibility_host',[token,'rotate','secret-ref',null,null,null]);
 const joined=await call('bookish_visibility_join',['','codeonly@example.test','','',invite.invite,'code-only']);
 assert.equal(joined.status,'joined');
});
