-- Bookish v1.1. Review/run after 001–004 as raw SQL, never db push on the shared project.
-- No provider settings or production data are changed by creating this file.
begin;
create schema if not exists bookish_private;
revoke all on schema bookish_private from public, anon, authenticated, service_role;
grant usage on schema bookish_private to authenticated, service_role;

create table if not exists public.bookish_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Reader' check (length(trim(display_name)) between 2 and 50),
  home_city text check (length(home_city)<=80),
  terms_version text,
  terms_accepted_at timestamptz,
  adult_confirmed boolean not null default false,
  banned_at timestamptz,
  created_at timestamptz not null default now()
);
grant select,insert,update,delete on table public.bookish_profiles to service_role;
alter table public.bookish_profiles enable row level security;
revoke all on table public.bookish_profiles from public,anon,authenticated;
alter table public.bookish_submissions add column if not exists user_id uuid references public.bookish_profiles(id) on delete cascade;
create or replace function bookish_private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.raw_app_meta_data->>'app' is distinct from 'bookish' then return new; end if;
  insert into public.bookish_profiles(id) values(new.id) on conflict do nothing;
  if new.email_confirmed_at is not null then
    update public.bookish_submissions set user_id=new.id where lower(email)=lower(new.email) and user_id is null;
  end if;
  return new;
exception when others then
  raise log 'Bookish profile trigger skipped auth user %: %', new.id, sqlerrm;
  return new;
end $$;
create or replace trigger bookish_new_profile after insert on auth.users for each row execute function bookish_private.new_profile();
create or replace function bookish_private.link_submission_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select u.id into new.user_id from auth.users u where lower(u.email)=lower(new.email) and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish' and exists(select 1 from public.bookish_profiles p where p.id=u.id) limit 1;
 return new;
end $$;
create or replace trigger bookish_link_submission_user before insert on public.bookish_submissions for each row execute function bookish_private.link_submission_user();

do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_member_profile_fk' and conrelid='public.bookish_members'::regclass) then
 alter table public.bookish_members add constraint bookish_member_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
alter table public.bookish_members add column if not exists race_visible boolean not null default true;
alter table public.bookish_members add column if not exists spoiler_shield boolean not null default true;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_pour_profile_fk' and conrelid='public.bookish_pours'::regclass) then
 alter table public.bookish_pours add constraint bookish_pour_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_taste_profile_fk' and conrelid='public.bookish_taste'::regclass) then
 alter table public.bookish_taste add constraint bookish_taste_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_event_profile_fk' and conrelid='public.bookish_suggest_events'::regclass) then
 alter table public.bookish_suggest_events add constraint bookish_event_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_event_club_fk' and conrelid='public.bookish_suggest_events'::regclass) then
 alter table public.bookish_suggest_events add constraint bookish_event_club_fk foreign key(club_id) references public.bookish_clubs(id) on delete cascade;
 end if; end $guard$;
create unique index if not exists bookish_club_ref_unique on public.bookish_clubs(club_ref) where club_ref is not null;
alter table public.bookish_clubs add column if not exists listed boolean not null default false;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_club_name_length' and conrelid='public.bookish_clubs'::regclass) then
 alter table public.bookish_clubs add constraint bookish_club_name_length check(length(trim(name)) between 2 and 140);
 end if; end $guard$;
alter table public.bookish_join_requests add column if not exists club_id uuid references public.bookish_clubs(id) on delete cascade;
alter table public.bookish_join_requests add column if not exists user_id uuid references public.bookish_profiles(id) on delete cascade;
create or replace function bookish_private.confirmed_user_links() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'app' is distinct from 'bookish' then return new; end if;
 if new.email_confirmed_at is not null then
  update public.bookish_submissions set user_id=new.id where lower(email)=lower(new.email) and user_id is null;
  update public.bookish_join_requests set user_id=new.id where lower(email)=lower(new.email) and user_id is null;
 end if;
 return new;
exception when others then
 raise log 'Bookish confirmed links trigger skipped auth user %: %', new.id, sqlerrm;
 return new;
