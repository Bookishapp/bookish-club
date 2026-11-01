-- READ ONLY. Run against the Dashboard-confirmed project wqnrortftkffmbeugjky.
-- Counts and definitions only. Never print tokens, emails, keys, codes, or backup rows.
begin read only;
select current_database() as database_name,current_user as operator,version() as postgres_version;
select to_regclass('auth.users') is not null as auth_exists,to_regclass('auth.identities') is not null as identities_exist;
select n.nspname,c.relname,c.relkind,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' and c.relname like 'bookish\_%' escape '\') or n.nspname in ('bookish_private','bookish_release_20261101') order by 1,2;
select club_ref,count(*) as duplicate_count from public.bookish_clubs where club_ref is not null group by club_ref having count(*)>1;
select count(*) as member_rows,count(*) filter(where not exists(select 1 from auth.users u where u.id=m.user_id and u.raw_app_meta_data->>'app'='bookish')) as members_without_trusted_bookish_identity from public.bookish_members m;
select count(*) as invalid_club_names from public.bookish_clubs where length(trim(name)) not between 2 and 140;
select count(*) as trusted_bookish_accounts,count(*) filter(where email_confirmed_at is null) as unconfirmed_bookish_accounts from auth.users where raw_app_meta_data->>'app'='bookish';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where (schemaname='public' and tablename like 'bookish\_%' escape '\') or schemaname='bookish_private' order by 1,2;
select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'bookish\_%' escape '\') or n.nspname='bookish_private' order by 1,2;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where not tgisinternal and tgname like 'bookish\_%' escape '\' order by 1;
select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name like 'bookish\_%' escape '\' and column_name in ('user_id','club_id','visibility','owner_submission_id','listed') order by 1,2;
select n.nspname,c.relname,has_table_privilege('anon',c.oid,'select') as anon_select,has_table_privilege('authenticated',c.oid,'select') as authenticated_select,has_table_privilege('service_role',c.oid,'select') as service_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','v') and n.nspname='public' and c.relname like 'bookish\_%' escape '\' order by 1,2;
commit;
