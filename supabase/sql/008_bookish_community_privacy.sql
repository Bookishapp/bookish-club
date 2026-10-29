-- Harden PR #12's existing aggregates: reading-club counts and rating-club counts
-- must independently pass the SAME existing 3-club floor. No new aggregates.
begin;
-- Only established, independent clubs can contribute to privacy-protected aggregates.
create or replace view public.bookish_active_clubs as
 with qualified as (
  select c.id,c.city,c.state
  from public.bookish_clubs c
  where (not (to_jsonb(c) ? 'visibility') or to_jsonb(c)->>'visibility' in ('open','private'))
    and (select count(distinct m.user_id) from public.bookish_members m
         where m.club_id=c.id and m.joined_at<=now()-interval '14 days')>=3
    and exists(select 1 from public.bookish_club_books b where b.club_id=c.id and b.status='finished')
 )
 select q.id,q.city,q.state from qualified q
 where not exists (
  select 1 from qualified other
  join public.bookish_members mine on mine.club_id=q.id
  join public.bookish_members theirs on theirs.club_id=other.id and theirs.user_id=mine.user_id
  where other.id<>q.id
 );
create or replace view public.bookish_book_stats as
  with reads as (
    select cb.book_id, cb.club_id, cb.status from public.bookish_club_books cb
    join public.bookish_active_clubs a on a.id = cb.club_id
    where cb.status in ('finished','dropped')
  ), pours as (
    select p.book_id, p.club_id, p.glasses from public.bookish_pours p
    join public.bookish_active_clubs a on a.id = p.club_id
    join public.bookish_members m on m.club_id = p.club_id and m.user_id = p.user_id and m.ratings_public
    where not p.dnf
  )
  select r.book_id,
         count(distinct r.club_id)::int as clubs,
         case when count(distinct p.club_id)>=public.bookish_privacy_floor() then round(avg(p.glasses), 1) end as mean_pour,
         count(distinct p.club_id)::int as pour_clubs,
         round(count(distinct r.club_id) filter (where r.status = 'finished')::numeric / count(distinct r.club_id), 2) as finish_rate
  from reads r left join pours p on p.book_id = r.book_id
  group by r.book_id
  having count(distinct r.club_id) >= public.bookish_privacy_floor();

-- "Clubs in <city> loved": finished in the last 90 days, mean pour from that city's clubs.
create or replace view public.bookish_city_book as
  select a.city, a.state, cb.book_id,
         count(distinct cb.club_id)::int as clubs,
         case when count(distinct p.club_id) filter (where m.ratings_public and not p.dnf)>=public.bookish_privacy_floor() then round(avg(p.glasses) filter (where m.ratings_public and not p.dnf), 1) end as mean_pour
  from public.bookish_club_books cb
  join public.bookish_active_clubs a on a.id = cb.club_id
  left join public.bookish_pours p on p.club_id = cb.club_id and p.book_id = cb.book_id
  left join public.bookish_members m on m.club_id = p.club_id and m.user_id = p.user_id
  where cb.status = 'finished' and cb.finished_at >= current_date - 90 and a.city is not null
  group by a.city, a.state, cb.book_id
  having count(distinct cb.club_id) >= public.bookish_privacy_floor();

-- Same, rolled up to the state (used when a city fails the floor).
create or replace view public.bookish_state_book as
  select a.state, cb.book_id, count(distinct cb.club_id)::int as clubs,
         case when count(distinct p.club_id) filter (where m.ratings_public and not p.dnf)>=public.bookish_privacy_floor() then round(avg(p.glasses) filter (where m.ratings_public and not p.dnf), 1) end as mean_pour
  from public.bookish_club_books cb
  join public.bookish_active_clubs a on a.id = cb.club_id
  left join public.bookish_pours p on p.club_id = cb.club_id and p.book_id = cb.book_id
  left join public.bookish_members m on m.club_id = p.club_id and m.user_id = p.user_id
  where cb.status = 'finished' and cb.finished_at >= current_date - 90 and a.state is not null
  group by a.state, cb.book_id
  having count(distinct cb.club_id) >= public.bookish_privacy_floor();

revoke all on public.bookish_book_stats,public.bookish_city_book,public.bookish_state_book from public,anon,authenticated;
-- Return pours within a club without disclosing who marked a book DNF.
create or replace function public.bookish_club_pour(p_club uuid,p_book text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin perform bookish_private.require_member(p_club);
 select jsonb_build_object(
  'mean_pour',case when count(*) filter(where not p.dnf)>=5 then round(avg(p.glasses) filter(where not p.dnf),1) end,
  'pours',case when count(*)>=5 then count(*) filter(where not p.dnf) end,
  'dnf_count',case when count(*)>=5 then count(*) filter(where p.dnf) end) into result
 from public.bookish_pours p join public.bookish_members m on m.club_id=p.club_id and m.user_id=p.user_id and m.ratings_public
 where p.club_id=p_club and p.book_id=p_book;
 return result;
end $$;
revoke all on function public.bookish_club_pour(uuid,text) from public,anon,authenticated;
grant execute on function public.bookish_club_pour(uuid,text) to authenticated;
commit;
