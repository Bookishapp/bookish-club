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
