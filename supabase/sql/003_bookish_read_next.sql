-- Bookish: "Stuck on what to read next?" (book suggestions). Raw SQL, idempotent,
-- kept out of the shared project's migration history like 001/002 (see README).
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
