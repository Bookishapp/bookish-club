-- READ ONLY. Dedicated project tkrsrnlasinmlftkcufi, before or after installation.
-- Confirm the Dashboard target, then prefix this session with:
-- set bookish.target_ref='tkrsrnlasinmlftkcufi';
-- Counts and definitions only. No keys, tokens, emails, codes, or Vault values.
begin read only;
do $guard$ begin
 if current_setting('bookish.target_ref',true) is distinct from 'tkrsrnlasinmlftkcufi' then
  raise exception 'Confirm the Bookish dedicated project tkrsrnlasinmlftkcufi and set bookish.target_ref first.';
 end if;
 if to_regclass('auth.users') is null or to_regclass('auth.identities') is null then
  raise exception 'Expected Supabase Auth schema is missing.';
 end if;
end $guard$;
select current_database() as database_name,current_user as operator,version() as postgres_version;
select to_regclass('auth.users') is not null as auth_exists,to_regclass('auth.identities') is not null as identities_exist,
 to_regclass('vault.decrypted_secrets') is not null as vault_ready;
select name,installed_version from pg_available_extensions where name='supabase_vault';
select n.nspname,c.relname,c.relkind,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' and c.relname like 'bookish\_%' escape '\') or n.nspname in ('bookish_private','bookish_release_20261101') order by 1,2;
select count(*) as auth_accounts,count(*) filter(where raw_app_meta_data->>'app'='bookish') as trusted_bookish_accounts,
 count(*) filter(where raw_app_meta_data->>'app'='bookish' and email_confirmed_at is null) as unconfirmed_bookish_accounts from auth.users;
-- PL/pgSQL plans optional table queries only after their existence check.
-- This makes preflight safe on an empty dedicated project's public schema.
do $counts$ declare n bigint;begin
 if to_regclass('public.bookish_clubs') is not null then
  select count(*) into n from (select club_ref from public.bookish_clubs where club_ref is not null group by club_ref having count(*)>1) d;
  raise notice 'Duplicate club references: %',n;
  select count(*) into n from public.bookish_clubs where length(trim(name)) not between 2 and 140;
  raise notice 'Invalid club names: %',n;
 end if;
 if to_regclass('public.bookish_members') is not null then
  select count(*) into n from public.bookish_members m where not exists(select 1 from auth.users u where u.id=m.user_id and u.raw_app_meta_data->>'app'='bookish');
  raise notice 'Members without trusted Bookish identity: %',n;
 end if;
 if to_regclass('bookish_release_20261101.state') is not null then
  select count(*) into n from bookish_release_20261101.state where version like 'dedicated-chunk-%';
  raise notice 'Completed dedicated SQL chunks: %',n;
 end if;
end $counts$;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
 where (schemaname='public' and tablename like 'bookish\_%' escape '\') or schemaname='bookish_private' order by 1,2;
select n.nspname,p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'execute') as service_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname like 'bookish\_%' escape '\') or n.nspname='bookish_private' order by 1,2;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where not tgisinternal and tgname like 'bookish\_%' escape '\' order by 1;
select n.nspname,c.relname,has_table_privilege('anon',c.oid,'select') as anon_select,
 has_table_privilege('authenticated',c.oid,'select') as authenticated_select,
 has_table_privilege('service_role',c.oid,'select') as service_select
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','v') and ((n.nspname='public' and c.relname like 'bookish\_%' escape '\') or n.nspname='vault') order by 1,2;
commit;
