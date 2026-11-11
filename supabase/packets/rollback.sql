-- Fail-closed operational rollback for dedicated project tkrsrnlasinmlftkcufi.
-- Retain all Bookish accounts and data. No schema or Vault secrets are deleted.
-- Confirm the Dashboard target, then prefix this session with:
-- set bookish.target_ref='tkrsrnlasinmlftkcufi';
-- This disables normal access and preserves traffic accepted after apply.
-- The operator must disable Bookish intake and serve a maintenance app before execution.
begin;
do $guard$ begin
 if current_setting('bookish.target_ref',true) is distinct from 'tkrsrnlasinmlftkcufi' then raise exception 'Confirm the Bookish dedicated project tkrsrnlasinmlftkcufi and set bookish.target_ref first.';end if;
 if to_regclass('bookish_release_20261101.state') is null then raise exception 'Bookish release was not applied here.';end if;
end $guard$;
create or replace function public.bookish_auth_throttle(p_email text,p_ip text,p_action text) returns boolean language sql as $$select false$$;
create or replace function public.bookish_visibility_directory() returns jsonb language sql as $$select '[]'::jsonb$$;
do $disable$ declare r record;begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'bookish\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 end loop;
 for r in select tablename from pg_tables where schemaname='public' and tablename like 'bookish\_%' escape '\' loop
  execute format('revoke all on public.%I from public,anon,authenticated',r.tablename);
  execute format('revoke insert,update,delete on public.%I from service_role',r.tablename);
 end loop;
 -- Table REVOKE does not remove the profile's explicit column grants.
 for r in select c.relname,a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'bookish\_%' escape '\' and a.attnum>0 and not a.attisdropped and a.attacl is not null loop
  execute format('revoke all (%I) on public.%I from public,anon,authenticated',r.attname,r.relname);
  execute format('revoke insert (%I),update (%I),references (%I) on public.%I from service_role',r.attname,r.attname,r.attname,r.relname);
 end loop;
end $disable$;
revoke execute on function public.bookish_visibility_join(text,text,text,text,text,text),public.bookish_visibility_host(uuid,text,text,text,uuid,boolean),public.bookish_visibility_decide(uuid,boolean) from service_role;
-- Keep the safety alert reader unavailable while this release is locked down.
-- Dynamic lookup also permits rollback on installations that stop at chunk 19.
do $alerts$ begin
 if to_regprocedure('public.bookish_content_report_queue(uuid)') is not null then
  revoke execute on function public.bookish_content_report_queue(uuid) from service_role;
 end if;
end $alerts$;
-- Deletion must remain available for existing trusted Bookish identities through
-- the verified bookish-delete-account edge. Its Auth cascades still operate.
-- The service-only Vault RPC stays available for Apple revocation during deletion.
-- Reapply chunks 01 through 20, in order, to restore all access and hardening.
commit;
