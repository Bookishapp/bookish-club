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
