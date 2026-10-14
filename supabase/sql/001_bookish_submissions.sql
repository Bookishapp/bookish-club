-- Bookish Club: host funnel submissions (claim / start / waitlist).
-- Run as raw SQL (NOT via `supabase db push`) so it never enters the shared
-- project's migration history. Idempotent.
create table if not exists public.bookish_submissions (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('claim','start','waitlist')),
  email         text not null check (length(email) between 5 and 254),
  club_ref      text,                      -- directory club id for claims
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending','confirmed','spam')),
  confirm_token uuid not null default gen_random_uuid(),
  confirmed_at  timestamptz,
  email_sent_at timestamptz,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists bookish_submissions_ip_created_idx on public.bookish_submissions (ip_hash, created_at desc);
create index if not exists bookish_submissions_email_idx on public.bookish_submissions (lower(email), kind, created_at desc);
create unique index if not exists bookish_submissions_token_idx on public.bookish_submissions (confirm_token);

alter table public.bookish_submissions enable row level security;
-- No policies on purpose: anon/authenticated get nothing. Only the
-- service role (used inside the bookish-submit / bookish-confirm edge
-- functions) can read or write.
revoke all on public.bookish_submissions from anon, authenticated;
