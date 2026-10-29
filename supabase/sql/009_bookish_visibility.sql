-- REVIEW ONLY. Requires 001-004 on the shared project. Never run db push.
-- See the job's apply.sql for the required backup and directory seed.
begin;
alter table public.bookish_clubs add column visibility text not null default 'private'
  check (visibility in ('open','private','hidden'));
alter table public.bookish_clubs add column public_data jsonb not null default '{}';
alter table public.bookish_clubs add column owner_submission_id uuid references public.bookish_submissions(id);
create unique index bookish_visibility_ref on public.bookish_clubs(club_ref) where club_ref is not null;
-- Pre-existing app clubs with no public listing remain Private.
-- Public directory seed and confirmed legacy submissions are backfilled separately.
create table public.bookish_city_centers (
 city text not null,state text not null,lat double precision not null,lng double precision not null,
 primary key(city,state),check(lat between -90 and 90),check(lng between -180 and 180)
);
grant select,insert,update,delete on table public.bookish_city_centers to service_role;
alter table public.bookish_city_centers enable row level security;
revoke all on table public.bookish_city_centers from public,anon,authenticated;
create function public.bookish_visibility_location(p_city text,p_state text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookish_city_centers where lower(city)=lower(trim(p_city)) and state=upper(trim(p_state)))
$$;
revoke all on function public.bookish_visibility_location(text,text) from public,anon,authenticated;
grant execute on function public.bookish_visibility_location(text,text) to service_role;

create table public.bookish_join_attempts (
  id uuid primary key default gen_random_uuid(), ip_hash text not null,
  email text not null, created_at timestamptz not null default now()
);
grant select,insert,update,delete on table public.bookish_join_attempts to service_role;
alter table public.bookish_join_attempts enable row level security;
revoke all on table public.bookish_join_attempts from public,anon,authenticated;
create index bookish_join_attempts_ip on public.bookish_join_attempts(ip_hash,created_at);
create index bookish_join_attempts_email on public.bookish_join_attempts(email,created_at);
-- No raw access: even the owner capability goes through a scoped server function.
revoke all on public.bookish_clubs,public.bookish_submissions,public.bookish_join_requests,public.bookish_invites from public,anon,authenticated;
grant select,insert,update,delete on public.bookish_clubs,public.bookish_submissions,public.bookish_join_requests,public.bookish_invites to service_role;

create function public.bookish_visibility_directory() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.club_ref,'name',c.name,'city',c.city,'state',c.state,
  'visibility',c.visibility,'verified',c.owner_submission_id is not null,
  'current_book',(select jsonb_build_object('title',b.title,'authors',b.authors)
    from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id
    where cb.club_id=c.id and cb.status='reading' order by cb.started_at desc nulls last,cb.id limit 1),
  'genres',case when c.visibility='open' then coalesce(c.public_data->'genres','[]'::jsonb) else '[]'::jsonb end,
  'cadence',case when c.visibility='open' then c.public_data->'cadence' end,
  'format',case when c.visibility='open' then c.public_data->'format' end,'vibe',null,
  'source_name',case when c.owner_submission_id is null and c.visibility='open' then c.public_data->'source_name' end,
  'source_url',case when c.owner_submission_id is null and c.visibility='open' then c.public_data->'source_url' end,
  'last_seen',c.public_data->'last_seen','lat',c.public_data->'lat','lng',c.public_data->'lng',
  'city_path',c.public_data->'city_path'
 ) order by c.name,c.club_ref),'[]'::jsonb)
 from public.bookish_clubs c where c.visibility in ('open','private') and c.club_ref is not null and nullif(trim(c.city),'') is not null and c.state ~ '^[A-Z]{2}$'
$$;

-- Confirmed submissions are the existing host identity. The first owner wins;
-- confirming another email claim can never take over an existing club.
create function public.bookish_visibility_confirm() returns trigger
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
 where bookish_clubs.owner_submission_id is null;
 return new;
end $$;
create trigger bookish_visibility_confirm after insert or update of status on public.bookish_submissions
 for each row execute function public.bookish_visibility_confirm();

create function public.bookish_visibility_decide(p_token uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.bookish_join_requests; c public.bookish_clubs;
begin
 select * into r from public.bookish_join_requests where decision_token=p_token;
 if r.id is null then return jsonb_build_object('ok',false); end if;
 select * into c from public.bookish_clubs where club_ref=r.club_ref for update;
 if c.id is null or c.visibility='hidden' then return jsonb_build_object('ok',false); end if;
 update public.bookish_join_requests set status=case when p_approve then 'approved' else 'declined' end,decided_at=now()
 where id=r.id and status='pending' returning * into r;
 if not found then return jsonb_build_object('ok',false); end if;
 return jsonb_build_object('ok',true,'status',r.status,'notice',jsonb_build_object('kind','decision','to',r.email,'name',r.first_name,'club',c.name,'approved',p_approve,'host_email',case when p_approve then (select email from public.bookish_submissions where id=c.owner_submission_id) end));
end $$;

create function public.bookish_visibility_host(p_token uuid,p_action text,p_ref text,p_visibility text default null,p_request uuid default null,p_approve boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; code_value text; i int; decision jsonb;
begin
 select cl.* into c from public.bookish_clubs cl join public.bookish_submissions s on s.id=cl.owner_submission_id
 where cl.club_ref=p_ref and s.confirm_token=p_token and s.status='confirmed' for update of cl;
 if c.id is null then raise exception 'Host link is unavailable.'; end if;
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
  delete from public.bookish_invites where club_ref=c.club_ref;
  insert into public.bookish_invites(code,club_ref,expires_at,max_uses) values(code_value,c.club_ref,now()+interval '7 days',20);
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

create function public.bookish_visibility_join(p_ref text,p_email text,p_name text,p_note text,p_code text,p_ip text) returns jsonb
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
 return jsonb_build_object('ok',true,'status',case when joined then 'joined' else 'pending' end,'notice',case when not joined then jsonb_build_object('kind','request','to',(select email from public.bookish_submissions where id=c.owner_submission_id),'name',p_name,'note',p_note,'club',c.name,'decision_token',decision) else jsonb_build_object('kind','decision','to',p_email,'name',p_name,'club',c.name,'approved',true,'host_email',(select email from public.bookish_submissions where id=c.owner_submission_id)) end);
end $$;

-- Hidden clubs contribute no facts or counts to any downstream public aggregate.
create or replace view public.bookish_active_clubs as
 select c.id,c.city,c.state from public.bookish_clubs c
 where c.visibility in ('open','private')
 and (select count(*) from public.bookish_members m where m.club_id=c.id)>=2
 and exists(select 1 from public.bookish_club_books b where b.club_id=c.id and b.status='finished');
revoke all on public.bookish_active_clubs from public,anon,authenticated;
grant select on public.bookish_active_clubs,public.bookish_book_stats,public.bookish_city_book,public.bookish_state_book,public.bookish_book_next to service_role;
-- Every new function has explicit grants, independent of Supabase defaults.
revoke all on function public.bookish_visibility_directory(),public.bookish_visibility_confirm(),public.bookish_visibility_decide(uuid,boolean),public.bookish_visibility_host(uuid,text,text,text,uuid,boolean),public.bookish_visibility_join(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bookish_visibility_directory(),public.bookish_visibility_decide(uuid,boolean),public.bookish_visibility_host(uuid,text,text,text,uuid,boolean),public.bookish_visibility_join(text,text,text,text,text,text) to service_role;
commit;
