-- REVIEW PACKET ONLY. No hosted deployment has occurred.
-- Dedicated Bookish project: tkrsrnlasinmlftkcufi. Do not run against any other project.
-- Confirm the Dashboard target, then prefix EVERY execution/session with:
-- set bookish.target_ref='tkrsrnlasinmlftkcufi';
-- The setting is an operator confirmation, not independent project detection.
-- Run all chunks in order while Bookish intake is paused. Retain normal backups.
-- Chunk 1/19. Reapplying preserves live rows.
begin;
do $guard$ begin
 if current_setting('bookish.target_ref',true) is distinct from 'tkrsrnlasinmlftkcufi' then
  raise exception 'Confirm the Bookish dedicated project tkrsrnlasinmlftkcufi and set bookish.target_ref first.';
 end if;
 if to_regclass('auth.users') is null or to_regclass('auth.identities') is null then
  raise exception 'Expected Supabase Auth schema is missing.';
 end if;
end $guard$;
create schema if not exists bookish_release_20261101;
revoke all on schema bookish_release_20261101 from public,anon,authenticated,service_role;
create table if not exists bookish_release_20261101.state(version text primary key,applied_at timestamptz);
alter table bookish_release_20261101.state enable row level security;
revoke all on all tables in schema bookish_release_20261101 from public,anon,authenticated,service_role;
-- SOURCE: supabase/sql/001_bookish_submissions.sql
-- Bookish Club: host funnel submissions (claim / start / waitlist).
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

-- SOURCE: supabase/sql/002_bookish_join.sql
-- Bookish: "Request to join" a club + invite codes. Raw SQL, idempotent,
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

-- SOURCE: supabase/sql/003_bookish_read_next.sql
-- Bookish: "Stuck on what to read next?" (book suggestions). Raw SQL, idempotent,
--
-- Reading data (books, club reads, pours = wine-glass ratings, cold-start taste)
-- plus the community aggregates the site reads. Nothing here is readable by
-- anon/authenticated: the bookish-community edge function reads the aggregate
-- views with the service role, and the views only ever return rows that pass
-- the privacy floor below.

