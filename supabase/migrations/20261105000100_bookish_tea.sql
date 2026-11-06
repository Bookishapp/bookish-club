-- Additive to the staged 001 through 011 baseline. Do not apply with this PR.
begin;
alter table public.bookish_takes add column did_not_finish boolean not null default false;
-- A legacy chapter has no reliable page translation. Seal it to the final
-- page without relabeling the author's take as Didn't finish.
update public.bookish_takes t set spoiler_page=greatest(t.spoiler_page,coalesce(b.pages,100000)),spoiler_chapter=null
from public.bookish_books b where b.id=t.book_id and t.spoiler_chapter>0;
-- Retire the signed projection, including historical signed names.
update public.bookish_takes set anonymous=true,signed_name=null;
update public.bookish_takes set hidden=true where length(body)>280;
alter table public.bookish_takes add constraint bookish_tea_anonymous check(anonymous and signed_name is null);
alter table public.bookish_takes add constraint bookish_tea_length check(hidden or length(body)<=280);
-- There is no RPC identity escape hatch, even for service moderation.
drop function public.bookish_escalate_author(uuid,text,text);
create table bookish_private.tea_post_events (
 author_id uuid not null references public.bookish_profiles(id) on delete cascade,
 posted_at timestamptz not null default clock_timestamp()
);
create index bookish_tea_rate on bookish_private.tea_post_events(author_id,posted_at);
alter table bookish_private.tea_post_events enable row level security;
revoke all on bookish_private.tea_post_events from public,anon,authenticated,service_role;

create function bookish_private.tea_verdict(p_club uuid,p_body text) returns text
language plpgsql stable security definer set search_path='' as $$
declare normalized text;
begin
 normalized:=normalize(regexp_replace(p_body,'[[:cntrl:]​‌‍]','','g'),NFKC);
 if normalized ~* '[[:alnum:]._%+\-]+@[[:alnum:].\-]+\.[[:alpha:]]{2,}'
 or normalized ~ '(\+?[0-9][ ()+.-]*){7,}'
 or normalized ~* '\m[0-9]{1,6}[[:alpha:]]?[[:space:]]+([[:alpha:]]+[[:space:]]+){1,5}(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl|terrace|circle)\M'
 then return 'blocked'; end if;
 return bookish_private.content_verdict(p_club,normalized);
end $$;
create or replace function bookish_private.filter_take() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_member(new.club_id);perform bookish_private.require_terms();
 if length(trim(new.body)) not between 1 and 280 then raise exception 'A take needs 1 to 280 characters.';end if;
 if bookish_private.tea_verdict(new.club_id,new.body)<>'allowed' then raise exception 'Spill about the book, never personal information or the club.';end if;
 if not new.anonymous or new.signed_name is not null then raise exception 'The Tea is anonymous.';end if;
 return new;
end $$;
create or replace function bookish_private.can_unseal(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when t.did_not_finish then coalesce(l.finished,false)
 else coalesce(l.finished,false) or coalesce(l.page,0)>=t.spoiler_page end
 from public.bookish_takes t join public.bookish_members m on m.club_id=t.club_id and m.user_id=auth.uid()
 left join lateral(select l.page,l.finished from public.bookish_page_log l
 join public.bookish_club_books cb on cb.club_id=l.club_id and cb.book_id=l.book_id
 where l.club_id=t.club_id and l.book_id=t.book_id and l.user_id=auth.uid() and l.logged_at>=cb.reading_started_at
 order by l.logged_at desc,l.id desc limit 1) l on true where t.id=p_take),false)
