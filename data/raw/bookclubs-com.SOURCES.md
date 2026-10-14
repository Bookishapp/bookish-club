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
