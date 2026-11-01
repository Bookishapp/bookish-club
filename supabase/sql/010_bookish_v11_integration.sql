-- Bookish-only integration, applied after 001-009. No shared Auth configuration.
begin;
-- Require live trusted metadata, confirmed email, and a live profile on every call.
create or replace function bookish_private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookish_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.banned_at is null and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish')
$$;
-- 009's directory API never replaces authenticated member access.
grant select on public.bookish_clubs to authenticated;
create table if not exists bookish_private.auth_attempts(id uuid primary key default gen_random_uuid(),email_hash text not null,ip_hash text not null,action text not null,created_at timestamptz not null default now());
alter table bookish_private.auth_attempts enable row level security;
revoke all on bookish_private.auth_attempts from public,anon,authenticated,service_role;
create index if not exists bookish_auth_attempt_email on bookish_private.auth_attempts(email_hash,created_at);
create index if not exists bookish_auth_attempt_ip on bookish_private.auth_attempts(ip_hash,created_at);
create or replace function public.bookish_auth_lookup(p_email text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'bookish',coalesce(raw_app_meta_data->>'app'='bookish',false)) from auth.users where lower(email)=lower(trim(p_email)) limit 1
$$;
create or replace function public.bookish_auth_throttle(p_email text,p_ip text,p_action text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_email is null or p_ip is null or p_action not in ('start','verify','password','refresh','logout') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip,42));
 perform pg_advisory_xact_lock(hashtextextended(p_email,43));
 delete from bookish_private.auth_attempts where created_at<now()-interval '30 days';
 if (select count(*) from bookish_private.auth_attempts where ip_hash=p_ip and created_at>now()-interval '1 hour')>=100 then return false; end if;
 if p_action='start' and ((select count(*) from bookish_private.auth_attempts where email_hash=p_email and action='start' and created_at>now()-interval '1 hour')>=5 or (select count(*) from bookish_private.auth_attempts where ip_hash=p_ip and action='start' and created_at>now()-interval '1 hour')>=15) then return false; end if;
 if p_action in ('verify','password') and (select count(*) from bookish_private.auth_attempts where email_hash=p_email and action in ('verify','password') and created_at>now()-interval '1 hour')>=10 then return false; end if;
 insert into bookish_private.auth_attempts(email_hash,ip_hash,action) values(p_email,p_ip,p_action);return true;
end $$;
revoke all on function public.bookish_auth_lookup(text),public.bookish_auth_throttle(text,text,text) from public,anon,authenticated;
grant execute on function public.bookish_auth_lookup(text),public.bookish_auth_throttle(text,text,text) to service_role;

create or replace function public.bookish_sync_account() returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; uid uuid:=auth.uid();
begin
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'app'='bookish' and email_confirmed_at is not null) then raise exception 'Sign in to Bookish to continue.'; end if;
 insert into public.bookish_profiles(id) values(uid) on conflict do nothing;
 if not bookish_private.active_user() then raise exception 'Account unavailable.'; end if;
 -- First confirmed owner retains the listing. Only proof of this email plus a
 -- trusted Bookish identity can attach an Auth host to a legacy listing.
 for cid in select c.id from public.bookish_clubs c join public.bookish_submissions s on s.id=c.owner_submission_id join auth.users u on u.id=uid and lower(u.email)=lower(s.email)
 where s.status='confirmed' and not exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role in ('host','cohost')) loop
  insert into public.bookish_members(club_id,user_id,role) values(cid,uid,'host') on conflict(club_id,user_id) do update set role='host';
 end loop;
