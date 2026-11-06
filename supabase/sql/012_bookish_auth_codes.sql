-- Opt-in short codes. Apply after 011; no hosted Auth configuration changes.
begin;

create table if not exists public.bookish_auth_codes (
  email_hash text primary key check (email_hash ~ '^[a-f0-9]{64}$'),
  salt text not null check (salt ~ '^[a-f0-9]{32}$'),
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5)
);
alter table public.bookish_auth_codes enable row level security;
revoke all on public.bookish_auth_codes from public, anon, authenticated;
grant select, insert, update, delete on public.bookish_auth_codes to service_role;

-- Independent of code rows: replacement, consumption, and failed delivery never
-- erase failed guesses. Keep individual timestamps for a rolling 24-hour window.
create table if not exists public.bookish_auth_code_failures (
  id bigint generated always as identity primary key,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists bookish_auth_code_failure_email
  on public.bookish_auth_code_failures(email_hash, created_at);
alter table public.bookish_auth_code_failures enable row level security;
revoke all on public.bookish_auth_code_failures from public, anon, authenticated, service_role;

-- Preserve 010's shared limits, counting both forms of start together. The
-- short-only hourly/daily limits and failure budget never gate legacy starts.
create or replace function public.bookish_auth_throttle(
  p_email text, p_ip text, p_action text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_email is null or p_ip is null or p_action is null
    or p_action not in ('start','start_short','verify','password','refresh','logout') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ip,42));
  perform pg_advisory_xact_lock(hashtextextended(p_email,43));
  delete from bookish_private.auth_attempts where created_at < now() - interval '30 days';
  delete from public.bookish_auth_code_failures where created_at <= clock_timestamp() - interval '24 hours';
  if (select count(*) from bookish_private.auth_attempts
    where ip_hash = p_ip and created_at > now() - interval '1 hour') >= 100 then
    return false;
  end if;
  if p_action in ('start','start_short') and (
    (select count(*) from bookish_private.auth_attempts where email_hash = p_email
      and action in ('start','start_short') and created_at > now() - interval '1 hour') >= 5
    or (select count(*) from bookish_private.auth_attempts where ip_hash = p_ip
      and action in ('start','start_short') and created_at > now() - interval '1 hour') >= 15
  ) then return false; end if;
  if p_action = 'start_short' and (
    (select count(*) from public.bookish_auth_code_failures where email_hash = p_email
      and created_at > clock_timestamp() - interval '24 hours') >= 10
    or (select count(*) from bookish_private.auth_attempts where email_hash = p_email
      and action = 'start_short' and created_at > now() - interval '1 hour') >= 3
    or (select count(*) from bookish_private.auth_attempts where email_hash = p_email
      and action = 'start_short' and created_at > now() - interval '24 hours') >= 10
  ) then return false; end if;
  if p_action in ('verify','password') and (
    select count(*) from bookish_private.auth_attempts where email_hash = p_email
      and action in ('verify','password') and created_at > now() - interval '1 hour'
  ) >= 10 then return false; end if;
  insert into bookish_private.auth_attempts(email_hash,ip_hash,action) values(p_email,p_ip,p_action);
  return true;
end $$;
revoke all on function public.bookish_auth_throttle(text, text, text) from public, anon, authenticated;
grant execute on function public.bookish_auth_throttle(text, text, text) to service_role;

-- Recheck under the same per-email lock used by finish, so a start admitted
-- before the tenth failure cannot replace the code after lockout takes effect.
create or replace function public.bookish_auth_code_put(
  p_email_hash text, p_salt text, p_code_hash text, p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_email_hash,43));
  if (select count(*) from public.bookish_auth_code_failures where email_hash = p_email_hash
    and created_at > clock_timestamp() - interval '24 hours') >= 10 then return false; end if;
  insert into public.bookish_auth_codes(email_hash,salt,code_hash,expires_at,attempts)
    values(p_email_hash,p_salt,p_code_hash,p_expires_at,0)
    on conflict(email_hash) do update set salt=excluded.salt,code_hash=excluded.code_hash,
      expires_at=excluded.expires_at,attempts=0;
  return true;
end $$;
revoke all on function public.bookish_auth_code_put(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.bookish_auth_code_put(text, text, text, timestamptz) to service_role;

-- The handler compares hashes in constant time. Recheck the same code under a
-- row lock before consuming it or charging a failure, including stale reads.
create or replace function public.bookish_auth_code_finish(
  p_email_hash text, p_salt text, p_matched boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare stored public.bookish_auth_codes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_email_hash,43));
  select * into stored from public.bookish_auth_codes
    where email_hash = p_email_hash for update;
  if not found or stored.salt <> p_salt or p_salt is null or p_matched is null
    or stored.expires_at <= clock_timestamp() or stored.attempts >= 5 then
    return false;
  end if;
  if (select count(*) from public.bookish_auth_code_failures where email_hash = p_email_hash
    and created_at > clock_timestamp() - interval '24 hours') >= 10 then return false; end if;
  if p_matched is true then
    delete from public.bookish_auth_codes where email_hash = p_email_hash;
    return true;
  end if;
  if p_matched is false then
    update public.bookish_auth_codes set attempts = attempts + 1
      where email_hash = p_email_hash;
    insert into public.bookish_auth_code_failures(email_hash) values(p_email_hash);
  end if;
  return false;
end $$;
revoke all on function public.bookish_auth_code_finish(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.bookish_auth_code_finish(text, text, boolean)
  to service_role;

commit;
