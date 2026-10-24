-- Read-only upgrade audit for a staging clone with 001–004 already present.
-- Each result must be empty before 005/006. No automatic cleanup of real data.
-- Existing reader rows need manual reconciliation because no Auth user is backfilled or marked automatically.
begin read only;
select club_ref,count(*) from public.bookish_clubs where club_ref is not null group by club_ref having count(*)>1;
select club_id,count(*) from public.bookish_club_books where status='reading' group by club_id having count(*)>1;
select 'members' source,m.user_id from public.bookish_members m left join auth.users u on u.id=m.user_id where u.id is null
union all
select 'pours',p.user_id from public.bookish_pours p left join auth.users u on u.id=p.user_id where u.id is null
union all
select 'taste',t.user_id from public.bookish_taste t left join auth.users u on u.id=t.user_id where u.id is null
union all
select 'events',e.user_id from public.bookish_suggest_events e left join auth.users u on u.id=e.user_id where e.user_id is not null and u.id is null;
select 'existing_member' source,user_id from public.bookish_members
union all select 'existing_pour',user_id from public.bookish_pours
union all select 'existing_taste',user_id from public.bookish_taste
union all select 'existing_event',user_id from public.bookish_suggest_events where user_id is not null;
select id,name from public.bookish_clubs where length(trim(name)) not between 2 and 140;
select e.club_id from public.bookish_suggest_events e left join public.bookish_clubs c on c.id=e.club_id where e.club_id is not null and c.id is null;
rollback;
