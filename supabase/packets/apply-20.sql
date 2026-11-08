-- REVIEW PACKET ONLY. No hosted deployment has occurred.
-- Dedicated Bookish project: tkrsrnlasinmlftkcufi. Do not run against any other project.
-- Confirm the Dashboard target, then prefix EVERY execution/session with:
-- set bookish.target_ref='tkrsrnlasinmlftkcufi';
-- The setting is an operator confirmation, not independent project detection.
-- Run all chunks in order while Bookish intake is paused. Retain normal backups.
-- Chunk 20/20. Reapplying preserves live rows.
begin;
do $guard$ begin
 if current_setting('bookish.target_ref',true) is distinct from 'tkrsrnlasinmlftkcufi' then
  raise exception 'Confirm the Bookish dedicated project tkrsrnlasinmlftkcufi and set bookish.target_ref first.';
 end if;
 if to_regclass('auth.users') is null or to_regclass('auth.identities') is null then
  raise exception 'Expected Supabase Auth schema is missing.';
 end if;
end $guard$;
do $order$ begin
 if to_regclass('bookish_release_20261101.state') is null then raise exception 'Apply earlier Bookish chunks first.';end if;
 if not exists(select 1 from bookish_release_20261101.state where version='dedicated-chunk-18') then raise exception 'Apply earlier Bookish chunks first.';end if;
 if not exists(select 1 from bookish_release_20261101.state where version='dedicated-chunk-19') then raise exception 'Apply earlier Bookish chunks first.';end if;
end $order$;
-- Reveal only the caller's own ballot. Hosts have no extra visibility.
create or replace function public.bookish_my_vote(p_vote uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare cid uuid; choice uuid;
begin
 select club_id into cid from public.bookish_votes where id=p_vote;
 perform bookish_private.require_member(cid);
 select option_id into choice from public.bookish_vote_ballots where vote_id=p_vote and user_id=auth.uid();
 return choice;
end $$;
revoke all on function public.bookish_my_vote(uuid) from public,anon,authenticated,service_role;
grant execute on function public.bookish_my_vote(uuid) to authenticated;

-- Email confirmation proves the claimant's email, never ownership of a listing.
-- Only a deliberate service-side review may transfer ownership or host roles.
alter table public.bookish_submissions add column if not exists claim_review_status text not null default 'pending' check(claim_review_status in ('pending','approved','declined'));
create or replace function public.bookish_visibility_confirm() returns trigger
language plpgsql security definer set search_path='' as $$
declare chosen text; geo public.bookish_city_centers;
begin
 if new.status<>'confirmed' or new.kind<>'start' or new.club_ref is null then return new; end if;
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
create or replace function public.bookish_sync_account() returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; uid uuid:=auth.uid();
begin
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'app'='bookish' and email_confirmed_at is not null) then raise exception 'Sign in to Bookish to continue.'; end if;
 insert into public.bookish_profiles(id) values(uid) on conflict do nothing;
 if not bookish_private.active_user() then raise exception 'Account unavailable.'; end if;
 -- First confirmed owner retains the listing. Only proof of this email plus a
 -- trusted Bookish identity can attach an Auth host to a legacy listing.
 for cid in select c.id from public.bookish_clubs c join public.bookish_submissions s on s.id=c.owner_submission_id join auth.users u on u.id=uid and lower(u.email)=lower(s.email)
 where s.kind='start' and s.status='confirmed' and not exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role in ('host','cohost')) loop
  insert into public.bookish_members(club_id,user_id,role) values(cid,uid,'host') on conflict(club_id,user_id) do update set role='host';
 end loop;
