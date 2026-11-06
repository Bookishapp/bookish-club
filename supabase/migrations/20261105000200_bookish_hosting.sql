begin;
set local lock_timeout='5s';
-- Existing preferences are compatibility names only. Sharing requires opt-in.
alter table public.bookish_members alter column race_visible set default false;
do $guard$ begin
 if not exists(select 1 from pg_attribute where attrelid='public.bookish_members'::regclass and attname='meeting_reminders' and not attisdropped) then
  update public.bookish_members set race_visible=false;
 end if;
end $guard$;
alter table public.bookish_members add column if not exists meeting_reminders boolean not null default true;
alter table public.bookish_page_log add column if not exists did_not_finish boolean not null default false;
-- Compute cover URLs at the RPC boundary without rewriting book storage.
create or replace function bookish_private.cover_url(p_cover bigint) returns text language sql immutable set search_path='' as $$
 select case when p_cover is not null then 'https://covers.openlibrary.org/b/id/'||p_cover::text||'-L.jpg' end
$$;
create or replace function public.bookish_share_reading(p_club uuid,p_share boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 if p_share is null then raise exception 'Choose whether to share.';end if;
 update public.bookish_members set race_visible=p_share where club_id=p_club and user_id=auth.uid();end $$;
create or replace function public.bookish_log_reading(p_club uuid,p_book text,p_page int,p_finished boolean default false,p_dnf boolean default false,p_request uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;existing public.bookish_page_log;begin
 perform bookish_private.require_member(p_club);
 perform 1 from public.bookish_profiles where id=auth.uid() for update;
 select * into existing from public.bookish_page_log where user_id=auth.uid() and request_id=p_request;
 if found then
  if existing.club_id is distinct from p_club or existing.book_id is distinct from p_book or existing.finished is distinct from p_finished or existing.did_not_finish is distinct from p_dnf or (not p_finished and existing.page is distinct from p_page) then raise exception 'Use the same reading values for a request retry.';end if;
  return existing.id;
 end if;
 if p_finished is null or p_dnf is null or (p_finished and p_dnf) then raise exception 'Choose a reading status.';end if;
 rid:=public.bookish_log_page(p_club,p_book,p_page,null,p_finished,p_request);
 update public.bookish_page_log set did_not_finish=p_dnf where id=rid and user_id=auth.uid() and club_id=p_club and book_id=p_book;
 return rid;end $$;
create or replace function public.bookish_reading_together(p_club uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform bookish_private.require_member(p_club);
 select jsonb_build_object('book',to_jsonb(b)||jsonb_build_object('cover_url',bookish_private.cover_url(b.cover_id)),'my_page',coalesce(own.page,0),'my_finished',coalesce(own.finished,false),'my_did_not_finish',coalesce(own.did_not_finish,false),
 'sharing',(select race_visible from public.bookish_members where club_id=p_club and user_id=auth.uid()),
 'meeting_mark',(select stop_page from public.bookish_meetings where club_id=p_club and status='scheduled' and starts_at>now() and bookish_private.content_visible('meeting',id) order by starts_at,id limit 1),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'page',coalesce(l.page,0),'finished',coalesce(l.finished,false))),'[]'::jsonb)
 from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
 left join lateral(select l.page,l.finished from public.bookish_page_log l where l.club_id=p_club and l.book_id=cb.book_id and l.user_id=m.user_id and l.logged_at>=cb.reading_started_at order by l.logged_at desc,l.id desc limit 1) l on true
 where m.club_id=p_club and m.race_visible and p.banned_at is null and bookish_private.content_visible('member',m.user_id))) into result
 from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id
 left join lateral(select l.page,l.finished,l.did_not_finish from public.bookish_page_log l where l.club_id=p_club and l.book_id=cb.book_id and l.user_id=auth.uid() and l.logged_at>=cb.reading_started_at order by l.logged_at desc,l.id desc limit 1) own on true
 where cb.club_id=p_club and cb.status='reading';
 return coalesce(result,jsonb_build_object('book',null,'members','[]'::jsonb));end $$;
create or replace function public.bookish_race(p_club uuid) returns table(user_id uuid,display_name text,page int,finished boolean) language sql stable security definer set search_path='' as $$
 select x.* from jsonb_to_recordset(public.bookish_reading_together(p_club)->'members') x(user_id uuid,display_name text,page int,finished boolean)
$$;