end $$;
create or replace trigger bookish_confirmed_user_links after update of email,email_confirmed_at on auth.users for each row execute function bookish_private.confirmed_user_links();
create unique index if not exists bookish_pending_member_request on public.bookish_join_requests(club_id,user_id) where status='pending' and user_id is not null;
alter table public.bookish_invites add column if not exists club_id uuid references public.bookish_clubs(id) on delete cascade;
alter table public.bookish_invites add column if not exists created_by uuid references public.bookish_profiles(id) on delete cascade;
-- Legacy directory codes remain directory-only: they never grant app membership.
create table if not exists bookish_private.club_removals (
  club_id uuid references public.bookish_clubs(id) on delete cascade,
  user_id uuid references public.bookish_profiles(id) on delete cascade,
  primary key(club_id,user_id)
);
alter table bookish_private.club_removals enable row level security;
create table if not exists public.bookish_preferences (
  user_id uuid primary key references public.bookish_profiles(id) on delete cascade,
  active_club_id uuid references public.bookish_clubs(id) on delete set null
);
grant select,insert,update,delete on table public.bookish_preferences to service_role;
alter table public.bookish_preferences enable row level security;
revoke all on table public.bookish_preferences from public,anon,authenticated;

create or replace function bookish_private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookish_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.banned_at is null and u.raw_app_meta_data->>'app'='bookish')
$$;
create or replace function bookish_private.is_member(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid())
$$;
create or replace function bookish_private.is_host(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid() and role in ('host','cohost'))
$$;
create or replace function bookish_private.require_member(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not bookish_private.is_member(p_club) then raise exception 'Join this club to enjoy its next chapter.'; end if; end $$;
create or replace function bookish_private.require_host(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not bookish_private.is_host(p_club) then raise exception 'Your host can help with this.'; end if; end $$;
create or replace function bookish_private.require_terms() returns void language plpgsql security definer set search_path='' as $$
begin
 if not bookish_private.active_user() or not exists(select 1 from public.bookish_profiles where id=auth.uid() and banned_at is null and terms_version='2026-10-15' and adult_confirmed and terms_accepted_at is not null)
 then raise exception 'Please accept our house rules and confirm you are 18 or over.'; end if;
end $$;

do $guard$ begin if not exists (select 1 from pg_policy where polname='profiles_read' and polrelid='public.bookish_profiles'::regclass) then
 create policy profiles_read on public.bookish_profiles for select to authenticated using(
 bookish_private.active_user() and (id=auth.uid() or exists(select 1 from public.bookish_members m where m.user_id=id and bookish_private.is_member(m.club_id)))
);
 end if; end $guard$;
-- Only safe profile columns are granted. Terms and ban state cannot be forged.
do $guard$ begin if not exists (select 1 from pg_policy where polname='profiles_update' and polrelid='public.bookish_profiles'::regclass) then
 create policy profiles_update on public.bookish_profiles for update to authenticated using(id=auth.uid() and bookish_private.active_user()) with check(id=auth.uid());
 end if; end $guard$;
grant select(id,display_name,home_city,created_at),update(display_name,home_city) on public.bookish_profiles to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='clubs_read' and polrelid='public.bookish_clubs'::regclass) then
 create policy clubs_read on public.bookish_clubs for select to authenticated using(bookish_private.is_member(id));
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_policy where polname='members_read' and polrelid='public.bookish_members'::regclass) then
 create policy members_read on public.bookish_members for select to authenticated using(bookish_private.is_member(club_id));
 end if; end $guard$;
grant select on public.bookish_clubs,public.bookish_members to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='books_read' and polrelid='public.bookish_books'::regclass) then
 create policy books_read on public.bookish_books for select to authenticated using(bookish_private.active_user());
 end if; end $guard$;
grant select on public.bookish_books to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='prefs_self' and polrelid='public.bookish_preferences'::regclass) then
 create policy prefs_self on public.bookish_preferences for select to authenticated using(user_id=auth.uid() and bookish_private.active_user());
 end if; end $guard$;
grant select on public.bookish_preferences to authenticated;

create or replace function public.bookish_accept_terms(p_version text,p_adult boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not bookish_private.active_user() or p_version is distinct from '2026-10-15' or p_adult is distinct from true then raise exception 'Please accept our house rules and confirm you are 18 or over.'; end if;
 update public.bookish_profiles set terms_version=p_version,terms_accepted_at=now(),adult_confirmed=true where id=auth.uid();
end $$;
create or replace function public.bookish_my_account() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'display_name',display_name,'home_city',home_city,'terms_version',terms_version,'terms_accepted_at',terms_accepted_at,'adult_confirmed',adult_confirmed)
 from public.bookish_profiles where id=auth.uid() and bookish_private.active_user()
