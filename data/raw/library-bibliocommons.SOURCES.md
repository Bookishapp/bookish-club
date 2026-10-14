# Source: BiblioCommons library event calendars: EXCLUDED for good (not used)

**Status: dropped permanently on 2026-10-14. Nothing from BiblioCommons is on Bookish.**

On 2026-10-13 we collected 978 book club listings from the public events RSS feeds that BiblioCommons runs for public libraries. We never published them. They were held back while the terms question was open, and are now deleted.

**Why:** the BiblioCommons Terms of Use, which every library's BiblioCommons site carries (for example https://chipublib.bibliocommons.com/info/terms, read 2026-10-13), grant "a limited, personal, non-transferable, revocable license to access and use the Service and Service Content for personal, non-commercial use". They also say that, except by separate agreement, you "may not copy, reproduce, republish, download, post, broadcast, transmit, make available to the public, or otherwise use the Service Content in any way except for your own personal, non-commercial use". Bookish is a public, commercial directory, so these listings can't be on it.

**What we removed:**
- the raw collected records (`data/raw/library-bibliocommons.json`) and the local response cache (`.cache/library-bibliocommons/`)
- the collector script (`scripts/sources/library-bibliocommons.mjs`)
- local scratch copies of feed and API responses

**Guards:**
- `scripts/merge.mjs` refuses the `library-bibliocommons` source and drops any record whose source URL is on `bibliocommons.com`, whatever file it comes from. There is no override.
- `scripts/sources/library-more.mjs` will not collect from a `*.bibliocommons.com` host.
- None of these clubs were ever in `data/clubs.json`, the published pages, the sitemap, the map, or the Supabase `bookish_*` tables (checked 2026-10-14).

**History:** earlier commits in this repo's git history (before 2026-10-14) still contain the raw file. We have not rewritten history.

Libraries whose events live only on BiblioCommons (for example Chicago, Boston, SFPL, Oakland, San Jose, Hennepin, KCLS, San Diego County, Cincinnati) are not covered. The only way they could be added is with written permission from the library or BiblioCommons, through a separate agreement.