-- ---------------------------------------------------------------------------
-- PRIVACY FLOOR: the ONE place the community threshold lives.
-- A community stat ("clubs near you loved this", "N clubs went here next") is
-- shown or used only when at least this many distinct clubs are behind it.
-- Sebastian 10-15: 3 for launch. TODO: raise to 5 once there are enough active
-- clubs (the original spec's k=5); every view below reads this function.
create or replace function public.bookish_privacy_floor() returns int
  language sql immutable parallel safe as $$ select 3 $$;
comment on function public.bookish_privacy_floor() is
  'Min distinct clubs behind any community stat. 3 at launch; raise to 5 later (Sebastian 10-15).';

-- ---------------------------------------------------------------------------
-- Catalog (Open Library metadata + Bookish mood tags). Mirrors data/books.json.
create table if not exists public.bookish_books (
  id          text primary key,                       -- slug, same id as data/books.json
  ol_work_id  text unique,
  title       text not null,
  authors     text[] not null,
  pages       int,
  first_year  int,
  cover_id    bigint,                                 -- Open Library cover id (covers.openlibrary.org/b/id/<id>-M.jpg)
  moods       text[] not null default '{}',
  series_key  text,
  series_pos  int,
  cover_style jsonb,                                  -- {cb, ci, m} for the typographic fallback cover
  created_at  timestamptz not null default now()
);

-- App clubs (a verified directory club links to its club_ref).
create table if not exists public.bookish_clubs (
  id         uuid primary key default gen_random_uuid(),
  club_ref   text,
  name       text not null,
  city       text,
  state      text,
  created_at timestamptz not null default now()
);
create table if not exists public.bookish_members (
  club_id   uuid not null references public.bookish_clubs(id) on delete cascade,
  user_id   uuid not null,
  role      text not null default 'member' check (role in ('host','cohost','member')),
  ratings_public boolean not null default true,       -- Privacy: off = left out of community aggregates
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create table if not exists public.bookish_club_books (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.bookish_clubs(id) on delete cascade,
  book_id     text not null references public.bookish_books(id),
  status      text not null check (status in ('reading','finished','dropped')),
  started_at  date,
  finished_at date,
  source      text check (source in ('vote','host','suggested')),
  unique (club_id, book_id)
);
-- Pours = wine-glass ratings, one per user per book (club_id null = personal read).
create table if not exists public.bookish_pours (
  user_id    uuid not null,
  book_id    text not null references public.bookish_books(id),
  club_id    uuid references public.bookish_clubs(id) on delete cascade,
  glasses    numeric(2,1) not null check (glasses between 0 and 5 and glasses * 2 = floor(glasses * 2)),
  dnf        boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
-- Cold start (the three taps).
create table if not exists public.bookish_taste (
  user_id       uuid primary key,
  moods         text[] not null default '{}',
  length        text check (length in ('short','mid','long','any')),
  loved_book_id text references public.bookish_books(id),
  updated_at    timestamptz not null default now()
);
-- Tuning (ids only, no content).
create table if not exists public.bookish_suggest_events (
  user_id uuid, club_id uuid, book_id text, slot text,
  event   text not null check (event in ('shown','added','voted','won')),
  at      timestamptz not null default now()
);
create index if not exists bookish_club_books_club_idx on public.bookish_club_books (club_id, status, finished_at);
create index if not exists bookish_pours_book_idx on public.bookish_pours (book_id);

-- ---------------------------------------------------------------------------
-- Community aggregates. Only ACTIVE clubs count: 2+ members and 1+ finished
-- book. Directory-only clubs have no reading data and never appear here.
create or replace view public.bookish_active_clubs as
  select c.id, c.city, c.state
  from public.bookish_clubs c
  where (select count(*) from public.bookish_members m where m.club_id = c.id) >= 2
    and exists (select 1 from public.bookish_club_books b where b.club_id = c.id and b.status = 'finished');

-- Per book: clubs that read it, mean pour (members with ratings_public only), finish rate.
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
         round(avg(p.glasses), 1) as mean_pour,
         count(distinct p.club_id)::int as pour_clubs,
         round(count(distinct r.club_id) filter (where r.status = 'finished')::numeric / count(distinct r.club_id), 2) as finish_rate
  from reads r left join pours p on p.book_id = r.book_id
  group by r.book_id
  having count(distinct r.club_id) >= public.bookish_privacy_floor();

-- "Clubs in <city> loved": finished in the last 90 days, mean pour from that city's clubs.
create or replace view public.bookish_city_book as
  select a.city, a.state, cb.book_id,
         count(distinct cb.club_id)::int as clubs,
         round(avg(p.glasses) filter (where m.ratings_public and not p.dnf), 1) as mean_pour
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
         round(avg(p.glasses) filter (where m.ratings_public and not p.dnf), 1) as mean_pour
  from public.bookish_club_books cb
  join public.bookish_active_clubs a on a.id = cb.club_id
  left join public.bookish_pours p on p.club_id = cb.club_id and p.book_id = cb.book_id
  left join public.bookish_members m on m.club_id = p.club_id and m.user_id = p.user_id
  where cb.status = 'finished' and cb.finished_at >= current_date - 90 and a.state is not null
  group by a.state, cb.book_id
  having count(distinct cb.club_id) >= public.bookish_privacy_floor();

-- "After <book>, clubs read": distinct clubs whose next finished book after
-- from_book was to_book.
create or replace view public.bookish_book_next as
  with seq as (
    select cb.club_id, cb.book_id,
           lead(cb.book_id) over (partition by cb.club_id order by cb.finished_at, cb.id) as next_book
    from public.bookish_club_books cb
    join public.bookish_active_clubs a on a.id = cb.club_id
    where cb.status = 'finished' and cb.finished_at is not null
  )
  select book_id as from_book, next_book as to_book, count(distinct club_id)::int as clubs
  from seq where next_book is not null
  group by book_id, next_book
  having count(distinct club_id) >= public.bookish_privacy_floor();

-- ---------------------------------------------------------------------------
-- Lock everything down: service role only.
do $$ declare t text; begin
  foreach t in array array['bookish_books','bookish_clubs','bookish_members','bookish_club_books','bookish_pours','bookish_taste','bookish_suggest_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['bookish_active_clubs','bookish_book_stats','bookish_city_book','bookish_state_book','bookish_book_next'] loop
    execute format('revoke all on public.%I from anon, authenticated, public', t);
  end loop;
end $$;
revoke all on function public.bookish_privacy_floor() from public, anon, authenticated;

-- SOURCE: supabase/sql/004_bookish_books_seed.sql
-- Generated by scripts/catalog.mjs from data/books.json. Re-run that script, then this file.
insert into public.bookish_books (id, ol_work_id, title, authors, pages, first_year, cover_id, moods, series_key, series_pos, cover_style) values
('fourth-wing', 'OL29226517W', 'Fourth Wing', array['Rebecca Yarros']::text[], 518, 2023, 14407898, array['big_fantasy','slow_burn']::text[], 'empyrean', 1, '{"cb":"#1d1712","ci":"#ecb74e","m":"sun"}'::jsonb),
('iron-flame', 'OL34028551W', 'Iron Flame', array['Rebecca Yarros']::text[], 640, 2023, 14405746, array['big_fantasy','slow_burn']::text[], 'empyrean', 2, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"sun"}'::jsonb),
('onyx-storm', 'OL41943074W', 'Onyx Storm', array['Rebecca Yarros']::text[], 544, 2025, 14826089, array['big_fantasy','fight']::text[], 'empyrean', 3, '{"cb":"#1d1712","ci":"#ecb74e","m":"key"}'::jsonb),
('yellowface', 'OL29050559W', 'Yellowface', array['R. F. Kuang']::text[], 352, 2023, 13195421, array['fight']::text[], null, null, '{"cb":"#ecb74e","ci":"#1d1712","m":"band"}'::jsonb),
('babel', 'OL26443093W', 'Babel', array['R. F. Kuang']::text[], 577, 2022, 12468631, array['big_fantasy','fight']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"band"}'::jsonb),
('the-god-of-the-woods', 'OL37827517W', 'The God of the Woods', array['Liz Moore']::text[], 438, 2024, 14645734, array['mystery']::text[], null, null, '{"cb":"#c9dcc0","ci":"#17443a","m":"frame"}'::jsonb),
('the-housemaid', 'OL27729743W', 'The Housemaid', array['Freida McFadden']::text[], 336, 2022, 15105883, array['mystery','fight']::text[], null, null, '{"cb":"#efe2c6","ci":"#7a1a2a","m":"key"}'::jsonb),
('funny-story', 'OL37575890W', 'Funny Story', array['Emily Henry']::text[], 400, 2024, 14625690, array['slow_burn']::text[], null, null, '{"cb":"#e6a2ac","ci":"#33101a","m":"band"}'::jsonb),
('book-lovers', 'OL24801992W', 'Book Lovers', array['Emily Henry']::text[], 408, 2022, 11567819, array['slow_burn']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"key"}'::jsonb),
('beach-read', 'OL20734329W', 'Beach Read', array['Emily Henry']::text[], 376, 2020, 9426296, array['slow_burn','cry']::text[], null, null, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"key"}'::jsonb),
('james', 'OL36506504W', 'James', array['Percival Everett']::text[], 320, 2024, 15094964, array['fight','cry']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"frame"}'::jsonb),
('remarkably-bright-creatures', 'OL25382083W', 'Remarkably Bright Creatures', array['Shelby Van Pelt']::text[], 368, 2022, 12019989, array['cry']::text[], null, null, '{"cb":"#22325a","ci":"#f3e6cf","m":"sun"}'::jsonb),
('lessons-in-chemistry', 'OL25344431W', 'Lessons in Chemistry', array['Bonnie Garmus']::text[], 464, 2022, 12725772, array['fight']::text[], null, null, '{"cb":"#a9c487","ci":"#1d1712","m":"band"}'::jsonb),
('tomorrow-and-tomorrow-and-tomorrow', 'OL26004554W', 'Tomorrow, and Tomorrow, and Tomorrow', array['Gabrielle Zevin']::text[], 460, 2022, 12859975, array['cry','slow_burn']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"key"}'::jsonb),
('the-seven-husbands-of-evelyn-hugo', 'OL18203673W', 'The Seven Husbands of Evelyn Hugo', array['Taylor Jenkins Reid']::text[], 400, 2017, 8354226, array['cry','fight']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"frame"}'::jsonb),
('daisy-jones-and-the-six', 'OL19922194W', 'Daisy Jones & The Six', array['Taylor Jenkins Reid']::text[], 400, 2019, 8742674, array['fight']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"key"}'::jsonb),
('a-court-of-thorns-and-roses', 'OL17352669W', 'A Court of Thorns and Roses', array['Sarah J. Maas']::text[], 454, 2013, 15254465, array['big_fantasy','slow_burn']::text[], 'acotar', 1, '{"cb":"#d97a52","ci":"#1d1712","m":"band"}'::jsonb),
('a-court-of-mist-and-fury', 'OL17860744W', 'A Court of Mist and Fury', array['Sarah J. Maas']::text[], 626, 2014, 14315081, array['big_fantasy','slow_burn']::text[], 'acotar', 2, '{"cb":"#e6a2ac","ci":"#33101a","m":"key"}'::jsonb),
('the-silent-patient', 'OL19096402W', 'The Silent Patient', array['Alex Michaelides']::text[], 352, 2018, 9407338, array['mystery','fight']::text[], null, null, '{"cb":"#ecb74e","ci":"#1d1712","m":"sun"}'::jsonb),
('gone-girl', 'OL16239762W', 'Gone Girl', array['Gillian Flynn']::text[], 475, 2011, 8368314, array['mystery','fight']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"band"}'::jsonb),
('where-the-crawdads-sing', 'OL18766691W', 'Where the Crawdads Sing', array['Delia Owens']::text[], 416, 2018, 8362947, array['mystery','cry']::text[], null, null, '{"cb":"#1d1712","ci":"#ecb74e","m":"key"}'::jsonb),
('the-thursday-murder-club', 'OL20878311W', 'The Thursday Murder Club', array['Richard Osman']::text[], 449, 2020, 10201431, array['mystery']::text[], 'thursday-murder-club', 1, '{"cb":"#1d1712","ci":"#ecb74e","m":"band"}'::jsonb),
('the-man-who-died-twice', 'OL24662687W', 'The Man Who Died Twice', array['Richard Osman']::text[], 480, 2019, 11358314, array['mystery']::text[], 'thursday-murder-club', 2, '{"cb":"#e6a2ac","ci":"#33101a","m":"band"}'::jsonb),
('the-love-hypothesis', 'OL24178205W', 'The Love Hypothesis', array['Ali Hazelwood']::text[], 398, 2021, 10601402, array['slow_burn']::text[], null, null, '{"cb":"#a9c487","ci":"#1d1712","m":"key"}'::jsonb),
('normal-people', 'OL20150260W', 'Normal People', array['Sally Rooney']::text[], 304, 2018, 8794265, array['slow_burn','cry','fight']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"band"}'::jsonb),
('intermezzo', 'OL37949460W', 'Intermezzo', array['Sally Rooney']::text[], 454, 2024, 14836043, array['fight','cry']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"frame"}'::jsonb),
('pride-and-prejudice', 'OL66554W', 'Pride and Prejudice', array['Jane Austen']::text[], 351, 1813, 14348537, array['slow_burn']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"key"}'::jsonb),
('jane-eyre', 'OL1095427W', 'Jane Eyre', array['Charlotte Brontë']::text[], 480, 1847, 8235363, array['slow_burn','mystery']::text[], null, null, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"key"}'::jsonb),
('rebecca', 'OL36633W', 'Rebecca', array['Daphne du Maurier']::text[], 386, 1938, 8238729, array['mystery','slow_burn']::text[], null, null, '{"cb":"#22325a","ci":"#f3e6cf","m":"band"}'::jsonb),
('a-little-life', 'OL17370186W', 'A Little Life', array['Hanya Yanagihara']::text[], 800, 2008, 12065783, array['cry','fight']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"band"}'::jsonb),
('the-kite-runner', 'OL5781992W', 'The Kite Runner', array['Khaled Hosseini']::text[], 371, 2003, 14846827, array['cry']::text[], null, null, '{"cb":"#1d1712","ci":"#ecb74e","m":"key"}'::jsonb),
('klara-and-the-sun', 'OL20883297W', 'Klara and the Sun', array['Kazuo Ishiguro']::text[], 334, 2019, 10648686, array['cry']::text[], null, null, '{"cb":"#efe2c6","ci":"#7a1a2a","m":"frame"}'::jsonb),
('never-let-me-go', 'OL59038W', 'Never Let Me Go', array['Kazuo Ishiguro']::text[], 319, 2005, 1047334, array['cry','mystery']::text[], null, null, '{"cb":"#e6a2ac","ci":"#33101a","m":"band"}'::jsonb),
('the-midnight-library', 'OL20965973W', 'The Midnight Library', array['Matt Haig']::text[], 304, 2020, 10313767, array['cry']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"sun"}'::jsonb),
('circe', 'OL18012166W', 'Circe', array['Madeline Miller']::text[], 404, 2018, 8739376, array['big_fantasy','cry']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"key"}'::jsonb),
('the-song-of-achilles', 'OL16509148W', 'The Song of Achilles', array['Madeline Miller']::text[], 386, 2011, 7098465, array['cry','slow_burn']::text[], null, null, '{"cb":"#c9dcc0","ci":"#17443a","m":"key"}'::jsonb),
('the-night-circus', 'OL16086747W', 'The Night Circus', array['Erin Morgenstern']::text[], 512, 2011, 8773134, array['slow_burn','big_fantasy']::text[], null, null, '{"cb":"#e6a2ac","ci":"#33101a","m":"key"}'::jsonb),
('the-name-of-the-wind', 'OL8479867W', 'The Name of the Wind', array['Patrick Rothfuss']::text[], 736, 2007, 11480483, array['big_fantasy']::text[], null, null, '{"cb":"#d97a52","ci":"#1d1712","m":"band"}'::jsonb),
('mistborn-the-final-empire', null, 'Mistborn: The Final Empire', array['Brandon Sanderson']::text[], 541, null, null, array['big_fantasy']::text[], null, null, '{"cb":"#22325a","ci":"#f3e6cf","m":"frame"}'::jsonb),
('tress-of-the-emerald-sea', 'OL28687656W', 'Tress of the Emerald Sea', array['Brandon Sanderson']::text[], 486, 2023, 13143232, array['big_fantasy']::text[], null, null, '{"cb":"#1d1712","ci":"#ecb74e","m":"band"}'::jsonb),
('the-priory-of-the-orange-tree', 'OL20157354W', 'The Priory of the Orange Tree', array['Samantha Shannon']::text[], 848, 2018, 8802446, array['big_fantasy']::text[], null, null, '{"cb":"#efe2c6","ci":"#7a1a2a","m":"band"}'::jsonb),
('the-invisible-life-of-addie-larue', 'OL20796936W', 'The Invisible Life of Addie LaRue', array['V. E. Schwab']::text[], 504, 2015, 10092261, array['slow_burn','cry']::text[], null, null, '{"cb":"#c9dcc0","ci":"#17443a","m":"key"}'::jsonb),
('project-hail-mary', 'OL21745884W', 'Project Hail Mary', array['Andy Weir']::text[], 496, 2021, 11200092, array['cry']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"band"}'::jsonb),
('big-little-lies', 'OL17116911W', 'Big Little Lies', array['Liane Moriarty']::text[], 512, 2014, 7352410, array['mystery','fight']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"sun"}'::jsonb),
('and-then-there-were-none', 'OL471565W', 'And Then There Were None', array['Agatha Christie']::text[], 222, 1939, 11172296, array['mystery','short']::text[], null, null, '{"cb":"#e6a2ac","ci":"#33101a","m":"key"}'::jsonb),
('the-guest-list', null, 'The Guest List', array['Lucy Foley']::text[], 320, null, null, array['mystery']::text[], null, null, '{"cb":"#a9c487","ci":"#1d1712","m":"key"}'::jsonb),
('mexican-gothic', 'OL20759125W', 'Mexican Gothic', array['Silvia Moreno-Garcia']::text[], 352, 2020, 10239163, array['mystery']::text[], null, null, '{"cb":"#22325a","ci":"#f3e6cf","m":"key"}'::jsonb),
('piranesi', 'OL20893680W', 'Piranesi', array['Susanna Clarke']::text[], 272, 2020, 10226290, array['mystery','short']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"band"}'::jsonb),
('verity', 'OL20068530W', 'Verity', array['Colleen Hoover']::text[], 340, 2018, 8747160, array['fight','mystery']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"sun"}'::jsonb),
('it-ends-with-us', 'OL18020194W', 'It Ends with Us', array['Colleen Hoover']::text[], 384, 2012, 10473609, array['fight','cry']::text[], null, null, '{"cb":"#22325a","ci":"#f3e6cf","m":"key"}'::jsonb),
('educated', 'OL18139176W', 'Educated', array['Tara Westover']::text[], 384, 2018, 8314077, array['fight','cry']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"sun"}'::jsonb),
('demon-copperhead', 'OL27052926W', 'Demon Copperhead', array['Barbara Kingsolver']::text[], 560, 2022, 13141227, array['cry','fight']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"band"}'::jsonb),
('small-things-like-these', 'OL23020966W', 'Small Things Like These', array['Claire Keegan']::text[], 112, 2020, 10507091, array['cry','short']::text[], null, null, '{"cb":"#e6a2ac","ci":"#33101a","m":"key"}'::jsonb),
('convenience-store-woman', 'OL19744024W', 'Convenience Store Woman', array['Sayaka Murata']::text[], 163, 2018, 9315164, array['fight','short']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"key"}'::jsonb),
('the-vegetarian', null, 'The Vegetarian', array['Han Kang']::text[], 188, null, null, array['fight','short']::text[], null, null, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"key"}'::jsonb),
('before-the-coffee-gets-cold', 'OL20832477W', 'Before the Coffee Gets Cold', array['Toshikazu Kawaguchi']::text[], 272, null, 10138333, array['cry','short']::text[], null, null, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"band"}'::jsonb),
('the-house-in-the-cerulean-sea', 'OL20656224W', 'The House in the Cerulean Sea', array['TJ Klune']::text[], 424, 2019, 9312772, array['slow_burn']::text[], null, null, '{"cb":"#e6a2ac","ci":"#33101a","m":"key"}'::jsonb),
('legends-and-lattes', 'OL27591348W', 'Legends & Lattes', array['Travis Baldree']::text[], 316, 2022, 13028635, array['slow_burn']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"band"}'::jsonb),
('the-women', 'OL37247638W', 'The Women', array['Kristin Hannah']::text[], 480, 2024, 14631595, array['cry']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"key"}'::jsonb),
('the-nightingale', 'OL17116910W', 'The Nightingale', array['Kristin Hannah']::text[], 560, 2000, 8314147, array['cry']::text[], null, null, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"frame"}'::jsonb),
('hello-beautiful', 'OL28723763W', 'Hello Beautiful', array['Ann Napolitano']::text[], 416, 2023, 14359793, array['cry']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"frame"}'::jsonb),
('the-covenant-of-water', 'OL29192912W', 'The Covenant of Water', array['Abraham Verghese']::text[], 724, 2023, 13190092, array['cry']::text[], null, null, '{"cb":"#7a1a2a","ci":"#f3e6cf","m":"key"}'::jsonb),
('crying-in-h-mart', 'OL22448002W', 'Crying in H Mart', array['Michelle Zauner']::text[], 256, 2020, 10462708, array['cry','short']::text[], null, null, '{"cb":"#c4485a","ci":"#fdfaf2","m":"key"}'::jsonb),
('killers-of-the-flower-moon', 'OL17778665W', 'Killers of the Flower Moon', array['David Grann']::text[], 350, 2017, 8055064, array['mystery','fight']::text[], null, null, '{"cb":"#1d5a46","ci":"#ecb74e","m":"frame"}'::jsonb),
('the-wedding-people', 'OL37618227W', 'The Wedding People', array['Alison Espach']::text[], 384, 2024, 15127690, array['fight']::text[], null, null, '{"cb":"#c9dcc0","ci":"#17443a","m":"key"}'::jsonb),
('sandwich', 'OL37572696W', 'Sandwich', array['Catherine Newman']::text[], 256, 2024, 14749853, array['cry','short']::text[], null, null, '{"cb":"#1d1712","ci":"#ecb74e","m":"band"}'::jsonb)
on conflict (id) do update set ol_work_id = excluded.ol_work_id, title = excluded.title, authors = excluded.authors, pages = excluded.pages,
  first_year = excluded.first_year, cover_id = excluded.cover_id, moods = excluded.moods, series_key = excluded.series_key,
  series_pos = excluded.series_pos, cover_style = excluded.cover_style;

-- SOURCE: supabase/sql/005_bookish_accounts_clubs.sql
-- No provider settings or production data are changed by creating this file.

create schema if not exists bookish_private;
revoke all on schema bookish_private from public, anon, authenticated, service_role;
grant usage on schema bookish_private to authenticated, service_role;

create table if not exists public.bookish_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Reader' check (length(trim(display_name)) between 2 and 50),
  home_city text check (length(home_city)<=80),
  terms_version text,
  terms_accepted_at timestamptz,
  adult_confirmed boolean not null default false,
  banned_at timestamptz,
  created_at timestamptz not null default now()
);
grant select,insert,update,delete on table public.bookish_profiles to service_role;
alter table public.bookish_profiles enable row level security;
revoke all on table public.bookish_profiles from public,anon,authenticated;
alter table public.bookish_submissions add column if not exists user_id uuid references public.bookish_profiles(id) on delete cascade;
create or replace function bookish_private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.raw_app_meta_data->>'app' is distinct from 'bookish' then return new; end if;
  insert into public.bookish_profiles(id) values(new.id) on conflict do nothing;
  if new.email_confirmed_at is not null then
    update public.bookish_submissions set user_id=new.id where lower(email)=lower(new.email) and user_id is null;
  end if;
  return new;
exception when others then
  raise log 'Bookish profile trigger skipped auth user %: %', new.id, sqlerrm;
  return new;
end $$;
create or replace trigger bookish_new_profile after insert on auth.users for each row execute function bookish_private.new_profile();
create or replace function bookish_private.link_submission_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select u.id into new.user_id from auth.users u where lower(u.email)=lower(new.email) and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish' and exists(select 1 from public.bookish_profiles p where p.id=u.id) limit 1;
 return new;
end $$;
create or replace trigger bookish_link_submission_user before insert on public.bookish_submissions for each row execute function bookish_private.link_submission_user();

do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_member_profile_fk' and conrelid='public.bookish_members'::regclass) then
 alter table public.bookish_members add constraint bookish_member_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
alter table public.bookish_members add column if not exists race_visible boolean not null default true;
alter table public.bookish_members add column if not exists spoiler_shield boolean not null default true;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_pour_profile_fk' and conrelid='public.bookish_pours'::regclass) then
 alter table public.bookish_pours add constraint bookish_pour_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_taste_profile_fk' and conrelid='public.bookish_taste'::regclass) then
 alter table public.bookish_taste add constraint bookish_taste_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_event_profile_fk' and conrelid='public.bookish_suggest_events'::regclass) then
 alter table public.bookish_suggest_events add constraint bookish_event_profile_fk foreign key(user_id) references public.bookish_profiles(id) on delete cascade;
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_event_club_fk' and conrelid='public.bookish_suggest_events'::regclass) then
 alter table public.bookish_suggest_events add constraint bookish_event_club_fk foreign key(club_id) references public.bookish_clubs(id) on delete cascade;
 end if; end $guard$;
create unique index if not exists bookish_club_ref_unique on public.bookish_clubs(club_ref) where club_ref is not null;
alter table public.bookish_clubs add column if not exists listed boolean not null default false;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_club_name_length' and conrelid='public.bookish_clubs'::regclass) then
 alter table public.bookish_clubs add constraint bookish_club_name_length check(length(trim(name)) between 2 and 140);
 end if; end $guard$;
alter table public.bookish_join_requests add column if not exists club_id uuid references public.bookish_clubs(id) on delete cascade;
alter table public.bookish_join_requests add column if not exists user_id uuid references public.bookish_profiles(id) on delete cascade;
create or replace function bookish_private.confirmed_user_links() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'app' is distinct from 'bookish' then return new; end if;
 if new.email_confirmed_at is not null then
  update public.bookish_submissions set user_id=new.id where lower(email)=lower(new.email) and user_id is null;
  update public.bookish_join_requests set user_id=new.id where lower(email)=lower(new.email) and user_id is null;
 end if;
 return new;
exception when others then
 raise log 'Bookish confirmed links trigger skipped auth user %: %', new.id, sqlerrm;
 return new;
end $$;
create or replace trigger bookish_confirmed_user_links after update of email,email_confirmed_at on auth.users for each row execute function bookish_private.confirmed_user_links();
create unique index if not exists bookish_pending_member_request on public.bookish_join_requests(club_id,user_id) where status='pending' and user_id is not null;
alter table public.bookish_invites add column if not exists club_id uuid references public.bookish_clubs(id) on delete cascade;
alter table public.bookish_invites add column if not exists created_by uuid references public.bookish_profiles(id) on delete cascade;
-- Legacy directory codes remain directory-only: they never grant app membership.
create table if not exists bookish_private.club_removals (
  club_id uuid references public.bookish_clubs(id) on delete cascade,
  user_id uuid references public.bookish_profiles(id) on delete cascade,
  primary key(club_id,user_id)
);
alter table bookish_private.club_removals enable row level security;
create table if not exists public.bookish_preferences (
  user_id uuid primary key references public.bookish_profiles(id) on delete cascade,
  active_club_id uuid references public.bookish_clubs(id) on delete set null
);
grant select,insert,update,delete on table public.bookish_preferences to service_role;
alter table public.bookish_preferences enable row level security;
revoke all on table public.bookish_preferences from public,anon,authenticated;

create or replace function bookish_private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookish_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.banned_at is null and u.raw_app_meta_data->>'app'='bookish')
$$;
create or replace function bookish_private.is_member(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid())
$$;
create or replace function bookish_private.is_host(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid() and role in ('host','cohost'))
$$;
create or replace function bookish_private.require_member(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not bookish_private.is_member(p_club) then raise exception 'Join this club to enjoy its next chapter.'; end if; end $$;
create or replace function bookish_private.require_host(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not bookish_private.is_host(p_club) then raise exception 'Your host can help with this.'; end if; end $$;
create or replace function bookish_private.require_terms() returns void language plpgsql security definer set search_path='' as $$
begin
 if not bookish_private.active_user() or not exists(select 1 from public.bookish_profiles where id=auth.uid() and banned_at is null and terms_version='2026-10-15' and adult_confirmed and terms_accepted_at is not null)
 then raise exception 'Please accept our house rules and confirm you are 18 or over.'; end if;
end $$;

do $guard$ begin if not exists (select 1 from pg_policy where polname='profiles_read' and polrelid='public.bookish_profiles'::regclass) then
 create policy profiles_read on public.bookish_profiles for select to authenticated using(
 bookish_private.active_user() and (id=auth.uid() or exists(select 1 from public.bookish_members m where m.user_id=id and bookish_private.is_member(m.club_id)))
);
 end if; end $guard$;
-- Only safe profile columns are granted. Terms and ban state cannot be forged.
do $guard$ begin if not exists (select 1 from pg_policy where polname='profiles_update' and polrelid='public.bookish_profiles'::regclass) then
 create policy profiles_update on public.bookish_profiles for update to authenticated using(id=auth.uid() and bookish_private.active_user()) with check(id=auth.uid());
 end if; end $guard$;
grant select(id,display_name,home_city,created_at),update(display_name,home_city) on public.bookish_profiles to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='clubs_read' and polrelid='public.bookish_clubs'::regclass) then
 create policy clubs_read on public.bookish_clubs for select to authenticated using(bookish_private.is_member(id));
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_policy where polname='members_read' and polrelid='public.bookish_members'::regclass) then
 create policy members_read on public.bookish_members for select to authenticated using(bookish_private.is_member(club_id));
 end if; end $guard$;
grant select on public.bookish_clubs,public.bookish_members to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='books_read' and polrelid='public.bookish_books'::regclass) then
 create policy books_read on public.bookish_books for select to authenticated using(bookish_private.active_user());
 end if; end $guard$;
grant select on public.bookish_books to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='prefs_self' and polrelid='public.bookish_preferences'::regclass) then
 create policy prefs_self on public.bookish_preferences for select to authenticated using(user_id=auth.uid() and bookish_private.active_user());
 end if; end $guard$;
