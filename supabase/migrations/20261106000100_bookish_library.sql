-- Additive to 001 through 011 and the three 20261105 migrations. File only.
begin;
set local lock_timeout='5s';
create table if not exists bookish_private.book_ratings (
 id uuid not null unique default gen_random_uuid(),
 public_id uuid not null unique default gen_random_uuid(),
 club_id uuid not null,
 book_id text not null,
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 hearts integer not null check(hearts between 1 and 5),
 take text not null default '' check(length(take)<=280),
 anonymous boolean not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(club_id,book_id,user_id),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade
);
-- Public take IDs rotate when attribution changes. Internal moderation targets stay stable.
alter table bookish_private.book_ratings add column if not exists public_id uuid not null unique default gen_random_uuid();
create table if not exists bookish_private.rating_author_blocks (
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 author_id uuid not null references public.bookish_profiles(id) on delete cascade,
 anonymous_only boolean not null default true,
 primary key(user_id,author_id)
);
alter table bookish_private.rating_author_blocks add column if not exists anonymous_only boolean not null default true;
alter table bookish_private.rating_author_blocks enable row level security;
revoke all on bookish_private.rating_author_blocks from public,anon,authenticated,service_role;
create index if not exists bookish_rating_user on bookish_private.book_ratings(user_id);
create index if not exists bookish_rating_book on bookish_private.book_ratings(book_id,club_id);
alter table bookish_private.book_ratings enable row level security;
revoke all on bookish_private.book_ratings from public,anon,authenticated,service_role;

-- No author identifiers leave this private schema. Book metadata is allowlisted.
create or replace function bookish_private.library_book(p_book text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'title',b.title,'authors',b.authors,'cover_id',b.cover_id,
 'cover_url',bookish_private.cover_url(b.cover_id),'moods',b.moods)
 from public.bookish_books b where b.id=p_book
$$;
create or replace function public.bookish_library(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);
 select jsonb_build_object('club',jsonb_build_object('id',c.id,'name',c.name,'created_at',c.created_at),'books',coalesce((
 select jsonb_agg(jsonb_build_object('book',bookish_private.library_book(cb.book_id),'status',cb.status,
 'started_at',cb.started_at,'finished_at',cb.finished_at,'mean_hearts',agg.mean_hearts,'rated_count',agg.rated_count,
 'member_count',(select count(*) from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id where m.club_id=p_club and p.banned_at is null),
 'my_rating',(select jsonb_build_object('hearts',r.hearts,'take',r.take,'anonymous',r.anonymous) from bookish_private.book_ratings r where r.club_id=p_club and r.book_id=cb.book_id and r.user_id=auth.uid()),
 'favorite_take',case when cb.status<>'reading' then (
 select jsonb_build_object('id',r.public_id,'body',r.take,'attribution',case when r.anonymous then 'Anonymous' else p.display_name end)
 from bookish_private.book_ratings r join public.bookish_members m on m.club_id=r.club_id and m.user_id=r.user_id
 join public.bookish_profiles p on p.id=r.user_id and p.banned_at is null
 where r.club_id=p_club and r.book_id=cb.book_id and r.take<>''
 and bookish_private.content_visible('rating',r.id) and bookish_private.content_visible('member',r.user_id)
 and not exists(select 1 from bookish_private.rating_author_blocks rb where rb.user_id=auth.uid() and rb.author_id=r.user_id and (not rb.anonymous_only or r.anonymous))
 order by r.updated_at desc,r.id limit 1) end)
 order by (cb.status='reading') desc,cb.finished_at desc nulls last,cb.started_at desc nulls last,cb.book_id)
 from public.bookish_club_books cb cross join lateral (
 select count(*)::int rated_count,case when count(*)>=5 then round(avg(r.hearts),1) end mean_hearts
 from bookish_private.book_ratings r join public.bookish_members m on m.club_id=r.club_id and m.user_id=r.user_id and m.ratings_public
 join public.bookish_profiles p on p.id=r.user_id and p.banned_at is null
 where r.club_id=p_club and r.book_id=cb.book_id
 ) agg where cb.club_id=p_club),'[]'::jsonb)) into result from public.bookish_clubs c where c.id=p_club;
 return result;
end $$;
create or replace function public.bookish_rate_book(p_club uuid,p_book text,p_hearts integer,p_take text,p_anonymous boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);perform bookish_private.require_terms();
 if p_hearts is null or p_hearts not between 1 and 5 then raise exception 'Choose 1 to 5 hearts.';end if;
 if p_anonymous is null then raise exception 'Choose an attribution: as me or anonymous.';end if;
 if length(coalesce(p_take,''))>280 then raise exception 'A take can be up to 280 characters.';end if;
 if not exists(select 1 from public.bookish_club_books where club_id=p_club and book_id=p_book) then raise exception 'Choose a club book.';end if;
 if nullif(trim(p_take),'') is not null and bookish_private.tea_verdict(p_club,p_take)<>'allowed' then raise exception 'Share about the book, never personal information or the club.';end if;
 insert into bookish_private.book_ratings as existing(club_id,book_id,user_id,hearts,take,anonymous)
 values(p_club,p_book,auth.uid(),p_hearts,trim(coalesce(p_take,'')),p_anonymous)
 on conflict(club_id,book_id,user_id) do update set hearts=excluded.hearts,take=excluded.take,
 public_id=case when existing.anonymous is distinct from excluded.anonymous then gen_random_uuid() else existing.public_id end,
 anonymous=excluded.anonymous,updated_at=clock_timestamp();
 select x into result from jsonb_array_elements(public.bookish_library(p_club)->'books') x where x->'book'->>'id'=p_book;
 return result;
