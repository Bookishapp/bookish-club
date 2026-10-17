-- The Tea. Raw text and author mapping are never available through table endpoints.
begin;
create table if not exists public.bookish_takes (
 id uuid primary key default gen_random_uuid(),club_id uuid not null,book_id text not null,
 parent_id uuid,body text not null check(length(trim(body)) between 1 and 2000),
 anonymous boolean not null default true,signed_name text,
 spoiler_page int not null default 0 check(spoiler_page>=0),spoiler_chapter int check(spoiler_chapter>=0),
 hidden boolean not null default false,created_at timestamptz not null default clock_timestamp(),
 unique(id,club_id,book_id),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade,
 foreign key(parent_id,club_id,book_id) references public.bookish_takes(id,club_id,book_id) on delete cascade,
 check((anonymous and signed_name is null) or (not anonymous and signed_name is not null))
);
create index if not exists bookish_tea_feed on public.bookish_takes(club_id,book_id,parent_id,created_at desc);
alter table public.bookish_takes enable row level security;
do $guard$ begin if not exists (select 1 from pg_policy where polname='tea_member' and polrelid='public.bookish_takes'::regclass) then
 create policy tea_member on public.bookish_takes for select to authenticated using(bookish_private.is_member(club_id));
 end if; end $guard$;
revoke all on public.bookish_takes from public,anon,authenticated;
create table if not exists bookish_private.take_authors (
 take_id uuid primary key references public.bookish_takes(id) on delete cascade,
 author_id uuid not null references public.bookish_profiles(id) on delete cascade
);
create index if not exists bookish_take_author on bookish_private.take_authors(author_id);
create table if not exists bookish_private.blocks (
 user_id uuid references public.bookish_profiles(id) on delete cascade,
 take_id uuid references public.bookish_takes(id) on delete cascade,
 primary key(user_id,take_id)
);
create table if not exists bookish_private.hidden_takes (
 user_id uuid references public.bookish_profiles(id) on delete cascade,
 take_id uuid references public.bookish_takes(id) on delete cascade,primary key(user_id,take_id)
);
create table if not exists bookish_private.reports (
 id uuid primary key default gen_random_uuid(),take_id uuid not null references public.bookish_takes(id) on delete cascade,
 reporter_id uuid not null references public.bookish_profiles(id) on delete cascade,
 reason text not null check(length(reason) between 1 and 500),created_at timestamptz not null default now(),
 due_at timestamptz not null default now()+interval '24 hours',
 host_status text not null default 'pending' check(host_status in ('pending','hidden','dismissed')),
 review_status text not null default 'pending' check(review_status in ('pending','hidden','dismissed','banned')),
 reviewed_at timestamptz,unique(take_id,reporter_id)
);
create index if not exists bookish_report_due on bookish_private.reports(review_status,due_at);
create table if not exists bookish_private.safety_audit (
 id uuid primary key default gen_random_uuid(),take_id uuid references public.bookish_takes(id) on delete set null,
 actor text not null,reason text not null check(length(trim(reason)) between 10 and 500),
 action text not null,at timestamptz not null default now()
);
create table if not exists bookish_private.content_rules (
 pattern text primary key,category text not null check(category in ('slur','threat','personal_sexual'))
);
-- A conservative launch ruleset. Ordinary swearing about books is welcome.
-- Trust & safety must maintain/test the ruleset; context and evasion need human review.
insert into bookish_private.content_rules values
 ('\m(nigg(er|a)s?|fagg?ots?|kikes?|chinks?|trann(y|ies))\M','slur'),
 ('\m(i|we)( will|''ll| am going to| are going to)? (kill|murder|rape|hurt) (you|him|her|them)\M','threat'),
 ('\m(kill yourself|go die|death threat)\M','threat'),
 ('\m(kill|murder|rape|hurt)\M.{0,20}\m(you|your family|yourself)\M','threat'),
 ('\m(i|we)\M.{0,25}\m(want|going|will|like)\M.{0,20}\m(fuck|bang|screw)\M','personal_sexual'),
 ('\m(doxx?|home address|phone number)\M','threat'),
 ('\m(rape|molest|sexually assault|nudes?|porn|fuck|screw|bang)\M.{0,30}\m(you|him|her|them|member|host)\M','personal_sexual'),
 ('\m(you|member|host)\M.{0,30}\m(naked|nudes?|sexy|sexual|porn)\M','personal_sexual') on conflict(pattern) do nothing;
