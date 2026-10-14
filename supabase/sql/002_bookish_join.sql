-- Bookish: "Request to join" a club + invite codes. Raw SQL, idempotent,
-- kept out of the shared project's migration history (see README).
create table if not exists public.bookish_join_requests (
  id              uuid primary key default gen_random_uuid(),
  club_ref        text not null check (length(club_ref) between 3 and 80),
  club_name       text,
  email           text not null check (length(email) between 5 and 254),
  first_name      text,
  note            text check (length(note) <= 500),
  via             text not null default 'request' check (via in ('request','invite')),
  status          text not null default 'pending' check (status in ('pending','approved','declined','spam')),
  host_notified   boolean not null default false,
  decision_token  uuid not null default gen_random_uuid(),
  decided_at      timestamptz,
  ip_hash         text,
  created_at      timestamptz not null default now()
);
create index if not exists bookish_join_ip_idx on public.bookish_join_requests (ip_hash, created_at desc);
create index if not exists bookish_join_email_idx on public.bookish_join_requests (lower(email), created_at desc);
create index if not exists bookish_join_club_idx on public.bookish_join_requests (club_ref, status);
create unique index if not exists bookish_join_token_idx on public.bookish_join_requests (decision_token);

-- Invite codes a host shares (link or code). Issued by host tools later;
-- a valid code lets the reader join without a request.
create table if not exists public.bookish_invites (
  code        text primary key check (code ~ '^[A-Z0-9]{6,12}$'),
  club_ref    text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    int,
  uses        int not null default 0
);

alter table public.bookish_join_requests enable row level security;
alter table public.bookish_invites enable row level security;
revoke all on public.bookish_join_requests from anon, authenticated;
revoke all on public.bookish_invites from anon, authenticated;
