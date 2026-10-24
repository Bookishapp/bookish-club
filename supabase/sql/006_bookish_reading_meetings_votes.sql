-- Bookish v1.1 reading and coordination. Depends on 005; preserves PR #12 aggregates.
begin;
alter table public.bookish_club_books add column if not exists reading_started_at timestamptz not null default now();
create unique index if not exists bookish_one_current_book on public.bookish_club_books(club_id) where status='reading';
do $guard$ begin if not exists (select 1 from pg_policy where polname='club_books_read' and polrelid='public.bookish_club_books'::regclass) then
 create policy club_books_read on public.bookish_club_books for select to authenticated using(bookish_private.is_member(club_id));
 end if; end $guard$;
grant select on public.bookish_club_books to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='pours_read' and polrelid='public.bookish_pours'::regclass) then
 create policy pours_read on public.bookish_pours for select to authenticated using(user_id=auth.uid() and bookish_private.active_user() and (club_id is null or bookish_private.is_member(club_id)));
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_policy where polname='pours_write' and polrelid='public.bookish_pours'::regclass) then
 create policy pours_write on public.bookish_pours for all to authenticated using(user_id=auth.uid() and bookish_private.active_user() and (club_id is null or bookish_private.is_member(club_id))) with check(user_id=auth.uid() and bookish_private.active_user() and (club_id is null or bookish_private.is_member(club_id)));
 end if; end $guard$;
grant select,insert,update,delete on public.bookish_pours to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='taste_self' and polrelid='public.bookish_taste'::regclass) then
 create policy taste_self on public.bookish_taste for all to authenticated using(user_id=auth.uid() and bookish_private.active_user()) with check(user_id=auth.uid() and bookish_private.active_user());
 end if; end $guard$;
grant select,insert,update,delete on public.bookish_taste to authenticated;
-- Suggest events stay service-only: never a raw cross-club analytics endpoint.

create table if not exists public.bookish_page_log (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 club_id uuid not null,
 book_id text not null,
 page int not null check(page>=0),
 chapter int check(chapter>=0),
 finished boolean not null default false,
 request_id uuid not null,
 logged_at timestamptz not null default clock_timestamp(),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade,
 unique(user_id,request_id)
);
grant select,insert,update,delete on table public.bookish_page_log to service_role;
alter table public.bookish_page_log enable row level security;
revoke all on table public.bookish_page_log from public,anon,authenticated;
create index if not exists bookish_latest_page on public.bookish_page_log(club_id,book_id,user_id,logged_at desc,id desc);
do $guard$ begin if not exists (select 1 from pg_policy where polname='page_log_self' and polrelid='public.bookish_page_log'::regclass) then
 create policy page_log_self on public.bookish_page_log for select to authenticated using(user_id=auth.uid() and bookish_private.is_member(club_id));
 end if; end $guard$;
grant select on public.bookish_page_log to authenticated;
create or replace function public.bookish_set_current_book(p_club uuid,p_book text) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 perform 1 from public.bookish_clubs where id=p_club for update;
 if exists(select 1 from public.bookish_club_books where club_id=p_club and status='reading' and book_id<>p_book) then raise exception 'Finish your current chapter together before starting another book.'; end if;
 if exists(select 1 from public.bookish_club_books where club_id=p_club and book_id=p_book and status='reading') then return; end if;
 insert into public.bookish_club_books(club_id,book_id,status,started_at,source) values(p_club,p_book,'reading',current_date,'host')
 on conflict(club_id,book_id) do update set status='reading',started_at=current_date,finished_at=null,reading_started_at=clock_timestamp();
end $$;
create or replace function public.bookish_finish_book(p_club uuid,p_book text,p_status text default 'finished') returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 if p_status not in ('finished','dropped') or p_status is null then raise exception 'Choose a shelf for this book.'; end if;
 update public.bookish_club_books set status=p_status,finished_at=current_date where club_id=p_club and book_id=p_book and status='reading'; end $$;
