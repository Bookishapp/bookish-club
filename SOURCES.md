# Sources

Every listing on Bookish Club comes from a public, logged-out page. Before we used any source, we read its robots.txt and its terms of use. This file records what we checked and what we decided. Sources whose terms forbid automated collection are listed here as **not used**.

Collection rules:
- We make at most one request every 1.5 to 2 seconds per host, sequentially.
- We back off on 429 and 5xx responses.
- We send the user agent `BookishClubDirectory/0.1`.
- Raw responses are cached so that re-runs don't hit the site again.
- We store only the club name, city, neighborhood or venue, genre or vibe (if stated), cadence (if stated), source URL and last-seen date.
- We never store personal emails, phone numbers or the names of hosts or staff.
- We list adult clubs only.

## Records in the current build (2026-10-14)

| Source | Clubs |
|---|---|
| library-other | 27 |
| **Total** | **27** |

---

# Silent Book Club (silent-book-club)

- **Source:** Silent Book Club, US chapters. https://silentbook.club (chapter finder under "Chapters > FIND A CHAPTER")
- **Date checked:** 2026-10-13
- **Decision:** NOT USED. No chapter data was collected.

## robots.txt (https://silentbook.club/robots.txt)
This is the standard Shopify storefront file. `User-agent: *` / `Allow: /`. It disallows only admin, cart, checkout, orders, account, `/services`, `/sf_*`, sort and filter traps, and preview params. Pages (`/pages/...`) and blogs are crawlable, so robots.txt alone would have permitted the chapter pages. The file also includes free-text instructions aimed at shopping assistants. Those are not relevant to this use and were not acted on.

## Terms of Service (https://silentbook.club/policies/terms-of-service)
The ToS bars this use. Quoted verbatim from the "Prohibited uses" section:

> "Any use of the term Silent Book Club, our logo, images, merchandise, or any content on this website is prohibited without express written permission. In addition to other prohibitions as set forth in the Terms of Service, you are prohibited from using the site or its content: ... (h) to collect or track the personal information of others; (i) to spam, phish, pharm, pretext, spider, crawl, or scrape; ..."

## Decision
The ToS explicitly prohibits spidering, crawling and scraping. It also prohibits use of any site content without express written permission. Per the project rule, ToS beats robots.txt, so nothing was fetched beyond robots.txt and the ToS page itself.

## Method / throttle
- `scripts/sources/silent-book-club.mjs` is a compliance guard. It makes no network requests and writes `[]`.
- Requests actually made: 2 (robots.txt and the ToS page), sequential and at least 2 s apart, with UA `BookishClubDirectory/0.1 (public book club listings; contact via site)`.

## Record count
0 records, 0 US cities.

## Known gaps / path forward
- All Silent Book Club US chapters are missing. This is likely several hundred listings and the single biggest structured source of in-person adult clubs.
- Compliant routes:
  1. Ask Silent Book Club (contact page on silentbook.club) for written permission or a data feed. Chapters are public and promotional, so a "listed on Bookish Club" partnership is plausible.
  2. Ask individual chapters to self-submit via our own form.
- Do not use third-party mirrors or copies of their chapter map. The content restriction applies to their content wherever it lives.

---

# Bookclubs.com (bookclubs-com)

- **Source:** Bookclubs.com public club pages and "Join a Book Club" discovery. https://bookclubs.com (operated by Bookclubz, Inc.)
- **Date checked:** 2026-10-13
- **Decision:** NOT USED. No club data was collected.

## robots.txt (https://bookclubs.com/robots.txt)
There is no robots.txt. The URL returns the site's single-page-app 404 page ("Oh no! Looks like you lost your bookmark."). The HTML carries `noindex` meta tags for MJ12Bot, AhrefsBot, SEMRushBot and DotBot. Club data loads from `api2.bookclubs.com`, and the site preconnects to Cloudflare Turnstile (a bot challenge).

## Terms of Use (https://bookclubs.com/terms-of-use, "Last Modified: 12/5/22")
Quoted verbatim:

- Section 7, Prohibited Uses: you may not "Use any robot, spider, or other automatic device, process, or means to access the Website for any purpose, including monitoring or copying any of the material on the Website" or "Use any manual process to monitor or copy any of the material on the Website ... without our prior written consent."
- Section 5, Intellectual Property: "You must not reproduce, distribute, modify, create derivative works of, ... republish, download, store, or transmit any of the material on our Website".

