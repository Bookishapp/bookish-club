# Bookish: Book Club Night

*Your book club, just more fun.* (Repo name: bookish-club.)

Bookish brings more fun to the club you already have, with an iMessage experience in development. The home, host, and press pages lead with anonymous hot takes, club memories, and easier hosting, with a waitlist for launch. The web finder is already available as a supporting feature. Every page is pre-rendered HTML: marketing pages, city pages, genre-in-city pages, state pages, and genre hubs. The existing forms post to Supabase edge functions.

- **Live (temporary):** https://fictora.github.io/bookish-club/
- **Planned domain:** bookishclub.com (not bought yet; see "Custom domain" below)

## Privacy model (hard rules)

- **City-level only.** No club venue, address, neighborhood or coordinate finer than the city centroid is stored in `data/clubs.json` or shown on any page, the map, or in JSON-LD. `scripts/merge.mjs` drops venue/neighborhood fields and strips venue names out of club names and vibes.
- **Raw collector output is gitignored** (`data/raw/*.json`) because it contains branch/venue names. Keep it local (or in private storage). Note: commits before this rule landed contain raw files in git history. Rewrite history if that matters.
- **The map** (`src/map.js`, MapLibre + free OpenFreeMap tiles, no key) plots one point per city with a club count. Tapping a city opens that city's list.
- **Exact place and time** are for approved members only. For seeded listings, readers follow the source link.
- **"List my club in <city>"** is the toggle on claim/start. It is on by default for public venues and off by default for clubs that meet at home.

## Excluded source: BiblioCommons (dropped for good)

`library-bibliocommons` (978 clubs collected 2026-10-13) was **never published and was deleted on 2026-10-14**. BiblioCommons' terms limit content to personal, non-commercial use and bar republishing. The raw data, cache and collector are gone. `merge.mjs` rejects that source and any record whose source URL is on `bibliocommons.com`, with no override. See SOURCES.md. Older commits in git history still contain the raw file; history was not rewritten.

## Verified vs unclaimed clubs

