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