$$;
create function public.bookish_create_take(p_club uuid,p_book text,p_body text,p_page int default null,p_dnf boolean default false,p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid;parent public.bookish_takes;total int;depth int;
begin
 perform bookish_private.require_member(p_club);perform bookish_private.require_terms();
 if not exists(select 1 from public.bookish_club_books where club_id=p_club and book_id=p_book) then raise exception 'Choose a club book.';end if;
 if p_body is null or length(p_body) not between 1 and 280 or length(trim(p_body))=0 then raise exception 'A take needs 1 to 280 characters.';end if;
 select pages into total from public.bookish_books where id=p_book;
 if p_dnf is null or (p_dnf and p_page is not null) or (not p_dnf and (p_page is null or p_page<0 or p_page>coalesce(total,100000))) then raise exception 'Choose a page or Didn''t finish.';end if;
 if bookish_private.tea_verdict(p_club,p_body)<>'allowed' then raise exception 'Spill about the book, never personal information or the club.';end if;
 perform 1 from public.bookish_profiles where id=auth.uid() for update;
 if (select count(*) from bookish_private.tea_post_events where author_id=auth.uid() and posted_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'Let this sip settle for a moment.';end if;
 if p_parent is not null then
  select * into parent from public.bookish_takes where id=p_parent;
  if parent.club_id is distinct from p_club or parent.book_id is distinct from p_book or not bookish_private.can_interact(p_parent) then raise exception 'This conversation is unavailable or sealed.';end if;
  with recursive chain as(select id,parent_id,1 d from public.bookish_takes where id=p_parent union all select t.id,t.parent_id,c.d+1 from public.bookish_takes t join chain c on t.id=c.parent_id where c.d<=10) select max(d) into depth from chain;
  if depth>=10 then raise exception 'Start a fresh take.';end if;
  p_dnf:=p_dnf or parent.did_not_finish;p_page:=greatest(p_page,parent.spoiler_page);
 end if;
 insert into bookish_private.tea_post_events(author_id) values(auth.uid());
 insert into public.bookish_takes(club_id,book_id,body,spoiler_page,did_not_finish,parent_id)
 values(p_club,p_book,trim(p_body),coalesce(p_page,0),p_dnf,p_parent) returning id into tid;
 insert into bookish_private.take_authors values(tid,auth.uid());
 return jsonb_build_object('id',tid,'status','posted');
end $$;
create or replace function public.bookish_post_take(p_club uuid,p_book text,p_body text,p_signed boolean default false,p_page int default 0,p_chapter int default null,p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_signed is distinct from false then raise exception 'The Tea is anonymous.';end if;
 if p_chapter is not null then raise exception 'Choose a page marker.';end if;
 return public.bookish_create_take(p_club,p_book,p_body,p_page,false,p_parent);
end $$;
create function public.bookish_tea_feed(p_club uuid,p_book text,p_parent uuid default null,p_limit int default 30,p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb) into result from (
 select t.id,t.parent_id,case when bookish_private.can_unseal(t.id) then t.body end body,
 case when t.did_not_finish then null else t.spoiler_page end page,t.did_not_finish,
 not bookish_private.can_unseal(t.id) sealed,
 (select count(*) from public.bookish_take_reactions r where r.take_id=t.id) sips,
 exists(select 1 from public.bookish_take_reactions r where r.take_id=t.id and r.user_id=auth.uid()) sipped,
 (select count(*) from public.bookish_takes r where r.parent_id=t.id and bookish_private.can_view_take(r.id)) reply_count,t.created_at
 from public.bookish_takes t where t.club_id=p_club and t.book_id=p_book and t.parent_id is not distinct from p_parent and bookish_private.can_view_take(t.id)
 order by t.created_at desc,t.id limit least(greatest(coalesce(p_limit,30),1),100) offset least(greatest(coalesce(p_offset,0),0),10000)
 ) x;return result;
end $$;
-- Preserve the old return signature, but return no authorship signal or name.
create or replace function public.bookish_tea(p_club uuid,p_book text,p_parent uuid default null,p_limit int default 30,p_offset int default 0)
returns table(id uuid,parent_id uuid,body text,anonymous boolean,signed_name text,spoiler_page int,spoiler_chapter int,sealed boolean,mine boolean,reactions jsonb,my_reaction text,reply_count bigint,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select x.id,x.parent_id,x.body,true,null::text,x.page,null::int,x.sealed,false,jsonb_build_object('sip',x.sips),case when x.sipped then 'sip' end,x.reply_count,x.created_at
 from jsonb_to_recordset(public.bookish_tea_feed(p_club,p_book,p_parent,p_limit,p_offset)) x(id uuid,parent_id uuid,body text,page int,sealed boolean,sips bigint,sipped boolean,reply_count bigint,created_at timestamptz)
$$;
create function public.bookish_sip(p_take uuid,p_sip boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_terms();
 if not bookish_private.can_interact(p_take) then raise exception 'This conversation is unavailable or sealed.';end if;
 if p_sip is null then raise exception 'Choose a sip.';end if;
 if p_sip then insert into public.bookish_take_reactions values(p_take,auth.uid(),'🍵') on conflict(take_id,user_id) do update set reaction=excluded.reaction;
 else delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();end if;
end $$;
create or replace function public.bookish_react(p_take uuid,p_reaction text) returns void language plpgsql security definer set search_path='' as $$
begin perform public.bookish_sip(p_take,p_reaction is not null);end $$;
-- Strip old reaction categories while preserving the one-per-member constraint.
update public.bookish_take_reactions set reaction='🍵';
revoke all on public.bookish_takes,public.bookish_take_reactions from public,anon,authenticated;
-- Historical integration granted every private helper to authenticated. Helpers
-- that inspect text against member names are an identity oracle if callable.
revoke all on all functions in schema bookish_private from public,anon,authenticated,service_role;
grant execute on function bookish_private.active_user(),bookish_private.is_member(uuid),bookish_private.is_host(uuid),bookish_private.content_visible(text,uuid) to authenticated;
revoke all on function public.bookish_create_take(uuid,text,text,int,boolean,uuid),public.bookish_tea_feed(uuid,text,uuid,int,int),public.bookish_sip(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.bookish_create_take(uuid,text,text,int,boolean,uuid),public.bookish_tea_feed(uuid,text,uuid,int,int),public.bookish_sip(uuid,boolean) to authenticated;
revoke all on function bookish_private.tea_verdict(uuid,text) from public,anon,authenticated,service_role;
commit;
