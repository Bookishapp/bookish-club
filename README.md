# Bookish Club

A directory of real book clubs that meet across the US, built as a static site. Every page is pre-rendered HTML: city pages, genre-in-city pages, state pages and genre hubs. The forms post to one small Supabase edge function.

- **Live (temporary):** https://fictora.github.io/bookish-club/
- **Planned domain:** bookishclub.com (not bought yet; see "Custom domain" below)

## Layout

```
data/raw/<source>.json        raw records per source (written by scripts/sources/*)
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
node scripts/sources/library-bibliocommons.mjs   # each collector reads robots.txt rules + throttles itself
node scripts/sources/library-other.mjs
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

- Table `public.bookish_submissions` (`supabase/sql/001_bookish_submissions.sql`). RLS is on with no policies, so only the service role can read or write it.
  - Apply it as raw SQL, **not** with `supabase db push`, so it stays out of the shared project's migration history.
- `bookish-submit` (POST, public) validates input and applies spam protection:
  - a honeypot field and a minimum fill time
  - no links allowed in free text
  - rate limits: 6 per IP-hash per hour, 3 per email per kind per day
  - a CORS allow-list
  - It then inserts the row.
- `bookish-confirm` (GET `?token=`) handles double opt-in. It sets `status='confirmed'` and redirects to `/confirmed/`.
- Confirmation emails are sent only when `BOOKISH_EMAIL_FROM` is set, for example `Bookish Club <hello@bookishclub.com>`. They are sent through Resend using the existing `RESEND_API_KEY`. Until `bookishclub.com` is verified in Resend, rows stay `pending`.

Deploy the functions:

```sh
supabase functions deploy bookish-submit --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
supabase functions deploy bookish-confirm --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api
```

Read submissions with SQL as the service role, for example `select kind, email, payload, status, created_at from bookish_submissions order by created_at desc;`.

## Theme

All colours, fonts and textures are CSS variables in `src/theme.css`. `src/styles.css` contains layout only and reads those variables. To re-skin the site, swap or edit `theme.css` (plus any font files in `public/fonts/`) and rebuild.

## Fonts

Newsreader (Production Type, SIL Open Font License 1.1), self-hosted latin subset.

## Mascot art

`public/img/lunair-*.webp` come from `scripts/stickers.py`. The script works on the existing cut-outs in `~/ted-screenshots/fictora-official/lunair-bible/`. It only scales them and adds a white die-cut border. It never mirrors or repaints them. The soft shadow is added in CSS.

Re-run it with `python3 scripts/stickers.py`. It needs Pillow installed.