## Decision
The Terms forbid both automated and manual copying, which covers club pages and the API the site itself calls. Nothing was fetched beyond the robots.txt URL, the terms URL, and a read of the Terms of Use page.

## Method / throttle
- `scripts/sources/bookclubs-com.mjs` is a compliance guard. It makes no network requests and writes `[]`.
- Requests actually made: 3, sequential and at least 2 s apart, same UA.

## Record count
0 records, 0 US cities.

## Known gaps / path forward
- All Bookclubs.com public clubs are missing. Many of them are online-only, so they matter less for a local directory.
- The only compliant route is prior written consent from Bookclubz, Inc. (for example via their Contact or Business pages).

---

# Meetup (meetup) — ToS/robots check only

- **Source:** https://www.meetup.com (book club groups and events)
- **Date checked:** 2026-10-13
- **Decision:** NOT USED. ToS/robots check only, no listings fetched.

## robots.txt (https://www.meetup.com/robots.txt)
Group and event pages are not blanket-disallowed. However, the search and filter parameters needed for discovery are disallowed: `?keywords=`, `?location=`, `?city=`, `?state=`, `?radius=`, `?offset=`, `?pageToken=`, `?categoryId=`. Also disallowed: `/api/`, `/mu_api/`, `/gql*`, `/_next/data/*`, `/n/*`, and the calendar/events atom, rss and xml feeds. Public sitemaps are listed, including `groups-index-sitemap.xml`.

## Terms of Service (https://www.meetup.com/terms/ redirects to https://help.meetup.com/hc/en-us/articles/360027447252-Terms-of-Service)
The live terms page returned HTTP 403 behind a Cloudflare "Just a moment..." JavaScript challenge. It was not bypassed. The clause below comes from the search-engine index and from ToS;DR, so re-verify it in a browser:

- The current Terms' platform-safety clause prohibits extracting data from the platform for any commercial purpose the Terms don't permit, including by automated tools, whether run by you or a third party. The 2019 version (section 5.5, https://help.meetup.com/hc/en-us/articles/42191077275789-Terms-of-Service-6-1-19) explicitly names "screen scraping," "data scraping," and "web scraping."
- ToS;DR summary (https://edit.tosdr.org/documents/257): "Spidering, crawling, or accessing the site through any automated means is not allowed".
- The public API has required approval and a paid Pro account since 2019.

## Decision
Not used. The Terms prohibit automated data extraction for an unlicensed commercial purpose, which a directory is. The discovery paths are disallowed by robots.txt, and the site sits behind a bot challenge that we will not circumvent. The only compliant route is a Meetup Pro API agreement, or organizers self-listing with us.

---

# Eventbrite (eventbrite) — ToS/robots check only

- **Source:** https://www.eventbrite.com (book club events)
- **Date checked:** 2026-10-13
- **Decision:** NOT USED. ToS/robots check only, no listings fetched.

## robots.txt (https://www.eventbrite.com/robots.txt)
`User-agent: *` disallows `/directory/` (only `/directory/sitemap/` is allowed), the `/rss/` and `/atom/` feeds, `/api/v3/destination/events/`, `/api/v3/promoted/events`, `/land-browse-bff`, and many query patterns (`*?i*`, `*&id*`, `*?x*` and others). Event pages and sitemaps are otherwise crawlable.

## Terms of Service (https://www.eventbrite.com/help/en-us/articles/251210/eventbrite-terms-of-service/, which redirects to support.eventbrite.com)
The live page returned HTTP 403 behind a Cloudflare challenge. It was not bypassed. From the search-engine index of the official page:

- Section 13 is headed **"Scraping or Commercial Use of Site Content is Prohibited"**, and section 13.1 is **"You can't use our content for your own purposes."** The body prohibits commercial use of Site Content and automated extraction, scraping or crawling of the Sites.
- The Affiliate Program Terms (https://www.eventbrite.com/help/en-us/articles/328394/) also bar scraping event listings from Eventbrite domains without written permission.

Re-verify the exact section 13 wording in a browser before citing it externally.

## Decision
Not used. The ToS has an explicit anti-scraping section. Event listings are also ephemeral, one-off events rather than standing clubs. The compliant alternative is the Eventbrite API under its API Terms, which needs a key (out of scope here) and restricts storing past-event content.