end $$;
create or replace function public.bookish_create_club(p_name text,p_city text,p_state text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform bookish_private.require_terms();
 if nullif(trim(p_city),'') is null or length(p_city)>80 or p_state is null or upper(trim(p_state)) !~ '^[A-Z]{2}$' then raise exception 'Choose your city and state.'; end if;
 insert into public.bookish_clubs(name,city,state,visibility) values(trim(p_name),trim(p_city),upper(trim(p_state)),'private') returning id into cid;
 update public.bookish_clubs set club_ref=cid::text where id=cid;
 insert into public.bookish_members(club_id,user_id,role) values(cid,auth.uid(),'host');
 insert into public.bookish_preferences(user_id,active_club_id) values(auth.uid(),cid) on conflict(user_id) do update set active_club_id=cid;
 return cid;
end $$;
create or replace function public.bookish_set_visibility(p_club uuid,p_visibility text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_host(p_club);
 if p_visibility is null or p_visibility not in ('open','private','hidden') then raise exception 'Choose club visibility.'; end if;
 if p_visibility in ('open','private') and not exists(select 1 from public.bookish_clubs c join public.bookish_city_centers g on lower(g.city)=lower(c.city) and g.state=c.state where c.id=p_club) then raise exception 'Choose a supported city before listing this club.'; end if;
 update public.bookish_clubs set visibility=p_visibility,listed=p_visibility<>'hidden',club_ref=coalesce(club_ref,id::text) where id=p_club;
 if p_visibility='hidden' then update public.bookish_join_requests set status='declined',decided_at=now() where club_id=p_club and status='pending'; end if;
end $$;
create or replace function public.bookish_rotate_invite(p_club uuid) returns text language plpgsql security definer set search_path='' as $$
declare code text;
begin
 perform bookish_private.require_host(p_club);
 perform 1 from public.bookish_clubs where id=p_club for update;
 delete from public.bookish_invites where club_id=p_club or club_ref in (select club_ref from public.bookish_clubs where id=p_club);
 code:=public.bookish_create_invite(p_club,20,7);return code;
end $$;

create or replace function public.bookish_join_club(p_ref text,p_note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; rid uuid; prior public.bookish_join_requests;
begin
 perform bookish_private.require_terms();
 select * into c from public.bookish_clubs where club_ref=p_ref or id::text=p_ref for update;
 if c.id is null or exists(select 1 from bookish_private.content_removals where kind='club' and target_id=c.id) or exists(select 1 from bookish_private.club_removals where club_id=c.id and user_id=auth.uid()) then raise exception 'Your host can help you join.'; end if;
 if bookish_private.is_member(c.id) then return jsonb_build_object('club_id',c.id,'status','joined'); end if;
 if c.visibility='hidden' or not(c.listed or c.owner_submission_id is not null) or (c.owner_submission_id is null and not exists(select 1 from public.bookish_members where club_id=c.id and role='host')) then raise exception 'Your host can help you join.'; end if;
 select j.* into prior from public.bookish_join_requests j join auth.users u on u.id=auth.uid() and lower(u.email)=lower(j.email) where j.club_ref=c.club_ref and j.status='approved' order by j.created_at limit 1;
 if c.visibility='open' or prior.id is not null then
  insert into public.bookish_members(club_id,user_id) values(c.id,auth.uid()) on conflict do nothing;
  update public.bookish_join_requests set club_id=c.id,user_id=auth.uid(),status='approved',decided_at=now() where club_ref=c.club_ref and (user_id=auth.uid() or id=prior.id) and status in ('pending','approved');
  return jsonb_build_object('club_id',c.id,'status','joined');
 end if;
 perform 1 from public.bookish_profiles where id=auth.uid() for update;
 if (select count(*) from public.bookish_join_requests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 and not exists(select 1 from public.bookish_join_requests where club_id=c.id and user_id=auth.uid() and status='pending') then raise exception 'Please wait before requesting another club.';end if;
 insert into public.bookish_join_requests(club_id,user_id,club_ref,email,first_name,note)
 select c.id,auth.uid(),c.club_ref,u.email,p.display_name,p_note from auth.users u join public.bookish_profiles p on p.id=u.id where u.id=auth.uid()
 on conflict(club_id,user_id) where status='pending' and user_id is not null do update set note=excluded.note returning id into rid;
 return jsonb_build_object('club_id',c.id,'request_id',rid,'status','pending');
end $$;
-- Old native clients share the same visibility semantics.
create or replace function public.bookish_request_join(p_club uuid,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result jsonb; begin result:=public.bookish_join_club(p_club::text,p_note);return (result->>'request_id')::uuid;end $$;

create table if not exists bookish_private.actor_blocks(user_id uuid references public.bookish_profiles(id) on delete cascade,author_id uuid references public.bookish_profiles(id) on delete cascade,primary key(user_id,author_id));
create table if not exists bookish_private.content_hides(user_id uuid references public.bookish_profiles(id) on delete cascade,kind text not null,target_id uuid not null,primary key(user_id,kind,target_id));
create table if not exists bookish_private.content_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid references public.bookish_profiles(id) on delete cascade,kind text not null,target_id uuid not null,club_id uuid references public.bookish_clubs(id) on delete cascade,reason text check(length(reason)<=500),created_at timestamptz not null default now(),due_at timestamptz not null default now()+interval '24 hours',status text not null default 'pending' check(status in ('pending','resolved')),unique(reporter_id,kind,target_id));
alter table bookish_private.actor_blocks enable row level security;
alter table bookish_private.content_hides enable row level security;
alter table bookish_private.content_reports enable row level security;
revoke all on bookish_private.actor_blocks,bookish_private.content_hides,bookish_private.content_reports from public,anon,authenticated,service_role;
-- Safety reviewers receive scoped reports, not anonymous author mappings.
create or replace function public.bookish_content_report_queue() returns table(id uuid,kind text,target_id uuid,club_id uuid,reason text,due_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,kind,target_id,club_id,reason,due_at from bookish_private.content_reports where status='pending' order by created_at limit 100
$$;
revoke all on function public.bookish_content_report_queue() from public,anon,authenticated;
grant execute on function public.bookish_content_report_queue() to service_role;

create table if not exists bookish_private.content_removals(kind text not null,target_id uuid not null,created_at timestamptz not null default now(),primary key(kind,target_id));
create table if not exists bookish_private.content_moderation_audit(id uuid primary key default gen_random_uuid(),report_id uuid references bookish_private.content_reports(id) on delete cascade,action text not null,reviewer text not null,note text not null,created_at timestamptz not null default now());
alter table bookish_private.content_removals enable row level security;
alter table bookish_private.content_moderation_audit enable row level security;
revoke all on bookish_private.content_removals,bookish_private.content_moderation_audit from public,anon,authenticated,service_role;
create or replace function public.bookish_review_content(p_report uuid,p_action text,p_reviewer text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r bookish_private.content_reports;
begin
 if p_action is null or p_action not in ('dismiss','hide','ban') or length(trim(coalesce(p_reviewer,'')))<3 or length(trim(coalesce(p_note,'')))<10 then raise exception 'A review action, reviewer, and note are required.';end if;
 select * into r from bookish_private.content_reports where id=p_report for update;
 if r.id is null then raise exception 'Report unavailable.';end if;
 if p_action='ban' and r.kind<>'member' then raise exception 'Use a member report for an account ban.';end if;
 if p_action in ('hide','ban') then insert into bookish_private.content_removals(kind,target_id) values(r.kind,r.target_id) on conflict do nothing;end if;
 if p_action='hide' and r.kind='club' then
 update public.bookish_clubs set visibility='hidden',listed=false where id=r.target_id;
 delete from public.bookish_invites where club_id=r.target_id or club_ref in(select club_ref from public.bookish_clubs where id=r.target_id);
 update public.bookish_join_requests set status='declined',decided_at=now() where club_id=r.target_id and status='pending';
 end if;
 if p_action='ban' then update public.bookish_profiles set banned_at=now() where id=r.target_id;end if;
 update bookish_private.content_reports set status='resolved' where id=r.id;
 insert into bookish_private.content_moderation_audit(report_id,action,reviewer,note) values(r.id,p_action,p_reviewer,p_note);
end $$;
revoke all on function public.bookish_review_content(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bookish_review_content(uuid,text,text,text) to service_role;
create or replace function bookish_private.content_visible(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from bookish_private.content_removals where kind=p_kind and target_id=p_id)
 and not exists(select 1 from bookish_private.content_hides where user_id=auth.uid() and kind=p_kind and target_id=p_id)
 and (p_kind<>'member' or not exists(select 1 from bookish_private.actor_blocks where user_id=auth.uid() and author_id=p_id))
$$;
create or replace function public.bookish_club_detail(p_ref text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',coalesce(c.club_ref,c.id::text),'club_id',c.id,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility,'hosted',exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role='host'))
 from public.bookish_clubs c where (c.club_ref=p_ref or c.id::text=p_ref) and bookish_private.content_visible('club',c.id) and ((c.visibility in ('open','private') and (c.listed or c.owner_submission_id is not null)) or bookish_private.is_member(c.id)) limit 1
$$;
create or replace function public.bookish_content_action(p_kind text,p_id uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; author uuid;
begin
 perform bookish_private.require_terms();
 if p_action is null or p_action not in ('report','block','hide') then raise exception 'Choose report, block, or hide.'; end if;
 if p_kind='take' then perform public.bookish_take_action(p_id,p_action,p_reason);return;
 elsif p_kind='club' then select id into cid from public.bookish_clubs where id=p_id and ((visibility in ('open','private') and (listed or owner_submission_id is not null)) or bookish_private.is_member(id));
 elsif p_kind='member' then select m.club_id,m.user_id into cid,author from public.bookish_members m where m.user_id=p_id and bookish_private.is_member(m.club_id) limit 1;
 elsif p_kind='meeting' then select club_id into cid from public.bookish_meetings where id=p_id and bookish_private.is_member(club_id);
 elsif p_kind='vote' then select club_id into cid from public.bookish_votes where id=p_id and bookish_private.is_member(club_id);
 elsif p_kind='request' then select club_id,user_id into cid,author from public.bookish_join_requests where id=p_id and bookish_private.is_host(club_id);
 end if;
 if cid is null then raise exception 'This content is unavailable.'; end if;
 if p_kind='member' and author=auth.uid() and p_action='block' then raise exception 'This is your own account.'; end if;
 insert into bookish_private.content_hides values(auth.uid(),p_kind,p_id) on conflict do nothing;
 if p_action='block' and author is not null and author<>auth.uid() then insert into bookish_private.actor_blocks values(auth.uid(),author) on conflict do nothing;end if;
 if p_action='report' then insert into bookish_private.content_reports(reporter_id,kind,target_id,club_id,reason) values(auth.uid(),p_kind,p_id,cid,p_reason) on conflict do nothing;end if;
end $$;
create or replace function public.bookish_my_content_filters() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',h.kind,'id',h.target_id)),'[]'::jsonb) from bookish_private.content_hides h where h.user_id=auth.uid() and bookish_private.active_user()
$$;
create or replace function public.bookish_my_clubs() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) from (select c.id,c.club_ref,c.name,c.city,c.state,c.visibility,m.role from public.bookish_clubs c join public.bookish_members m on m.club_id=c.id and m.user_id=auth.uid() where bookish_private.active_user() and bookish_private.content_visible('club',c.id)) x
$$;
create or replace function public.bookish_club_home(p_club uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);
 if not bookish_private.content_visible('club',p_club) then raise exception 'This club is hidden.';end if;
 select jsonb_build_object('club',jsonb_build_object('id',c.id,'club_ref',c.club_ref,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility),
 'role',(select role from public.bookish_members where club_id=c.id and user_id=auth.uid()),
 'current_book',(select to_jsonb(b) from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id where cb.club_id=c.id and cb.status='reading' limit 1),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'display_name',p.display_name,'joined_at',m.joined_at) order by m.joined_at),'[]'::jsonb) from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id where m.club_id=c.id and p.banned_at is null and bookish_private.content_visible('member',m.user_id)),
 'meetings',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('bring_items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.bookish_bring_items i where i.meeting_id=m.id),'rsvps',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.bookish_rsvps r where r.meeting_id=m.id)) order by m.starts_at),'[]'::jsonb) from public.bookish_meetings m where m.club_id=c.id and bookish_private.content_visible('meeting',m.id)),
 'votes',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('options',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from public.bookish_vote_options o where o.vote_id=v.id),'tally',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.bookish_vote_tally(v.id) t)) order by v.closes_at desc),'[]'::jsonb) from public.bookish_votes v where v.club_id=c.id and bookish_private.content_visible('vote',v.id))) into result from public.bookish_clubs c where c.id=p_club;
 return result;