create table if not exists bookish_private.content_holds (
 id uuid primary key default gen_random_uuid(),club_id uuid not null,book_id text not null,
 author_id uuid not null references public.bookish_profiles(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 2000),created_at timestamptz not null default now(),
 due_at timestamptz not null default now()+interval '24 hours',
 review_status text not null default 'pending' check(review_status in ('pending','dismissed')),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade
);
create table if not exists public.bookish_take_reactions (
 take_id uuid not null references public.bookish_takes(id) on delete cascade,
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 reaction text not null check(reaction in ('🔥','😭','🍵','🤯')),primary key(take_id,user_id)
);
alter table public.bookish_take_reactions enable row level security;
-- No raw reaction identities; the feed returns aggregate counts only.
revoke all on public.bookish_take_reactions from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['take_authors','blocks','hidden_takes','reports','safety_audit','content_rules','content_holds'] loop
 execute format('alter table bookish_private.%I enable row level security',t);
 execute format('revoke all on bookish_private.%I from public,anon,authenticated,service_role',t);
end loop; end $$;

create or replace function bookish_private.content_verdict(p_club uuid,p_body text) returns text language plpgsql stable security definer set search_path='' as $$
declare normalized text;
begin
 normalized:=lower(regexp_replace(translate(p_body,'013457@$','oieastAS'),'[[:cntrl:]​‌‍]','','g'));
 if exists(select 1 from bookish_private.content_rules r where normalized ~* r.pattern) then return 'blocked'; end if;
 if exists(select 1 from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
   cross join lateral (select trim(regexp_replace(lower(regexp_replace(translate(p.display_name,'013457@$','oieastAS'),'[[:cntrl:]​‌‍]','','g')),'[^[:alnum:]]+',' ','g')) full_name) name
   where m.club_id=p_club and length(name.full_name)>=3
    and exists(select 1 from regexp_split_to_table(name.full_name,' ') name_part
      where name_part not in ('reader','the','book','a','an','and','or','of','to','in','on','at','for','with'))
    and position(' '||name.full_name||' ' in ' '||regexp_replace(normalized,'[^[:alnum:]]+',' ','g')||' ')>0)
 then return 'held'; end if;
 return 'allowed';
end $$;
create or replace function bookish_private.filter_take() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_member(new.club_id); perform bookish_private.require_terms();
 if bookish_private.content_verdict(new.club_id,new.body)<>'allowed' then raise exception 'Spill about the book, never the club.'; end if;
 return new;
end $$;
do $guard$ begin if not exists (select 1 from pg_trigger where tgname='bookish_filter_take' and tgrelid='public.bookish_takes'::regclass) then
 create trigger bookish_filter_take before insert or update of body on public.bookish_takes for each row execute function bookish_private.filter_take();
 end if; end $guard$;

-- Ancestors are checked too: replies cannot reveal a hidden or blocked conversation.
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
   or exists(select 1 from bookish_private.blocks b where b.user_id=auth.uid() and b.take_id=c.id)
 )
$$;
create or replace function bookish_private.can_unseal(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select not m.spoiler_shield or coalesce(l.finished,false)
   or (coalesce(l.page,0)>=t.spoiler_page and (t.spoiler_chapter is null or coalesce(l.chapter,0)>=t.spoiler_chapter))
 from public.bookish_takes t join public.bookish_members m on m.club_id=t.club_id and m.user_id=auth.uid()
 left join lateral(select l.page,l.chapter,l.finished from public.bookish_page_log l where l.club_id=t.club_id and l.book_id=t.book_id and l.user_id=auth.uid() and l.logged_at>=(select cb.reading_started_at from public.bookish_club_books cb where cb.club_id=t.club_id and cb.book_id=t.book_id) order by l.logged_at desc,l.id desc limit 1) l on true
 where t.id=p_take),false)