end $$;
create or replace function public.bookish_rating_action(p_rating uuid,p_action text,p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare r bookish_private.book_ratings;
begin
 perform bookish_private.require_terms();
 select * into r from bookish_private.book_ratings where public_id=p_rating;
 perform bookish_private.require_member(r.club_id);
 if p_action is null or p_action not in ('report','hide','block') then raise exception 'Choose report, hide, or block.';end if;
 if r.take='' or not bookish_private.content_visible('rating',r.id) or not bookish_private.content_visible('member',r.user_id)
 or exists(select 1 from bookish_private.rating_author_blocks rb where rb.user_id=auth.uid() and rb.author_id=r.user_id and (not rb.anonymous_only or r.anonymous))
 or not exists(select 1 from public.bookish_club_books cb where cb.club_id=r.club_id and cb.book_id=r.book_id and cb.status<>'reading')
 then raise exception 'This take is unavailable.';end if;
 if p_action='block' and r.user_id=auth.uid() then raise exception 'This is your own take.';end if;
 insert into bookish_private.content_hides values(auth.uid(),'rating',r.id) on conflict do nothing;
 -- Anonymous blocks leave named surfaces unchanged, including signed shelf takes.
 if p_action='block' then
 insert into bookish_private.rating_author_blocks as existing(user_id,author_id,anonymous_only) values(auth.uid(),r.user_id,r.anonymous)
 on conflict(user_id,author_id) do update set anonymous_only=existing.anonymous_only and excluded.anonymous_only;
 end if;
 if p_action='report' then insert into bookish_private.content_reports(reporter_id,kind,target_id,club_id,reason) values(auth.uid(),'rating',r.id,r.club_id,p_reason) on conflict do nothing;end if;
end $$;
-- Safety reviewers receive only reported text and book context, never attribution.
create or replace function public.bookish_rating_report_queue(p_limit integer default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('report_id',x.report_id,'body',x.take,
 'book',jsonb_build_object('id',x.book_id,'title',x.title),'reason',x.reason,
 'created_at',x.created_at,'due_at',x.due_at) order by x.due_at,x.report_id),'[]'::jsonb)
 from (select report.id report_id,r.take,r.book_id,b.title,report.reason,report.created_at,report.due_at
 from bookish_private.content_reports report join bookish_private.book_ratings r on r.id=report.target_id
 join public.bookish_books b on b.id=r.book_id
 where report.kind='rating' and report.status='pending'
 order by report.due_at,report.id limit least(greatest(coalesce(p_limit,50),1),100)) x
$$;
revoke all on function public.bookish_rating_report_queue(integer) from public,anon,authenticated,service_role;
grant execute on function public.bookish_rating_report_queue(integer) to service_role;
create or replace function public.bookish_recommendations(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);
 with club_ratings as (
 select r.club_id,r.book_id,avg(r.hearts) mean_hearts
 from bookish_private.book_ratings r
 join public.bookish_members m on m.club_id=r.club_id and m.user_id=r.user_id and m.ratings_public
 join public.bookish_profiles p on p.id=r.user_id and p.banned_at is null
 join public.bookish_club_books cb on cb.club_id=r.club_id and cb.book_id=r.book_id and cb.status='finished'
 group by r.club_id,r.book_id having count(*)>=5
 ), loved as (
 select cr.book_id from club_ratings cr where cr.club_id=p_club and cr.mean_hearts>=4
 ), evidence as (
 select candidate.book_id,l.book_id because_book,count(distinct a.id)::int clubs,round(avg(candidate.mean_hearts),1) mean_hearts
 from loved l join club_ratings shared on shared.book_id=l.book_id and shared.mean_hearts>=4
 join public.bookish_active_clubs a on a.id=shared.club_id and a.id<>p_club
 join club_ratings candidate on candidate.club_id=a.id and candidate.book_id<>l.book_id and candidate.mean_hearts>=4
 where not exists(select 1 from public.bookish_club_books mine where mine.club_id=p_club and mine.book_id=candidate.book_id)
 and not exists(select 1 from public.bookish_members theirs join public.bookish_members mine on mine.user_id=theirs.user_id where theirs.club_id=a.id and mine.club_id=p_club)
 group by candidate.book_id,l.book_id having count(distinct a.id)>=public.bookish_privacy_floor()
 ), chosen as (
 select distinct on(e.book_id) e.* from evidence e order by e.book_id,e.clubs desc,e.because_book
 ), limited as (
 select * from chosen order by clubs desc,mean_hearts desc,book_id limit 12
 )
 select coalesce(jsonb_agg(jsonb_build_object('book',bookish_private.library_book(e.book_id),
 'because_book',jsonb_build_object('id',b.id,'title',b.title),'mean_hearts',e.mean_hearts,'clubs',e.clubs)
 order by e.clubs desc,e.mean_hearts desc,e.book_id),'[]'::jsonb) into result
 from limited e join public.bookish_books b on b.id=e.because_book;
 return result;
end $$;
revoke all on function bookish_private.library_book(text) from public,anon,authenticated,service_role;
revoke all on function public.bookish_library(uuid),public.bookish_rate_book(uuid,text,integer,text,boolean),public.bookish_recommendations(uuid),public.bookish_rating_action(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bookish_library(uuid),public.bookish_rate_book(uuid,text,integer,text,boolean),public.bookish_recommendations(uuid),public.bookish_rating_action(uuid,text,text) to authenticated;
commit;
