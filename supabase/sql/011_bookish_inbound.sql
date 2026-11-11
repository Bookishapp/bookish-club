-- REVIEW ONLY. This file has not been applied to a hosted database.
-- Apply only after supabase/packets/apply-20.sql in the dedicated Bookish project.
-- Confirm the Dashboard target, then prefix EVERY execution/session with:
-- set bookish.target_ref='tkrsrnlasinmlftkcufi';
-- The setting is an operator confirmation, not independent project detection.
begin;
do $guard$ begin
 if current_setting('bookish.target_ref',true) is distinct from 'tkrsrnlasinmlftkcufi' then
  raise exception 'Confirm the Bookish dedicated project tkrsrnlasinmlftkcufi and set bookish.target_ref first.';
 end if;
 if to_regclass('auth.users') is null or to_regclass('auth.identities') is null then
  raise exception 'Expected Supabase Auth schema is missing.';
 end if;
 if to_regclass('bookish_release_20261101.state') is null then
  raise exception 'Apply supabase/packets/apply-20.sql and all earlier Bookish chunks first.';
 end if;
 if not exists(select 1 from bookish_release_20261101.state where version='dedicated-chunk-20') then
  raise exception 'Apply supabase/packets/apply-20.sql and all earlier Bookish chunks first.';
 end if;
end $guard$;

-- Keep sent markers indefinitely. Deleting them would permit duplicate forwards.
-- The sending request must use a stable Resend Idempotency-Key for this email_id.
create table if not exists bookish_private.inbound_emails(
 email_id uuid primary key,
 first_attempt_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz
);
alter table bookish_private.inbound_emails enable row level security;
revoke all on bookish_private.inbound_emails from public,anon,authenticated,service_role;

create or replace function public.bookish_inbound_status(p_email_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare attempt bookish_private.inbound_emails;
begin
 if p_email_id is null then raise exception 'An inbound email identifier is required.' using errcode='22023';end if;
 select * into attempt from bookish_private.inbound_emails where email_id=p_email_id;
 if not found then return 'new';end if;
 if attempt.sent_at is not null then return 'done';end if;
 if attempt.first_attempt_at<=clock_timestamp()-interval '23 hours' then return 'expired';end if;
 return 'send';
end $$;

create or replace function public.bookish_inbound_begin(p_email_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare attempt bookish_private.inbound_emails;
begin
 if p_email_id is null then raise exception 'An inbound email identifier is required.' using errcode='22023';end if;
 insert into bookish_private.inbound_emails(email_id) values(p_email_id) on conflict(email_id) do nothing;
 select * into attempt from bookish_private.inbound_emails where email_id=p_email_id;
 if attempt.sent_at is not null then return 'done';end if;
 -- Stop ambiguous retries before Resend's 24-hour idempotency window ends.
 if attempt.first_attempt_at<=clock_timestamp()-interval '23 hours' then return 'expired';end if;
 return 'send';
end $$;

create or replace function public.bookish_inbound_complete(p_email_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update bookish_private.inbound_emails set sent_at=coalesce(sent_at,clock_timestamp()) where email_id=p_email_id;
 if not found then raise exception 'Inbound email attempt is missing.' using errcode='22023';end if;
end $$;
revoke all on function public.bookish_inbound_status(uuid),public.bookish_inbound_begin(uuid),public.bookish_inbound_complete(uuid) from public,anon,authenticated,service_role;
grant execute on function public.bookish_inbound_status(uuid),public.bookish_inbound_begin(uuid),public.bookish_inbound_complete(uuid) to service_role;

-- Preserve the chunk 20 allowlist and add only the inbound configuration names.
create or replace function public.bookish_get_secret(p_name text) returns text
language plpgsql stable security definer set search_path='' as $secret$
declare value text;
begin
 if p_name is null or p_name not in (
  'BOOKISH_SITE_URL','BOOKISH_EMAIL_FROM','RESEND_API_KEY',
  'BOOKISH_APPLE_CLIENT_ID','BOOKISH_APPLE_TEAM_ID','BOOKISH_APPLE_KEY_ID',
  'BOOKISH_APPLE_PRIVATE_KEY','BOOKISH_TERMS_URL','BOOKISH_PRIVACY_URL',
  'BOOKISH_MODERATION_EMAIL','BOOKISH_REPORT_WORKER_KEY',
  'RESEND_INBOUND_WEBHOOK_SECRET','BOOKISH_INBOX_FORWARD_TO'
 ) then raise exception 'Bookish secret name is not allowed.' using errcode='22023';end if;
 select s.decrypted_secret into value from vault.decrypted_secrets s where s.name=p_name;
 return value;
end $secret$;
revoke all on function public.bookish_get_secret(text) from public,anon,authenticated,service_role;
grant execute on function public.bookish_get_secret(text) to service_role;
comment on function public.bookish_get_secret(text) is 'Bookish edge configuration only. Service role execution, exact allowlist, null when missing. Never log returned values.';
commit;