create or replace function public.bookish_rsvp(p_meeting uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
declare m public.bookish_meetings;response text;begin
 select * into m from public.bookish_meetings where id=p_meeting for update;perform bookish_private.require_member(m.club_id);
 if m.status<>'scheduled' or m.starts_at<=clock_timestamp() then raise exception 'This meeting is cancelled or past.';end if;
 response:=case p_response when 'yes' then 'going' when 'maybe' then 'maybe' when 'cant' then 'next_time' end;
 if response is null then raise exception 'Choose Yes, Maybe, or Can''t as your response.';end if;
 insert into public.bookish_rsvps values(m.id,m.club_id,auth.uid(),response) on conflict(meeting_id,user_id) do update set response=excluded.response;
end $$;
-- Require the checked RPC, so direct writes cannot bypass meeting status checks.
revoke insert,update,delete on public.bookish_rsvps from authenticated;
-- Raw claimant IDs would bypass the member-visibility projection in both RPCs.
revoke select on public.bookish_bring_items from public,anon,authenticated;
create or replace function public.bookish_meeting_detail(p_meeting uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.bookish_meetings;begin
 select * into m from public.bookish_meetings where id=p_meeting;perform bookish_private.require_member(m.club_id);
 if not bookish_private.content_visible('meeting',m.id) then raise exception 'This meeting is unavailable.';end if;
 return to_jsonb(m)||jsonb_build_object('counts',(select jsonb_build_object('yes',count(*) filter(where r.response='going'),'maybe',count(*) filter(where r.response='maybe'),'cant',count(*) filter(where r.response='next_time')) from public.bookish_rsvps r join public.bookish_members cm on cm.club_id=r.club_id and cm.user_id=r.user_id join public.bookish_profiles p on p.id=cm.user_id and p.banned_at is null where r.meeting_id=m.id),
 'my_rsvp',(select case response when 'going' then 'yes' when 'maybe' then 'maybe' when 'next_time' then 'cant' end from public.bookish_rsvps where meeting_id=m.id and user_id=auth.uid()),
 'bring_items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'label',i.label,'claimed',i.claimed_by is not null,'claimed_by',case when bookish_private.content_visible('member',i.claimed_by) then i.claimed_by end,'display_name',case when bookish_private.content_visible('member',i.claimed_by) then p.display_name end)),'[]'::jsonb) from public.bookish_bring_items i left join public.bookish_profiles p on p.id=i.claimed_by where i.meeting_id=m.id));
end $$;
create or replace function public.bookish_claim_bring_item(p_item uuid,p_claim boolean) returns void language plpgsql security definer set search_path='' as $$
declare item public.bookish_bring_items;m public.bookish_meetings;begin
 select mt.* into m from public.bookish_meetings mt join public.bookish_bring_items i on i.meeting_id=mt.id where i.id=p_item for update of mt;
 perform bookish_private.require_member(m.club_id);
 if m.status<>'scheduled' or m.starts_at<=clock_timestamp() then raise exception 'This meeting is cancelled or past.';end if;
 select * into item from public.bookish_bring_items where id=p_item for update;
 if item.claimed_by is not null and item.claimed_by<>auth.uid() then raise exception 'Already claimed. Pick another treat.';end if;
 if p_claim is null then raise exception 'Choose whether to claim.';end if;
 update public.bookish_bring_items set claimed_by=case when p_claim then auth.uid() else null end where id=p_item;
end $$;
create or replace function public.bookish_meeting_calendar(p_meeting uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.bookish_meetings;begin
 select * into m from public.bookish_meetings where id=p_meeting;perform bookish_private.require_member(m.club_id);
 if m.status<>'scheduled' or m.starts_at<=clock_timestamp() or not bookish_private.content_visible('meeting',m.id) then raise exception 'This meeting is cancelled, past, or unavailable.';end if;
 return jsonb_build_object('id',m.id,'title',m.title,'starts_at',m.starts_at,'location',m.location);
end $$;

create table if not exists public.bookish_notifications (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.bookish_clubs(id) on delete cascade,
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 kind text not null check(kind in ('new_take','vote_opened','meeting_reminder','join_request')),
 target_id uuid not null,created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 unique(user_id,kind,target_id)
);
alter table public.bookish_notifications enable row level security;
revoke all on public.bookish_notifications from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.bookish_notifications to service_role;
create index if not exists bookish_notification_inbox on public.bookish_notifications(user_id,created_at desc,id);
create or replace function bookish_private.notification_visible(p_club uuid,p_kind text,p_target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.is_member(p_club) and bookish_private.content_visible('club',p_club) and case p_kind
 when 'new_take' then bookish_private.can_interact(p_target)
 when 'vote_opened' then exists(select 1 from public.bookish_votes where id=p_target and club_id=p_club and bookish_private.content_visible('vote',id))
 when 'meeting_reminder' then exists(select 1 from public.bookish_meetings where id=p_target and club_id=p_club and status='scheduled' and starts_at>now() and bookish_private.content_visible('meeting',id))
 when 'join_request' then bookish_private.is_host(p_club) and exists(select 1 from public.bookish_join_requests where id=p_target and club_id=p_club and status='pending' and bookish_private.content_visible('request',id) and bookish_private.content_visible('member',user_id))
 else false end
$$;
-- This public predicate accepts only a notification row ID and checks ownership
-- before invoking private target checks. Its definer read avoids policy recursion.
create or replace function public.bookish_notification_visible(p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare n public.bookish_notifications;begin
 select * into n from public.bookish_notifications where id=p_id and user_id=auth.uid();
 if not found then return false;end if;
 return bookish_private.notification_visible(n.club_id,n.kind,n.target_id);
end $$;
do $guard$ begin
 if not exists(select 1 from pg_policy where polrelid='public.bookish_notifications'::regclass and polname='own_inbox') then
  create policy own_inbox on public.bookish_notifications for select to authenticated using(user_id=auth.uid() and public.bookish_notification_visible(id));
 end if;
end $guard$;
grant select on public.bookish_notifications to authenticated;
create or replace function public.bookish_notifications(p_limit int default 50,p_offset int default 0) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb) from (
 select n.id,n.club_id,n.kind,n.target_id,n.created_at,n.read_at from public.bookish_notifications n where n.user_id=auth.uid() and bookish_private.notification_visible(n.club_id,n.kind,n.target_id)
 order by n.created_at desc,n.id limit least(greatest(coalesce(p_limit,50),1),100) offset least(greatest(coalesce(p_offset,0),0),10000)) x
$$;
create or replace function public.bookish_mark_notifications_read(p_id uuid default null) returns void language sql security definer set search_path='' as $$
 update public.bookish_notifications n set read_at=coalesce(n.read_at,clock_timestamp()) where n.user_id=auth.uid() and (p_id is null or n.id=p_id) and bookish_private.notification_visible(n.club_id,n.kind,n.target_id)
$$;
create or replace function bookish_private.notify_take() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.bookish_notifications(club_id,user_id,kind,target_id)
 select t.club_id,m.user_id,'new_take',t.id from public.bookish_takes t
 join public.bookish_club_books cb on cb.club_id=t.club_id and cb.book_id=t.book_id
 join public.bookish_members m on m.club_id=t.club_id
 join public.bookish_profiles p on p.id=m.user_id and p.banned_at is null
 left join lateral(select l.page,l.finished from public.bookish_page_log l where l.club_id=t.club_id and l.book_id=t.book_id and l.user_id=m.user_id and l.logged_at>=cb.reading_started_at order by l.logged_at desc,l.id desc limit 1) l on true
 where t.id=new.take_id and m.user_id<>new.author_id and not t.hidden
 and (coalesce(l.finished,false) or (not t.did_not_finish and coalesce(l.page,0)>=t.spoiler_page))
 and not exists(select 1 from bookish_private.actor_blocks b where b.user_id=m.user_id and b.author_id=new.author_id)
 on conflict do nothing;return new;
end $$;
create or replace trigger bookish_notify_take after insert on bookish_private.take_authors for each row execute function bookish_private.notify_take();
create or replace function bookish_private.notify_club_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='bookish_votes' then
  if new.status='open' then insert into public.bookish_notifications(club_id,user_id,kind,target_id) select new.club_id,m.user_id,'vote_opened',new.id from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id and p.banned_at is null where m.club_id=new.club_id on conflict do nothing;end if;
 else
  if new.status='pending' and (tg_op='INSERT' or old.status is distinct from 'pending') then
   insert into public.bookish_notifications(club_id,user_id,kind,target_id) select new.club_id,m.user_id,'join_request',new.id from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id and p.banned_at is null where m.club_id=new.club_id and m.role in ('host','cohost') on conflict do nothing;
  end if;
 end if;return new;
end $$;
create or replace trigger bookish_notify_vote after insert on public.bookish_votes for each row execute function bookish_private.notify_club_event();
create or replace trigger bookish_notify_request after insert or update of status on public.bookish_join_requests for each row execute function bookish_private.notify_club_event();

create or replace function public.bookish_club_home(p_club uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);
 if not bookish_private.content_visible('club',p_club) then raise exception 'This club is hidden.';end if;
 select jsonb_build_object('club',jsonb_build_object('id',c.id,'club_ref',c.club_ref,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility),
 'role',(select role from public.bookish_members where club_id=c.id and user_id=auth.uid()),
 'current_book',(select to_jsonb(b)||jsonb_build_object('cover_url',bookish_private.cover_url(b.cover_id)) from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id where cb.club_id=c.id and cb.status='reading' limit 1),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'display_name',p.display_name,'joined_at',m.joined_at) order by m.joined_at),'[]'::jsonb) from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id where m.club_id=c.id and p.banned_at is null and bookish_private.content_visible('member',m.user_id)),
 'meetings',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('bring_items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'meeting_id',i.meeting_id,'club_id',i.club_id,'label',i.label,'claimed',i.claimed_by is not null,'claimed_by',case when bookish_private.content_visible('member',i.claimed_by) then i.claimed_by end)),'[]'::jsonb) from public.bookish_bring_items i where i.meeting_id=m.id),'rsvps',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.bookish_rsvps r where r.meeting_id=m.id)) order by m.starts_at),'[]'::jsonb) from public.bookish_meetings m where m.club_id=c.id and bookish_private.content_visible('meeting',m.id)),
 'votes',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('options',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from public.bookish_vote_options o where o.vote_id=v.id),'tally',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.bookish_vote_tally(v.id) t)) order by v.closes_at desc),'[]'::jsonb) from public.bookish_votes v where v.club_id=c.id and bookish_private.content_visible('vote',v.id))) into result from public.bookish_clubs c where c.id=p_club;
 return result;