$$;
create or replace function public.bookish_create_club(p_name text,p_city text,p_state text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform bookish_private.require_terms();
 if length(p_city)>80 or length(p_state)>80 then raise exception 'A shorter city name fits beautifully.'; end if;
 insert into public.bookish_clubs(name,city,state) values(trim(p_name),trim(p_city),trim(p_state)) returning id into cid;
 insert into public.bookish_members(club_id,user_id,role) values(cid,auth.uid(),'host');
 insert into public.bookish_preferences(user_id,active_club_id) values(auth.uid(),cid) on conflict(user_id) do update set active_club_id=cid;
 return cid;
end $$;
create or replace function public.bookish_switch_club(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 insert into public.bookish_preferences values(auth.uid(),p_club) on conflict(user_id) do update set active_club_id=p_club;
end $$;
create or replace function public.bookish_member_preferences(p_club uuid,p_race boolean,p_shield boolean,p_ratings boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 update public.bookish_members set race_visible=p_race,spoiler_shield=p_shield,ratings_public=p_ratings where club_id=p_club and user_id=auth.uid(); end $$;
create or replace function public.bookish_link_directory(p_club uuid,p_ref text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_host(p_club);
 if not exists(select 1 from public.bookish_submissions s join auth.users u on u.id=auth.uid() and lower(u.email)=lower(s.email) and u.email_confirmed_at is not null
   where s.club_ref=p_ref and s.kind in ('claim','start') and s.status='confirmed') then raise exception 'Confirm your host email to connect this listing.'; end if;
 update public.bookish_clubs set club_ref=p_ref where id=p_club and club_ref is null;
 if not found then raise exception 'This club already has a listing.'; end if;
end $$;
create or replace function public.bookish_set_listing(p_club uuid,p_listed boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club); update public.bookish_clubs set listed=p_listed where id=p_club; end $$;
create or replace function public.bookish_discover_clubs(p_city text,p_state text) returns table(id uuid,club_ref text,name text,city text,state text) language sql stable security definer set search_path='' as $$
 select c.id,c.club_ref,c.name,c.city,c.state from public.bookish_clubs c where bookish_private.active_user() and c.listed and (not (to_jsonb(c) ? 'visibility') or to_jsonb(c)->>'visibility' in ('open','private')) and c.city=p_city and c.state=p_state order by c.name,c.id limit 100
$$;
create or replace function public.bookish_create_invite(p_club uuid,p_max_uses int default 20,p_days int default 7) returns text language plpgsql security definer set search_path='' as $$
declare code_value text;
begin
 perform bookish_private.require_host(p_club);
 if p_max_uses not between 1 and 100 or p_days not between 1 and 30 or p_max_uses is null or p_days is null then raise exception 'Choose 1–100 guests and 1–30 days.'; end if;
 code_value:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 insert into public.bookish_invites(code,club_ref,club_id,created_by,expires_at,max_uses) values(code_value,p_club::text,p_club,auth.uid(),now()+make_interval(days=>p_days),p_max_uses);
 return code_value;
end $$;
create or replace function public.bookish_redeem_invite(p_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.bookish_invites;
begin
 perform bookish_private.require_terms();
 select * into inv from public.bookish_invites where code=upper(trim(p_code)) for update;
 if inv.club_id is null then raise exception 'Ask your host for a fresh invite.'; end if;
 if exists(select 1 from bookish_private.club_removals where club_id=inv.club_id and user_id=auth.uid()) then raise exception 'Your host can help with an invite.'; end if;
 if exists(select 1 from public.bookish_members where club_id=inv.club_id and user_id=auth.uid()) then return inv.club_id; end if;
 if inv.expires_at<=now() or inv.uses>=inv.max_uses then raise exception 'Ask your host for a fresh invite.'; end if;
 insert into public.bookish_members(club_id,user_id) values(inv.club_id,auth.uid());
 update public.bookish_invites set uses=uses+1 where code=inv.code;
 return inv.club_id;
end $$;
create or replace function public.bookish_request_join(p_club uuid,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 perform bookish_private.require_terms();
 if not exists(select 1 from public.bookish_clubs c where c.id=p_club and c.listed and (not (to_jsonb(c) ? 'visibility') or to_jsonb(c)->>'visibility' in ('open','private'))) or exists(select 1 from bookish_private.club_removals where club_id=p_club and user_id=auth.uid()) then raise exception 'Your host can help you join.'; end if;
 insert into public.bookish_join_requests(club_id,user_id,club_ref,email,first_name,note)
 select p_club,auth.uid(),p_club::text,u.email,p.display_name,p_note from auth.users u join public.bookish_profiles p on p.id=u.id where u.id=auth.uid()
 on conflict(club_id,user_id) where status='pending' and user_id is not null do update set note=excluded.note returning id into rid;
 return rid;
end $$;
create or replace function public.bookish_join_queue(p_club uuid) returns table(id uuid,user_id uuid,first_name text,note text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 return query select j.id,j.user_id,j.first_name,j.note,j.created_at from public.bookish_join_requests j where j.club_id=p_club and j.status='pending'; end $$;
create or replace function public.bookish_decide_join(p_request uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare j public.bookish_join_requests;
begin select * into j from public.bookish_join_requests where id=p_request for update;
 perform bookish_private.require_host(j.club_id);
 if j.status<>'pending' then return; end if;
 if p_approve then
  if j.user_id is null or exists(select 1 from bookish_private.club_removals where club_id=j.club_id and user_id=j.user_id) then raise exception 'Invite this reader through their Bookish account.'; end if;
  insert into public.bookish_members(club_id,user_id) values(j.club_id,j.user_id) on conflict do nothing;
 end if;
 update public.bookish_join_requests set status=case when p_approve then 'approved' else 'declined' end,decided_at=now() where id=j.id;
end $$;
create or replace function public.bookish_remove_member(p_club uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 if exists(select 1 from public.bookish_members where club_id=p_club and user_id=p_user and role in ('host','cohost')) then raise exception 'Pass the hosting ribbon first.'; end if;
 insert into bookish_private.club_removals values(p_club,p_user) on conflict do nothing;
 delete from public.bookish_members where club_id=p_club and user_id=p_user;
 update public.bookish_preferences set active_club_id=null where user_id=p_user and active_club_id=p_club;
end $$;
create or replace function public.bookish_transfer_host(p_club uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.bookish_clubs where id=p_club for update;
 if not exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid() and role='host') or not bookish_private.active_user() then raise exception 'Your host can pass the ribbon.'; end if;
 if not exists(select 1 from public.bookish_members where club_id=p_club and user_id=p_user) then raise exception 'Choose a member of this club.'; end if;
 update public.bookish_members set role=case when user_id=p_user then 'host' else 'member' end where club_id=p_club and (role='host' or user_id=p_user);
end $$;

-- Only explicitly listed APIs and policy predicates are executable by app users.
revoke all on all tables in schema bookish_private from public,anon,authenticated,service_role;
revoke all on all functions in schema bookish_private from public,anon,authenticated,service_role;
grant execute on function bookish_private.active_user(),bookish_private.is_member(uuid),bookish_private.is_host(uuid) to authenticated;
revoke all on function public.bookish_accept_terms(text, boolean),public.bookish_my_account(),public.bookish_create_club(text, text, text),public.bookish_switch_club(uuid),public.bookish_member_preferences(uuid, boolean, boolean, boolean),public.bookish_link_directory(uuid, text),public.bookish_set_listing(uuid, boolean),public.bookish_discover_clubs(text, text),public.bookish_create_invite(uuid, integer, integer),public.bookish_redeem_invite(text),public.bookish_request_join(uuid, text),public.bookish_join_queue(uuid),public.bookish_decide_join(uuid, boolean),public.bookish_remove_member(uuid, uuid),public.bookish_transfer_host(uuid, uuid) from public,anon,authenticated;
grant execute on function public.bookish_accept_terms(text, boolean),public.bookish_my_account(),public.bookish_create_club(text, text, text),public.bookish_switch_club(uuid),public.bookish_member_preferences(uuid, boolean, boolean, boolean),public.bookish_link_directory(uuid, text),public.bookish_set_listing(uuid, boolean),public.bookish_discover_clubs(text, text),public.bookish_create_invite(uuid, integer, integer),public.bookish_redeem_invite(text),public.bookish_request_join(uuid, text),public.bookish_join_queue(uuid),public.bookish_decide_join(uuid, boolean),public.bookish_remove_member(uuid, uuid),public.bookish_transfer_host(uuid, uuid) to authenticated;
commit;