end $$;
-- Native and website discovery share a safe projection. Never use a club venue's
-- coordinates, exact meeting locations, email, tokens, or arbitrary payload JSON.
create or replace function public.bookish_visibility_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.club_ref,'club_id',c.id,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility,
 'verified',c.owner_submission_id is not null or exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role='host'),
 'current_book',(select jsonb_build_object('title',b.title,'authors',b.authors) from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id where cb.club_id=c.id and cb.status='reading' limit 1),
 'genres',case when c.visibility='open' then coalesce(c.public_data->'genres','[]'::jsonb) else '[]'::jsonb end,
 'cadence',case when c.visibility='open' then c.public_data->'cadence' end,'format',case when c.visibility='open' then c.public_data->'format' end,'vibe',null,
 'source_name',case when c.visibility='open' and c.owner_submission_id is null then c.public_data->'source_name' end,'source_url',case when c.visibility='open' and c.owner_submission_id is null then c.public_data->'source_url' end,
 'last_seen',c.public_data->'last_seen','lat',g.lat,'lng',g.lng,'city_path',c.public_data->'city_path') order by c.name,c.club_ref),'[]'::jsonb)
 from public.bookish_clubs c left join public.bookish_city_centers g on lower(g.city)=lower(c.city) and g.state=c.state
 where c.visibility in ('open','private') and c.club_ref is not null and (c.listed or c.owner_submission_id is not null) and bookish_private.content_visible('club',c.id)