Every club is one of two kinds, and every list (city pages, genre pages, search results and the map's city sheet) has a toggle at the top: **On Bookish** / **Listed from public calendars**, with counts. The toggle defaults to On Bookish when a list has any.

- **Verified ("On Bookish")**: a host claimed the club (or started it) and confirmed by email, meaning a `claim` / `start` row in `bookish_submissions` with `status='confirmed'`. These are the only clubs with **Request to join**, and the only ones with a schema.org `JoinAction`.
- **Unclaimed ("Not on Bookish yet")**: listed from public library and bookstore calendars. The card is muted and has **See where it meets** (the source page, the only route to the venue) and **Run this club? Claim it**. It has no join button. In JSON-LD it is described as a listing that points at its source.
- `bookish-join` rejects any request for a club that isn't verified (`403 not_on_bookish`), invite code or not.
- `bookish-verified` (public GET) returns the verified club ids. For clubs started on Bookish it also returns their city-level facts. `scripts/build.mjs` reads it at build time. The deploy workflow rebuilds every hour, so a newly confirmed claim goes live within the hour. In CI, if the fetch fails the build fails and the last good deploy stays up. For local previews, set `BOOKISH_VERIFIED_FILE=path.json` (`{"clubs":[{"id":"…","kind":"claim","listed":true}]}`).
- A host who turns off "List my club in <city>" is not shown anywhere.

## Layout

```
data/raw/<source>.json        raw records per source (gitignored; contain venue names)
data/raw/<source>.SOURCES.md  robots/ToS notes per source (rolled up into SOURCES.md)
data/clubs.json               merged, deduped, geocoded directory (what the site builds from)
data/ref/places.json          US Census place centroids (city -> lat/lng)
public/                       static assets copied as-is (fonts, ZIP centroid shards)
scripts/sources/*.mjs         collectors, one per source; throttled, cached in .cache/
scripts/merge.mjs             raw -> data/clubs.json (filters, adults-only, dedupe, geocode, ids)
scripts/build.mjs             data/clubs.json -> dist/ (all pages, sitemap.xml, robots.txt)
src/styles.css, src/site.js   the only CSS and JS (inlined CSS, ~10 KB JS, no framework)
supabase/                     table SQL + edge functions for the forms
```

No npm install is needed. Node 24+ only.

## Re-seed the directory

```sh
node scripts/sources/library-other.mjs            # each collector reads robots.txt rules + throttles itself
node scripts/sources/library-more.mjs
node scripts/sources/bookstores.mjs
node scripts/merge.mjs                           # -> data/clubs.json, prints counts + ungeocoded cities
node scripts/build-ref.mjs                       # only if place / ZIP reference data needs refreshing
```

Collectors cache raw responses under `.cache/` (gitignored). Delete a source's cache folder to force a fresh crawl. Before adding a new source, check its robots.txt and terms and record the result in `data/raw/<source>.SOURCES.md`, then run `node scripts/sources-md.mjs` to rebuild `SOURCES.md`. Silent Book Club, Bookclubs.com, Meetup and Eventbrite are excluded on purpose because their terms forbid collection. See SOURCES.md.

Rules every collector follows:
- It stores only the club name, city, neighborhood or venue, genre or vibe (if stated), cadence (if stated), source URL and last-seen date.
- It never stores personal emails, phone numbers or names.
- Adults only.
- It makes at most one request every 1.5 to 2 seconds per host, and backs off on 429 or 5xx responses.

## Build and preview locally

```sh
SITE_URL=http://localhost:4321/bookish-club node scripts/build.mjs
mkdir -p /tmp/bk && ln -sfn "$PWD/dist" /tmp/bk/bookish-club && (cd /tmp/bk && python3 -m http.server 4321)
# open http://localhost:4321/bookish-club/
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds `dist/` and publishes it to GitHub Pages. `data/clubs.json` is committed, so CI never crawls. To change the data: re-seed locally, commit `data/`, then open and merge a PR.

The repo is public because GitHub Pages for private repos needs a paid plan.

## Custom domain (bookishclub.com)

1. Buy `bookishclub.com`.
2. DNS: add apex `A` records to 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153, and a `CNAME` for `www` pointing to `fictora.github.io`.
3. Repo → Settings → Secrets and variables → Actions → **Variables**: set `SITE_URL=https://bookishclub.com` and `CUSTOM_DOMAIN=bookishclub.com`. The build then writes `dist/CNAME`; the root `CNAME` file holds the same value for reference. It also switches canonical URLs, the sitemap and the base path from `/bookish-club` to `/`.
4. Repo → Settings → Pages: set the custom domain to `bookishclub.com` and tick "Enforce HTTPS" once the certificate is issued.
5. Re-run the deploy workflow.
6. Set the edge function secret `BOOKISH_SITE_URL=https://bookishclub.com`, which controls where the confirm link redirects.

## Forms backend

- Tables `public.bookish_submissions` (`supabase/sql/001_bookish_submissions.sql`), `public.bookish_join_requests` and `public.bookish_invites` (`002_bookish_join.sql`). RLS is on with no policies, so only the service role can read or write them.
  - Apply it as raw SQL, **not** with `supabase db push`, so it stays out of the shared project's migration history.
- `bookish-submit` (POST, public) validates input and applies spam protection:
  - a honeypot field and a minimum fill time
  - no links allowed in free text
  - rate limits: 6 per IP-hash per hour, 3 per email per kind per day
  - a CORS allow-list
  - It then inserts the row.
- `bookish-join` (POST, public) handles "Request to join". It first rejects any club that isn't verified (`403 not_on_bookish`).
  - It applies a honeypot, a minimum fill time and rate limits: 5 per IP-hash per hour, 8 per email per day, and one open request per club.
  - A valid invite code (table `bookish_invites`) joins straight away (`via='invite'`).
  - Otherwise the request is stored as `pending` and the verified host is emailed approve and decline links.
  - Neither side sees the other's contact details until the host approves.
- `bookish-join-respond` (GET `?token=&action=approve|decline`) records the decision, emails the reader, and redirects the host to `/join/done/`.
- Email is a **logged stub** until `BOOKISH_EMAIL_FROM` is set (see `supabase/functions/_shared/bookish.ts`).
- `bookish-confirm` (GET `?token=`) handles double opt-in. It sets `status='confirmed'` and redirects to `/confirmed/`.
- The code gates confirmation email attempts only on the presence of both `BOOKISH_EMAIL_FROM` and `RESEND_API_KEY`; it does not check DNS or domain verification. An unverified `meetbookish.com` fails closed only because Resend rejects the send. Verify its sending DNS in Resend before setting `BOOKISH_EMAIL_FROM` to an approved sender such as `Bookish <hello@meetbookish.com>`. A submission stays `pending` until its confirmation link is used, even after Resend accepts the email. Provider rejection or a thrown email request leaves `email_sent_at` unset and returns success for the saved row with `confirm_sent: false`. Enabling the sender does not resend existing pending submissions. See the [confirmation email activation guide](docs/confirmation-emails.md) for verification, rollout, rollback, and offline tests. Production setup, deployment, and test sends require separate approval.

Deploy the functions:

```sh
supabase functions deploy bookish-submit --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
supabase functions deploy bookish-confirm --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
supabase functions deploy bookish-join --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
supabase functions deploy bookish-join-respond --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
supabase functions deploy bookish-verified --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
```

Read submissions with SQL as the service role, for example `select kind, email, payload, status, created_at from bookish_submissions order by created_at desc;`.

## Read next ("Stuck on what to read next?")

`/read-next/` suggests three books, then rows of more. Readers with no club get picks from day one through three taps (mood, length, one book they loved); "Skip" shows community rows only. No account, no model calls: `src/read-next.js` ranks `data/books.json` with fixed rules (spec weights: own/loved 0.35, history 0.20, community 0.20, taste 0.15; slots obvious / fit / wildcard; one book per author, one sequel max) and writes "why" lines from fixed templates. Taps and saved books stay in the reader's localStorage.

- **Catalog:** `data/books.seed.json` (hand-picked titles + mood tags) -> `node scripts/catalog.mjs` -> `data/books.json` + `supabase/sql/004_bookish_books_seed.sql`. Open Library is called once per book at catalog time, never at build or runtime. See SOURCES.md.
- **Covers:** Open Library Covers API by cover id, medium size, whole and unaltered, linked to the book. Never cropped, overlaid or used in marketing. No cover -> typographic cover.
- **Community stats** ("Clubs in Chicago loved", "After Fourth Wing, clubs read", pours, % finish): `supabase/sql/003_bookish_read_next.sql` adds the reading tables and aggregate views. **Privacy floor:** `bookish_privacy_floor()` in 003 is the one constant (3 clubs at launch; raise to 5 later). Every view drops rows below it, and only active clubs (2+ members, 1+ finished book) count. The public `bookish-community` function returns only those views; the build writes them to `/data/community.json` (a failed fetch builds with no community rows). `BOOKISH_COMMUNITY_FILE=path.json` previews with fixture data.
- Not built yet (needs the app's club/member model): the book-finished card, host vote builder, member vote and iMessage card (frames 01, 04-06).

```sh
supabase functions deploy bookish-community --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
```

## Theme

All colours, fonts and textures are CSS variables in `src/theme.css`. `src/styles.css` holds layout and the theme's motifs (paper cards, library card, bookmark ribbons) and reads those variables. To re-skin the site, swap or edit `theme.css` (plus any files in `public/fonts/` and `public/img/`) and rebuild.

Current theme (locked 2026-10-14): palette 05 **Oxblood Reading Room** on a gouache wall, the M2 middle-ground motifs, the R2-04 "ish reply" wordmark and the Y2K Sticker type system. Text pairs are WCAG AA (lowest is 4.96:1, the input placeholder).

- **Wall:** `public/img/bg-oxblood-{m,d}.webp`, recoloured from the raw gouache by `scripts/theme-assets.py` (tall crop for phones, wide crop for desktop). Below it the page is plain oxblood (`--ox-deep`).
- **Cards:** shelf paper (`--card`) with the paper grain `tx-paper-900.webp`. Verified clubs carry a brass bookmark ribbon; unclaimed clubs are a muted paper with an outline.
- **Club story** (home, hosts, and press): paper chat examples, drawn Lunair art, shared reading check-ins, and a small finder at the bottom. No rankings or comparative progress displays.
- **Props:** sun, daisy and two washi tapes from the r2 pass. No rainbow tape, sparkles or butterflies.
- **Wordmark:** `scripts/wordmark.mjs` renders R2-04 with the Oxblood colours (outer `#220710`, key `#f4a6bf`, bubble `#1d5a46`) to a transparent PNG master, `public/img/bookish-wordmark.png`. `scripts/wordmark-sizes.py` trims it and writes the `wordmark-{160,320,480}.webp` sizes the site uses. It needs Playwright; point `PLAYWRIGHT` at its `index.mjs`.

## Resources hub

`data/resources.json` drives `/resources/` and is published as `/data/resources.json` for the app. Each entry has these fields:
- `affiliate_url`: used instead of `url` when set
- `featured`
- `label`: honest disclosure, e.g. "From the makers of Bookish Club"
- `sponsored`
- `status`: `slot` entries are reserved placements that never render until filled

## Fonts

"Y2K Sticker": Unbounded (display), Young Serif (titles) and Manrope (UI), all SIL Open Font License 1.1. They are self-hosted latin subsets in `public/fonts/`, copied from the r2 colour pass by `scripts/theme-assets.py`, with preload, `font-display: swap` and metric-matched local fallbacks (size-adjust, ascent and descent overrides in `theme.css`) so the swap barely moves the layout. The wordmark's own fonts (Lilita One, Sniglet) are only used to render the logo image and are not shipped.

## Mascot art

`public/img/lunair-*.webp` come from `scripts/stickers.py`. The script works on the existing cut-outs in `~/ted-screenshots/fictora-official/lunair-bible/`. It only scales them. It never mirrors, repaints or regenerates them. The Oxblood theme uses them without the white die-cut border, matching the locked renders; the soft shadow is added in CSS.

- `lunair-hug`: fangirl-06, hugging a book (home hero, "Pull up a chair").
- `lunair-gossip`: gossip-01, whispering (home "Start your own").
- `lunair-reading`: reading-01, peeking over a book (the "Hosting a club?" card on every list page).
- `lunair-wave`, `lunair-peek`, `lunair-shrug`: start page, empty states, 404.

Re-run it with `python3 scripts/stickers.py`. It needs Pillow installed.