$$;
create or replace function bookish_private.can_interact(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.can_view_take(p_take) and bookish_private.can_unseal(p_take)
$$;
create or replace function public.bookish_post_take(p_club uuid,p_book text,p_body text,p_signed boolean default false,p_page int default 0,p_chapter int default null,p_parent uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid; parent public.bookish_takes; depth int; total int; verdict text;
begin
 perform bookish_private.require_member(p_club); perform bookish_private.require_terms();
 -- Serialize a member's posts to make the rate bound reliable across concurrent requests.
 perform 1 from public.bookish_profiles where id=auth.uid() for update;
 if (select count(*) from bookish_private.take_authors a join public.bookish_takes t on t.id=a.take_id where a.author_id=auth.uid() and t.created_at>now()-interval '1 minute')+(select count(*) from bookish_private.content_holds where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Let this sip settle for a moment, then share another.'; end if;
 select pages into total from public.bookish_books where id=p_book;
 if p_page>coalesce(total,100000) or p_chapter>10000 then raise exception 'Let’s check that spoiler marker together.'; end if;
 if p_parent is not null then
  select * into parent from public.bookish_takes where id=p_parent;
  if parent.club_id is distinct from p_club or parent.book_id is distinct from p_book or not bookish_private.can_interact(p_parent) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
  with recursive chain as(select id,parent_id,1 d from public.bookish_takes where id=p_parent union all select t.id,t.parent_id,c.d+1 from public.bookish_takes t join chain c on t.id=c.parent_id where c.d<=10) select max(d) into depth from chain;
  if depth>=10 then raise exception 'Start a fresh take to keep the conversation flowing.'; end if;
  p_page:=greatest(p_page,parent.spoiler_page); p_chapter:=greatest(p_chapter,parent.spoiler_chapter);
 end if;
 verdict:=bookish_private.content_verdict(p_club,p_body);
 if verdict='blocked' then raise exception 'Spill about the book, never the club.'; end if;
 if verdict='held' then
  insert into bookish_private.content_holds(club_id,book_id,author_id,body) values(p_club,p_book,auth.uid(),trim(p_body)) returning id into tid;
  return jsonb_build_object('id',tid,'status','held','message','Spill about the book, never the club.');
 end if;
 insert into public.bookish_takes(club_id,book_id,body,anonymous,signed_name,spoiler_page,spoiler_chapter,parent_id)
 values(p_club,p_book,trim(p_body),not p_signed,case when p_signed then (select display_name from public.bookish_profiles where id=auth.uid()) end,p_page,p_chapter,p_parent) returning id into tid;
 insert into bookish_private.take_authors values(tid,auth.uid()); return jsonb_build_object('id',tid,'status','posted');
end $$;
create or replace function public.bookish_tea(p_club uuid,p_book text,p_parent uuid default null,p_limit int default 30,p_offset int default 0)
returns table(id uuid,parent_id uuid,body text,anonymous boolean,signed_name text,spoiler_page int,spoiler_chapter int,sealed boolean,mine boolean,reactions jsonb,my_reaction text,reply_count bigint,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 perform bookish_private.require_member(p_club);
 return query select t.id,t.parent_id,case when bookish_private.can_unseal(t.id) then t.body end,t.anonymous,t.signed_name,t.spoiler_page,t.spoiler_chapter,not bookish_private.can_unseal(t.id),
 exists(select 1 from bookish_private.take_authors a where a.take_id=t.id and a.author_id=auth.uid()),
 coalesce((select jsonb_object_agg(x.reaction,x.n) from (select r.reaction,count(*) n from public.bookish_take_reactions r where r.take_id=t.id group by r.reaction) x),'{}'::jsonb),
 (select r.reaction from public.bookish_take_reactions r where r.take_id=t.id and r.user_id=auth.uid()),
 (select count(*) from public.bookish_takes r where r.parent_id=t.id and bookish_private.can_view_take(r.id)),t.created_at
 from public.bookish_takes t
 where t.club_id=p_club and t.book_id=p_book and t.parent_id is not distinct from p_parent and bookish_private.can_view_take(t.id)
 -- Sipped: most reactions first; no content or identity in URLs/cursors.
 order by (select count(*) from public.bookish_take_reactions r where r.take_id=t.id) desc,t.created_at desc,t.id
 limit least(greatest(coalesce(p_limit,30),1),100) offset least(greatest(coalesce(p_offset,0),0),10000);
end $$;
create or replace function public.bookish_react(p_take uuid,p_reaction text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_terms();
 if not bookish_private.can_interact(p_take) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
 if p_reaction is null then delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();
 else insert into public.bookish_take_reactions values(p_take,auth.uid(),p_reaction) on conflict(take_id,user_id) do update set reaction=excluded.reaction; end if;
end $$;
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
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
  delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();
 elsif p_action='hide' then insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 elsif p_action='report' then
  insert into bookish_private.reports(take_id,reporter_id,reason) values(p_take,auth.uid(),p_reason) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 else raise exception 'Choose report, hide, block or delete.'; end if;
end $$;
create or replace function public.bookish_host_reports(p_club uuid) returns table(report_id uuid,take_id uuid,body text,reason text,due_at timestamptz,host_status text,review_status text) language plpgsql stable security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 return query select r.id,t.id,case when bookish_private.can_unseal(t.id) then t.body end,r.reason,r.due_at,r.host_status,r.review_status from bookish_private.reports r join public.bookish_takes t on t.id=r.take_id where t.club_id=p_club and r.host_status='pending' order by r.created_at limit 100;
end $$;
create or replace function public.bookish_moderate_take(p_take uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; begin select club_id into cid from public.bookish_takes where id=p_take; perform bookish_private.require_host(cid);
 if p_action='hide' then update public.bookish_takes set hidden=true where id=p_take;
 elsif p_action<>'dismiss' or p_action is null then raise exception 'Choose hide or dismiss.'; end if;
 update bookish_private.reports set host_status=case when p_action='hide' then 'hidden' else 'dismissed' end where take_id=p_take;
 -- Host actions do not close the separate safety review queue.
end $$;

-- Service-only moderation operations. No anonymous author in queue responses.
create or replace function public.bookish_review_queue() returns table(report_id uuid,take_id uuid,club_id uuid,body text,reason text,due_at timestamptz,host_status text) language sql stable security definer set search_path='' as $$
 select r.id,t.id,t.club_id,t.body,r.reason,r.due_at,r.host_status from bookish_private.reports r join public.bookish_takes t on t.id=r.take_id where r.review_status='pending' order by r.due_at limit 200
$$;
create or replace function public.bookish_safety_review(p_take uuid,p_action text,p_actor text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_action not in ('hide','dismiss','ban') or p_action is null or nullif(trim(p_actor),'') is null then raise exception 'Choose a review action and reviewer.'; end if;
 insert into bookish_private.safety_audit(take_id,actor,reason,action) values(p_take,p_actor,p_reason,p_action);
 if p_action in ('hide','ban') then update public.bookish_takes set hidden=true where id=p_take; end if;
 if p_action='ban' then update public.bookish_profiles set banned_at=now() where id=(select author_id from bookish_private.take_authors where take_id=p_take); end if;
 update bookish_private.reports set review_status=case p_action when 'hide' then 'hidden' when 'ban' then 'banned' else 'dismissed' end,reviewed_at=now() where take_id=p_take;
end $$;
create or replace function public.bookish_escalate_author(p_take uuid,p_actor text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare author uuid; begin
 if nullif(trim(p_actor),'') is null then raise exception 'Record the safety reviewer.'; end if;
 insert into bookish_private.safety_audit(take_id,actor,reason,action) values(p_take,p_actor,p_reason,'legal_or_safety_identity_access');
 select author_id into author from bookish_private.take_authors where take_id=p_take; return author;
end $$;

create or replace function public.bookish_held_queue() returns table(id uuid,club_id uuid,body text,due_at timestamptz) language sql stable security definer set search_path='' as $$
 select h.id,h.club_id,h.body,h.due_at from bookish_private.content_holds h where h.review_status='pending' order by h.due_at limit 200
$$;
create or replace function public.bookish_dismiss_hold(p_hold uuid,p_actor text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if nullif(trim(p_actor),'') is null then raise exception 'Record the safety reviewer.'; end if;
 insert into bookish_private.safety_audit(actor,reason,action) values(p_actor,p_reason,'dismiss_held_content');
 update bookish_private.content_holds set review_status='dismissed' where id=p_hold;
end $$;

-- Hard deletion removes UGC itself, rather than leaving orphaned anonymous posts.
create or replace function bookish_private.delete_profile_data() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; successor uuid;
begin
 delete from public.bookish_takes where id in (select take_id from bookish_private.take_authors where author_id=old.id);
 -- Shared meeting coordination can remain, with claims released by their FK.
 for cid in select club_id from public.bookish_members where user_id=old.id and role='host' order by club_id loop
  perform 1 from public.bookish_clubs where id=cid for update;
  select m.user_id into successor from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
    where m.club_id=cid and m.user_id<>old.id and p.banned_at is null order by (m.role='cohost') desc,m.joined_at,m.user_id limit 1;
  if successor is null then delete from public.bookish_clubs where id=cid;
  else update public.bookish_members set role='host' where club_id=cid and user_id=successor; end if;
 end loop;
 return old;
end $$;
do $guard$ begin if not exists (select 1 from pg_trigger where tgname='bookish_delete_profile_data' and tgrelid='public.bookish_profiles'::regclass) then
 create trigger bookish_delete_profile_data before delete on public.bookish_profiles for each row execute function bookish_private.delete_profile_data();
 end if; end $guard$;
create or replace function bookish_private.delete_legacy_data() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.raw_app_meta_data->>'app' is distinct from 'bookish' or old.email_confirmed_at is null then return old; end if;
 delete from public.bookish_join_requests where lower(email)=lower(old.email) or lower(email) in (select lower(i.identity_data->>'email') from auth.identities i where i.user_id=old.id and i.identity_data->>'email_verified'='true');
 delete from public.bookish_submissions where lower(email)=lower(old.email) or lower(email) in (select lower(i.identity_data->>'email') from auth.identities i where i.user_id=old.id and i.identity_data->>'email_verified'='true');
 return old;
-- Marked Bookish deletions are atomic: failed cleanup preserves Auth for retry.
-- Unmarked Fictora identities returned above and never enter this cleanup.
end $$;
do $guard$ begin if not exists (select 1 from pg_trigger where tgname='bookish_delete_legacy_data' and tgrelid='auth.users'::regclass) then
 create trigger bookish_delete_legacy_data before delete on auth.users for each row execute function bookish_private.delete_legacy_data();
 end if; end $guard$;

revoke all on all functions in schema bookish_private from public,anon,authenticated,service_role;
grant execute on function bookish_private.active_user(),bookish_private.is_member(uuid),bookish_private.is_host(uuid) to authenticated;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('bookish_post_take','bookish_tea','bookish_react','bookish_take_action','bookish_host_reports','bookish_moderate_take')
 loop execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to authenticated',f); end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('bookish_review_queue','bookish_safety_review','bookish_escalate_author','bookish_held_queue','bookish_dismiss_hold')
 loop execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f); end loop;
end $$;
commit;