$$;
create or replace function bookish_private.can_view_take(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain as (
  select t.id,t.parent_id,t.club_id,t.hidden,0 depth from public.bookish_takes t where t.id=p_take
  union all select t.id,t.parent_id,t.club_id,t.hidden,c.depth+1 from public.bookish_takes t join chain c on c.parent_id=t.id where c.depth<10
 )
 select exists(select 1 from chain) and not exists(
  select 1 from chain c left join bookish_private.take_authors a on a.take_id=c.id
  left join public.bookish_profiles p on p.id=a.author_id
  where c.hidden or not bookish_private.is_member(c.club_id) or a.author_id is null or p.banned_at is not null or not exists(select 1 from public.bookish_members m where m.club_id=c.club_id and m.user_id=a.author_id)
   or exists(select 1 from bookish_private.hidden_takes h where h.take_id=c.id and h.user_id=auth.uid())
   or exists(select 1 from bookish_private.actor_blocks ab where ab.user_id=auth.uid() and ab.author_id=a.author_id)
   or exists(select 1 from bookish_private.blocks b where b.user_id=auth.uid() and b.take_id=c.id)
 )
$$;
create or replace function public.bookish_take_action(p_take uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare author uuid; cid uuid;
begin
 select a.author_id,t.club_id into author,cid from public.bookish_takes t join bookish_private.take_authors a on a.take_id=t.id where t.id=p_take;
 perform bookish_private.require_member(cid);
 if p_action='delete' and author=auth.uid() then delete from public.bookish_takes where id=p_take; return; end if;
 if not bookish_private.can_view_take(p_take) and not exists(select 1 from bookish_private.hidden_takes where take_id=p_take and user_id=auth.uid()) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
 if p_action='block' then
  if author=auth.uid() then raise exception 'This is one of your own lovely takes.'; end if;
  insert into bookish_private.blocks values(auth.uid(),p_take) on conflict do nothing;
  insert into bookish_private.actor_blocks values(auth.uid(),author) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
  delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();
 elsif p_action='hide' then insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 elsif p_action='report' then
  insert into bookish_private.reports(take_id,reporter_id,reason) values(p_take,auth.uid(),p_reason) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 else raise exception 'Choose report, hide, block or delete.'; end if;
end $$;
create or replace function public.bookish_visibility_confirm() returns trigger
language plpgsql security definer set search_path='' as $$
declare chosen text; geo public.bookish_city_centers;
begin
 if new.status<>'confirmed' or new.kind='waitlist' or new.club_ref is null then return new; end if;
 if tg_op='UPDATE' and old.status='confirmed' then return new; end if;
 if new.kind='start' then
  select * into geo from public.bookish_city_centers where lower(city)=lower(trim(new.payload->>'city')) and state=upper(trim(new.payload->>'state')) limit 1;
  if geo.city is null then raise exception 'Choose a supported US city and state.'; end if;
 end if;
 chosen:=new.payload->>'visibility';
 if chosen is null or chosen not in ('open','private','hidden') then raise exception 'Choose club visibility.'; end if;
 insert into public.bookish_clubs(club_ref,name,city,state,visibility,owner_submission_id,public_data)
 values(new.club_ref,left(new.payload->>'club_name',140),left(coalesce(new.payload->>'city',new.payload->>'club_city'),80),upper(left(new.payload->>'state',2)),chosen,new.id,
 jsonb_build_object('lat',geo.lat,'lng',geo.lng,'genres',case when coalesce(new.payload->>'genre','')='' then '[]'::jsonb else jsonb_build_array(new.payload->>'genre') end,'format',new.payload->>'format','cadence',new.payload->>'cadence'))
 on conflict(club_ref) where club_ref is not null do update set
  owner_submission_id=new.id,visibility=chosen
 where bookish_clubs.owner_submission_id is null and not exists(select 1 from public.bookish_members m where m.club_id=bookish_clubs.id and m.role in ('host','cohost'));
 return new;
end $$;
create or replace function public.bookish_visibility_host(p_token uuid,p_action text,p_ref text,p_visibility text default null,p_request uuid default null,p_approve boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; code_value text; i int; decision jsonb;
begin
 select cl.* into c from public.bookish_clubs cl join public.bookish_submissions s on s.id=cl.owner_submission_id
 where cl.club_ref=p_ref and s.confirm_token=p_token and s.status='confirmed' for update of cl;
 if c.id is null or exists(select 1 from bookish_private.content_removals where kind='club' and target_id=c.id) then raise exception 'Host link is unavailable.'; end if;
 if p_action='save' then
  if p_visibility is null or p_visibility not in ('open','private','hidden') then raise exception 'Choose club visibility.'; end if;
  update public.bookish_clubs set visibility=p_visibility where id=c.id returning * into c;
  if p_visibility='hidden' then
   update public.bookish_join_requests set status='declined',decided_at=now() where club_ref=c.club_ref and status='pending';
  end if;
 elsif p_action='rotate' then
  -- 12 characters, 60 random bits from PostgreSQL's cryptographic UUID source.
  code_value:='';
  for i in 1..12 loop
   code_value:=code_value||substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,2))::bit(8)::int % 32)+1,1);
  end loop;
  delete from public.bookish_invites where club_ref=c.club_ref or club_id=c.id;
  insert into public.bookish_invites(code,club_ref,club_id,expires_at,max_uses) values(code_value,c.club_ref,c.id,now()+interval '7 days',20);
 elsif p_action='decide' then
  if p_approve is null then raise exception 'Choose approve or decline.'; end if;
  select public.bookish_visibility_decide(r.decision_token,p_approve) into decision from public.bookish_join_requests r where r.id=p_request and r.club_ref=c.club_ref;
  if not coalesce((decision->>'ok')::boolean,false) then raise exception 'Request is unavailable.'; end if;
 elsif p_action<>'get' then raise exception 'Unknown action.';
 end if;
 return jsonb_build_object('ok',true,'club',jsonb_build_object('id',c.club_ref,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility),
 'invite',(select code from public.bookish_invites where club_ref=c.club_ref and expires_at>now() and uses<max_uses order by created_at desc limit 1),
 'notice',decision->'notice','requests',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'email',email,'note',note) order by created_at),'[]'::jsonb) from public.bookish_join_requests where club_ref=c.club_ref and status='pending'));