create or replace function public.bookish_log_page(p_club uuid,p_book text,p_page int,p_chapter int default null,p_finished boolean default false,p_request uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; total int;
begin
 perform bookish_private.require_member(p_club);
 select id into rid from public.bookish_page_log where user_id=auth.uid() and request_id=p_request;
 if rid is not null then return rid; end if;
 if not exists(select 1 from public.bookish_club_books where club_id=p_club and book_id=p_book and status='reading') then raise exception 'Choose your club’s current book.'; end if;
 select pages into total from public.bookish_books where id=p_book;
 if p_page<0 or p_page is null or p_page>coalesce(total,100000) or p_chapter<0 or p_chapter>10000 then raise exception 'Let’s check that page together.'; end if;
 insert into public.bookish_page_log(user_id,club_id,book_id,page,chapter,finished,request_id)
 values(auth.uid(),p_club,p_book,case when p_finished and total is not null then total else p_page end,p_chapter,p_finished,p_request)
 on conflict(user_id,request_id) do update set request_id=excluded.request_id returning id into rid;
 return rid;
end $$;
create or replace function public.bookish_race(p_club uuid) returns table(user_id uuid,display_name text,page int,finished boolean,"position" bigint,streak bigint,title text) language plpgsql stable security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 return query
 with current_read as(select b.book_id,b.reading_started_at from public.bookish_club_books b where b.club_id=p_club and b.status='reading'),
 latest as (
  select m.user_id,p.display_name,coalesce(l.page,0) page,coalesce(l.finished,false) finished,l.logged_at
  from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
  left join lateral(select l.* from public.bookish_page_log l join current_read c on c.book_id=l.book_id and l.logged_at>=c.reading_started_at where l.club_id=p_club and l.user_id=m.user_id order by l.logged_at desc,l.id desc limit 1) l on true
  where m.club_id=p_club and m.race_visible and p.banned_at is null
 ), days as (
  select distinct l.user_id,(l.logged_at at time zone 'UTC')::date log_day from public.bookish_page_log l join current_read c on c.book_id=l.book_id and l.logged_at>=c.reading_started_at where l.club_id=p_club
 ), numbered as (
  select d.*,d.log_day+row_number() over(partition by d.user_id order by d.log_day desc)::int grp from days d
 ), streaks as (
  select n.user_id,count(*) n from numbered n where n.grp in (select n2.grp from numbered n2 where n2.user_id=n.user_id and n2.log_day>=(now() at time zone 'UTC')::date-1) group by n.user_id
 )
 select l.user_id,l.display_name,l.page,l.finished,rank() over(order by l.finished desc,l.page desc),coalesce(s.n,0),
 case when l.finished then 'Lovely finish' when l.page>0 then 'Page turner' else 'A fresh chapter' end
 from latest l left join streaks s on s.user_id=l.user_id order by 5,l.user_id;
end $$;

create table if not exists public.bookish_meetings (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.bookish_clubs(id) on delete cascade,
 starts_at timestamptz not null, title text not null check(length(trim(title)) between 1 and 140),
 location text not null check(length(location)<=500), stop_page int check(stop_page>=0),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
 unique(id,club_id)
);
grant select,insert,update,delete on table public.bookish_meetings to service_role;
alter table public.bookish_meetings enable row level security;
revoke all on table public.bookish_meetings from public,anon,authenticated;
create table if not exists public.bookish_rsvps (
 meeting_id uuid not null,club_id uuid not null,user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 response text not null check(response in ('going','maybe','next_time')),primary key(meeting_id,user_id),
 foreign key(meeting_id,club_id) references public.bookish_meetings(id,club_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_rsvps to service_role;
alter table public.bookish_rsvps enable row level security;
revoke all on table public.bookish_rsvps from public,anon,authenticated;
create table if not exists public.bookish_bring_items (
 id uuid primary key default gen_random_uuid(),meeting_id uuid not null,club_id uuid not null,
 label text not null check(length(trim(label)) between 1 and 120),claimed_by uuid references public.bookish_profiles(id) on delete set null,
 foreign key(meeting_id,club_id) references public.bookish_meetings(id,club_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_bring_items to service_role;
alter table public.bookish_bring_items enable row level security;
revoke all on table public.bookish_bring_items from public,anon,authenticated;
drop policy if exists club_read on public.bookish_meetings;
create policy club_read on public.bookish_meetings for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_meetings to authenticated;
drop policy if exists club_read on public.bookish_rsvps;
create policy club_read on public.bookish_rsvps for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_rsvps to authenticated;
drop policy if exists club_read on public.bookish_bring_items;
create policy club_read on public.bookish_bring_items for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_bring_items to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='rsvp_write' and polrelid='public.bookish_rsvps'::regclass) then
 create policy rsvp_write on public.bookish_rsvps for all to authenticated using(user_id=auth.uid() and bookish_private.is_member(club_id)) with check(user_id=auth.uid() and bookish_private.is_member(club_id));
 end if; end $guard$;
grant insert,update,delete on public.bookish_rsvps to authenticated;
create or replace function public.bookish_schedule_meeting(p_club uuid,p_starts timestamptz,p_title text,p_location text,p_stop int default null) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; begin perform bookish_private.require_host(p_club);
 insert into public.bookish_meetings(club_id,starts_at,title,location,stop_page) values(p_club,p_starts,p_title,p_location,p_stop) returning id into mid; return mid; end $$;
create or replace function public.bookish_edit_meeting(p_meeting uuid,p_starts timestamptz,p_title text,p_location text,p_stop int,p_cancel boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; begin select club_id into cid from public.bookish_meetings where id=p_meeting; perform bookish_private.require_host(cid);
 update public.bookish_meetings set starts_at=p_starts,title=p_title,location=p_location,stop_page=p_stop,status=case when p_cancel then 'cancelled' else 'scheduled' end where id=p_meeting; end $$;
create or replace function public.bookish_add_bring_item(p_meeting uuid,p_label text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; iid uuid; begin select club_id into cid from public.bookish_meetings where id=p_meeting; perform bookish_private.require_host(cid);
 insert into public.bookish_bring_items(meeting_id,club_id,label) values(p_meeting,cid,p_label) returning id into iid; return iid; end $$;
create or replace function public.bookish_claim_bring_item(p_item uuid,p_claim boolean) returns void language plpgsql security definer set search_path='' as $$
declare item public.bookish_bring_items; begin select * into item from public.bookish_bring_items where id=p_item for update;
 perform bookish_private.require_member(item.club_id);
 if item.claimed_by is not null and item.claimed_by<>auth.uid() then raise exception 'Already claimed, with love. Pick another treat.'; end if;
 update public.bookish_bring_items set claimed_by=case when p_claim then auth.uid() else null end where id=p_item; end $$;

create table if not exists public.bookish_votes (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.bookish_clubs(id) on delete cascade,
 opened_by uuid references public.bookish_profiles(id) on delete set null,closes_at timestamptz not null,
 status text not null default 'open' check(status in ('open','closed')),post_to_chat boolean not null default false,
 winner_option uuid,imsg_token text unique not null default gen_random_uuid()::text,unique(id,club_id)
);
grant select,insert,update,delete on table public.bookish_votes to service_role;
alter table public.bookish_votes enable row level security;
revoke all on table public.bookish_votes from public,anon,authenticated;
create unique index if not exists bookish_one_open_vote on public.bookish_votes(club_id) where status='open';
create table if not exists public.bookish_vote_options (
 id uuid primary key default gen_random_uuid(),vote_id uuid not null,club_id uuid not null,book_id text not null references public.bookish_books(id),
 origin text not null default 'nominated' check(origin in ('suggested','nominated')),why_key text,why_text text,
 unique(id,vote_id),unique(vote_id,book_id),foreign key(vote_id,club_id) references public.bookish_votes(id,club_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_vote_options to service_role;
alter table public.bookish_vote_options enable row level security;
revoke all on table public.bookish_vote_options from public,anon,authenticated;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_winner_same_vote' and conrelid='public.bookish_votes'::regclass) then
 alter table public.bookish_votes add constraint bookish_winner_same_vote foreign key(winner_option,id) references public.bookish_vote_options(id,vote_id) deferrable initially deferred;
 end if; end $guard$;
create table if not exists public.bookish_vote_ballots (
 vote_id uuid not null,club_id uuid not null,user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 option_id uuid not null,via text not null check(via in ('app','imessage','web')),cast_at timestamptz not null default now(),primary key(vote_id,user_id),
 foreign key(vote_id,club_id) references public.bookish_votes(id,club_id) on delete cascade,
 foreign key(option_id,vote_id) references public.bookish_vote_options(id,vote_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_vote_ballots to service_role;
alter table public.bookish_vote_ballots enable row level security;
revoke all on table public.bookish_vote_ballots from public,anon,authenticated;
create table if not exists public.bookish_nominations (
 club_id uuid not null references public.bookish_clubs(id) on delete cascade,book_id text not null references public.bookish_books(id),
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(club_id,book_id,user_id)
);
grant select,insert,update,delete on table public.bookish_nominations to service_role;
alter table public.bookish_nominations enable row level security;
revoke all on table public.bookish_nominations from public,anon,authenticated;
drop policy if exists club_read on public.bookish_votes;
create policy club_read on public.bookish_votes for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_votes to authenticated;
drop policy if exists club_read on public.bookish_vote_options;
create policy club_read on public.bookish_vote_options for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_vote_options to authenticated;
drop policy if exists club_read on public.bookish_nominations;
create policy club_read on public.bookish_nominations for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_nominations to authenticated;
-- A ballot is private even to other club members. Expose only grouped counts.
drop policy if exists club_read on public.bookish_vote_ballots;
create or replace function public.bookish_vote_tally(p_vote uuid)
returns table(option_id uuid,book_id text,ballots bigint)
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;
begin
 select v.club_id into cid from public.bookish_votes v where v.id=p_vote;
 perform bookish_private.require_member(cid);
 return query select o.id,o.book_id,count(b.user_id)
 from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id
 where o.vote_id=p_vote group by o.id,o.book_id order by o.id;
end $$;
revoke all on function public.bookish_vote_tally(uuid) from public,anon,authenticated;
grant execute on function public.bookish_vote_tally(uuid) to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='nominations_write' and polrelid='public.bookish_nominations'::regclass) then
 create policy nominations_write on public.bookish_nominations for all to authenticated using(user_id=auth.uid() and bookish_private.is_member(club_id)) with check(user_id=auth.uid() and bookish_private.is_member(club_id));
 end if; end $guard$;
grant insert,delete on public.bookish_nominations to authenticated;
create or replace function public.bookish_open_vote(p_club uuid,p_closes timestamptz,p_books text[],p_chat boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare vid uuid; begin perform bookish_private.require_host(p_club);
 if p_closes is null or p_closes<=now() or cardinality(p_books) not between 2 and 4 or p_books is null then raise exception 'Pick two to four books and a future closing time.'; end if;
 insert into public.bookish_votes(club_id,opened_by,closes_at,post_to_chat) values(p_club,auth.uid(),p_closes,p_chat) returning id into vid;
 insert into public.bookish_vote_options(vote_id,club_id,book_id) select vid,p_club,unnest(p_books);
 return vid; end $$;
create or replace function public.bookish_cast_ballot(p_vote uuid,p_option uuid,p_via text default 'app') returns void language plpgsql security definer set search_path='' as $$
declare v public.bookish_votes; begin select * into v from public.bookish_votes where id=p_vote for update;
 perform bookish_private.require_member(v.club_id);
 if v.status<>'open' or v.closes_at<=now() then raise exception 'This vote has its next chapter ready.'; end if;
 insert into public.bookish_vote_ballots(vote_id,club_id,user_id,option_id,via) values(v.id,v.club_id,auth.uid(),p_option,p_via)
 on conflict(vote_id,user_id) do update set option_id=excluded.option_id,via=excluded.via,cast_at=now(); end $$;
create or replace function public.bookish_close_vote(p_vote uuid,p_winner uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.bookish_votes; winner uuid; top_count bigint; n int; next_book text; begin
 select * into v from public.bookish_votes where id=p_vote for update; perform bookish_private.require_host(v.club_id);
 if v.status='closed' then return v.winner_option; end if;
 select max(tally) into top_count from (select count(b.user_id) tally from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id where o.vote_id=v.id group by o.id) x;
 select count(*) into n from (select o.id from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id where o.vote_id=v.id group by o.id having count(b.user_id)=top_count) x;
 if p_winner is null and n<>1 then raise exception 'A lovely tie. Host, pick the next chapter.'; end if;
 select o.id,o.book_id into winner,next_book from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id
 where o.vote_id=v.id and (p_winner is null or o.id=p_winner) group by o.id having count(b.user_id)=top_count limit 1;
 if winner is null then raise exception 'Pick one of the leading books.'; end if;
 perform 1 from public.bookish_clubs where id=v.club_id for update;
 update public.bookish_club_books set status='finished',finished_at=current_date where club_id=v.club_id and status='reading';
 insert into public.bookish_club_books(club_id,book_id,status,started_at,source) values(v.club_id,next_book,'reading',current_date,'vote')
 on conflict(club_id,book_id) do update set status='reading',started_at=current_date,finished_at=null,source='vote',reading_started_at=clock_timestamp();
 update public.bookish_votes set status='closed',winner_option=winner where id=v.id;
 return winner;
end $$;
-- Deliberately no public token ballot: every voter must authenticate and be a member.

revoke all on function public.bookish_set_current_book(uuid, text),public.bookish_finish_book(uuid, text, text),public.bookish_log_page(uuid, text, integer, integer, boolean, uuid),public.bookish_race(uuid),public.bookish_schedule_meeting(uuid, timestamp with time zone, text, text, integer),public.bookish_edit_meeting(uuid, timestamp with time zone, text, text, integer, boolean),public.bookish_add_bring_item(uuid, text),public.bookish_claim_bring_item(uuid, boolean),public.bookish_open_vote(uuid, timestamp with time zone, text[], boolean),public.bookish_cast_ballot(uuid, uuid, text),public.bookish_close_vote(uuid, uuid) from public,anon,authenticated;
grant execute on function public.bookish_set_current_book(uuid, text),public.bookish_finish_book(uuid, text, text),public.bookish_log_page(uuid, text, integer, integer, boolean, uuid),public.bookish_race(uuid),public.bookish_schedule_meeting(uuid, timestamp with time zone, text, text, integer),public.bookish_edit_meeting(uuid, timestamp with time zone, text, text, integer, boolean),public.bookish_add_bring_item(uuid, text),public.bookish_claim_bring_item(uuid, boolean),public.bookish_open_vote(uuid, timestamp with time zone, text[], boolean),public.bookish_cast_ballot(uuid, uuid, text),public.bookish_close_vote(uuid, uuid) to authenticated;
commit;
