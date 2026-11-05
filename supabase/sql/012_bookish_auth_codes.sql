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

-- The handler compares hashes in constant time. Recheck the same code under a
-- row lock before consuming it or charging a failure, including stale reads.
create or replace function public.bookish_auth_code_finish(
  p_email_hash text, p_salt text, p_matched boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare stored public.bookish_auth_codes%rowtype;
begin
  select * into stored from public.bookish_auth_codes
    where email_hash = p_email_hash for update;
  if not found or stored.salt <> p_salt or p_salt is null
    or stored.expires_at <= clock_timestamp() or stored.attempts >= 5 then
    return false;
  end if;
  if p_matched is true then
    delete from public.bookish_auth_codes where email_hash = p_email_hash;
    return true;
  end if;
  update public.bookish_auth_codes set attempts = attempts + 1
    where email_hash = p_email_hash;
  return false;
end $$;
revoke all on function public.bookish_auth_code_finish(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.bookish_auth_code_finish(text, text, boolean)
  to service_role;

commit;