end $$;
create or replace function public.bookish_visibility_join(p_ref text,p_email text,p_name text,p_note text,p_code text,p_ip text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; inv public.bookish_invites; joined boolean:=false; decision uuid; resolved_ref text; prior public.bookish_join_requests;
begin
 if p_email is null or length(p_email) not between 5 and 254 or length(coalesce(p_note,''))>500 or p_ip is null then return jsonb_build_object('ok',false,'error','invalid'); end if;
 -- Serialize retries across every club so rate limits cannot be raced.
 perform pg_advisory_xact_lock(hashtextextended(p_ip,0));
 perform pg_advisory_xact_lock(hashtextextended(lower(p_email),1));
 if (select count(*) from public.bookish_join_attempts where ip_hash=p_ip and created_at>now()-interval '1 hour')>=5
 or (select count(*) from public.bookish_join_attempts where email=lower(p_email) and created_at>now()-interval '1 day')>=8
 then return jsonb_build_object('ok',false,'error','rate_limited'); end if;
 delete from public.bookish_join_attempts where created_at<now()-interval '30 days';
 insert into public.bookish_join_attempts(ip_hash,email) values(p_ip,lower(p_email));
 resolved_ref:=nullif(trim(p_ref),'');
 if resolved_ref is null and coalesce(p_code,'')<>'' then
  select club_ref into resolved_ref from public.bookish_invites where code=upper(trim(p_code));
 end if;
 select * into c from public.bookish_clubs where club_ref=resolved_ref and owner_submission_id is not null for update;
 if c.id is null then return jsonb_build_object('ok',false,'error','unavailable'); end if;
 if coalesce(p_code,'')<>'' then
  select * into inv from public.bookish_invites where code=upper(trim(p_code)) and club_ref=resolved_ref for update;
  if inv.code is null or inv.expires_at is null or inv.expires_at<=now() or inv.max_uses is null or inv.uses>=inv.max_uses then return jsonb_build_object('ok',false,'error','unavailable'); end if;
  joined:=true;
 elsif c.visibility='hidden' then return jsonb_build_object('ok',false,'error','unavailable');
 else joined:=c.visibility='open'; end if;
 select * into prior from public.bookish_join_requests
 where club_ref=resolved_ref and lower(email)=lower(p_email) and status in ('pending','approved')
 order by (status='approved') desc,created_at,id limit 1 for update;
 if prior.status='approved' then return jsonb_build_object('ok',true,'status','joined'); end if;
 if prior.status='pending' and not joined then return jsonb_build_object('ok',true,'status','already_requested'); end if;
 if prior.id is not null then
  update public.bookish_join_requests set status='approved',via=case when inv.code is null then 'request' else 'invite' end,decided_at=now()
  where id=prior.id returning decision_token into decision;
 else
  insert into public.bookish_join_requests(club_ref,club_name,email,first_name,note,via,status,ip_hash,decided_at)
  values(resolved_ref,c.name,lower(p_email),left(p_name,60),p_note,case when inv.code is null then 'request' else 'invite' end,
  case when joined then 'approved' else 'pending' end,p_ip,case when joined then now() end) returning decision_token into decision;
 end if;
 if inv.code is not null then update public.bookish_invites set uses=uses+1 where code=inv.code; end if;
 return jsonb_build_object('ok',true,'status',case when joined then 'joined' else 'pending' end,'notice',case when not joined then jsonb_build_object('kind','request','to',(select email from public.bookish_submissions where id=c.owner_submission_id),'name',p_name,'note',p_note,'club',c.name,'decision_token',decision) else jsonb_build_object('kind','decision','to',p_email,'name',p_name,'club',c.name,'approved',true) end);
end $$;
create or replace function public.bookish_visibility_host(p_token uuid,p_action text,p_ref text,p_visibility text default null,p_request uuid default null,p_approve boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; code_value text; i int; decision jsonb;
begin
 select cl.* into c from public.bookish_clubs cl join public.bookish_submissions s on s.id=cl.owner_submission_id
 where cl.club_ref=p_ref and s.confirm_token=p_token and s.kind='start' and s.status='confirmed' for update of cl;
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
 'notice',decision->'notice','requests',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'email',case when user_id is null then email end,'note',note) order by created_at),'[]'::jsonb) from public.bookish_join_requests where club_ref=c.club_ref and status='pending'));
end $$;
-- Worker pagination does not hide reports from the existing safety queue.
create or replace function public.bookish_content_report_queue(p_after uuid)
returns table(id uuid,kind text,target_id uuid,club_id uuid,reason text,due_at timestamptz)
language sql stable security definer set search_path='' as $$
 select id,kind,target_id,club_id,reason,due_at from bookish_private.content_reports
 where status='pending' and (p_after is null or id>p_after) order by id limit 100
$$;
revoke all on function public.bookish_content_report_queue(uuid) from public,anon,authenticated,service_role;
grant execute on function public.bookish_content_report_queue(uuid) to service_role;
create or replace function public.bookish_get_secret(p_name text) returns text
 language plpgsql stable security definer set search_path='' as $secret$
declare value text;
begin
 if p_name is null or p_name not in (
  'BOOKISH_SITE_URL','BOOKISH_EMAIL_FROM','RESEND_API_KEY',
  'BOOKISH_APPLE_CLIENT_ID','BOOKISH_APPLE_TEAM_ID','BOOKISH_APPLE_KEY_ID',
  'BOOKISH_APPLE_PRIVATE_KEY','BOOKISH_TERMS_URL','BOOKISH_PRIVACY_URL',
  'BOOKISH_MODERATION_EMAIL','BOOKISH_REPORT_WORKER_KEY'
 ) then raise exception 'Bookish secret name is not allowed.' using errcode='22023';end if;
 select s.decrypted_secret into value from vault.decrypted_secrets s where s.name=p_name;
 return value;
end $secret$;
revoke all on function public.bookish_get_secret(text) from public,anon,authenticated,service_role;
grant execute on function public.bookish_get_secret(text) to service_role;
revoke all on function public.bookish_visibility_confirm(),public.bookish_visibility_join(text,text,text,text,text,text),public.bookish_visibility_host(uuid,text,text,text,uuid,boolean),public.bookish_sync_account() from public,anon,authenticated,service_role;
grant execute on function public.bookish_visibility_join(text,text,text,text,text,text),public.bookish_visibility_host(uuid,text,text,text,uuid,boolean) to service_role;
grant execute on function public.bookish_sync_account() to authenticated;
insert into bookish_release_20261101.state values('dedicated-chunk-20',now()) on conflict(version) do nothing;
commit;
