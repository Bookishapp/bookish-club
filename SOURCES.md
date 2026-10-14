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
| library-other | 695 |
| library-bibliocommons | 102 |
| bookstores | 57 |
| **Total** | **854** |

---

# Source: independent bookstores (book club pages)

Date checked: 2026-10-13. Collector: `scripts/sources/bookstores.mjs`. Store and club config: `scripts/sources/bookstores.stores.mjs`. Raw cache: `.cache/bookstores/`.

## Method

- Candidate stores came from web search and a list of well-known indie stores in the 30 largest US metros, plus a few others. About 260 store domains were probed.
- For each domain the collector:
  1. fetches `robots.txt` and checks the path for our user agent;
  2. fetches the homepage, follows any terms, conditions or legal link, and searches the text for anti-automation clauses (robot, spider, crawl, scrape, data miner, automated means);
  3. reads the book club page only if both checks pass.
- Requests are sequential per host, at least 2 s apart. User-Agent: `BookishClubDirectory/0.1 (public book club listings)`. Only public, logged-out pages are read. No forms, logins or challenge pages.
- Bookmanager storefronts (React apps) load their own page content from `api.bookmanager.com/customer/*`. That host's robots.txt is `Disallow: /` with `Allow: /customer`, so the collector reads the same logged-out endpoints the public page uses: `store/getSettings`, `session/get` (anonymous guest session), `site_content/getPage` and `event/getList`. In every record, `source_url` is the human-facing page on the store's domain.
- Club entries were read by hand from each page and written into the config. Each build re-verifies them: a club is kept only if its name (or `match` string) still appears in that page's text. For event-calendar sources, the event must fall within the last 12 months or be upcoming.
- **Kept:** recurring adult clubs only, with name, city, state, neighborhood, venue, genres (only from the fixed vocabulary, and only when the page states them), cadence (only when stated), and a short paraphrased vibe.
- **Dropped:**
  - kids, teen and tween clubs;
  - private clubs;
  - one-off author events;
  - first-edition and subscription "clubs";
  - all host or staff names, emails and phone numbers.
- At the Astoria Bookshop, the store's book club page also lists neighborhood clubs that meet elsewhere. Those records carry the meeting venue the page names, or `venue: null`.

## Result

118 records, 23 store domains, 21 cities (2026-10-13 build).

## Stores used

| Domain | robots | Terms | Used | Records |
|---|---|---|---|---|
| eastcitybookshop.com (Bookmanager) | no rule blocks path; api.bookmanager.com allows /customer | no terms page linked | used | 11 |
| oldtownbooks.com (Bookmanager) | allowed | no terms page linked | used | 6 |
| bardsalley.com (Weebly) | allowed | no terms page linked | used | 7 |
| bookclubbar.com (Bookmanager) | allowed | no terms page linked | used | 7 |
| communitybookstore.net (Bookmanager) | allowed | no terms page linked | used | 2 |
| deepvellum.com | robots.txt 404 (allow) | no terms page linked | used | 4 |
| alienatedmajestybooks.com (Bookmanager) | allowed | no terms page linked | used | 7 |
| greedyreads.com (Bookmanager) | allowed | no terms page linked | used | 6 |
| riverstonebookstore.com (Squarespace) | allowed | no terms page linked | used | 4 |
| murderonthebeach.com (WordPress) | allowed | no terms page linked | used | 1 |
| keplers.org | allowed | no terms page linked | used | 2 |
| elliottbaybook.com (Bookmanager) | allowed | no terms page linked | used | 2 |
| eagleharborbooks.com (Bookmanager) | allowed | no terms page linked | used | 1 |
| subtextbooks.com (Bookmanager) | allowed | no terms page linked | used | 1 |
| blackgarnetbooks.com (Bookmanager) | allowed | no terms page linked | used | 3 |
| kingsenglish.com (Bookmanager) | allowed | no terms page linked | used | 11 |
| mainstreetbooksdavidson.com (Bookmanager) | allowed | no terms page linked | used | 3 |
| astoriabookshop.com (Bookmanager) | allowed | no terms page linked | used | 11 |
| watchungbooksellers.com (Bookmanager) | allowed | no terms page linked | used | 9 |
| citylitbooks.com (Bookmanager) | allowed | no terms page linked | used | 6 |
| silverunicornbooks.com (Bookmanager) | allowed | no terms page linked | used | 5 |
| thewritersblock.org (Bookmanager) | allowed | no terms page linked | used | 8 |
| whitewhalebookstore.com (Bookmanager) | allowed | no terms page linked | used | 1 |

## Skipped: terms forbid automated collection

**IndieCommerce (ABA) storefronts.** These all use the same terms. Quoted from bookcellarinc.com/terms-and-conditions:

> "This license does not include the right to ... use any robot, spider, data miner, or other means to extract and gather data from the website ... unless you first obtain [the store's] express written consent."

Domains confirmed by fetching each one's terms page:

- therippedbodice.com
- andersonsbookshop.com
- bookcellarinc.com
- bookpassage.com
- bookshopwestportal.com
- boswellbooks.com
- chevaliersbooks.com
- copperfieldsbooks.com
- eagleeyebooks.com
- gardendistrictbookshop.com
- interabangbooks.com
- literatibookstore.com
- mainpointbooks.com
- mcnallyjackson.com
- mrsdalloways.com
- pagesabookstore.com
- unabridgedbookstore.com
- warwicks.com
- wordbookstores.com
- writersblockbookstore.com
- shop.booksandbooks.com

These further IndieCommerce (Drupal) storefronts were identified but not read, on the presumption that they carry the same template terms:

