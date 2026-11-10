begin;
set local lock_timeout='5s';
create table if not exists bookish_private.meeting_reminders (
 id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.bookish_meetings(id) on delete cascade,
 club_id uuid not null references public.bookish_clubs(id) on delete cascade,
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 starts_at timestamptz not null,payload jsonb not null,first_attempt_at timestamptz,
 lease uuid not null default gen_random_uuid(),leased_at timestamptz,sent_at timestamptz,
 unique(meeting_id,user_id,starts_at)
);
alter table bookish_private.meeting_reminders enable row level security;
revoke all on bookish_private.meeting_reminders from public,anon,authenticated,service_role;
create index if not exists bookish_meeting_reminder_window on public.bookish_meetings(status,starts_at);
create or replace function public.bookish_reminder_preferences(p_club uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 if p_enabled is null then raise exception 'Choose whether to receive reminders.';end if;
 update public.bookish_members set meeting_reminders=p_enabled where club_id=p_club and user_id=auth.uid();end $$;
create or replace function bookish_private.reminder_payload(p_meeting uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('meeting_id',m.id,'title',m.title,'starts_at',m.starts_at,'email',u.email,'location',m.location)
 from public.bookish_meetings m join public.bookish_members cm on cm.club_id=m.club_id and cm.user_id=p_user and cm.meeting_reminders
 join public.bookish_rsvps r on r.meeting_id=m.id and r.user_id=cm.user_id and r.response in ('going','maybe')
 join public.bookish_profiles p on p.id=cm.user_id and p.banned_at is null
 join auth.users u on u.id=p.id and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish'
 where m.id=p_meeting and m.status='scheduled' and m.starts_at>clock_timestamp()
 and m.starts_at between clock_timestamp()+interval '20 hours' and clock_timestamp()+interval '30 hours'
 and not exists(select 1 from bookish_private.content_removals cr where (cr.kind='meeting' and cr.target_id=m.id) or (cr.kind='club' and cr.target_id=m.club_id))
 and not exists(select 1 from bookish_private.content_hides h where h.user_id=p_user and ((h.kind='meeting' and h.target_id=m.id) or (h.kind='club' and h.target_id=m.club_id)))
$$;
create or replace function public.bookish_claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 -- Queued rows have no possible provider attempt until their first lease.
 -- Refresh those snapshots so edits cannot strand recipients beyond a batch.
 update bookish_private.meeting_reminders r set payload=p.payload
 from (select r.id,bookish_private.reminder_payload(r.meeting_id,r.user_id) payload from bookish_private.meeting_reminders r where r.first_attempt_at is null) p
 where r.id=p.id and r.first_attempt_at is null and p.payload is not null
 and (p.payload->>'starts_at')::timestamptz=r.starts_at and r.payload is distinct from p.payload;
 with eligible as materialized (
  select m.id,m.club_id,m.starts_at,cm.user_id from public.bookish_meetings m
  join public.bookish_members cm on cm.club_id=m.club_id and cm.meeting_reminders
  where m.status='scheduled' and m.starts_at>clock_timestamp() and m.starts_at<clock_timestamp()+interval '2 days'
  and not exists(select 1 from bookish_private.meeting_reminders existing where existing.meeting_id=m.id and existing.user_id=cm.user_id and existing.starts_at=m.starts_at)
 )
 insert into bookish_private.meeting_reminders(meeting_id,club_id,user_id,starts_at,payload)
 select m.id,m.club_id,m.user_id,m.starts_at,p.payload from eligible m
 cross join lateral(select bookish_private.reminder_payload(m.id,m.user_id) payload) p
 where p.payload is not null
 order by m.starts_at,m.id,m.user_id limit 500 on conflict do nothing;
 -- A single claim is at most 50 rows. Parallel workers do not share leases.
 with candidates as (
 select r.id from bookish_private.meeting_reminders r where r.sent_at is null
 and (r.first_attempt_at is null or r.first_attempt_at>clock_timestamp()-interval '23 hours')
 and (r.leased_at is null or r.leased_at<clock_timestamp()-interval '10 minutes')
 and r.payload=bookish_private.reminder_payload(r.meeting_id,r.user_id)
 order by r.starts_at,r.id limit 50 for update skip locked
 ),claimed as (
 update bookish_private.meeting_reminders r set lease=gen_random_uuid(),leased_at=clock_timestamp(),first_attempt_at=coalesce(r.first_attempt_at,clock_timestamp()) from candidates c where r.id=c.id returning r.*
 ) select coalesce(jsonb_agg(r.payload||jsonb_build_object('id',r.id,'lease',r.lease,'calendar_generated_at',r.first_attempt_at)),'[]'::jsonb) into result from claimed r;
 insert into public.bookish_notifications(club_id,user_id,kind,target_id)
 select r.club_id,r.user_id,'meeting_reminder',r.meeting_id from bookish_private.meeting_reminders r
 where r.id in (select (x->>'id')::uuid from jsonb_array_elements(result) x) on conflict do nothing;
 return result;
end $$;
create or replace function public.bookish_prepare_reminder(p_id uuid,p_lease uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select r.payload||jsonb_build_object('id',r.id,'lease',r.lease,'calendar_generated_at',r.first_attempt_at) from bookish_private.meeting_reminders r
 where r.id=p_id and r.lease=p_lease and r.sent_at is null and r.leased_at>clock_timestamp()-interval '10 minutes'
 and r.first_attempt_at>clock_timestamp()-interval '23 hours'
 and r.payload=bookish_private.reminder_payload(r.meeting_id,r.user_id)
$$;
create or replace function public.bookish_complete_reminder(p_id uuid,p_lease uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update bookish_private.meeting_reminders set sent_at=coalesce(sent_at,clock_timestamp()) where id=p_id and lease=p_lease and leased_at>clock_timestamp()-interval '10 minutes';
 if not found then raise exception 'This reminder lease is no longer valid.';end if;
end $$;
revoke all on function public.bookish_reminder_preferences(uuid,boolean),public.bookish_claim_reminders(),public.bookish_prepare_reminder(uuid,uuid),public.bookish_complete_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.bookish_reminder_preferences(uuid,boolean) to authenticated;
grant execute on function public.bookish_claim_reminders(),public.bookish_prepare_reminder(uuid,uuid),public.bookish_complete_reminder(uuid,uuid) to service_role;
revoke all on function bookish_private.reminder_payload(uuid,uuid) from public,anon,authenticated,service_role;
commit;
