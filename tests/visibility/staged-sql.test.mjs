import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {reviewSQL} from '../../scripts/stage-visibility.mjs';
test('full reviewed apply preserves public listings, backup, and rollback without production access',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
  for(const f of ['001_bookish_submissions.sql','002_bookish_join.sql','003_bookish_read_next.sql'])await db.exec(fs.readFileSync(new URL(`../../supabase/sql/${f}`,import.meta.url),'utf8'));
  await db.exec("insert into bookish_clubs(name,city,state) values ('Existing app club','Austin','TX');insert into bookish_submissions(kind,email,club_ref,payload,status) values ('start','host@example.test','legacy-open','{\"club_name\":\"Legacy Open\",\"city\":\"Austin\",\"state\":\"TX\",\"list_in_city\":\"yes\"}','confirmed'),('start','hidden@example.test','legacy-hidden','{\"club_name\":\"Legacy Hidden\",\"city\":\"Austin\",\"state\":\"TX\",\"list_in_city\":\"no\"}','confirmed')");
  const sql=reviewSQL();await db.exec(sql.apply);
  const counts=(await db.query("select visibility,count(*)::int n from bookish_clubs group by visibility")).rows;
  assert.equal(counts.find(x=>x.visibility==='open').n,2539);assert.equal(counts.find(x=>x.visibility==='private').n,1);assert.equal(counts.find(x=>x.visibility==='hidden').n,1);
  const directory=(await db.query('select bookish_visibility_directory() as v')).rows[0].v;
  assert.ok(!JSON.stringify(directory).includes('Legacy Hidden'));assert.ok(directory.some(x=>x.name==='Legacy Open'));
  await db.exec('set role service_role');try{assert.ok((await db.query('select bookish_visibility_directory() as v')).rows[0].v.length>2500);}finally{await db.exec('reset role');}
  await db.exec(sql.check);
  await db.exec("update bookish_clubs set visibility='hidden' where club_ref='legacy-open'");await assert.rejects(db.exec(sql.rollback),/changed after apply/);await db.exec('rollback');
  await db.exec("update bookish_clubs set visibility='open' where club_ref='legacy-open'");
  await db.exec(sql.rollback);
  assert.equal((await db.query('select count(*)::int n from bookish_clubs')).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='bookish_clubs' and column_name='visibility'")).rows[0].n,0);
  assert.equal((await db.query("select payload ? 'visibility' as v from bookish_submissions limit 1")).rows[0].v,false);
 }catch(error){throw new Error(error.message);}finally{await db.close();}
});