end $$;
create or replace function public.bookish_visibility_decide(p_token uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.bookish_join_requests; c public.bookish_clubs;
begin
 select * into r from public.bookish_join_requests where decision_token=p_token;
 if r.id is null then return jsonb_build_object('ok',false); end if;
 select * into c from public.bookish_clubs where (id=r.club_id or club_ref=r.club_ref) for update;
 if c.id is null or c.visibility='hidden' then return jsonb_build_object('ok',false); end if;
 update public.bookish_join_requests set status=case when p_approve then 'approved' else 'declined' end,decided_at=now()
 where id=r.id and status='pending' returning * into r;
 if not found then return jsonb_build_object('ok',false); end if;
 if p_approve and r.user_id is not null then
  if exists(select 1 from bookish_private.club_removals where club_id=c.id and user_id=r.user_id) or not exists(select 1 from public.bookish_profiles p join auth.users u on u.id=p.id where p.id=r.user_id and p.banned_at is null and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish') then raise exception 'This account is unavailable.';end if;
  insert into public.bookish_members(club_id,user_id) values(c.id,r.user_id) on conflict do nothing;
 end if;
 return jsonb_build_object('ok',true,'status',r.status,'notice',jsonb_build_object('kind','decision','to',r.email,'name',r.first_name,'club',c.name,'approved',p_approve,'host_email',case when p_approve then (select email from public.bookish_submissions where id=c.owner_submission_id) end));
end $$;

-- A former legacy host's email submission must not prevent account deletion or
-- erase the club transferred to its remaining members.
do $fk$ declare r record;begin
 for r in select conname from pg_constraint where conrelid='public.bookish_clubs'::regclass and contype='f' and confrelid='public.bookish_submissions'::regclass and confdeltype<>'n' loop
 execute format('alter table public.bookish_clubs drop constraint %I',r.conname);
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.bookish_clubs'::regclass and contype='f' and confrelid='public.bookish_submissions'::regclass) then
 alter table public.bookish_clubs add constraint bookish_clubs_owner_submission_id_fkey foreign key(owner_submission_id) references public.bookish_submissions(id) on delete set null;
 end if;
end $fk$;
create or replace function bookish_private.delete_account_traces() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.raw_app_meta_data->>'app' is distinct from 'bookish' then return old;end if;
 delete from bookish_private.auth_attempts where email_hash=encode(sha256(convert_to('bookish:'||lower(old.email),'UTF8')),'hex');
 if old.email_confirmed_at is not null then
 delete from public.bookish_join_attempts where lower(email)=lower(old.email) or lower(email) in(select lower(i.identity_data->>'email') from auth.identities i where i.user_id=old.id and i.identity_data->>'email_verified'='true');
 end if;
 delete from bookish_private.content_hides where kind='member' and target_id=old.id;
 delete from bookish_private.content_reports where kind='member' and target_id=old.id;
 return old;
end $$;
create or replace trigger bookish_delete_account_traces before delete on auth.users for each row execute function bookish_private.delete_account_traces();


alter table public.bookish_join_requests add column if not exists notice_attempted_at timestamptz;
create or replace function public.bookish_join_notice(p_request uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.bookish_join_requests; c public.bookish_clubs; recipient text;
begin
 select * into j from public.bookish_join_requests where id=p_request and user_id=p_user and status='pending' for update;
 if j.id is null or j.host_notified or j.notice_attempted_at>now()-interval '5 minutes' then return null;end if;
 select * into c from public.bookish_clubs where id=j.club_id;
 select email into recipient from public.bookish_submissions where id=c.owner_submission_id and status='confirmed';
 if recipient is null then select u.email into recipient from public.bookish_members m join auth.users u on u.id=m.user_id where m.club_id=c.id and m.role='host' and u.raw_app_meta_data->>'app'='bookish' and u.email_confirmed_at is not null order by m.joined_at limit 1;end if;
 if recipient is null then return null;end if;
 update public.bookish_join_requests set notice_attempted_at=now() where id=j.id;
 return jsonb_build_object('kind','request','to',recipient,'club',c.name,'name',j.first_name,'note',j.note,'decision_token',j.decision_token);
end $$;
revoke all on function public.bookish_join_notice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bookish_join_notice(uuid,uuid) to service_role;
create or replace function public.bookish_join_notice_done(p_request uuid,p_user uuid) returns void language sql security definer set search_path='' as $$
 update public.bookish_join_requests set host_notified=true where id=p_request and user_id=p_user
$$;
revoke all on function public.bookish_join_notice_done(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bookish_join_notice_done(uuid,uuid) to service_role;
-- Refreshing a blocked request must not redisplay its author or note.
create or replace function public.bookish_join_queue(p_club uuid) returns table(id uuid,user_id uuid,first_name text,note text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 return query select j.id,j.user_id,j.first_name,j.note,j.created_at from public.bookish_join_requests j where j.club_id=p_club and j.status='pending' and bookish_private.content_visible('request',j.id) and (j.user_id is null or bookish_private.content_visible('member',j.user_id));end $$;


create or replace function public.bookish_set_club_city(p_club uuid,p_city text,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare geo public.bookish_city_centers;
begin
 perform bookish_private.require_host(p_club);
 select * into geo from public.bookish_city_centers where lower(city)=lower(trim(p_city)) and state=upper(trim(p_state)) limit 1;
 if geo.city is null then raise exception 'Choose a supported city and state.';end if;
 update public.bookish_clubs set city=geo.city,state=geo.state where id=p_club;
end $$;
revoke all on function public.bookish_set_club_city(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bookish_set_club_city(uuid,text,text) to authenticated;
-- Personal content preferences apply to both composed RPC reads and the Data API.
drop policy if exists clubs_read on public.bookish_clubs;
create policy clubs_read on public.bookish_clubs for select to authenticated using(bookish_private.is_member(id) and bookish_private.content_visible('club',id));
drop policy if exists members_read on public.bookish_members;
create policy members_read on public.bookish_members for select to authenticated using(bookish_private.is_member(club_id) and bookish_private.content_visible('member',user_id));
drop policy if exists profiles_read on public.bookish_profiles;
create policy profiles_read on public.bookish_profiles for select to authenticated using(bookish_private.active_user() and bookish_private.content_visible('member',id) and (id=auth.uid() or exists(select 1 from public.bookish_members m where m.user_id=id and bookish_private.is_member(m.club_id))));
drop policy if exists club_read on public.bookish_meetings;
create policy club_read on public.bookish_meetings for select to authenticated using(bookish_private.is_member(club_id) and bookish_private.content_visible('meeting',id));
drop policy if exists club_read on public.bookish_votes;
create policy club_read on public.bookish_votes for select to authenticated using(bookish_private.is_member(club_id) and bookish_private.content_visible('vote',id));


-- Globally removed clubs cannot use member or legacy host tools to republish.
create or replace function bookish_private.is_member(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and bookish_private.content_visible('club',p_club) and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid())
$$;
create or replace function bookish_private.is_host(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and bookish_private.content_visible('club',p_club) and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid() and role in ('host','cohost'))
$$;

-- Restore the hardened, independent established-club aggregate after legacy 009.
create or replace view public.bookish_active_clubs as
 with qualified as (select c.id,c.city,c.state from public.bookish_clubs c where c.visibility in ('open','private')
 and (select count(distinct m.user_id) from public.bookish_members m where m.club_id=c.id and m.joined_at<=now()-interval '14 days')>=3
 and exists(select 1 from public.bookish_club_books b where b.club_id=c.id and b.status='finished'))
 select q.id,q.city,q.state from qualified q where not exists(select 1 from qualified other join public.bookish_members mine on mine.club_id=q.id join public.bookish_members theirs on theirs.club_id=other.id and theirs.user_id=mine.user_id where other.id<>q.id);
revoke all on public.bookish_active_clubs from public,anon,authenticated;
grant select on public.bookish_active_clubs to service_role;
revoke all on function public.bookish_sync_account(),public.bookish_set_visibility(uuid,text),public.bookish_rotate_invite(uuid),public.bookish_club_detail(text),public.bookish_join_club(text,text),public.bookish_content_action(text,uuid,text,text),public.bookish_my_content_filters(),public.bookish_my_clubs(),public.bookish_club_home(uuid) from public,anon,authenticated;
grant execute on function public.bookish_sync_account(),public.bookish_set_visibility(uuid,text),public.bookish_rotate_invite(uuid),public.bookish_club_detail(text),public.bookish_join_club(text,text),public.bookish_content_action(text,uuid,text,text),public.bookish_my_content_filters(),public.bookish_my_clubs(),public.bookish_club_home(uuid) to authenticated;
revoke all on all functions in schema bookish_private from public,anon;
-- Private helpers are callable only inside member RLS and scoped RPCs.
grant execute on all functions in schema bookish_private to authenticated;
commit;