- cellardoorbookstore.com
- copperdogbooks.com
- kewandwillow.com
- left-bank.com
- islandbooks.com
- milkweed.org
- mysterylovers.com
- mystgalaxy.com
- newtonvillebooks.com
- nextchapterbooksellers.com
- oldfirehousebooks.com
- palabrasbookstore.com
- penguinbookshop.com
- roscoebooks.com
- thetwig.com
- semcoop.com

**Shopify terms.** These contain "(i) to spam, phish, pharm, pretext, spider, crawl, or scrape" or "use any robot, spider, scraping, data gathering and extraction tools":

- birchbarkbooks.com
- oxfordexchange.com
- archestrat.us
- anovelideaphilly.com

**Barnes & Noble terms of use.** These stores link to the B&N terms, which include "(e) use any robot, spider, data miner, crawler, scraper or other automated means ...":

- tatteredcover.com
- booksinc.com
- josephbeth.com

**Personal-use-only terms.** lastbookstorela.com says: "You may browse, share, and link to our site for personal, non-commercial use only." Skipped conservatively.

**Terms not readable.** atomicbooks.com has a Shopify terms page that renders only with JavaScript. Skipped conservatively.

## Skipped: robots.txt

- semicolonchi.com: `Disallow: /` for all agents.

## Skipped: bot challenge (Cloudflare "Just a moment..." / 403)

Not bypassed. These stores were not read:

- politics-prose.com
- changinghands.com
- greenlightbookstore.com
- brooklinebooksmith.com
- vromansbookstore.com
- thebookstall.com
- womenandchildrenfirst.com
- bookpeople.com
- annieblooms.com
- belmontbooks.com
- bluewillowbookshop.com
- bookendsandbeginnings.com
- booksoup.com
- booksmith.com
- brazosbookstore.com
- broadwaybooks.net
- charisbooksandmore.com
- bookshopsantacruz.com
- flyleafbooks.com
- boulderbookstore.net
- greenapplebooks.com
- headhousebooks.com
- foxtalebookshoppe.com
- harvard.com
- loyaltybookstores.com
- malaprops.com
- murderbooks.com
- onemorepagebooks.com
- parnassusbooks.net
- powells.com
- prairielights.com
- octaviabooks.com
- schulerbooks.com
- quailridgebooks.com
- parkroadbooks.com
- squarebooks.com
- strandbooks.com
- skylightbooks.com
- portersquarebooks.com
- tridentbookscafe.com
- thirdplacebooks.com
- wellesleybooks.com
- centerforfiction.org
- avidbookshop.com
- copperfishbooks.com
- dieselbookstore.com
- edmondsbookshop.com
- lakeforestbookstore.com
- libertybaybooks.com
- littleshopofstories.com
- lostcitybookstore.com
- nowherebookshop.com
- orindabooks.com
- pegasusbookstore.com
- qabookco.com
- rakestrawbooks.com
- secretgardenbooks.com
- shoponceuponatime.com
- store.subbooks.com
- valleybookseller.com
- wellreadmoose.com
- curiousiguana.com

acappellabooks.com returned 429 "One moment..." and was also skipped.

## Checked, allowed, but no usable adult club listing (0 records)

- **Bookmanager stores with no current adult club text:**
  - bluestockings.com
  - booksaremagic.net (club pages not in navigation)
  - fountainbookstore.com
  - kramers.com (only a 2025 club event)
  - thelitbar.com
  - thenovelneighbor.com
  - moonpalacebooks.com
  - mysteriousbookshop.com
  - avidreaderbooks.com
  - banterbookshop.com
  - brickandmortarbooks.com
  - charliesqueerbooks.com
  - downboundbooks.com
  - iambooksboston.com
  - monkeyanddogbooks.com
  - papercutsjp.com (lists other stores' clubs)
  - sandmeyersbookstore.com (club has no name on the page)
  - townecenterbooks.com
- **Other HTML sites:**
  - dialbookshop.com
  - loftypigeonbooks.com
  - motherfoucaultsbookshop.com
  - octaviasbookshelf.com
  - rosecitybookpub.com
  - sourcebooksellers.com
  - duendedistrict.com
  - narberthbookshop.com
  - allshewrotebooks.com
  - thelastwordbooks.com
  - thelegendarium.com
  - unclebobbies.com
  - anotherreadthrough.com
  - birdbeckett.com
  - capitalbooksonk.com
  - magnoliasbookstore.com
  - verbatimbooks.com
  - smallworldbooks.com
  - unchartedbooks.com
  - luckydogbooks.com
  - sistersuptownbookstore.com
  - capitolhillbooks-dc.com
  - christophersbooks.com
  - haslams.com
  - riveroaksbookstore.com
  - bookcatapult.com
  - unnameablebooks.com
  - bigbluemarblebooks.com
  - phinneybooks.com
  - oursisterbookshops.com
  - goodbooksinthewoods.com
  - thewilddetectives.com (club events seen, not yet added)
  - theivybookshop.com (club category not yet read)
  - malvernbooks.com
  - runforcoverbookstore.com (subscription box, not a club)
  - larkandowlbooksellers.com and yuandmebooks.com (club pages render with JavaScript; Shopify, no terms page found)
  - mahoganybooks.com
  - redemmas.org
  - queerbooks.com
- **Dead or parked domains:**
  - volumesbooks.com
  - thedrunkenpoet.com
  - wallacebooks.com
  - thebookstoreinthegrove.com
  - upshurstreetbooks.com
  - bookwoman.com (unrelated content)

## Not used at all (ruled out by policy)

Silent Book Club, Bookclubs.com, Meetup and Eventbrite. Links from store pages to those sites were not followed.

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
