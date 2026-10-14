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