grant select on public.bookish_preferences to authenticated;

create or replace function public.bookish_accept_terms(p_version text,p_adult boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not bookish_private.active_user() or p_version is distinct from '2026-10-15' or p_adult is distinct from true then raise exception 'Please accept our house rules and confirm you are 18 or over.'; end if;
 update public.bookish_profiles set terms_version=p_version,terms_accepted_at=now(),adult_confirmed=true where id=auth.uid();
end $$;
create or replace function public.bookish_my_account() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'display_name',display_name,'home_city',home_city,'terms_version',terms_version,'terms_accepted_at',terms_accepted_at,'adult_confirmed',adult_confirmed)
 from public.bookish_profiles where id=auth.uid() and bookish_private.active_user()
$$;
create or replace function public.bookish_create_club(p_name text,p_city text,p_state text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform bookish_private.require_terms();
 if length(p_city)>80 or length(p_state)>80 then raise exception 'A shorter city name fits beautifully.'; end if;
 insert into public.bookish_clubs(name,city,state) values(trim(p_name),trim(p_city),trim(p_state)) returning id into cid;
 insert into public.bookish_members(club_id,user_id,role) values(cid,auth.uid(),'host');
 insert into public.bookish_preferences(user_id,active_club_id) values(auth.uid(),cid) on conflict(user_id) do update set active_club_id=cid;
 return cid;
end $$;
create or replace function public.bookish_switch_club(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 insert into public.bookish_preferences values(auth.uid(),p_club) on conflict(user_id) do update set active_club_id=p_club;
end $$;
create or replace function public.bookish_member_preferences(p_club uuid,p_race boolean,p_shield boolean,p_ratings boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 update public.bookish_members set race_visible=p_race,spoiler_shield=p_shield,ratings_public=p_ratings where club_id=p_club and user_id=auth.uid(); end $$;
create or replace function public.bookish_link_directory(p_club uuid,p_ref text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_host(p_club);
 if not exists(select 1 from public.bookish_submissions s join auth.users u on u.id=auth.uid() and lower(u.email)=lower(s.email) and u.email_confirmed_at is not null
   where s.club_ref=p_ref and s.kind in ('claim','start') and s.status='confirmed') then raise exception 'Confirm your host email to connect this listing.'; end if;
 update public.bookish_clubs set club_ref=p_ref where id=p_club and club_ref is null;
 if not found then raise exception 'This club already has a listing.'; end if;
end $$;
create or replace function public.bookish_set_listing(p_club uuid,p_listed boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club); update public.bookish_clubs set listed=p_listed where id=p_club; end $$;
create or replace function public.bookish_discover_clubs(p_city text,p_state text) returns table(id uuid,club_ref text,name text,city text,state text) language sql stable security definer set search_path='' as $$
 select c.id,c.club_ref,c.name,c.city,c.state from public.bookish_clubs c where bookish_private.active_user() and c.listed and (not (to_jsonb(c) ? 'visibility') or to_jsonb(c)->>'visibility' in ('open','private')) and c.city=p_city and c.state=p_state order by c.name,c.id limit 100
$$;
create or replace function public.bookish_create_invite(p_club uuid,p_max_uses int default 20,p_days int default 7) returns text language plpgsql security definer set search_path='' as $$
declare code_value text;
begin
 perform bookish_private.require_host(p_club);
 if p_max_uses not between 1 and 100 or p_days not between 1 and 30 or p_max_uses is null or p_days is null then raise exception 'Choose 1–100 guests and 1–30 days.'; end if;
 code_value:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 insert into public.bookish_invites(code,club_ref,club_id,created_by,expires_at,max_uses) values(code_value,p_club::text,p_club,auth.uid(),now()+make_interval(days=>p_days),p_max_uses);
 return code_value;
end $$;
create or replace function public.bookish_redeem_invite(p_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.bookish_invites;
begin
 perform bookish_private.require_terms();
 select * into inv from public.bookish_invites where code=upper(trim(p_code)) for update;
 if inv.club_id is null then raise exception 'Ask your host for a fresh invite.'; end if;
 if exists(select 1 from bookish_private.club_removals where club_id=inv.club_id and user_id=auth.uid()) then raise exception 'Your host can help with an invite.'; end if;
 if exists(select 1 from public.bookish_members where club_id=inv.club_id and user_id=auth.uid()) then return inv.club_id; end if;
 if inv.expires_at<=now() or inv.uses>=inv.max_uses then raise exception 'Ask your host for a fresh invite.'; end if;
 insert into public.bookish_members(club_id,user_id) values(inv.club_id,auth.uid());
 update public.bookish_invites set uses=uses+1 where code=inv.code;
 return inv.club_id;
end $$;
create or replace function public.bookish_request_join(p_club uuid,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 perform bookish_private.require_terms();
 if not exists(select 1 from public.bookish_clubs c where c.id=p_club and c.listed and (not (to_jsonb(c) ? 'visibility') or to_jsonb(c)->>'visibility' in ('open','private'))) or exists(select 1 from bookish_private.club_removals where club_id=p_club and user_id=auth.uid()) then raise exception 'Your host can help you join.'; end if;
 insert into public.bookish_join_requests(club_id,user_id,club_ref,email,first_name,note)
 select p_club,auth.uid(),p_club::text,u.email,p.display_name,p_note from auth.users u join public.bookish_profiles p on p.id=u.id where u.id=auth.uid()
 on conflict(club_id,user_id) where status='pending' and user_id is not null do update set note=excluded.note returning id into rid;
 return rid;
end $$;
create or replace function public.bookish_join_queue(p_club uuid) returns table(id uuid,user_id uuid,first_name text,note text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 return query select j.id,j.user_id,j.first_name,j.note,j.created_at from public.bookish_join_requests j where j.club_id=p_club and j.status='pending'; end $$;
create or replace function public.bookish_decide_join(p_request uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare j public.bookish_join_requests;
begin select * into j from public.bookish_join_requests where id=p_request for update;
 perform bookish_private.require_host(j.club_id);
 if j.status<>'pending' then return; end if;
 if p_approve then
  if j.user_id is null or exists(select 1 from bookish_private.club_removals where club_id=j.club_id and user_id=j.user_id) then raise exception 'Invite this reader through their Bookish account.'; end if;
  insert into public.bookish_members(club_id,user_id) values(j.club_id,j.user_id) on conflict do nothing;
 end if;
 update public.bookish_join_requests set status=case when p_approve then 'approved' else 'declined' end,decided_at=now() where id=j.id;
end $$;
create or replace function public.bookish_remove_member(p_club uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 if exists(select 1 from public.bookish_members where club_id=p_club and user_id=p_user and role in ('host','cohost')) then raise exception 'Pass the hosting ribbon first.'; end if;
 insert into bookish_private.club_removals values(p_club,p_user) on conflict do nothing;
 delete from public.bookish_members where club_id=p_club and user_id=p_user;
 update public.bookish_preferences set active_club_id=null where user_id=p_user and active_club_id=p_club;
end $$;
create or replace function public.bookish_transfer_host(p_club uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.bookish_clubs where id=p_club for update;
 if not exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid() and role='host') or not bookish_private.active_user() then raise exception 'Your host can pass the ribbon.'; end if;
 if not exists(select 1 from public.bookish_members where club_id=p_club and user_id=p_user) then raise exception 'Choose a member of this club.'; end if;
 update public.bookish_members set role=case when user_id=p_user then 'host' else 'member' end where club_id=p_club and (role='host' or user_id=p_user);
end $$;

-- Only explicitly listed APIs and policy predicates are executable by app users.
revoke all on all tables in schema bookish_private from public,anon,authenticated,service_role;
revoke all on all functions in schema bookish_private from public,anon,authenticated,service_role;
grant execute on function bookish_private.active_user(),bookish_private.is_member(uuid),bookish_private.is_host(uuid) to authenticated;
revoke all on function public.bookish_accept_terms(text, boolean),public.bookish_my_account(),public.bookish_create_club(text, text, text),public.bookish_switch_club(uuid),public.bookish_member_preferences(uuid, boolean, boolean, boolean),public.bookish_link_directory(uuid, text),public.bookish_set_listing(uuid, boolean),public.bookish_discover_clubs(text, text),public.bookish_create_invite(uuid, integer, integer),public.bookish_redeem_invite(text),public.bookish_request_join(uuid, text),public.bookish_join_queue(uuid),public.bookish_decide_join(uuid, boolean),public.bookish_remove_member(uuid, uuid),public.bookish_transfer_host(uuid, uuid) from public,anon,authenticated;
grant execute on function public.bookish_accept_terms(text, boolean),public.bookish_my_account(),public.bookish_create_club(text, text, text),public.bookish_switch_club(uuid),public.bookish_member_preferences(uuid, boolean, boolean, boolean),public.bookish_link_directory(uuid, text),public.bookish_set_listing(uuid, boolean),public.bookish_discover_clubs(text, text),public.bookish_create_invite(uuid, integer, integer),public.bookish_redeem_invite(text),public.bookish_request_join(uuid, text),public.bookish_join_queue(uuid),public.bookish_decide_join(uuid, boolean),public.bookish_remove_member(uuid, uuid),public.bookish_transfer_host(uuid, uuid) to authenticated;

-- SOURCE: supabase/sql/006_bookish_reading_meetings_votes.sql
-- Bookish v1.1 reading and coordination. Depends on 005; preserves PR #12 aggregates.

alter table public.bookish_club_books add column if not exists reading_started_at timestamptz not null default now();
create unique index if not exists bookish_one_current_book on public.bookish_club_books(club_id) where status='reading';
do $guard$ begin if not exists (select 1 from pg_policy where polname='club_books_read' and polrelid='public.bookish_club_books'::regclass) then
 create policy club_books_read on public.bookish_club_books for select to authenticated using(bookish_private.is_member(club_id));
 end if; end $guard$;
grant select on public.bookish_club_books to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='pours_read' and polrelid='public.bookish_pours'::regclass) then
 create policy pours_read on public.bookish_pours for select to authenticated using(user_id=auth.uid() and bookish_private.active_user() and (club_id is null or bookish_private.is_member(club_id)));
 end if; end $guard$;
do $guard$ begin if not exists (select 1 from pg_policy where polname='pours_write' and polrelid='public.bookish_pours'::regclass) then
 create policy pours_write on public.bookish_pours for all to authenticated using(user_id=auth.uid() and bookish_private.active_user() and (club_id is null or bookish_private.is_member(club_id))) with check(user_id=auth.uid() and bookish_private.active_user() and (club_id is null or bookish_private.is_member(club_id)));
 end if; end $guard$;
grant select,insert,update,delete on public.bookish_pours to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='taste_self' and polrelid='public.bookish_taste'::regclass) then
 create policy taste_self on public.bookish_taste for all to authenticated using(user_id=auth.uid() and bookish_private.active_user()) with check(user_id=auth.uid() and bookish_private.active_user());
 end if; end $guard$;
grant select,insert,update,delete on public.bookish_taste to authenticated;
-- Suggest events stay service-only: never a raw cross-club analytics endpoint.

create table if not exists public.bookish_page_log (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 club_id uuid not null,
 book_id text not null,
 page int not null check(page>=0),
 chapter int check(chapter>=0),
 finished boolean not null default false,
 request_id uuid not null,
 logged_at timestamptz not null default clock_timestamp(),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade,
 unique(user_id,request_id)
);
grant select,insert,update,delete on table public.bookish_page_log to service_role;
alter table public.bookish_page_log enable row level security;
revoke all on table public.bookish_page_log from public,anon,authenticated;
create index if not exists bookish_latest_page on public.bookish_page_log(club_id,book_id,user_id,logged_at desc,id desc);
do $guard$ begin if not exists (select 1 from pg_policy where polname='page_log_self' and polrelid='public.bookish_page_log'::regclass) then
 create policy page_log_self on public.bookish_page_log for select to authenticated using(user_id=auth.uid() and bookish_private.is_member(club_id));
 end if; end $guard$;
grant select on public.bookish_page_log to authenticated;
create or replace function public.bookish_set_current_book(p_club uuid,p_book text) returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 perform 1 from public.bookish_clubs where id=p_club for update;
 if exists(select 1 from public.bookish_club_books where club_id=p_club and status='reading' and book_id<>p_book) then raise exception 'Finish your current chapter together before starting another book.'; end if;
 if exists(select 1 from public.bookish_club_books where club_id=p_club and book_id=p_book and status='reading') then return; end if;
 insert into public.bookish_club_books(club_id,book_id,status,started_at,source) values(p_club,p_book,'reading',current_date,'host')
 on conflict(club_id,book_id) do update set status='reading',started_at=current_date,finished_at=null,reading_started_at=clock_timestamp();
end $$;
create or replace function public.bookish_finish_book(p_club uuid,p_book text,p_status text default 'finished') returns void language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 if p_status not in ('finished','dropped') or p_status is null then raise exception 'Choose a shelf for this book.'; end if;
 update public.bookish_club_books set status=p_status,finished_at=current_date where club_id=p_club and book_id=p_book and status='reading'; end $$;
create or replace function public.bookish_log_page(p_club uuid,p_book text,p_page int,p_chapter int default null,p_finished boolean default false,p_request uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; total int;
begin
 perform bookish_private.require_member(p_club);
 select id into rid from public.bookish_page_log where user_id=auth.uid() and request_id=p_request;
 if rid is not null then return rid; end if;
 if not exists(select 1 from public.bookish_club_books where club_id=p_club and book_id=p_book and status='reading') then raise exception 'Choose your club’s current book.'; end if;
 select pages into total from public.bookish_books where id=p_book;
 if p_page<0 or p_page is null or p_page>coalesce(total,100000) or p_chapter<0 or p_chapter>10000 then raise exception 'Let’s check that page together.'; end if;
 insert into public.bookish_page_log(user_id,club_id,book_id,page,chapter,finished,request_id)
 values(auth.uid(),p_club,p_book,case when p_finished and total is not null then total else p_page end,p_chapter,p_finished,p_request)
 on conflict(user_id,request_id) do update set request_id=excluded.request_id returning id into rid;
 return rid;
end $$;
-- Legacy RPC name retained for callers; shared reading has no rank or streak.
create or replace function public.bookish_race(p_club uuid) returns table(user_id uuid,display_name text,page int,finished boolean) language plpgsql stable security definer set search_path='' as $$
begin perform bookish_private.require_member(p_club);
 return query
 with current_read as(select b.book_id,b.reading_started_at from public.bookish_club_books b where b.club_id=p_club and b.status='reading'),
 latest as (
  select m.user_id,p.display_name,coalesce(l.page,0) page,coalesce(l.finished,false) finished
  from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
  left join lateral(select l.* from public.bookish_page_log l join current_read c on c.book_id=l.book_id and l.logged_at>=c.reading_started_at where l.club_id=p_club and l.user_id=m.user_id order by l.logged_at desc,l.id desc limit 1) l on true
  where m.club_id=p_club and m.race_visible and p.banned_at is null
 )
 select l.user_id,l.display_name,l.page,l.finished
 from latest l order by l.user_id;
end $$;

create table if not exists public.bookish_meetings (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.bookish_clubs(id) on delete cascade,
 starts_at timestamptz not null, title text not null check(length(trim(title)) between 1 and 140),
 location text not null check(length(location)<=500), stop_page int check(stop_page>=0),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
 unique(id,club_id)
);
grant select,insert,update,delete on table public.bookish_meetings to service_role;
alter table public.bookish_meetings enable row level security;
revoke all on table public.bookish_meetings from public,anon,authenticated;
create table if not exists public.bookish_rsvps (
 meeting_id uuid not null,club_id uuid not null,user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 response text not null check(response in ('going','maybe','next_time')),primary key(meeting_id,user_id),
 foreign key(meeting_id,club_id) references public.bookish_meetings(id,club_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_rsvps to service_role;
alter table public.bookish_rsvps enable row level security;
revoke all on table public.bookish_rsvps from public,anon,authenticated;
create table if not exists public.bookish_bring_items (
 id uuid primary key default gen_random_uuid(),meeting_id uuid not null,club_id uuid not null,
 label text not null check(length(trim(label)) between 1 and 120),claimed_by uuid references public.bookish_profiles(id) on delete set null,
 foreign key(meeting_id,club_id) references public.bookish_meetings(id,club_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_bring_items to service_role;
alter table public.bookish_bring_items enable row level security;
revoke all on table public.bookish_bring_items from public,anon,authenticated;
drop policy if exists club_read on public.bookish_meetings;
create policy club_read on public.bookish_meetings for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_meetings to authenticated;
drop policy if exists club_read on public.bookish_rsvps;
create policy club_read on public.bookish_rsvps for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_rsvps to authenticated;
drop policy if exists club_read on public.bookish_bring_items;
create policy club_read on public.bookish_bring_items for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_bring_items to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='rsvp_write' and polrelid='public.bookish_rsvps'::regclass) then
 create policy rsvp_write on public.bookish_rsvps for all to authenticated using(user_id=auth.uid() and bookish_private.is_member(club_id)) with check(user_id=auth.uid() and bookish_private.is_member(club_id));
 end if; end $guard$;
grant insert,update,delete on public.bookish_rsvps to authenticated;
create or replace function public.bookish_schedule_meeting(p_club uuid,p_starts timestamptz,p_title text,p_location text,p_stop int default null) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; begin perform bookish_private.require_host(p_club);
 insert into public.bookish_meetings(club_id,starts_at,title,location,stop_page) values(p_club,p_starts,p_title,p_location,p_stop) returning id into mid; return mid; end $$;
create or replace function public.bookish_edit_meeting(p_meeting uuid,p_starts timestamptz,p_title text,p_location text,p_stop int,p_cancel boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; begin select club_id into cid from public.bookish_meetings where id=p_meeting; perform bookish_private.require_host(cid);
 update public.bookish_meetings set starts_at=p_starts,title=p_title,location=p_location,stop_page=p_stop,status=case when p_cancel then 'cancelled' else 'scheduled' end where id=p_meeting; end $$;
create or replace function public.bookish_add_bring_item(p_meeting uuid,p_label text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; iid uuid; begin select club_id into cid from public.bookish_meetings where id=p_meeting; perform bookish_private.require_host(cid);
 insert into public.bookish_bring_items(meeting_id,club_id,label) values(p_meeting,cid,p_label) returning id into iid; return iid; end $$;
create or replace function public.bookish_claim_bring_item(p_item uuid,p_claim boolean) returns void language plpgsql security definer set search_path='' as $$
declare item public.bookish_bring_items; begin select * into item from public.bookish_bring_items where id=p_item for update;
 perform bookish_private.require_member(item.club_id);
 if item.claimed_by is not null and item.claimed_by<>auth.uid() then raise exception 'Already claimed, with love. Pick another treat.'; end if;
 update public.bookish_bring_items set claimed_by=case when p_claim then auth.uid() else null end where id=p_item; end $$;

create table if not exists public.bookish_votes (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.bookish_clubs(id) on delete cascade,
 opened_by uuid references public.bookish_profiles(id) on delete set null,closes_at timestamptz not null,
 status text not null default 'open' check(status in ('open','closed')),post_to_chat boolean not null default false,
 winner_option uuid,imsg_token text unique not null default gen_random_uuid()::text,unique(id,club_id)
);
grant select,insert,update,delete on table public.bookish_votes to service_role;
alter table public.bookish_votes enable row level security;
revoke all on table public.bookish_votes from public,anon,authenticated;
create unique index if not exists bookish_one_open_vote on public.bookish_votes(club_id) where status='open';
create table if not exists public.bookish_vote_options (
 id uuid primary key default gen_random_uuid(),vote_id uuid not null,club_id uuid not null,book_id text not null references public.bookish_books(id),
 origin text not null default 'nominated' check(origin in ('suggested','nominated')),why_key text,why_text text,
 unique(id,vote_id),unique(vote_id,book_id),foreign key(vote_id,club_id) references public.bookish_votes(id,club_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_vote_options to service_role;
alter table public.bookish_vote_options enable row level security;
revoke all on table public.bookish_vote_options from public,anon,authenticated;
do $guard$ begin if not exists (select 1 from pg_constraint where conname='bookish_winner_same_vote' and conrelid='public.bookish_votes'::regclass) then
 alter table public.bookish_votes add constraint bookish_winner_same_vote foreign key(winner_option,id) references public.bookish_vote_options(id,vote_id) deferrable initially deferred;
 end if; end $guard$;
create table if not exists public.bookish_vote_ballots (
 vote_id uuid not null,club_id uuid not null,user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 option_id uuid not null,via text not null check(via in ('app','imessage','web')),cast_at timestamptz not null default now(),primary key(vote_id,user_id),
 foreign key(vote_id,club_id) references public.bookish_votes(id,club_id) on delete cascade,
 foreign key(option_id,vote_id) references public.bookish_vote_options(id,vote_id) on delete cascade
);
grant select,insert,update,delete on table public.bookish_vote_ballots to service_role;
alter table public.bookish_vote_ballots enable row level security;
revoke all on table public.bookish_vote_ballots from public,anon,authenticated;
create table if not exists public.bookish_nominations (
 club_id uuid not null references public.bookish_clubs(id) on delete cascade,book_id text not null references public.bookish_books(id),
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(club_id,book_id,user_id)
);
grant select,insert,update,delete on table public.bookish_nominations to service_role;
alter table public.bookish_nominations enable row level security;
revoke all on table public.bookish_nominations from public,anon,authenticated;
drop policy if exists club_read on public.bookish_votes;
create policy club_read on public.bookish_votes for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_votes to authenticated;
drop policy if exists club_read on public.bookish_vote_options;
create policy club_read on public.bookish_vote_options for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_vote_options to authenticated;
drop policy if exists club_read on public.bookish_nominations;
create policy club_read on public.bookish_nominations for select to authenticated using(bookish_private.is_member(club_id));
grant select on public.bookish_nominations to authenticated;
-- A ballot is private even to other club members. Expose only grouped counts.
drop policy if exists club_read on public.bookish_vote_ballots;
create or replace function public.bookish_vote_tally(p_vote uuid)
returns table(option_id uuid,book_id text,ballots bigint)
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;
begin
 select v.club_id into cid from public.bookish_votes v where v.id=p_vote;
 perform bookish_private.require_member(cid);
 return query select o.id,o.book_id,count(b.user_id)
 from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id
 where o.vote_id=p_vote group by o.id,o.book_id order by o.id;
end $$;
revoke all on function public.bookish_vote_tally(uuid) from public,anon,authenticated;
grant execute on function public.bookish_vote_tally(uuid) to authenticated;
do $guard$ begin if not exists (select 1 from pg_policy where polname='nominations_write' and polrelid='public.bookish_nominations'::regclass) then
 create policy nominations_write on public.bookish_nominations for all to authenticated using(user_id=auth.uid() and bookish_private.is_member(club_id)) with check(user_id=auth.uid() and bookish_private.is_member(club_id));
 end if; end $guard$;
grant insert,delete on public.bookish_nominations to authenticated;
create or replace function public.bookish_open_vote(p_club uuid,p_closes timestamptz,p_books text[],p_chat boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare vid uuid; begin perform bookish_private.require_host(p_club);
 if p_closes is null or p_closes<=now() or cardinality(p_books) not between 2 and 4 or p_books is null then raise exception 'Pick two to four books and a future closing time.'; end if;
 insert into public.bookish_votes(club_id,opened_by,closes_at,post_to_chat) values(p_club,auth.uid(),p_closes,p_chat) returning id into vid;
 insert into public.bookish_vote_options(vote_id,club_id,book_id) select vid,p_club,unnest(p_books);
 return vid; end $$;
create or replace function public.bookish_cast_ballot(p_vote uuid,p_option uuid,p_via text default 'app') returns void language plpgsql security definer set search_path='' as $$
declare v public.bookish_votes; begin select * into v from public.bookish_votes where id=p_vote for update;
 perform bookish_private.require_member(v.club_id);
 if v.status<>'open' or v.closes_at<=now() then raise exception 'This vote has its next chapter ready.'; end if;
 insert into public.bookish_vote_ballots(vote_id,club_id,user_id,option_id,via) values(v.id,v.club_id,auth.uid(),p_option,p_via)
 on conflict(vote_id,user_id) do update set option_id=excluded.option_id,via=excluded.via,cast_at=now(); end $$;
create or replace function public.bookish_close_vote(p_vote uuid,p_winner uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.bookish_votes; winner uuid; top_count bigint; n int; next_book text; begin
 select * into v from public.bookish_votes where id=p_vote for update; perform bookish_private.require_host(v.club_id);
 if v.status='closed' then return v.winner_option; end if;
 select max(tally) into top_count from (select count(b.user_id) tally from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id where o.vote_id=v.id group by o.id) x;
 select count(*) into n from (select o.id from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id where o.vote_id=v.id group by o.id having count(b.user_id)=top_count) x;
 if p_winner is null and n<>1 then raise exception 'A lovely tie. Host, pick the next chapter.'; end if;
 select o.id,o.book_id into winner,next_book from public.bookish_vote_options o left join public.bookish_vote_ballots b on b.option_id=o.id
 where o.vote_id=v.id and (p_winner is null or o.id=p_winner) group by o.id having count(b.user_id)=top_count limit 1;
 if winner is null then raise exception 'Pick one of the leading books.'; end if;
 perform 1 from public.bookish_clubs where id=v.club_id for update;
 update public.bookish_club_books set status='finished',finished_at=current_date where club_id=v.club_id and status='reading';
 insert into public.bookish_club_books(club_id,book_id,status,started_at,source) values(v.club_id,next_book,'reading',current_date,'vote')
 on conflict(club_id,book_id) do update set status='reading',started_at=current_date,finished_at=null,source='vote',reading_started_at=clock_timestamp();
 update public.bookish_votes set status='closed',winner_option=winner where id=v.id;
 return winner;
end $$;
-- Deliberately no public token ballot: every voter must authenticate and be a member.

revoke all on function public.bookish_set_current_book(uuid, text),public.bookish_finish_book(uuid, text, text),public.bookish_log_page(uuid, text, integer, integer, boolean, uuid),public.bookish_race(uuid),public.bookish_schedule_meeting(uuid, timestamp with time zone, text, text, integer),public.bookish_edit_meeting(uuid, timestamp with time zone, text, text, integer, boolean),public.bookish_add_bring_item(uuid, text),public.bookish_claim_bring_item(uuid, boolean),public.bookish_open_vote(uuid, timestamp with time zone, text[], boolean),public.bookish_cast_ballot(uuid, uuid, text),public.bookish_close_vote(uuid, uuid) from public,anon,authenticated;
grant execute on function public.bookish_set_current_book(uuid, text),public.bookish_finish_book(uuid, text, text),public.bookish_log_page(uuid, text, integer, integer, boolean, uuid),public.bookish_race(uuid),public.bookish_schedule_meeting(uuid, timestamp with time zone, text, text, integer),public.bookish_edit_meeting(uuid, timestamp with time zone, text, text, integer, boolean),public.bookish_add_bring_item(uuid, text),public.bookish_claim_bring_item(uuid, boolean),public.bookish_open_vote(uuid, timestamp with time zone, text[], boolean),public.bookish_cast_ballot(uuid, uuid, text),public.bookish_close_vote(uuid, uuid) to authenticated;

-- SOURCE: supabase/sql/007_bookish_tea_moderation_deletion.sql
-- The Tea. Raw text and author mapping are never available through table endpoints.

create table if not exists public.bookish_takes (
 id uuid primary key default gen_random_uuid(),club_id uuid not null,book_id text not null,
 parent_id uuid,body text not null check(length(trim(body)) between 1 and 2000),
 anonymous boolean not null default true,signed_name text,
 spoiler_page int not null default 0 check(spoiler_page>=0),spoiler_chapter int check(spoiler_chapter>=0),
 hidden boolean not null default false,created_at timestamptz not null default clock_timestamp(),
 unique(id,club_id,book_id),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade,
 foreign key(parent_id,club_id,book_id) references public.bookish_takes(id,club_id,book_id) on delete cascade,
 check((anonymous and signed_name is null) or (not anonymous and signed_name is not null))
);
grant select,insert,update,delete on table public.bookish_takes to service_role;
alter table public.bookish_takes enable row level security;
revoke all on table public.bookish_takes from public,anon,authenticated;
create index if not exists bookish_tea_feed on public.bookish_takes(club_id,book_id,parent_id,created_at desc);
do $guard$ begin if not exists (select 1 from pg_policy where polname='tea_member' and polrelid='public.bookish_takes'::regclass) then
 create policy tea_member on public.bookish_takes for select to authenticated using(bookish_private.is_member(club_id));
 end if; end $guard$;
create table if not exists bookish_private.take_authors (
 take_id uuid primary key references public.bookish_takes(id) on delete cascade,
 author_id uuid not null references public.bookish_profiles(id) on delete cascade
);
create index if not exists bookish_take_author on bookish_private.take_authors(author_id);
create table if not exists bookish_private.blocks (
 user_id uuid references public.bookish_profiles(id) on delete cascade,
 take_id uuid references public.bookish_takes(id) on delete cascade,
 primary key(user_id,take_id)
);
create table if not exists bookish_private.hidden_takes (
 user_id uuid references public.bookish_profiles(id) on delete cascade,
 take_id uuid references public.bookish_takes(id) on delete cascade,primary key(user_id,take_id)
);
create table if not exists bookish_private.reports (
 id uuid primary key default gen_random_uuid(),take_id uuid not null references public.bookish_takes(id) on delete cascade,
 reporter_id uuid not null references public.bookish_profiles(id) on delete cascade,
 reason text not null check(length(reason) between 1 and 500),created_at timestamptz not null default now(),
 due_at timestamptz not null default now()+interval '24 hours',
 host_status text not null default 'pending' check(host_status in ('pending','hidden','dismissed')),
 review_status text not null default 'pending' check(review_status in ('pending','hidden','dismissed','banned')),
 reviewed_at timestamptz,unique(take_id,reporter_id)
);
create index if not exists bookish_report_due on bookish_private.reports(review_status,due_at);
create table if not exists bookish_private.safety_audit (
 id uuid primary key default gen_random_uuid(),take_id uuid references public.bookish_takes(id) on delete set null,
 actor text not null,reason text not null check(length(trim(reason)) between 10 and 500),
 action text not null,at timestamptz not null default now()
);
create table if not exists bookish_private.content_rules (
 pattern text primary key,category text not null check(category in ('slur','threat','personal_sexual'))
);
-- A conservative launch ruleset. Ordinary swearing about books is welcome.
-- Trust & safety must maintain/test the ruleset; context and evasion need human review.
insert into bookish_private.content_rules values
 ('\m(nigg(er|a)s?|fagg?ots?|kikes?|chinks?|trann(y|ies))\M','slur'),
 ('\m(i|we)( will|''ll| am going to| are going to)? (kill|murder|rape|hurt) (you|him|her|them)\M','threat'),
 ('\m(kill yourself|go die|death threat)\M','threat'),
 ('\m(kill|murder|rape|hurt)\M.{0,20}\m(you|your family|yourself)\M','threat'),
 ('\m(i|we)\M.{0,25}\m(want|going|will|like)\M.{0,20}\m(fuck|bang|screw)\M','personal_sexual'),
 ('\m(doxx?|home address|phone number)\M','threat'),
 ('\m(rape|molest|sexually assault|nudes?|porn|fuck|screw|bang)\M.{0,30}\m(you|him|her|them|member|host)\M','personal_sexual'),
 ('\m(you|member|host)\M.{0,30}\m(naked|nudes?|sexy|sexual|porn)\M','personal_sexual') on conflict(pattern) do nothing;
create table if not exists bookish_private.content_holds (
 id uuid primary key default gen_random_uuid(),club_id uuid not null,book_id text not null,
 author_id uuid not null references public.bookish_profiles(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 2000),created_at timestamptz not null default now(),
 due_at timestamptz not null default now()+interval '24 hours',
 review_status text not null default 'pending' check(review_status in ('pending','dismissed')),
 foreign key(club_id,book_id) references public.bookish_club_books(club_id,book_id) on delete cascade
);
create table if not exists public.bookish_take_reactions (
 take_id uuid not null references public.bookish_takes(id) on delete cascade,
 user_id uuid not null references public.bookish_profiles(id) on delete cascade,
 reaction text not null check(reaction in ('🔥','😭','🍵','🤯')),primary key(take_id,user_id)
);
grant select,insert,update,delete on table public.bookish_take_reactions to service_role;
alter table public.bookish_take_reactions enable row level security;
revoke all on table public.bookish_take_reactions from public,anon,authenticated;
-- No raw reaction identities; the feed returns aggregate counts only.
alter table bookish_private.take_authors enable row level security;
revoke all on bookish_private.take_authors from public,anon,authenticated,service_role;
alter table bookish_private.blocks enable row level security;
revoke all on bookish_private.blocks from public,anon,authenticated,service_role;
alter table bookish_private.hidden_takes enable row level security;
revoke all on bookish_private.hidden_takes from public,anon,authenticated,service_role;
alter table bookish_private.reports enable row level security;
revoke all on bookish_private.reports from public,anon,authenticated,service_role;
alter table bookish_private.safety_audit enable row level security;
revoke all on bookish_private.safety_audit from public,anon,authenticated,service_role;
alter table bookish_private.content_rules enable row level security;
revoke all on bookish_private.content_rules from public,anon,authenticated,service_role;
alter table bookish_private.content_holds enable row level security;
revoke all on bookish_private.content_holds from public,anon,authenticated,service_role;

create or replace function bookish_private.content_verdict(p_club uuid,p_body text) returns text language plpgsql stable security definer set search_path='' as $$
declare normalized text;
begin
 normalized:=lower(regexp_replace(translate(p_body,'013457@$','oieastAS'),'[[:cntrl:]​‌‍]','','g'));
 if exists(select 1 from bookish_private.content_rules r where normalized ~* r.pattern) then return 'blocked'; end if;
 if exists(select 1 from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
   cross join lateral (select trim(regexp_replace(lower(regexp_replace(translate(p.display_name,'013457@$','oieastAS'),'[[:cntrl:]​‌‍]','','g')),'[^[:alnum:]]+',' ','g')) full_name) name
   where m.club_id=p_club and length(name.full_name)>=3
    and exists(select 1 from regexp_split_to_table(name.full_name,' ') name_part
      where name_part not in ('reader','the','book','a','an','and','or','of','to','in','on','at','for','with'))
    and position(' '||name.full_name||' ' in ' '||regexp_replace(normalized,'[^[:alnum:]]+',' ','g')||' ')>0)
 then return 'held'; end if;
 return 'allowed';
end $$;
create or replace function bookish_private.filter_take() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_member(new.club_id); perform bookish_private.require_terms();
 if bookish_private.content_verdict(new.club_id,new.body)<>'allowed' then raise exception 'Spill about the book, never the club.'; end if;
 return new;
end $$;
create or replace trigger bookish_filter_take before insert or update of body on public.bookish_takes for each row execute function bookish_private.filter_take();

-- Ancestors are checked too: replies cannot reveal a hidden or blocked conversation.
create or replace function bookish_private.can_view_take(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain as (
  select t.id,t.parent_id,t.club_id,t.hidden,0 depth from public.bookish_takes t where t.id=p_take
  union all select t.id,t.parent_id,t.club_id,t.hidden,c.depth+1 from public.bookish_takes t join chain c on c.parent_id=t.id where c.depth<10
 )
 select exists(select 1 from chain) and not exists(
  select 1 from chain c left join bookish_private.take_authors a on a.take_id=c.id
  left join public.bookish_profiles p on p.id=a.author_id
  where c.hidden or not bookish_private.is_member(c.club_id) or a.author_id is null or p.banned_at is not null or not exists(select 1 from public.bookish_members m where m.club_id=c.club_id and m.user_id=a.author_id)
   or exists(select 1 from bookish_private.hidden_takes h where h.take_id=c.id and h.user_id=auth.uid())
   or exists(select 1 from bookish_private.blocks b where b.user_id=auth.uid() and b.take_id=c.id)
 )
$$;
create or replace function bookish_private.can_unseal(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select not m.spoiler_shield or coalesce(l.finished,false)
   or (coalesce(l.page,0)>=t.spoiler_page and (t.spoiler_chapter is null or coalesce(l.chapter,0)>=t.spoiler_chapter))
 from public.bookish_takes t join public.bookish_members m on m.club_id=t.club_id and m.user_id=auth.uid()
 left join lateral(select l.page,l.chapter,l.finished from public.bookish_page_log l where l.club_id=t.club_id and l.book_id=t.book_id and l.user_id=auth.uid() and l.logged_at>=(select cb.reading_started_at from public.bookish_club_books cb where cb.club_id=t.club_id and cb.book_id=t.book_id) order by l.logged_at desc,l.id desc limit 1) l on true
 where t.id=p_take),false)
$$;
create or replace function bookish_private.can_interact(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.can_view_take(p_take) and bookish_private.can_unseal(p_take)
$$;
create or replace function public.bookish_post_take(p_club uuid,p_book text,p_body text,p_signed boolean default false,p_page int default 0,p_chapter int default null,p_parent uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid; parent public.bookish_takes; depth int; total int; verdict text;
begin
 perform bookish_private.require_member(p_club); perform bookish_private.require_terms();
 -- Serialize a member's posts to make the rate bound reliable across concurrent requests.
 perform 1 from public.bookish_profiles where id=auth.uid() for update;
 if (select count(*) from bookish_private.take_authors a join public.bookish_takes t on t.id=a.take_id where a.author_id=auth.uid() and t.created_at>now()-interval '1 minute')+(select count(*) from bookish_private.content_holds where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Let this sip settle for a moment, then share another.'; end if;
 select pages into total from public.bookish_books where id=p_book;
 if p_page>coalesce(total,100000) or p_chapter>10000 then raise exception 'Let’s check that spoiler marker together.'; end if;
 if p_parent is not null then
  select * into parent from public.bookish_takes where id=p_parent;
  if parent.club_id is distinct from p_club or parent.book_id is distinct from p_book or not bookish_private.can_interact(p_parent) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
  with recursive chain as(select id,parent_id,1 d from public.bookish_takes where id=p_parent union all select t.id,t.parent_id,c.d+1 from public.bookish_takes t join chain c on t.id=c.parent_id where c.d<=10) select max(d) into depth from chain;
  if depth>=10 then raise exception 'Start a fresh take to keep the conversation flowing.'; end if;
  p_page:=greatest(p_page,parent.spoiler_page); p_chapter:=greatest(p_chapter,parent.spoiler_chapter);
 end if;
 verdict:=bookish_private.content_verdict(p_club,p_body);
 if verdict='blocked' then raise exception 'Spill about the book, never the club.'; end if;
 if verdict='held' then
  insert into bookish_private.content_holds(club_id,book_id,author_id,body) values(p_club,p_book,auth.uid(),trim(p_body)) returning id into tid;
  return jsonb_build_object('id',tid,'status','held','message','Spill about the book, never the club.');
 end if;
 insert into public.bookish_takes(club_id,book_id,body,anonymous,signed_name,spoiler_page,spoiler_chapter,parent_id)
 values(p_club,p_book,trim(p_body),not p_signed,case when p_signed then (select display_name from public.bookish_profiles where id=auth.uid()) end,p_page,p_chapter,p_parent) returning id into tid;
 insert into bookish_private.take_authors values(tid,auth.uid()); return jsonb_build_object('id',tid,'status','posted');
end $$;
create or replace function public.bookish_tea(p_club uuid,p_book text,p_parent uuid default null,p_limit int default 30,p_offset int default 0)
returns table(id uuid,parent_id uuid,body text,anonymous boolean,signed_name text,spoiler_page int,spoiler_chapter int,sealed boolean,mine boolean,reactions jsonb,my_reaction text,reply_count bigint,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 perform bookish_private.require_member(p_club);
 return query select t.id,t.parent_id,case when bookish_private.can_unseal(t.id) then t.body end,t.anonymous,t.signed_name,t.spoiler_page,t.spoiler_chapter,not bookish_private.can_unseal(t.id),
 exists(select 1 from bookish_private.take_authors a where a.take_id=t.id and a.author_id=auth.uid()),
 coalesce((select jsonb_object_agg(x.reaction,x.n) from (select r.reaction,count(*) n from public.bookish_take_reactions r where r.take_id=t.id group by r.reaction) x),'{}'::jsonb),
 (select r.reaction from public.bookish_take_reactions r where r.take_id=t.id and r.user_id=auth.uid()),
 (select count(*) from public.bookish_takes r where r.parent_id=t.id and bookish_private.can_view_take(r.id)),t.created_at
 from public.bookish_takes t
 where t.club_id=p_club and t.book_id=p_book and t.parent_id is not distinct from p_parent and bookish_private.can_view_take(t.id)
 -- Sipped: most reactions first; no content or identity in URLs/cursors.
 order by (select count(*) from public.bookish_take_reactions r where r.take_id=t.id) desc,t.created_at desc,t.id
 limit least(greatest(coalesce(p_limit,30),1),100) offset least(greatest(coalesce(p_offset,0),0),10000);
end $$;
create or replace function public.bookish_react(p_take uuid,p_reaction text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_terms();
 if not bookish_private.can_interact(p_take) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
 if p_reaction is null then delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();
 else insert into public.bookish_take_reactions values(p_take,auth.uid(),p_reaction) on conflict(take_id,user_id) do update set reaction=excluded.reaction; end if;
end $$;
create or replace function public.bookish_take_action(p_take uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare author uuid; cid uuid;
begin
 select a.author_id,t.club_id into author,cid from public.bookish_takes t join bookish_private.take_authors a on a.take_id=t.id where t.id=p_take;
 perform bookish_private.require_member(cid);
 if p_action='delete' and author=auth.uid() then delete from public.bookish_takes where id=p_take; return; end if;
 if not bookish_private.can_view_take(p_take) and not exists(select 1 from bookish_private.hidden_takes where take_id=p_take and user_id=auth.uid()) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
 if p_action='block' then
  if author=auth.uid() then raise exception 'This is one of your own lovely takes.'; end if;
  insert into bookish_private.blocks values(auth.uid(),p_take) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
  delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();
 elsif p_action='hide' then insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 elsif p_action='report' then
  insert into bookish_private.reports(take_id,reporter_id,reason) values(p_take,auth.uid(),p_reason) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 else raise exception 'Choose report, hide, block or delete.'; end if;
end $$;
create or replace function public.bookish_host_reports(p_club uuid) returns table(report_id uuid,take_id uuid,body text,reason text,due_at timestamptz,host_status text,review_status text) language plpgsql stable security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 return query select r.id,t.id,case when bookish_private.can_unseal(t.id) then t.body end,r.reason,r.due_at,r.host_status,r.review_status from bookish_private.reports r join public.bookish_takes t on t.id=r.take_id where t.club_id=p_club and r.host_status='pending' order by r.created_at limit 100;
end $$;
create or replace function public.bookish_moderate_take(p_take uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; begin select club_id into cid from public.bookish_takes where id=p_take; perform bookish_private.require_host(cid);
 if p_action='hide' then update public.bookish_takes set hidden=true where id=p_take;
 elsif p_action<>'dismiss' or p_action is null then raise exception 'Choose hide or dismiss.'; end if;
 update bookish_private.reports set host_status=case when p_action='hide' then 'hidden' else 'dismissed' end where take_id=p_take;
 -- Host actions do not close the separate safety review queue.
end $$;

-- Service-only moderation operations. No anonymous author in queue responses.
create or replace function public.bookish_review_queue() returns table(report_id uuid,take_id uuid,club_id uuid,body text,reason text,due_at timestamptz,host_status text) language sql stable security definer set search_path='' as $$
 select r.id,t.id,t.club_id,t.body,r.reason,r.due_at,r.host_status from bookish_private.reports r join public.bookish_takes t on t.id=r.take_id where r.review_status='pending' order by r.due_at limit 200
$$;
create or replace function public.bookish_safety_review(p_take uuid,p_action text,p_actor text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_action not in ('hide','dismiss','ban') or p_action is null or nullif(trim(p_actor),'') is null then raise exception 'Choose a review action and reviewer.'; end if;
 insert into bookish_private.safety_audit(take_id,actor,reason,action) values(p_take,p_actor,p_reason,p_action);
 if p_action in ('hide','ban') then update public.bookish_takes set hidden=true where id=p_take; end if;
 if p_action='ban' then update public.bookish_profiles set banned_at=now() where id=(select author_id from bookish_private.take_authors where take_id=p_take); end if;
 update bookish_private.reports set review_status=case p_action when 'hide' then 'hidden' when 'ban' then 'banned' else 'dismissed' end,reviewed_at=now() where take_id=p_take;
end $$;
create or replace function public.bookish_escalate_author(p_take uuid,p_actor text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare author uuid; begin
 if nullif(trim(p_actor),'') is null then raise exception 'Record the safety reviewer.'; end if;
 insert into bookish_private.safety_audit(take_id,actor,reason,action) values(p_take,p_actor,p_reason,'legal_or_safety_identity_access');
 select author_id into author from bookish_private.take_authors where take_id=p_take; return author;
end $$;

create or replace function public.bookish_held_queue() returns table(id uuid,club_id uuid,body text,due_at timestamptz) language sql stable security definer set search_path='' as $$
 select h.id,h.club_id,h.body,h.due_at from bookish_private.content_holds h where h.review_status='pending' order by h.due_at limit 200
$$;
create or replace function public.bookish_dismiss_hold(p_hold uuid,p_actor text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if nullif(trim(p_actor),'') is null then raise exception 'Record the safety reviewer.'; end if;
 insert into bookish_private.safety_audit(actor,reason,action) values(p_actor,p_reason,'dismiss_held_content');
 update bookish_private.content_holds set review_status='dismissed' where id=p_hold;
end $$;

-- Hard deletion removes UGC itself, rather than leaving orphaned anonymous posts.
create or replace function bookish_private.delete_profile_data() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; successor uuid;
begin
 delete from public.bookish_takes where id in (select take_id from bookish_private.take_authors where author_id=old.id);
 -- Shared meeting coordination can remain, with claims released by their FK.
 for cid in select club_id from public.bookish_members where user_id=old.id and role='host' order by club_id loop
  perform 1 from public.bookish_clubs where id=cid for update;
  select m.user_id into successor from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id
    where m.club_id=cid and m.user_id<>old.id and p.banned_at is null order by (m.role='cohost') desc,m.joined_at,m.user_id limit 1;
  if successor is null then delete from public.bookish_clubs where id=cid;
  else update public.bookish_members set role='host' where club_id=cid and user_id=successor; end if;
 end loop;
 return old;
end $$;
create or replace trigger bookish_delete_profile_data before delete on public.bookish_profiles for each row execute function bookish_private.delete_profile_data();
create or replace function bookish_private.delete_legacy_data() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.raw_app_meta_data->>'app' is distinct from 'bookish' or old.email_confirmed_at is null then return old; end if;
 delete from public.bookish_join_requests where lower(email)=lower(old.email) or lower(email) in (select lower(i.identity_data->>'email') from auth.identities i where i.user_id=old.id and i.identity_data->>'email_verified'='true');
 delete from public.bookish_submissions where lower(email)=lower(old.email) or lower(email) in (select lower(i.identity_data->>'email') from auth.identities i where i.user_id=old.id and i.identity_data->>'email_verified'='true');
 return old;
-- Marked Bookish deletions are atomic: failed cleanup preserves Auth for retry.
end $$;
create or replace trigger bookish_delete_legacy_data before delete on auth.users for each row execute function bookish_private.delete_legacy_data();

revoke all on all functions in schema bookish_private from public,anon,authenticated,service_role;
grant execute on function bookish_private.active_user(),bookish_private.is_member(uuid),bookish_private.is_host(uuid) to authenticated;
revoke all on function public.bookish_post_take(uuid, text, text, boolean, integer, integer, uuid),public.bookish_tea(uuid, text, uuid, integer, integer),public.bookish_react(uuid, text),public.bookish_take_action(uuid, text, text),public.bookish_host_reports(uuid),public.bookish_moderate_take(uuid, text) from public,anon,authenticated;
grant execute on function public.bookish_post_take(uuid, text, text, boolean, integer, integer, uuid),public.bookish_tea(uuid, text, uuid, integer, integer),public.bookish_react(uuid, text),public.bookish_take_action(uuid, text, text),public.bookish_host_reports(uuid),public.bookish_moderate_take(uuid, text) to authenticated;
revoke all on function public.bookish_review_queue(),public.bookish_safety_review(uuid, text, text, text),public.bookish_escalate_author(uuid, text, text),public.bookish_held_queue(),public.bookish_dismiss_hold(uuid, text, text) from public,anon,authenticated;
grant execute on function public.bookish_review_queue(),public.bookish_safety_review(uuid, text, text, text),public.bookish_escalate_author(uuid, text, text),public.bookish_held_queue(),public.bookish_dismiss_hold(uuid, text, text) to service_role;

-- SOURCE: supabase/sql/008_bookish_community_privacy.sql
-- Harden PR #12's existing aggregates: reading-club counts and rating-club counts
-- must independently pass the SAME existing 3-club floor. No new aggregates.

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

-- SOURCE: supabase/sql/009_bookish_visibility.sql
-- See the job's apply.sql for the required backup and directory seed.

alter table public.bookish_clubs add column if not exists visibility text not null default 'private'
  check (visibility in ('open','private','hidden'));
alter table public.bookish_clubs add column if not exists public_data jsonb not null default '{}';
alter table public.bookish_clubs add column if not exists owner_submission_id uuid references public.bookish_submissions(id);
create unique index if not exists bookish_visibility_ref on public.bookish_clubs(club_ref) where club_ref is not null;
-- Pre-existing app clubs with no public listing remain Private.
-- Public directory seed and confirmed legacy submissions are backfilled separately.
create table if not exists public.bookish_city_centers (
 city text not null,state text not null,lat double precision not null,lng double precision not null,
 primary key(city,state),check(lat between -90 and 90),check(lng between -180 and 180)
);
grant select,insert,update,delete on table public.bookish_city_centers to service_role;
alter table public.bookish_city_centers enable row level security;
revoke all on table public.bookish_city_centers from public,anon,authenticated;
create or replace function public.bookish_visibility_location(p_city text,p_state text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookish_city_centers where lower(city)=lower(trim(p_city)) and state=upper(trim(p_state)))
$$;
revoke all on function public.bookish_visibility_location(text,text) from public,anon,authenticated;
grant execute on function public.bookish_visibility_location(text,text) to service_role;

create table if not exists public.bookish_join_attempts (
  id uuid primary key default gen_random_uuid(), ip_hash text not null,
  email text not null, created_at timestamptz not null default now()
);
grant select,insert,update,delete on table public.bookish_join_attempts to service_role;
alter table public.bookish_join_attempts enable row level security;
revoke all on table public.bookish_join_attempts from public,anon,authenticated;
create index if not exists bookish_join_attempts_ip on public.bookish_join_attempts(ip_hash,created_at);
create index if not exists bookish_join_attempts_email on public.bookish_join_attempts(email,created_at);
-- No raw access: even the owner capability goes through a scoped server function.
revoke all on public.bookish_clubs,public.bookish_submissions,public.bookish_join_requests,public.bookish_invites from public,anon,authenticated;
grant select,insert,update,delete on public.bookish_clubs,public.bookish_submissions,public.bookish_join_requests,public.bookish_invites to service_role;

create or replace function public.bookish_visibility_directory() returns jsonb
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
create or replace function public.bookish_visibility_confirm() returns trigger
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
drop trigger if exists bookish_visibility_confirm on public.bookish_submissions;
create trigger bookish_visibility_confirm after insert or update of status on public.bookish_submissions
 for each row execute function public.bookish_visibility_confirm();

create or replace function public.bookish_visibility_decide(p_token uuid,p_approve boolean) returns jsonb
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

create or replace function public.bookish_visibility_host(p_token uuid,p_action text,p_ref text,p_visibility text default null,p_request uuid default null,p_approve boolean default null) returns jsonb
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

-- SOURCE: supabase/sql/010_bookish_v11_integration.sql
-- Require live trusted metadata, confirmed email, and a live profile on every call.
create or replace function bookish_private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookish_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.banned_at is null and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish')
$$;
-- 009's directory API never replaces authenticated member access.
grant select on public.bookish_clubs to authenticated;
create table if not exists bookish_private.auth_attempts(id uuid primary key default gen_random_uuid(),email_hash text not null,ip_hash text not null,action text not null,created_at timestamptz not null default now());
alter table bookish_private.auth_attempts enable row level security;
revoke all on bookish_private.auth_attempts from public,anon,authenticated,service_role;
create index if not exists bookish_auth_attempt_email on bookish_private.auth_attempts(email_hash,created_at);
create index if not exists bookish_auth_attempt_ip on bookish_private.auth_attempts(ip_hash,created_at);
create or replace function public.bookish_auth_lookup(p_email text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'bookish',coalesce(raw_app_meta_data->>'app'='bookish',false)) from auth.users where lower(email)=lower(trim(p_email)) limit 1
$$;
create or replace function public.bookish_auth_throttle(p_email text,p_ip text,p_action text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_email is null or p_ip is null or p_action not in ('start','verify','password','refresh','logout') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip,42));
 perform pg_advisory_xact_lock(hashtextextended(p_email,43));
 delete from bookish_private.auth_attempts where created_at<now()-interval '30 days';
 if (select count(*) from bookish_private.auth_attempts where ip_hash=p_ip and created_at>now()-interval '1 hour')>=100 then return false; end if;
 if p_action='start' and ((select count(*) from bookish_private.auth_attempts where email_hash=p_email and action='start' and created_at>now()-interval '1 hour')>=5 or (select count(*) from bookish_private.auth_attempts where ip_hash=p_ip and action='start' and created_at>now()-interval '1 hour')>=15) then return false; end if;
 if p_action in ('verify','password') and (select count(*) from bookish_private.auth_attempts where email_hash=p_email and action in ('verify','password') and created_at>now()-interval '1 hour')>=10 then return false; end if;
 insert into bookish_private.auth_attempts(email_hash,ip_hash,action) values(p_email,p_ip,p_action);return true;
end $$;
revoke all on function public.bookish_auth_lookup(text),public.bookish_auth_throttle(text,text,text) from public,anon,authenticated;
grant execute on function public.bookish_auth_lookup(text),public.bookish_auth_throttle(text,text,text) to service_role;

create or replace function public.bookish_sync_account() returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; uid uuid:=auth.uid();
begin
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'app'='bookish' and email_confirmed_at is not null) then raise exception 'Sign in to Bookish to continue.'; end if;
 insert into public.bookish_profiles(id) values(uid) on conflict do nothing;
 if not bookish_private.active_user() then raise exception 'Account unavailable.'; end if;
 -- First confirmed owner retains the listing. Only proof of this email plus a
 -- trusted Bookish identity can attach an Auth host to a legacy listing.
 for cid in select c.id from public.bookish_clubs c join public.bookish_submissions s on s.id=c.owner_submission_id join auth.users u on u.id=uid and lower(u.email)=lower(s.email)
 where s.status='confirmed' and not exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role in ('host','cohost')) loop
  insert into public.bookish_members(club_id,user_id,role) values(cid,uid,'host') on conflict(club_id,user_id) do update set role='host';
 end loop;
end $$;
create or replace function public.bookish_create_club(p_name text,p_city text,p_state text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform bookish_private.require_terms();
 if nullif(trim(p_city),'') is null or length(p_city)>80 or p_state is null or upper(trim(p_state)) !~ '^[A-Z]{2}$' then raise exception 'Choose your city and state.'; end if;
 insert into public.bookish_clubs(name,city,state,visibility) values(trim(p_name),trim(p_city),upper(trim(p_state)),'private') returning id into cid;
 update public.bookish_clubs set club_ref=cid::text where id=cid;
 insert into public.bookish_members(club_id,user_id,role) values(cid,auth.uid(),'host');
 insert into public.bookish_preferences(user_id,active_club_id) values(auth.uid(),cid) on conflict(user_id) do update set active_club_id=cid;
 return cid;
end $$;
create or replace function public.bookish_set_visibility(p_club uuid,p_visibility text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform bookish_private.require_host(p_club);
 if p_visibility is null or p_visibility not in ('open','private','hidden') then raise exception 'Choose club visibility.'; end if;
 if p_visibility in ('open','private') and not exists(select 1 from public.bookish_clubs c join public.bookish_city_centers g on lower(g.city)=lower(c.city) and g.state=c.state where c.id=p_club) then raise exception 'Choose a supported city before listing this club.'; end if;
 update public.bookish_clubs set visibility=p_visibility,listed=p_visibility<>'hidden',club_ref=coalesce(club_ref,id::text) where id=p_club;
 if p_visibility='hidden' then update public.bookish_join_requests set status='declined',decided_at=now() where club_id=p_club and status='pending'; end if;
end $$;
create or replace function public.bookish_rotate_invite(p_club uuid) returns text language plpgsql security definer set search_path='' as $$
declare code text;
begin
 perform bookish_private.require_host(p_club);
 perform 1 from public.bookish_clubs where id=p_club for update;
 delete from public.bookish_invites where club_id=p_club or club_ref in (select club_ref from public.bookish_clubs where id=p_club);
 code:=public.bookish_create_invite(p_club,20,7);return code;
end $$;

create or replace function public.bookish_join_club(p_ref text,p_note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; rid uuid; prior public.bookish_join_requests;
begin
 perform bookish_private.require_terms();
 select * into c from public.bookish_clubs where club_ref=p_ref or id::text=p_ref for update;
 if c.id is null or exists(select 1 from bookish_private.content_removals where kind='club' and target_id=c.id) or exists(select 1 from bookish_private.club_removals where club_id=c.id and user_id=auth.uid()) then raise exception 'Your host can help you join.'; end if;
 if bookish_private.is_member(c.id) then return jsonb_build_object('club_id',c.id,'status','joined'); end if;
 if c.visibility='hidden' or not(c.listed or c.owner_submission_id is not null) or (c.owner_submission_id is null and not exists(select 1 from public.bookish_members where club_id=c.id and role='host')) then raise exception 'Your host can help you join.'; end if;
 select j.* into prior from public.bookish_join_requests j join auth.users u on u.id=auth.uid() and lower(u.email)=lower(j.email) where j.club_ref=c.club_ref and j.status='approved' order by j.created_at limit 1;
 if c.visibility='open' or prior.id is not null then
  insert into public.bookish_members(club_id,user_id) values(c.id,auth.uid()) on conflict do nothing;
  update public.bookish_join_requests set club_id=c.id,user_id=auth.uid(),status='approved',decided_at=now() where club_ref=c.club_ref and (user_id=auth.uid() or id=prior.id) and status in ('pending','approved');
  return jsonb_build_object('club_id',c.id,'status','joined');
 end if;
 perform 1 from public.bookish_profiles where id=auth.uid() for update;
 if (select count(*) from public.bookish_join_requests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 and not exists(select 1 from public.bookish_join_requests where club_id=c.id and user_id=auth.uid() and status='pending') then raise exception 'Please wait before requesting another club.';end if;
 insert into public.bookish_join_requests(club_id,user_id,club_ref,email,first_name,note)
 select c.id,auth.uid(),c.club_ref,u.email,p.display_name,p_note from auth.users u join public.bookish_profiles p on p.id=u.id where u.id=auth.uid()
 on conflict(club_id,user_id) where status='pending' and user_id is not null do update set note=excluded.note returning id into rid;
 return jsonb_build_object('club_id',c.id,'request_id',rid,'status','pending');
end $$;
-- Old native clients share the same visibility semantics.
create or replace function public.bookish_request_join(p_club uuid,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result jsonb; begin result:=public.bookish_join_club(p_club::text,p_note);return (result->>'request_id')::uuid;end $$;

create table if not exists bookish_private.actor_blocks(user_id uuid references public.bookish_profiles(id) on delete cascade,author_id uuid references public.bookish_profiles(id) on delete cascade,primary key(user_id,author_id));
create table if not exists bookish_private.content_hides(user_id uuid references public.bookish_profiles(id) on delete cascade,kind text not null,target_id uuid not null,primary key(user_id,kind,target_id));
create table if not exists bookish_private.content_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid references public.bookish_profiles(id) on delete cascade,kind text not null,target_id uuid not null,club_id uuid references public.bookish_clubs(id) on delete cascade,reason text check(length(reason)<=500),created_at timestamptz not null default now(),due_at timestamptz not null default now()+interval '24 hours',status text not null default 'pending' check(status in ('pending','resolved')),unique(reporter_id,kind,target_id));
alter table bookish_private.actor_blocks enable row level security;
alter table bookish_private.content_hides enable row level security;
alter table bookish_private.content_reports enable row level security;
revoke all on bookish_private.actor_blocks,bookish_private.content_hides,bookish_private.content_reports from public,anon,authenticated,service_role;
-- Safety reviewers receive scoped reports, not anonymous author mappings.
create or replace function public.bookish_content_report_queue() returns table(id uuid,kind text,target_id uuid,club_id uuid,reason text,due_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,kind,target_id,club_id,reason,due_at from bookish_private.content_reports where status='pending' order by created_at limit 100
$$;
revoke all on function public.bookish_content_report_queue() from public,anon,authenticated;
grant execute on function public.bookish_content_report_queue() to service_role;

create table if not exists bookish_private.content_removals(kind text not null,target_id uuid not null,created_at timestamptz not null default now(),primary key(kind,target_id));
create table if not exists bookish_private.content_moderation_audit(id uuid primary key default gen_random_uuid(),report_id uuid references bookish_private.content_reports(id) on delete cascade,action text not null,reviewer text not null,note text not null,created_at timestamptz not null default now());
alter table bookish_private.content_removals enable row level security;
alter table bookish_private.content_moderation_audit enable row level security;
revoke all on bookish_private.content_removals,bookish_private.content_moderation_audit from public,anon,authenticated,service_role;
create or replace function public.bookish_review_content(p_report uuid,p_action text,p_reviewer text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r bookish_private.content_reports;
begin
 if p_action is null or p_action not in ('dismiss','hide','ban') or length(trim(coalesce(p_reviewer,'')))<3 or length(trim(coalesce(p_note,'')))<10 then raise exception 'A review action, reviewer, and note are required.';end if;
 select * into r from bookish_private.content_reports where id=p_report for update;
 if r.id is null then raise exception 'Report unavailable.';end if;
 if p_action='ban' and r.kind<>'member' then raise exception 'Use a member report for an account ban.';end if;
 if p_action in ('hide','ban') then insert into bookish_private.content_removals(kind,target_id) values(r.kind,r.target_id) on conflict do nothing;end if;
 if p_action='hide' and r.kind='club' then
 update public.bookish_clubs set visibility='hidden',listed=false where id=r.target_id;
 delete from public.bookish_invites where club_id=r.target_id or club_ref in(select club_ref from public.bookish_clubs where id=r.target_id);
 update public.bookish_join_requests set status='declined',decided_at=now() where club_id=r.target_id and status='pending';
 end if;
 if p_action='ban' then update public.bookish_profiles set banned_at=now() where id=r.target_id;end if;
 update bookish_private.content_reports set status='resolved' where id=r.id;
 insert into bookish_private.content_moderation_audit(report_id,action,reviewer,note) values(r.id,p_action,p_reviewer,p_note);
end $$;
revoke all on function public.bookish_review_content(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bookish_review_content(uuid,text,text,text) to service_role;
create or replace function bookish_private.content_visible(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from bookish_private.content_removals where kind=p_kind and target_id=p_id)
 and not exists(select 1 from bookish_private.content_hides where user_id=auth.uid() and kind=p_kind and target_id=p_id)
 and (p_kind<>'member' or not exists(select 1 from bookish_private.actor_blocks where user_id=auth.uid() and author_id=p_id))
$$;
create or replace function public.bookish_club_detail(p_ref text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',coalesce(c.club_ref,c.id::text),'club_id',c.id,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility,'hosted',exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role='host'))
 from public.bookish_clubs c where (c.club_ref=p_ref or c.id::text=p_ref) and bookish_private.content_visible('club',c.id) and ((c.visibility in ('open','private') and (c.listed or c.owner_submission_id is not null)) or bookish_private.is_member(c.id)) limit 1
$$;
create or replace function public.bookish_content_action(p_kind text,p_id uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; author uuid;
begin
 perform bookish_private.require_terms();
 if p_action is null or p_action not in ('report','block','hide') then raise exception 'Choose report, block, or hide.'; end if;
 if p_kind='take' then perform public.bookish_take_action(p_id,p_action,p_reason);return;
 elsif p_kind='club' then select id into cid from public.bookish_clubs where id=p_id and ((visibility in ('open','private') and (listed or owner_submission_id is not null)) or bookish_private.is_member(id));
 elsif p_kind='member' then select m.club_id,m.user_id into cid,author from public.bookish_members m where m.user_id=p_id and bookish_private.is_member(m.club_id) limit 1;
 elsif p_kind='meeting' then select club_id into cid from public.bookish_meetings where id=p_id and bookish_private.is_member(club_id);
 elsif p_kind='vote' then select club_id into cid from public.bookish_votes where id=p_id and bookish_private.is_member(club_id);
 elsif p_kind='request' then select club_id,user_id into cid,author from public.bookish_join_requests where id=p_id and bookish_private.is_host(club_id);
 end if;
 if cid is null then raise exception 'This content is unavailable.'; end if;
 if p_kind='member' and author=auth.uid() and p_action='block' then raise exception 'This is your own account.'; end if;
 insert into bookish_private.content_hides values(auth.uid(),p_kind,p_id) on conflict do nothing;
 if p_action='block' and author is not null and author<>auth.uid() then insert into bookish_private.actor_blocks values(auth.uid(),author) on conflict do nothing;end if;
 if p_action='report' then insert into bookish_private.content_reports(reporter_id,kind,target_id,club_id,reason) values(auth.uid(),p_kind,p_id,cid,p_reason) on conflict do nothing;end if;
end $$;
create or replace function public.bookish_my_content_filters() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',h.kind,'id',h.target_id)),'[]'::jsonb) from bookish_private.content_hides h where h.user_id=auth.uid() and bookish_private.active_user()
$$;
create or replace function public.bookish_my_clubs() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) from (select c.id,c.club_ref,c.name,c.city,c.state,c.visibility,m.role from public.bookish_clubs c join public.bookish_members m on m.club_id=c.id and m.user_id=auth.uid() where bookish_private.active_user() and bookish_private.content_visible('club',c.id)) x
$$;
create or replace function public.bookish_club_home(p_club uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform bookish_private.require_member(p_club);
 if not bookish_private.content_visible('club',p_club) then raise exception 'This club is hidden.';end if;
 select jsonb_build_object('club',jsonb_build_object('id',c.id,'club_ref',c.club_ref,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility),
 'role',(select role from public.bookish_members where club_id=c.id and user_id=auth.uid()),
 'current_book',(select to_jsonb(b) from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id where cb.club_id=c.id and cb.status='reading' limit 1),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'display_name',p.display_name,'joined_at',m.joined_at) order by m.joined_at),'[]'::jsonb) from public.bookish_members m join public.bookish_profiles p on p.id=m.user_id where m.club_id=c.id and p.banned_at is null and bookish_private.content_visible('member',m.user_id)),
 'meetings',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('bring_items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.bookish_bring_items i where i.meeting_id=m.id),'rsvps',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.bookish_rsvps r where r.meeting_id=m.id)) order by m.starts_at),'[]'::jsonb) from public.bookish_meetings m where m.club_id=c.id and bookish_private.content_visible('meeting',m.id)),
 'votes',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('options',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from public.bookish_vote_options o where o.vote_id=v.id),'tally',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.bookish_vote_tally(v.id) t)) order by v.closes_at desc),'[]'::jsonb) from public.bookish_votes v where v.club_id=c.id and bookish_private.content_visible('vote',v.id))) into result from public.bookish_clubs c where c.id=p_club;
 return result;
end $$;
-- Native and website discovery share a safe projection. Never use a club venue's
-- coordinates, exact meeting locations, email, tokens, or arbitrary payload JSON.
create or replace function public.bookish_visibility_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.club_ref,'club_id',c.id,'name',c.name,'city',c.city,'state',c.state,'visibility',c.visibility,
 'verified',c.owner_submission_id is not null or exists(select 1 from public.bookish_members m where m.club_id=c.id and m.role='host'),
 'current_book',(select jsonb_build_object('title',b.title,'authors',b.authors) from public.bookish_club_books cb join public.bookish_books b on b.id=cb.book_id where cb.club_id=c.id and cb.status='reading' limit 1),
 'genres',case when c.visibility='open' then coalesce(c.public_data->'genres','[]'::jsonb) else '[]'::jsonb end,
 'cadence',case when c.visibility='open' then c.public_data->'cadence' end,'format',case when c.visibility='open' then c.public_data->'format' end,'vibe',null,
 'source_name',case when c.visibility='open' and c.owner_submission_id is null then c.public_data->'source_name' end,'source_url',case when c.visibility='open' and c.owner_submission_id is null then c.public_data->'source_url' end,
 'last_seen',c.public_data->'last_seen','lat',g.lat,'lng',g.lng,'city_path',c.public_data->'city_path') order by c.name,c.club_ref),'[]'::jsonb)
 from public.bookish_clubs c left join public.bookish_city_centers g on lower(g.city)=lower(c.city) and g.state=c.state
 where c.visibility in ('open','private') and c.club_ref is not null and (c.listed or c.owner_submission_id is not null) and bookish_private.content_visible('club',c.id)
$$;
create or replace function bookish_private.can_view_take(p_take uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain as (
  select t.id,t.parent_id,t.club_id,t.hidden,0 depth from public.bookish_takes t where t.id=p_take
  union all select t.id,t.parent_id,t.club_id,t.hidden,c.depth+1 from public.bookish_takes t join chain c on c.parent_id=t.id where c.depth<10
 )
 select exists(select 1 from chain) and not exists(
  select 1 from chain c left join bookish_private.take_authors a on a.take_id=c.id
  left join public.bookish_profiles p on p.id=a.author_id
  where c.hidden or not bookish_private.is_member(c.club_id) or a.author_id is null or p.banned_at is not null or not exists(select 1 from public.bookish_members m where m.club_id=c.club_id and m.user_id=a.author_id)
   or exists(select 1 from bookish_private.hidden_takes h where h.take_id=c.id and h.user_id=auth.uid())
   or exists(select 1 from bookish_private.actor_blocks ab where ab.user_id=auth.uid() and ab.author_id=a.author_id)
   or exists(select 1 from bookish_private.blocks b where b.user_id=auth.uid() and b.take_id=c.id)
 )
$$;
create or replace function public.bookish_take_action(p_take uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare author uuid; cid uuid;
begin
 select a.author_id,t.club_id into author,cid from public.bookish_takes t join bookish_private.take_authors a on a.take_id=t.id where t.id=p_take;
 perform bookish_private.require_member(cid);
 if p_action='delete' and author=auth.uid() then delete from public.bookish_takes where id=p_take; return; end if;
 if not bookish_private.can_view_take(p_take) and not exists(select 1 from bookish_private.hidden_takes where take_id=p_take and user_id=auth.uid()) then raise exception 'This conversation is not available. A fresh take awaits.'; end if;
 if p_action='block' then
  if author=auth.uid() then raise exception 'This is one of your own lovely takes.'; end if;
  insert into bookish_private.blocks values(auth.uid(),p_take) on conflict do nothing;
  insert into bookish_private.actor_blocks values(auth.uid(),author) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
  delete from public.bookish_take_reactions where take_id=p_take and user_id=auth.uid();
 elsif p_action='hide' then insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 elsif p_action='report' then
  insert into bookish_private.reports(take_id,reporter_id,reason) values(p_take,auth.uid(),p_reason) on conflict do nothing;
  insert into bookish_private.hidden_takes values(auth.uid(),p_take) on conflict do nothing;
 else raise exception 'Choose report, hide, block or delete.'; end if;
end $$;
create or replace function public.bookish_visibility_confirm() returns trigger
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
 where bookish_clubs.owner_submission_id is null and not exists(select 1 from public.bookish_members m where m.club_id=bookish_clubs.id and m.role in ('host','cohost'));
 return new;
end $$;
create or replace function public.bookish_visibility_host(p_token uuid,p_action text,p_ref text,p_visibility text default null,p_request uuid default null,p_approve boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.bookish_clubs; code_value text; i int; decision jsonb;
begin
 select cl.* into c from public.bookish_clubs cl join public.bookish_submissions s on s.id=cl.owner_submission_id
 where cl.club_ref=p_ref and s.confirm_token=p_token and s.status='confirmed' for update of cl;
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
 'notice',decision->'notice','requests',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'email',email,'note',note) order by created_at),'[]'::jsonb) from public.bookish_join_requests where club_ref=c.club_ref and status='pending'));
end $$;
create or replace function public.bookish_visibility_decide(p_token uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.bookish_join_requests; c public.bookish_clubs;
begin
 select * into r from public.bookish_join_requests where decision_token=p_token;
 if r.id is null then return jsonb_build_object('ok',false); end if;
 select * into c from public.bookish_clubs where (id=r.club_id or club_ref=r.club_ref) for update;
 if c.id is null or c.visibility='hidden' then return jsonb_build_object('ok',false); end if;
 update public.bookish_join_requests set status=case when p_approve then 'approved' else 'declined' end,decided_at=now()
 where id=r.id and status='pending' returning * into r;
 if not found then return jsonb_build_object('ok',false); end if;
 if p_approve and r.user_id is not null then
  if exists(select 1 from bookish_private.club_removals where club_id=c.id and user_id=r.user_id) or not exists(select 1 from public.bookish_profiles p join auth.users u on u.id=p.id where p.id=r.user_id and p.banned_at is null and u.email_confirmed_at is not null and u.raw_app_meta_data->>'app'='bookish') then raise exception 'This account is unavailable.';end if;
  insert into public.bookish_members(club_id,user_id) values(c.id,r.user_id) on conflict do nothing;
 end if;
 return jsonb_build_object('ok',true,'status',r.status,'notice',jsonb_build_object('kind','decision','to',r.email,'name',r.first_name,'club',c.name,'approved',p_approve,'host_email',case when p_approve then (select email from public.bookish_submissions where id=c.owner_submission_id) end));
end $$;

-- A former legacy host's email submission must not prevent account deletion or
-- erase the club transferred to its remaining members.
do $fk$ declare r record;begin
 for r in select conname from pg_constraint where conrelid='public.bookish_clubs'::regclass and contype='f' and confrelid='public.bookish_submissions'::regclass and confdeltype<>'n' loop
 execute format('alter table public.bookish_clubs drop constraint %I',r.conname);
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.bookish_clubs'::regclass and contype='f' and confrelid='public.bookish_submissions'::regclass) then
 alter table public.bookish_clubs add constraint bookish_clubs_owner_submission_id_fkey foreign key(owner_submission_id) references public.bookish_submissions(id) on delete set null;
 end if;
end $fk$;
create or replace function bookish_private.delete_account_traces() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.raw_app_meta_data->>'app' is distinct from 'bookish' then return old;end if;
 delete from bookish_private.auth_attempts where email_hash=encode(sha256(convert_to('bookish:'||lower(old.email),'UTF8')),'hex');
 if old.email_confirmed_at is not null then
 delete from public.bookish_join_attempts where lower(email)=lower(old.email) or lower(email) in(select lower(i.identity_data->>'email') from auth.identities i where i.user_id=old.id and i.identity_data->>'email_verified'='true');
 end if;
 delete from bookish_private.content_hides where kind='member' and target_id=old.id;
 delete from bookish_private.content_reports where kind='member' and target_id=old.id;
 return old;
end $$;
create or replace trigger bookish_delete_account_traces before delete on auth.users for each row execute function bookish_private.delete_account_traces();


alter table public.bookish_join_requests add column if not exists notice_attempted_at timestamptz;
create or replace function public.bookish_join_notice(p_request uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.bookish_join_requests; c public.bookish_clubs; recipient text;
begin
 select * into j from public.bookish_join_requests where id=p_request and user_id=p_user and status='pending' for update;
 if j.id is null or j.host_notified or j.notice_attempted_at>now()-interval '5 minutes' then return null;end if;
 select * into c from public.bookish_clubs where id=j.club_id;
 select email into recipient from public.bookish_submissions where id=c.owner_submission_id and status='confirmed';
 if recipient is null then select u.email into recipient from public.bookish_members m join auth.users u on u.id=m.user_id where m.club_id=c.id and m.role='host' and u.raw_app_meta_data->>'app'='bookish' and u.email_confirmed_at is not null order by m.joined_at limit 1;end if;
 if recipient is null then return null;end if;
 update public.bookish_join_requests set notice_attempted_at=now() where id=j.id;
 return jsonb_build_object('kind','request','to',recipient,'club',c.name,'name',j.first_name,'note',j.note,'decision_token',j.decision_token);
end $$;
revoke all on function public.bookish_join_notice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bookish_join_notice(uuid,uuid) to service_role;
create or replace function public.bookish_join_notice_done(p_request uuid,p_user uuid) returns void language sql security definer set search_path='' as $$
 update public.bookish_join_requests set host_notified=true where id=p_request and user_id=p_user
$$;
revoke all on function public.bookish_join_notice_done(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bookish_join_notice_done(uuid,uuid) to service_role;
-- Refreshing a blocked request must not redisplay its author or note.
create or replace function public.bookish_join_queue(p_club uuid) returns table(id uuid,user_id uuid,first_name text,note text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin perform bookish_private.require_host(p_club);
 return query select j.id,j.user_id,j.first_name,j.note,j.created_at from public.bookish_join_requests j where j.club_id=p_club and j.status='pending' and bookish_private.content_visible('request',j.id) and (j.user_id is null or bookish_private.content_visible('member',j.user_id));end $$;


create or replace function public.bookish_set_club_city(p_club uuid,p_city text,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare geo public.bookish_city_centers;
begin
 perform bookish_private.require_host(p_club);
 select * into geo from public.bookish_city_centers where lower(city)=lower(trim(p_city)) and state=upper(trim(p_state)) limit 1;
 if geo.city is null then raise exception 'Choose a supported city and state.';end if;
 update public.bookish_clubs set city=geo.city,state=geo.state where id=p_club;
end $$;
revoke all on function public.bookish_set_club_city(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bookish_set_club_city(uuid,text,text) to authenticated;
-- Personal content preferences apply to both composed RPC reads and the Data API.
drop policy if exists clubs_read on public.bookish_clubs;
create policy clubs_read on public.bookish_clubs for select to authenticated using(bookish_private.is_member(id) and bookish_private.content_visible('club',id));
drop policy if exists members_read on public.bookish_members;
create policy members_read on public.bookish_members for select to authenticated using(bookish_private.is_member(club_id) and bookish_private.content_visible('member',user_id));
drop policy if exists profiles_read on public.bookish_profiles;
create policy profiles_read on public.bookish_profiles for select to authenticated using(bookish_private.active_user() and bookish_private.content_visible('member',id) and (id=auth.uid() or exists(select 1 from public.bookish_members m where m.user_id=id and bookish_private.is_member(m.club_id))));
drop policy if exists club_read on public.bookish_meetings;
create policy club_read on public.bookish_meetings for select to authenticated using(bookish_private.is_member(club_id) and bookish_private.content_visible('meeting',id));
drop policy if exists club_read on public.bookish_votes;
create policy club_read on public.bookish_votes for select to authenticated using(bookish_private.is_member(club_id) and bookish_private.content_visible('vote',id));


-- Globally removed clubs cannot use member or legacy host tools to republish.
create or replace function bookish_private.is_member(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and bookish_private.content_visible('club',p_club) and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid())
$$;
create or replace function bookish_private.is_host(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bookish_private.active_user() and bookish_private.content_visible('club',p_club) and exists(select 1 from public.bookish_members where club_id=p_club and user_id=auth.uid() and role in ('host','cohost'))
$$;

-- Restore the hardened, independent established-club aggregate after legacy 009.
create or replace view public.bookish_active_clubs as
 with qualified as (select c.id,c.city,c.state from public.bookish_clubs c where c.visibility in ('open','private')
 and (select count(distinct m.user_id) from public.bookish_members m where m.club_id=c.id and m.joined_at<=now()-interval '14 days')>=3
 and exists(select 1 from public.bookish_club_books b where b.club_id=c.id and b.status='finished'))
 select q.id,q.city,q.state from qualified q where not exists(select 1 from qualified other join public.bookish_members mine on mine.club_id=q.id join public.bookish_members theirs on theirs.club_id=other.id and theirs.user_id=mine.user_id where other.id<>q.id);
revoke all on public.bookish_active_clubs from public,anon,authenticated;
grant select on public.bookish_active_clubs to service_role;
revoke all on function public.bookish_sync_account(),public.bookish_set_visibility(uuid,text),public.bookish_rotate_invite(uuid),public.bookish_club_detail(text),public.bookish_join_club(text,text),public.bookish_content_action(text,uuid,text,text),public.bookish_my_content_filters(),public.bookish_my_clubs(),public.bookish_club_home(uuid) from public,anon,authenticated;
grant execute on function public.bookish_sync_account(),public.bookish_set_visibility(uuid,text),public.bookish_rotate_invite(uuid),public.bookish_club_detail(text),public.bookish_join_club(text,text),public.bookish_content_action(text,uuid,text,text),public.bookish_my_content_filters(),public.bookish_my_clubs(),public.bookish_club_home(uuid) to authenticated;
revoke all on all functions in schema bookish_private from public,anon;
-- Private helpers are callable only inside member RLS and scoped RPCs.
grant execute on all functions in schema bookish_private to authenticated;

-- Vault is provisioned by Supabase, including its encryption key management.
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;
-- Plaintext is reachable only through the narrow service RPC, never direct API roles.
revoke all on schema vault from public,anon,authenticated,service_role;
revoke all on all tables in schema vault from public,anon,authenticated,service_role;
create or replace function public.bookish_get_secret(p_name text) returns text
 language plpgsql stable security definer set search_path='' as $secret$
declare value text;
begin
 if p_name is null or p_name not in (
  'BOOKISH_SITE_URL','BOOKISH_EMAIL_FROM','RESEND_API_KEY',
  'BOOKISH_APPLE_CLIENT_ID','BOOKISH_APPLE_TEAM_ID','BOOKISH_APPLE_KEY_ID',
  'BOOKISH_APPLE_PRIVATE_KEY','BOOKISH_TERMS_URL','BOOKISH_PRIVACY_URL',
  'BOOKISH_MODERATION_EMAIL'
 ) then raise exception 'Bookish secret name is not allowed.' using errcode='22023';end if;
 select s.decrypted_secret into value from vault.decrypted_secrets s where s.name=p_name;
 return value;
end $secret$;
revoke all on function public.bookish_get_secret(text) from public,anon,authenticated,service_role;
grant execute on function public.bookish_get_secret(text) to service_role;
comment on function public.bookish_get_secret(text) is 'Bookish edge configuration only. Service role execution, exact allowlist, null when missing. Never log returned values.';

-- Explicit privileges do not depend on hosted default privileges.
do $acl$ declare r record;begin
 for r in select tablename from pg_tables where schemaname='public' and tablename like 'bookish\_%' escape '\' loop
  execute format('alter table public.%I enable row level security',r.tablename);
  execute format('revoke all on public.%I from public,anon',r.tablename);
  execute format('grant select,insert,update,delete on public.%I to service_role',r.tablename);
 end loop;
end $acl$;
insert into bookish_release_20261101.state values('dedicated-chunk-01',now()) on conflict(version) do nothing;
commit;