end $$;

-- iMessage receives only an allowlisted card envelope. It is never an access token.
create or replace function public.bookish_message_card(p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.bookish_takes;v public.bookish_votes;m jsonb;begin
 if p_kind='take' then
  select * into t from public.bookish_takes where id=p_id;
  if not bookish_private.can_view_take(p_id) then raise exception 'This conversation is unavailable.';end if;
  return jsonb_build_object('kind','take','id',t.id,'page',case when t.did_not_finish then null else t.spoiler_page end,'did_not_finish',t.did_not_finish,'sealed',true,'label','Anonymous','book',(select jsonb_build_object('id',b.id,'title',b.title,'cover_id',b.cover_id,'cover_url',bookish_private.cover_url(b.cover_id)) from public.bookish_books b where b.id=t.book_id));
 elsif p_kind='vote' then
  select * into v from public.bookish_votes where id=p_id;perform bookish_private.require_member(v.club_id);
  if not bookish_private.content_visible('vote',v.id) then raise exception 'This vote is unavailable.';end if;
  return jsonb_build_object('kind','vote','id',v.id,'status',v.status,'closes_at',v.closes_at,'options',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.bookish_vote_tally(v.id) x));
 elsif p_kind='meeting' then
  m:=public.bookish_meeting_detail(p_id);
  return jsonb_build_object('kind','meeting','id',m->'id','title',m->'title','starts_at',m->'starts_at','status',m->'status','counts',m->'counts','open_items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'label',i.label)),'[]'::jsonb) from public.bookish_bring_items i where i.meeting_id=p_id and i.claimed_by is null));
 end if;raise exception 'Choose a card kind.';end $$;

revoke all on function public.bookish_share_reading(uuid,boolean),public.bookish_log_reading(uuid,text,int,boolean,boolean,uuid),public.bookish_reading_together(uuid),public.bookish_rsvp(uuid,text),public.bookish_meeting_detail(uuid),public.bookish_meeting_calendar(uuid),public.bookish_notifications(int,int),public.bookish_mark_notifications_read(uuid),public.bookish_message_card(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.bookish_share_reading(uuid,boolean),public.bookish_log_reading(uuid,text,int,boolean,boolean,uuid),public.bookish_reading_together(uuid),public.bookish_rsvp(uuid,text),public.bookish_meeting_detail(uuid),public.bookish_meeting_calendar(uuid),public.bookish_notifications(int,int),public.bookish_mark_notifications_read(uuid),public.bookish_message_card(text,uuid) to authenticated;
revoke all on function bookish_private.notification_visible(uuid,text,uuid),bookish_private.notify_take(),bookish_private.notify_club_event() from public,anon,authenticated,service_role;
revoke all on function public.bookish_notification_visible(uuid) from public,anon,authenticated,service_role;
grant execute on function public.bookish_notification_visible(uuid) to authenticated;
revoke all on function bookish_private.cover_url(bigint) from public,anon,authenticated,service_role;
commit;
