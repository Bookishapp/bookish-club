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
| library-other | 1,226 |
| library-more | 1,194 |
| bookstores | 118 |
| **Total** | **2,538** |

---

# Source: public library book clubs on the BiblioCommons events platform

- Output: `data/raw/library-bibliocommons.json` (978 clubs, 292 distinct US city/state pairs, 54 library systems with data)
- Scraper: `scripts/sources/library-bibliocommons.mjs` (Node 24, zero deps, re-runnable, cache in `.cache/library-bibliocommons/`)
- Run date / last_seen: 2026-10-13. Event window searched: 2026-10-13 to 2027-01-13 (92 days).

## Terms of use check (2026-10-13)

BiblioCommons has no separate corporate terms page (www.bibliocommons.com/terms-of-use, /terms and /legal all return 404).
Each library's BiblioCommons site carries the same BiblioCommons Terms of Use, for example
https://chipublib.bibliocommons.com/info/terms (read 2026-10-13). Relevant clauses:

> "[you may not] use any automated system to harvest or capture any BiblioCommons Content (as defined below) from the BiblioCommons Service, **except as may be specifically permitted using RSS/XML feeds**"

> "BiblioCommons and Chicago Public Library grant our authorized users a limited, personal, non-transferable, revocable license to access and use the Service and Service Content for personal, non-commercial use. All other rights are reserved. Except as arranged by separate agreement, you may not copy, reproduce, republish, download, post, broadcast, transmit, make available to the public, or otherwise use the Service Content in any way except for your own personal, non-commercial use"

> "[you may not] disable, overburden, impair the proper performance or functionality of the BiblioCommons Service"

**Decision:**
- Automated collection uses **only** the official public events RSS feed that BiblioCommons publishes for each events-enabled library
  (`https://gateway.bibliocommons.com/v2/libraries/<id>/rss/events?q=...&startDate=...&endDate=...&page=N`). That is the route the
  terms explicitly allow. The scraper does not call the JSON events API (`/v2/libraries/<id>/events`, `/events/search`), and it
  never requests anything on `<id>.bibliocommons.com`.
- We store only short facts: club name, municipality, state, branch name, cadence derived from dates, format, genre tags drawn
  from the name, and a link back to the library's own event page. No event descriptions, images, staff names, emails or phone
  numbers are stored. The `vibe` string is generated from a fixed template (format plus registration/drop-in facts) and is not
  copied text.
- **FLAG FOR LEAD (open risk):** the "personal, non-commercial use ... may not republish / make available to the public" clause
  covers "Service Content". Our view is that we republish only uncopyrightable facts (a club exists at branch X, meets monthly) and
  link back. Still, the clause is written broadly, and a commercial directory publishing these facts goes beyond "personal use".
  Options: (a) publish as is, facts only with link-back; (b) ask the libraries (they own the event data) or BiblioCommons for
  permission; (c) use these records only for internal seeding or verification. This needs a human decision before launch.
- Exploration disclosure: while working out the feed format, about 35 manual requests went to the JSON gateway endpoints
  (`/events`, `/events/search`) for chipublib, austin and a few other ids. Once the ToS was read, we switched to RSS only.
  We also made one request each to austin.bibliocommons.com/robots.txt and chipublib.bibliocommons.com/info/terms, plus 4 requests to
  www.bibliocommons.com (robots/terms checks and the public partner list). No JSON-API data is used in the output.

## robots.txt (checked 2026-10-13)

| Host | Result |
|---|---|
| gateway.bibliocommons.com | `/robots.txt` returns 404 (JSON "Not found"), so there are no rules and the host is allowed. All data requests go here. |
| `<id>.bibliocommons.com` (e.g. austin.bibliocommons.com) | `User-agent: *` with `Crawl-delay: 120` and Disallow on catalog internals (`/item/...`, `/holds/...`, `/v2/availability/`, `/user/login`); `Allow: /*`. **Not used**: we never request these hosts, so the 120 s crawl delay is not exercised. |
| www.bibliocommons.com | `User-agent: * Allow: /`. Used only to read the public "Libraries We Work With" partner list (3 pages). |

The scraper fetches gateway robots.txt at start and checks every RSS path against it, so it would stop if rules ever appeared.

## Method

1. Candidates: about 500 BiblioCommons site ids. The 30 largest US metros came first, then suburban/county systems, then the US entries on
   BiblioCommons' public partner list (https://www.bibliocommons.com/libraries-we-work-with, 3 pages).
   Ids are guesses, and bad guesses return `404 SiteNotFound` from the gateway on the first request.
2. For each id, page through the RSS feed (25 items per page) for each of these queries: "book club", "book discussion", "book group",
   "reading group", "club de lectura". The window is today to +92 days. Events are deduped by event URL.
3. Keep an event if the title reads as a club (regex: book club/discussion/group, readers' circle, silent book club, club de lectura,
   books & brews, genre + club, ...), or if the library tagged it with a Book Club/Book Discussion event type and the title looks
   club-like. Exclude author talks, book sales/swaps, kits, storytimes, writing groups, celebrations/kick-offs, and the "Club Book"
   lecture series.
4. Adults only. Drop the event if its audience categories are only kids/teens/tweens/family/young adult, or if the title names a
   youth audience (kids, teen, tween, family, grades, parent-child, homeschool, ...).
5. Collapse into one club per (library, normalized club name, branch location id or "virtual"). The name drops the per-month book
   title ("Adult Book Discussion: Orbital" becomes "Adult Book Discussion"), month prefixes, "(Virtual)" tags and "with <person>" credits.
6. Cadence comes from the occurrence dates (Weekly / Every other week / Monthly, Nth weekday / Monthly, last weekday / Every
   other month). If the window shows only one occurrence, it comes from explicit wording in the description ("third Tuesday of each month",
   "meets monthly"). Otherwise it is null.
   730 of 978 records have a cadence.
7. Format: virtual flag means online; branch location means in-person; both, or "hybrid"/"in person or via Zoom" wording, means hybrid.
   Result: {'in-person': 855, 'online': 97, 'hybrid': 26}.
8. Genres come only from the controlled vocabulary, stated in the club name, the library's category tags, or a description phrase
   naming the genre as the club's focus (e.g. "a mystery book club"). 235 records have at least one genre.
9. city/state come from the branch address in the feed (`bc:location`). Full state names are mapped to 2-letter codes.
   Non-US systems (Canada: Hamilton, Toronto, Vancouver, Calgary, Edmonton, Oakville, Fraser Valley, Aurora ON) are dropped.
   For online clubs, the city is the library system's home city.
10. source_url is the library's own event page for the **next upcoming occurrence** in the window. last_seen is the run date.
11. Libraries already present in `library-other.json` / `library-more.json` (matched on library name) are skipped to avoid
    duplicates. 8 were skipped (see below).

## Throttle

At most 1 request per 1.6 s per host, strictly sequential, with User-Agent `BookishClubDirectory/0.1 (public book club listings)`.
On 429/5xx/network errors the scraper backs off exponentially (10 s, 20 s, 40 s, 80 s). The first probe of an id gets no retry and a 25 s
timeout, because ids without the events feature answer the RSS URL with a slow 504. Every successful (status < 500) response is
cached in `.cache/library-bibliocommons/` keyed by URL hash, so re-runs make 0 requests for cached pages (`--refresh` forces
re-fetch). Total gateway RSS requests across all runs: about 1,150.

## Per-library record counts

| BiblioCommons id | Library | Home | Events matched (RSS) | Clubs |
|---|---|---|---|---|
| chipublib | Chicago Public Library | Chicago, IL | 362 | 102 |
| cmlibrary | Charlotte Mecklenburg Library | Charlotte, NC | 351 | 59 |
| cincinnatilibrary | Cincinnati & Hamilton County Public Library | Cincinnati, OH | 228 | 52 |
| kcls | King County Library System | Federal Way, WA | 347 | 52 |
| hclib | Hennepin County Library | Minneapolis, MN | 113 | 45 |
| hcpl | Harris County Public Library | Houston, TX | 338 | 37 |
| sdcl | San Diego County Library | El Cajon, CA | 105 | 36 |
| dayton | Dayton Metro Library | Dayton, OH | 132 | 32 |
| pima | Pima County Public Library | Tucson, AZ | 82 | 27 |
| slpl | St. Louis Public Library - City | St. Louis, MO | 94 | 27 |
| bpl | Boston Public Library | Boston, MA | 183 | 26 |
| smcl | San Mateo County Libraries | Foster City, CA | 75 | 26 |
| fulcolibrary | Fulton County Library System | Atlanta, GA | 201 | 25 |
| librarypoint | Central Rappahannock Regional Library | Fredericksburg, VA | 51 | 25 |
| pbclibrary | Palm Beach County Library System | Delray Beach, FL | 66 | 24 |
| sno-isle | Sno-Isle Libraries | Snohomish, WA | 94 | 24 |
| sjpl | San José Public Library | San Jose, CA | 276 | 23 |
| jeffcolibrary | Jefferson County Public Library | Arvada, CO | 80 | 22 |
| kdl | Kent District Library | Grand Rapids, MI | 58 | 20 |
| jocolibrary | Johnson County Library | Overland Park, KS | 58 | 18 |
| bclsnj | Burlington County Library System | Riverton, NJ | 66 | 17 |
| greenelibrary | Greene County Public Library | Beavercreek, OH | 101 | 17 |
| krl | Kitsap Regional Library | Bremerton, WA | 58 | 17 |
| wccls | Washington County Cooperative Library Services | Hillsboro, OR | 49 | 16 |
| herrickdl | Herrick District Library | Holland, MI | 32 | 15 |
| sccl | Santa Clara County Library | Milpitas, CA | 77 | 15 |
| plymc | Public Library of Youngstown and Mahoning County | Youngstown, OH | 44 | 14 |
| evanstonlibrary | Evanston Public Library | Evanston, IL | 46 | 13 |
| ccclib | Contra Costa County Library | San Ramon, CA | 47 | 12 |
| arapahoelibraries | Arapahoe Libraries | Centennial, CO | 54 | 11 |
| marinlibrary | Marin County Free Library | San Rafael, CA | 38 | 10 |
| tacoma | Tacoma Public Library | Tacoma, WA | 27 | 10 |
| lawrence | Lawrence Public Library | Lawrence, KS | 81 | 8 |
| oaklandlibrary | Oakland Public Library | Oakland, CA | 34 | 8 |
| sppl | Saint Paul Public Library | Saint Paul, MN | 31 | 8 |
| starklibrary | Stark Library | Canton, OH | 161 | 8 |
| westervillelibrary | Westerville Public Library | Westerville, OH | 44 | 8 |
| aclibrary | Alameda County Library | Dublin, CA | 54 | 7 |
| ccplohio | Clark County Public Library | Springfield, OH | 20 | 7 |
| grpl | Grand Rapids Public Library | Grand Rapids, MI | 15 | 6 |
| kentonlibrary | Kenton County Public Library | Erlanger, KY | 55 | 6 |
| smpl | Santa Monica Public Library | Santa Monica, CA | 18 | 6 |
| friscolibrary | Frisco Public Library | Frisco, TX | 23 | 5 |
| glenviewpl | Glenview Public Library | Glenview, IL | 38 | 5 |
| mykpl | Kenosha Public Library | Kenosha, WI | 18 | 5 |
| rclreads | Ramsey County Library | Shoreview, MN | 11 | 5 |
| oceancity | Ocean City Free Public Library | Ocean City, NJ | 49 | 4 |
| chandler | Chandler Public Library | Chandler, AZ | 30 | 3 |
| paloalto | Palo Alto City Library | Palo Alto, CA | 17 | 3 |
| denton | Denton Public Library | Denton, TX | 2 | 2 |
| elpl | East Lansing Public Library | East Lansing, MI | 10 | 2 |
| yumalibrary | Yuma County Library | Wellton, AZ | 4 | 2 |
| cantonpl | Canton Public Library | Canton, MI | 6 | 1 |
| laurellibrary | Laurel County Public Library | London, KY | 13 | 0 |

States: CA 146, OH 138, IL 120, WA 103, NC 59, MN 58, MI 44, TX 44, CO 33, AZ 32, MO 27, KS 26, MA 26, GA 25, VA 25, FL 24, NJ 21, OR 16, KY 6, WI 5

## Libraries tried and skipped

The 30-metro systems below are mostly **not** on BiblioCommons events, or have the events module off: NYPL, Austin, Multnomah, Seattle, Tampa-Hillsborough (504/403, events not enabled); Brooklyn, Queens, San Diego city (410 disabled);
SFPL (feed works but no matching events); LA city/county, Dallas, Houston city, Philadelphia, Miami-Dade, Phoenix, Detroit,
Denver, Orlando, Baltimore, St. Louis County, Sacramento, Pittsburgh, DC (no BiblioCommons site found under any guessed id).
Las Vegas-Clark County and San Antonio are on BiblioCommons but are already covered by sibling sources.

- **not a BiblioCommons site id (404 SiteNotFound)** (378): aacpl, aadl, abqlibrary, acld, acpl, afpls, ahml, akronlibrary, alachua, alaska, albany, alexlibrary, allegheny, anchorage, anoka, anythink, appleton, arapahoe, arlingtontx, arlingtonva, athens, atlantic, bccls, bcpl, bcpl-ky, berkeley, bham, bhpl, bloomington, boca, bocaratonlibrary, boise, boston, boulderlibrary, brevard, brookline, broward, bucks, buckslib, buffalo, buffalolib, burbank, cadl, cambridge, camden, campbell, carmelclay, carnegielibrary, carr, carrollton, carver, ccls, ccpl, ccpl-in, ccpl-md, ccpl-sc, cedarrapids, champaign, chandlerlibrary, chapelhill, chapelhillpubliclibrary, charleston, chatham, chattanooga, chesterfield, clackamas, clarkcounty, clevelandpubliclibrary, clp, cobb, cobbcat, colapl, collier, columbus, columbuslibrary, contracosta, cplmd, crrl, cumberland, cuyahoga, cuyahogalibrary, cwmars, dakota, dallas, dallaslibrary, dauphin, dclibrary, dcplibrary, deerfield, dekalb, delaware, delco, dentonlibrary, denver, denverlibrary, deschutes, deschuteslibrary, desmoines, detroit, detroitpubliclibrary, dmpl, downers, duluth, durham, durhamcountylibrary, ebrpl, eden, eglendalelac, einetwork, elmhurst, elpaso, elpasolibrary, epfl, epls, eppl, escambia, eugene, everett, evpl, fairfax, fairfaxcounty, farmington, fcpl, fcplmd, fergusonlibrary, fletcherfree, flint, forsyth, fortbend, fortworth, freelibrary, fresnolibrary, fwpl, gail, galveston, garland, gcpl, gilbert, glendale, glendaleaz, glendalelac, gloucester, gplibrary, greensboro, greenvillelibrary, greenwich, guilford, gwinnettpl, hamilton, hampton, hartford, hawaii, haywardlibrary, hclibrary, hcplmd, hempstead, hennepin, henrico, hepl, herrick, hinsdale, honolulu, horry, houston, hplct, hunterdon, huntington, huntsville, ifls, iowacity, irving, jackson, jaxpubliclibrary, jcpl, jefferson, jmrl, joliet, jpl, jrlibrary, kckpl, kcpl, kenosha, kerncountylibrary, knox, kpl, lacountylibrary, lagrange, lake, lakecounty, lancaster, lansing, lapl, laurel, lbpl, lcd, leelibrary, leon, lewisville, lexpublib, lfpl, library.nashville, lincoln, liveoakpl, livermore, llcoop, loudoun, macon, madison, madl, manatee, manchester, margatelibrary, mckinney, mcl, mcldaz, mclib, mclinc, mcpl-in, mcpl-pa, mcplmd, mcplnj, mdpls, memphis, mesa, mesacounty, metrolibrary, midarklibrary, minuteman, mkepl, mobile, mobilepubliclibrary, monroe, montgomerycountymd, montgomerycountytx, morris, mvpl, myboca, mylibrary, naperville, nashville, nashvillelibrary, nassau, newhaven, neworleans, newton, nhpl, noble, nolalibrary, novi, npl, nyack, oakpark, ocean, ocln, ocln-ma, ocls, ocpl, olathelibrary, olympia, omahalibrary, onlib, oppl, osceola, palatine, pasadena, pasco, peoria, peoriapl, pgcmls, phoenix, phoenixpubliclibrary, piercecountylibrary, pinellas, placer, plano, pleasanton, pls, plsinfo, plymouth, polk, portland, poudre, ppld, prattlibrary, princeton, providence, provlib, pwcls, rampl, ramsey, ramseycounty, richardson, richland, richmond, riverside, rivlib, rochester, rochesterpl, rockford, roundrock, saclibrary, sacramento, santaclara, santacruzpl, santafe, sarasota, sbpl, scarsdale, schaumburg, scld, sclsnj, scott, scottsdale, sdcounty, sdpl, seattlepubliclibrary, seminole, shreveport, sjcl, skokie, slcl, slco, slcolibrary, slolibrary, smithtown, sno_isle, snoisle, solano, somerset, somerville, sonomalibrary, spartanburg, spokanelibrary, springfield, stamford, stanislaus, stark, stjohns, stl, stlouis, sttammany, sttammanylibrary, suffolk, sugarland, syracuse, tallahassee, tampa, tempe, toledolibrary, trl, troy, tulsalibrary, urbana, vbpl, ventura, volusia, wake, wakegov, washington, washoe, waukesha, westbloomfield, westchester, westerville, westfloridalibrary, westport, wheaton, whiteplains, wichita, williamson, winnetka, wls, worcester, wtx, yolocounty, yonkers, yorklibraries, yuma
- **RSS feed returned HTTP 504 (gateway timeout; events feature not enabled for this site)** (19): austin, bellingham, burlington, carmel, dcl, gailborden, hcplc, indypl, mcpl, mpl, mppl, multcolib, nypl, rcpl, sapl, sclibrary, seattle, toledo, wcls
- **no matching events in window** (18): calgary (Calgary Public Library), cals (Central Arkansas Library System), chpl (Chapel Hill Public Library), dcpl (Daviess County Public Library), fremont (Fremont Area District Library), fvrl (Fraser Valley Regional Library), kclibrary (The Kansas City Public Library), lakecountyca (Lake County Library), marinet (MARINet), midark (Mid-Ark Regional Library System), more (MORE Libraries), mymcpl (Mid-Continent Public Library), olathe (Olathe Public Library), opl (Oakville Public Library), pac2 (PAC2), salem (Salem Township Library), sfpl (San Francisco Public Library), sunnyvale (Sunnyvale Public Library)
- **TimeoutError: The operation was aborted due to timeout** (15): beverlyhills, bocalibrary, delawarelibrary, egvpl, hayward, margate, orangecountync, plymouthlibrary, princetonlibrary, richmondlibrary, skokielibrary, spl, tscpl, wcpl, ylpl
- **BiblioCommons site disabled (410)** (13): brooklyn, cpl, eapl, ecpl, highlandpark, lakeforest, northbrook, norwalk, portlandlibrary, queens, sandiego, slcpl, wilmette
- **already covered by library-other.json / library-more.json** (8): cml (Columbus Metropolitan Library), dbrl (Daniel Boone Regional Library), durhamcounty (Durham County Library), greenwichlibrary (Greenwich Library), lvccld (Las Vegas-Clark County Library District), mysapl (San Antonio Public Library), sjcpl (St. Joseph County Public Library), yourlibrary (Richmond Public Library)
- **no location data to place clubs** (5): aurora (Aurora Public Library), epl (Edmonton Public Library), hpl (Hamilton Public Library), tpl (Toronto Public Library), vpl (Vancouver Public Library)

"Timeout" ids returned no response within 25 s on the first probe. They are most likely events-disabled sites (same behaviour as the 504s), but this is
unconfirmed. A later run with a longer timeout could retry them: Beverly Hills, Boca Raton, Delaware County OH, Elk Grove Village, Hayward,
Margate, Orange County NC, Plymouth MI, Princeton NJ, Richmond CA, Skokie, Topeka, Warren County, Yorba Linda.

---

# library-other: sources and compliance notes

Generated by `scripts/sources/library-other/sources-md.mjs`. Run date 2026-10-13.

Client: User-Agent `BookishClubDirectory/0.1 (public book club listings)`. Requests are sequential per host, at least 1.6 s apart or the robots.txt Crawl-delay if larger (LibCal hosts: 10 s), with backoff on 429/5xx. Raw responses are cached under `.cache/library-other/<host>/`. Only public, logged-out endpoints are used, with no keys or logins. Only these fields are stored: name, city, state, venue, genre, cadence, format, vibe (a paraphrased feature list) and source URL. No staff names, emails or phone numbers.

Total: **1226 clubs** from **67 library systems**, 342 distinct cities.

## Platform notes

- **communico**: Communico (vendor) privacy policy https://communico.co/privacy-policy: no automated-access clause. The endpoint is the same public JSON (/eeventcaldata) the logged-out events page loads.
- **trumba**: Trumba public JSON calendar feed (https://www.trumba.com/calendars/<webName>.json), the documented embed feed. robots.txt allows it.
- **localist**: Localist public API /api/2/events. robots.txt allows /api; /search is disallowed, so we filter by event-type id rather than using search. Crawl-delay 1s honoured.
- **libcal**: Springshare LibCal: privacy page https://www.springshare.com/privacy has no automated-access clause. robots.txt sets Crawl-delay: 10, which we honour. The endpoint is the same public JSON (/ajax/calendar/list) the calendar page loads.
- **tribe**: WordPress "The Events Calendar": public REST API /wp-json/tribe/events/v1/events (logged-out, the documented public feed).
- **custom**: Public HTML listing pages (logged-out). LAPL: /events/search filtered to the Book Clubs category + Adults/Seniors audiences. Queens: /calendar search filtered to program type "Book Discussion Group" and split by branch facet. The load-more endpoint /search/call is robots-disallowed and is not used, so each query reads only its first 12-result page.

## Hosts scraped

| Library | Host | Platform | robots.txt (checked 2026-10-13) | Terms check (2026-10-13) | Decision | Records |
|---|---|---|---|---|---|---|
| Houston Public Library | calendar.houstonlibrary.org | libcal | allows event endpoint; Crawl-delay 10s honoured | Policies page has no clause on automated access or scraping. (https://houstonlibrary.org/policies) | scraped | 14 |
| Cleveland Public Library | cpl.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | Policies page has no clause on automated access or scraping. (https://cpl.org/policies/) | scraped | 16 |
| Indianapolis Public Library | attend.indypl.org | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 25 |
| LA County Library | visit.lacountylibrary.org | communico | allows event endpoint | Terms of use page has no clause on automated access or scraping. (https://lacountylibrary.org/terms-of-use/) | scraped | 55 |
| Miami-Dade Public Library System | mdpls.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 28 |
| DC Public Library | dclibrary.libnet.info | communico | allows event endpoint | Terms and conditions have no clause on automated access or scraping. (https://www.dclibrary.org/terms-and-conditions) | scraped | 30 |
| Tampa-Hillsborough County Public Library | attend.hcplc.org | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 26 |
| Orange County Library System | attend.ocls.org | communico | allows event endpoint | Library policies have no clause on automated access or scraping. (https://ocls.org/using-library/library-policies/) | scraped | 29 |
| Sacramento Public Library | engage.saclibrary.org | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 22 |
| Las Vegas-Clark County Library District | events.thelibrarydistrict.org | communico | allows event endpoint | Only rental-facility terms found; no automated-access clause. (https://thelibrarydistrict.org/rental-facilities/terms-and-conditions/) | scraped | 26 |
| Broward County Library | broward.libnet.info | communico | allows event endpoint | County terms have no clause on automated access or scraping. (https://www.broward.org/terms) | scraped | 34 |
| Jacksonville Public Library | jaxpubliclibrary.libnet.info | communico | allows event endpoint | Policies page has no clause on automated access or scraping. (https://jaxpubliclibrary.org/policies) | scraped | 20 |
| OC Public Libraries | ocpl.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 43 |
| Salt Lake County Library | slcls.libnet.info | communico | allows event endpoint | Policies page has no clause on automated access or scraping. (https://www.slcolibrary.org/policies/) | scraped | 25 |
| Salt Lake City Public Library | slcpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 8 |
| Milwaukee Public Library | mpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 8 |
| Burbank Public Library | burbank.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 3 |
| Lexington Public Library | lexpublib.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 10 |
| Spokane Public Library | spokanelibrary.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 4 |
| Charles County Public Library | ccplonline.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 4 |
| DeKalb County Public Library | events.dekalblibrary.org | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 24 |
| Glendale Library, Arts & Culture | glendaleca.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 2 |
| New Orleans Public Library | neworleans.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 6 |
| Gwinnett County Public Library | gwinnettpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 31 |
| Loudoun County Public Library | loudoun.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 14 |
| Prince George's County Memorial Library System | pgcmls.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 13 |
| Pierce County Library System | piercecounty.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 7 |
| Tulsa City-County Library | events.tulsalibrary.org | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 18 |
| Montgomery County Public Libraries | mcpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 42 |
| Cuyahoga County Public Library | attend.cuyahogalibrary.org | communico | allows event endpoint | Policies page has no clause on automated access or scraping. (https://cuyahogalibrary.org/about/policies) | scraped | 50 |
| Arlington Public Library (TX) | arlingtontx.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 7 |
| Fort Worth Public Library | fortworthtexas.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 8 |
| Charleston County Public Library | ccplsc.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 21 |
| Durham County Library | durhamcountylibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 21 |
| Arlington Public Library (VA) | arlingtonva.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 24 |
| Boise Public Library | boisepubliclibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 8 |
| Riverside Public Library | riversidecalibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 0 |
| Delaware County District Library | delawarelibrary.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 5 |
| Allen County Public Library | acpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 10 |
| Carmel Clay Public Library | carmel.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 7 |
| Pasco County Library System | pascolibraries.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 16 |
| Hamilton East Public Library | hepl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 8 |
| St. Joseph County Public Library | sjcpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 9 |
| Monroe County Public Library (IN) | mcplin.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 7 |
| Evansville Vanderburgh Public Library | events.evpl.org | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 16 |
| Manatee County Public Library System | manateelibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 15 |
| Norfolk Public Library | norfolk.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 9 |
| Richmond Public Library | rvalibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 17 |
| St. Petersburg Public Library | splibraries.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 0 |
| Buffalo & Erie County Public Library | buffalolib.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 52 |
| Westchester Library System | westchesterlibraries.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 0 |
| Newark Public Library | npl.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 0 |
| Chesterfield County Public Library | chesterfield.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 9 |
| LeRoy Collins Leon County Public Library | leoncountyfl.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 5 |
| Bergen County Cooperative Library System | bccls.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 113 |
| Henrico County Public Library | henricolibrary-va.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 16 |
| Volusia County Public Library | volusialibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 11 |
| Chattanooga Public Library | chattlibrary.org | tribe | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 4 |
| Carnegie Library of Pittsburgh | carnegielibrary.org | tribe | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 30 |
| Montgomery County-Norristown Public Library | www.montcolibraries.org | tribe | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 1 |
| Washington County Public Library (VA) | www.wcpl.net | tribe | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 7 |
| Los Angeles Public Library | www.lapl.org | custom | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 43 |
| Santa Cruz Public Libraries | santacruzpl.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 13 |
| Solano County Library | solanolibrary.libnet.info | communico | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 9 |
| Washoe County Library System | events.washoecountylibrary.us | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 10 |
| Yolo County Library | events.yolocountylibrary.org | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 4 |
| Sioux City Public Library | siouxcitylibrary.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 0 |
| Lafayette Public Library | lafayettela.libcal.com | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 9 |
| Queens Public Library | www.queenslibrary.org | custom | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 15 |
| The Seattle Public Library | www.trumba.com | trumba | allows event endpoint | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 7 |
| Enoch Pratt Free Library | calendar.prattlibrary.org | localist | allows event endpoint; Crawl-delay 1s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 14 |
| Phoenix Public Library | calendar.phoenixpubliclibrary.org | libcal | allows event endpoint; Crawl-delay 10s honoured | No site terms page restricting automated access found at common paths. Platform terms above apply. | scraped | 9 |

## Libraries skipped

| Library | Host | Reason |
|---|---|---|
| New York Public Library | www.nypl.org | Behind an Incapsula bot wall (it serves a JS challenge even for robots.txt). Not circumvented. Skipped. |
| Free Library of Philadelphia | www.freelibrary.org / libwww.freelibrary.org | HTTP 403 to our UA (bot protection). Skipped. |
| Columbus Metropolitan Library | www.columbuslibrary.org | HTTP 403 (bot protection). Skipped. |
| Nashville Public Library | library.nashville.gov | HTTP 403 (bot protection). Skipped. |
| San Antonio Public Library | www.mysapl.org | robots.txt disallows our path. Skipped. |
| St. Louis County Library | www.slcl.org | robots.txt disallows /events-classes. Skipped. |
| Denver Public Library | denverlibrary.libcal.com | LibCal robots.txt has "Disallow: /" for *. Skipped. |
| Memphis Public Libraries | memphis.librarycalendar.com | LibraryCalendar (LibraryMarket) robots.txt has "User-agent: * / Disallow: /" (only named search/social bots allowed). Skipped. The same applies to every librarycalendar.com / librarymarket.com host: Dallas, Frederick County MD, Forsyth County NC, Springfield MA, Troy MI, Waterford MI, Virginia Beach, Lee County FL, Sarasota County. |
| Mesa Public Library | events.mesalibrary.org | robots.txt disallows. Skipped. |
| Louisville Free Public Library | events.lfpl.org | robots.txt disallows. Skipped. |
| Jefferson Parish Library | calendar.jplibrary.net | robots.txt disallows. Skipped. |
| Fresno County Public Library | fresnolibrary.libcal.com | robots.txt disallows. Skipped. |
| New Orleans PL (LibCal host) | nolalibrary.libcal.com | robots.txt disallows. Communico host neworleans.libnet.info was used instead. |
| York County Libraries (PA) | events.yorklibraries.org | robots.txt disallows. Skipped. |
| Library System of Lancaster County | calendar.lancasterlibraries.org | robots.txt disallows. Skipped. |
| Community Libraries of Providence | clpvd.org | robots.txt disallows /wp-json. Skipped. |
| Anne Arundel County PL, Kansas City KS PL, Metropolitan Library System (OKC), Fort Bend County Libraries, Knox County PL, Ventura County Library, Seminole County FL | various | robots.txt disallows the site root for *. Skipped. |
| Toledo Lucas County PL, Richland Library, Howard County (hclibrary.org), Prince William, Irving, Brevard, Hampton, Onslow, Nassau, Johnson County (jclibrary.org) | various | HTTP 403 to our UA. Skipped. |
| Detroit Public Library | detroitpubliclibrary.org | Events are published on Eventbrite, which is out of scope here. Skipped. |
| Brooklyn Public Library | discover.bklynlibrary.org | The event search API (/api/search/v2.php) returns {"error":"access denied"} to non-browser clients. This is treated as an access gate and not circumvented. www.bklynlibrary.org/events returns 500. Skipped. |
| San Diego Public Library (city) | sandiego.events.mylibrary.digital | HTTP 403 to our UA (bot protection). Skipped. |
| Maricopa County Library District | events.mcldaz.org | Already covered by the library-more source. Skipped here to avoid duplicates. |
| Kansas City Public Library (MO) | kclibrary.org | Robots allow it, but it needs a bespoke Drupal parser. Not built. |
| BiblioCommons Events libraries | Chicago, Boston, SFPL, Oakland, San Jose, Austin, Harris County, Atlanta-Fulton, Charlotte, Hennepin, KCLS, San Diego County, St. Louis City, Cincinnati, Multnomah, etc. | Covered by the BiblioCommons source. Excluded here. |

## Method

- Only events matching book club, book discussion, readers or reading group are kept, from the next ~90 days. Kids, teen, tween and family audiences are excluded via audience tags and title words. One-off author talks, book sales, storytimes and similar are excluded.
- Recurring occurrences are collapsed per (library, normalised club name, branch). Cadence comes from the occurrence dates (e.g. "Monthly, 3rd Tuesday") or, failing that, from the description's own wording. It is null if neither is conclusive.
- Genres are assigned only when the club's name, tags or self-description states them. Vocab only.
- City is the branch's municipality. Sources, in order: Communico event JSON-LD PostalAddress; LibCal/tribe venue address; registry branch-to-city maps for county systems. It falls back to the system's home city only when the branch can't be resolved.

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

---

# library-more — sources and access notes

Collector: `scripts/sources/library-more.mjs` (registry: `scripts/sources/library-more/registry.mjs`).
Date of all checks: 2026-10-13. User-Agent `BookishClubDirectory/0.1 (public book club listings)`, one host at a time,
>= 1.6 s between requests per host (LibCal hosts declare `Crawl-delay: 10`, honoured as 10.1 s), back-off on 429/5xx,
raw responses cached under `.cache/library-more/`. Public logged-out endpoints only; no keys, no logins.

Scope: library systems whose hosts did not appear in `library-bibliocommons.json` / `library-other.json` (or in the
library-other registry) at the moment each library ran; the check is repeated immediately before every library.

Records: 1195 clubs, 431 cities, 138 library systems.

Rules applied: recurring adult clubs only (kids/teen/tween/family excluded); one record per (library, club name, branch);
cadence derived from the listed dates (or the stated schedule); clubs listed only once in the window are kept only when the
name is a standing club name, with cadence null. city = municipality of the branch (event address / mapped branch town),
validated to never be a branch label. No staff names, emails or phone numbers are stored (contact fields are never read;
"Book Club with <first name>" suffixes are stripped).

Terms: robots.txt was checked automatically for every host before any request (results below). Per-host terms-of-use
pages were NOT individually reviewed in this run (time-boxed); every route used is a public, logged-out listing or feed that
the library's own public calendar page loads (or a syndication feed: Trumba JSON, CivicPlus RSS, Localist API). Follow-up:
review each library's site terms before publishing. BiblioCommons-hosted event calendars were left entirely to the
library-bibliocommons collector (its Terms restrict harvesting to RSS). LibraryMarket/LibraryCalendar hosts serve a
robots.txt that blocks all crawlers except a named list of search engines ("User-agent: * / Disallow: /"), so they were
skipped. Hosts answering 403 to this User-Agent (e.g. *.events.mylibrary.digital tenants) were treated as refusals.

## Collected

| Library | Host | Platform / route | robots.txt (2026-10-13) | Decision | Clubs |
|---|---|---|---|---|---|
| Baltimore County Public Library | events.bcpl.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 16 |
| Douglas County Libraries | go.dcl.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 28 |
| Anythink Libraries | events.anythinklibraries.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 13 |
| Hartford Public Library | programs.hplct.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 1 |
| Ocean County Library | theoceancountylibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 29 |
| Akron-Summit County Public Library | services.akronlibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 27 |
| Fairfax County Public Library | librarycalendar.fairfaxcounty.gov | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 42 |
| Albuquerque & Bernalillo County Library | libevents.abqlibrary.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 27 |
| Spokane County Library District | scld.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 5 |
| Monroe County Library System (Rochester) | calendar.libraryweb.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 40 |
| Monmouth County Library | monmouthcountylib.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 16 |
| Round Rock Public Library | roundrocktexas.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Columbus Metropolitan Library | columbus.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 22 |
| The Seattle Public Library | spl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 0 |
| Kansas City Public Library | kcpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Toledo Lucas County Public Library | toledo.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 22 |
| Harford County Public Library | hcpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*; Disallow: /reserve" | collected | 22 |
| Scottsdale Public Library | scottsdale.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 0 |
| Daniel Boone Regional Library | dbrl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Topeka & Shawnee County Public Library | tscpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Henderson Libraries | henderson.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 7 |
| Aurora Public Library District | aurora.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Newport Beach Public Library | newportbeach.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 0 |
| Westminster Public Library | westminster.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 0 |
| Bexley Public Library | bexley.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 1 |
| Upper Arlington Public Library | ualibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Plano Public Library | plano.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 3 |
| Solano County Library | solanolibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | skipped: host already covered by library-other / library-bibliocommons | 0 |
| Alexandria Library | alexlibraryva.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 9 |
| Forsyth County Public Library | www.forsythpl.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 7 |
| Henry County Library System | henrylibraries.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 10 |
| Gail Borden Public Library District | attend.gailborden.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 7 |
| Princeton Public Library | princetonlibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Chesapeake Public Library | events.chesapeakelibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 8 |
| Boone County Public Library | boone.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Portage District Library | portage.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 1 |
| Maricopa County Library District | events.mcldaz.org | evcal: events.mylibrary.digital-style public search (`POST /update`, the request the public search page makes) | "User-agent: *; Disallow: /staff/" | collected | 22 |
| Mercer County Library System | events.mcl.org | evcal: events.mylibrary.digital-style public search (`POST /update`, the request the public search page makes) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | failed: HTTP 404 /update | 0 |
| Camden County Library System | events.camdencountylibrary.org | evcal: events.mylibrary.digital-style public search (`POST /update`, the request the public search page makes) | "User-agent: *; Disallow: /core/; Disallow: /profiles/; Disallow: /README.md; Disallow: /composer/Metapackage/README.txt; Disallow: /composer/Plugin/ProjectMessage/README.md; Disallow: /composer/Plugin/Scaffold/README.md; ..." | failed: HTTP 404 /update | 0 |
| Hunterdon County Library | hclibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 6 |
| High Plains Library District | highplains.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 18 |
| Jackson County Library Services | jcls.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 9 |
| Lewisville Public Library | lewisville.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 4 |
| Placer County Library | placer.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 7 |
| Providence Public Library | provlib.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /; Disallow: /process_" | skipped: robots.txt disallows | 0 |
| Anaheim Public Library | anaheim.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 8 |
| Eugene Public Library | eugene.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Riverside County Library System | rivlib.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 17 |
| Huntington Beach Public Library | hbpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Cherry Hill Public Library | chplnj.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Hawaii State Public Library System | www.librarieshawaii.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/; Disallow: /wp-content/cache/" | collected | 15 |
| Kern County Library | kerncountylibrary.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/" | collected | 0 |
| Prince William Public Libraries | pwcgov.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*; Disallow: /" | skipped: robots.txt disallows | 0 |
| West Islip Public Library | westisliplibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Edison Public Library | edisonpubliclibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 3 |
| New Brunswick Free Public Library | nbpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 1 |
| Franklin Township Public Library | franklintwp.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Hicksville Public Library | hicksvillelibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Garden City Public Library | gardencitypl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /; Disallow: /process_" | skipped: robots.txt disallows | 0 |
| Freeport Memorial Library | freeportlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Woodbridge Public Library | woodbridge-nj.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 5 |
| Pinellas Public Library Cooperative | pplc.us | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *" with no disallow rules | collected | 37 |
| Huntsville-Madison County Public Library | events.hmcpl.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /core/; Disallow: /profiles/; Disallow: /README.txt; Disallow: /web.config; Disallow: /admin/; Disallow: /comment/reply/; ..." | collected | 0 |
| Chattahoochee Valley Libraries | cvl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 9 |
| Clayton County Library System | claytonpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Pueblo City-County Library District | pueblolibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 11 |
| Clinton-Macomb Public Library | cmpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Lake County Library System (FL) | mylakelibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 25 |
| Osceola Library System | osceolalibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 5 |
| Athens Regional Library System | athenslibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /; Disallow: /process_" | skipped: robots.txt disallows | 0 |
| Lafayette Public Library | lafayettela.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | n/a | skipped: host already covered by library-other / library-bibliocommons | 0 |
| Davenport Public Library | davenportlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 8 |
| Carver County Library | carverlib.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 6 |
| Rutherford County Library System | rclstn.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/" | collected | 0 |
| Westlake Porter Public Library | westlakelibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*; Disallow: /favicon.ico" | collected | 5 |
| Portage County District Library | events.portagelibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 12 |
| Cuyahoga Falls Library | events.fallslibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | robots.txt HTTP 404 (no robots file: allowed) | collected | 0 |
| Pickerington Public Library | pickeringtonlibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Fairfield County District Library | www.fcdlibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | robots.txt HTTP 404 (no robots file: allowed) | collected | 0 |
| Johnson County Public Library (IN) | jcplin.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 7 |
| Campbell County Public Library | cc-pl.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 9 |
| Springfield-Greene County Library District | programs.thelibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 18 |
| Worcester Public Library | mywpl.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | robots.txt HTTP 404 (no robots file: allowed) | collected | 0 |
| Washington-Centerville Public Library | events.wclibrary.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Lorain Public Library System | lorainpubliclibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 14 |
| Mentor Public Library | mentorpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 7 |
| Willoughby-Eastlake Public Library | welibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 5 |
| Geauga County Public Library | geaugalibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 8 |
| Chester County Library System | ccls.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 15 |
| Delaware County Libraries (PA) | delcolibraries.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 38 |
| Dauphin County Library System | dcls.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| New Haven Free Public Library | nhfpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 11 |
| Greenwich Library | greenwichlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 9 |
| Lakewood Public Library | www.lakewoodpubliclibrary.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/; Crawl-delay: 10; Disallow: /?s=; Disallow: /page/*/?s=; Disallow: /search/; Disallow: /sdc_download" | collected | 0 |
| Elkhart Public Library | www.myepl.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/; Disallow: /wp-login.php; Disallow: /xmlrpc.php; Disallow: /?s=; Disallow: /*?replytocom=; Disallow: /local-history?; ..." | collected | 4 |
| St. Mary's County Library | stmalib.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 3 |
| Calvert Library | calvertlibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 9 |
| Berkeley Public Library | berkeleypubliclibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 5 |
| Williamsburg Regional Library | libcal.wrl.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 6 |
| Roanoke County Public Library | roanokecountyva.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 9 |
| Whatcom County Library System | wcls.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 12 |
| Yakima Valley Libraries | yvl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 4 |
| Salem Public Library | cityofsalemlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 1 |
| Yolo County Library | events.yolocountylibrary.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | n/a | skipped: host already covered by library-other / library-bibliocommons | 0 |
| Fullerton Public Library | fullertonlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Corona Public Library | coronacalibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Mountain View Public Library | mountainview.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Los Angeles Public Library | www.lapl.org | lapl: public events search listing (`/events/search`) | "User-agent: *; Disallow: /core/; Disallow: /profiles/; Disallow: /README.md; Disallow: /composer/Metapackage/README.txt; Disallow: /composer/Plugin/ProjectMessage/README.md; Disallow: /composer/Plugin/Scaffold/README.md; ..." | skipped: host already covered by library-other / library-bibliocommons | 0 |
| Flower Mound Public Library | fmlibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 1 |
| McAllen Public Library | mcallenlibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 3 |
| Cozby Library and Community Commons | coppelltx.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 1 |
| Southlake Public Library | southlake.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Corpus Christi Public Libraries | cctexas.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 15 |
| Waco-McLennan County Library | calendar.wacolibrary.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 1 |
| Little Elm Public Library | littleelm.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 1 |
| Sachse Public Library | sachse.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Weatherford Public Library | weatherfordtx.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Ector County Library | ector.lib.tx.us | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/; Crawl-delay: 10" | collected | 0 |
| Aurora Public Library (CO) | auroraco.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 7 |
| Provo City Library | www.provolibrary.gov | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*; Disallow: /library-card-signup" | collected | 2 |
| Calcasieu Parish Public Library | calcasieulibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 7 |
| Nampa Public Library | nampalibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Thomas Branigan Memorial Library | lascruceslibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /; Disallow: /process_" | skipped: robots.txt disallows | 0 |
| Flagstaff City-Coconino County Public Library | flagstaffpubliclibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Englewood Public Library | englewoodpl-co.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 4 |
| Rogers Public Library | rogerspubliclibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 1 |
| Springdale Public Library | calendar.springdalelibrary.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Ada Community Library | adalib.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow: /wp-admin/" | collected | 0 |
| San Antonio Public Library | www.trumba.com | trumba: Trumba public calendar JSON feed (`www.trumba.com/calendars/<name>.json`) | "User-agent: *; Disallow:" | collected | 52 |
| Spartanburg County Public Libraries | www.trumba.com | trumba: Trumba public calendar JSON feed (`www.trumba.com/calendars/<name>.json`) | "User-agent: *; Disallow:" | collected | 10 |
| Shreve Memorial Library | www.shreve-lib.org | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 6 |
| Brazoria County Library System | tx-brazoriacountylibrary.civicplus.com | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /" | skipped: robots.txt disallows | 0 |
| Williamson County Public Library (TN) | www.wcpltn.org | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 1 |
| Nicholson Memorial Library System | www.garlandtx.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 4 |
| Mesquite Public Library | www.cityofmesquite.com | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |
| Zula B. Wylie Public Library | www.cedarhilllibrary.org | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 2 |
| Mansfield Public Library | www.mansfieldtexas.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 2 |
| Rowlett Public Library | www.rowletttx.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |
| Everett Public Library | epls.org | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |
| Longview Public Library | www.longviewtexas.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 1 |
| Abilene Public Library | www.abilenetx.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 2 |
| DeSoto Public Library | www.desototexas.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |
| Enoch Pratt Free Library | calendar.prattlibrary.org | localist: Localist public API (`/api/2/events`) | "User-agent: *; Crawl-Delay: 1; Disallow: /calendar/*?*types*; Disallow: /*/calendar/*?*types*; Disallow: /*/browse*?*types*; Disallow: /*/calendar/200*; Disallow: /*/calendar/2015*; ..." | skipped: host already covered by library-other / library-bibliocommons | 0 |
| Rockford Public Library | services.rockfordpubliclibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 4 |
| Champaign Public Library | champaign.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Urbana Free Library | urbanafreelibrary.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Waukegan Public Library | events.waukeganpl.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| Cook Memorial Public Library District | cooklib.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 9 |
| Sioux City Public Library | siouxcitylibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | n/a | skipped: host already covered by library-other / library-bibliocommons | 0 |
| Great River Regional Library | events.griver.org | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 18 |
| Anderson Public Library | andersonlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /; Disallow: /process_" | skipped: robots.txt disallows | 0 |
| Austin Public Library | library.austintexas.gov | austin: public "Book Clubs" category listing (`/events/book-clubs`) | "User-agent: *; Disallow: /core/; Disallow: /profiles/; Disallow: /README.md; Disallow: /composer/Metapackage/README.txt; Disallow: /composer/Plugin/ProjectMessage/README.md; Disallow: /composer/Plugin/Scaffold/README.md; ..." | collected | 30 |
| Memphis Public Libraries | www.memphislibrary.org | memphis: public "Library Book Clubs" directory page (`/events/book-clubs/`) | "User-agent: *; Disallow: /wp-content/uploads/wpo-plugins-tables-list.json; Disallow:" | collected | 19 |
| Newton Free Library | newtonfreelibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Public Library of Brookline | brooklinelibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Wellesley Free Library | wellesleyfreelibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 6 |
| Bridgeport Public Library | bportlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Onondaga County Public Libraries | onlib-central.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 8 |
| Finkelstein Memorial Library | attend.finkelsteinlibrary.org | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 0 |
| Easton Area Public Library | eastonpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 4 |
| South Brunswick Public Library | sbpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*" | collected | 2 |
| West Windsor Branch Library | wwpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 6 |
| Summit Free Public Library | summitlibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Clifton Public Library | cliftonpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 2 |
| Wayne Public Library | waynepubliclibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 9 |
| Altoona Area Public Library | altoonalibrary.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow:" | collected | 1 |
| Brunswick County Library (NC) | mybcpl.libnet.info | communico: Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address | "User-agent: *; Disallow: /results*; Disallow: /sitesearch*; Disallow: /*/sitesearch*; Disallow: /onlinebookdiscussion" | collected | 4 |
| Hall County Library System | hallcountylibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 5 |
| Lakeland Public Library | lakelandpl.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 3 |
| Union County Public Library (NC) | union-nc.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 9 |
| New Hanover County Public Library | libcal.nhcgov.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 10 |
| Berkeley County Library System (SC) | berkeleylibrarysc.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 0 |
| Lexington County Public Library | lexcolibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 23 |
| Northwest Regional Library System (FL) | www.nwrls.com | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow:" | collected | 9 |
| Cherokee County Public Library (SC) | cherokeecountylibrary.org | tribe: WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`) | "User-agent: *; Disallow:" | collected | 0 |
| High Point Public Library | www.highpointnc.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 3 |
| Rowan Public Library | www.rowancountync.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 1 |
| San Mateo Public Library | sanmateopublic.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 4 |
| Camarillo Public Library | camarillolibrary.libcal.com | libcal: Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads) | "User-agent: *; Crawl-delay: 10; Disallow: /process_" | collected | 4 |
| Temecula Public Library | www.temeculaca.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |
| Murrieta Public Library | www.murrietaca.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 1 |
| Danville Public Library (VA) | www.danvilleva.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |
| Richmond Public Library (CA) | www.richmondca.gov | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 1 |
| Daly City Public Library | www.dalycity.org | civicplus: CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`) | "User-agent: *; Disallow: /activedit; Disallow: /admin; Disallow: /common/admin/; Disallow: /OJA; Disallow: /support; Disallow: /currenteventsview.asp; ..." | collected | 0 |

## Skipped libraries (not attempted beyond robots.txt / homepage)

| Library | Host | Reason |
|---|---|---|
| Anne Arundel County Public Library | www.aacpl.net | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Metropolitan Library System (Oklahoma City) | www.metrolibrary.org | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Des Moines Public Library | www.dmpl.org | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Louisville Free Public Library | events.lfpl.org | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Virginia Beach Public Library | vbpl.librarymarket.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Fort Bend County Libraries | www.fortbendlibraries.gov | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Knox County Public Library | www.knoxcountylibrary.org | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Dallas Public Library | dallaslibrary.librarymarket.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Poudre River Public Library District | poudrelibraries.librarycalendar.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Pikes Peak Library District | ppld.librarymarket.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Frederick County Public Libraries | frederick.librarycalendar.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Carroll County Public Library | ccpl.librarymarket.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Ventura County Library | www.library.venturacounty.gov | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Sarasota County Libraries | scgovlibrary.librarymarket.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| St. Johns County Public Library System | sjcpls.librarycalendar.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Augusta-Richmond County Public Library | arcpls.librarycalendar.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Forsyth County Public Library (NC) | forsythcounty.librarycalendar.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Mobile Public Library | www.mobilepubliclibrary.org | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Lee County Library System | www.leegov.com/library | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Medina County District Library | medinacounty.librarycalendar.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Lane Public Libraries / Davis County / Orem / Glendale AZ / Naperville / Oak Park / Skokie / Evanston-area and many Long Island, NJ, MI libraries | *.librarycalendar.com, *.librarymarket.com | LibraryMarket/LibraryCalendar host: robots.txt "User-agent: * / Disallow: /" (only named search engines allowed) |
| Fresno County Public Library | fresnolibrary.libcal.com | robots.txt disallows |
| Providence Public Library | provlib.libcal.com | robots.txt disallows |
| Prince William Public Libraries | pwcgov.libnet.info | robots.txt disallows |
| Garden City Public Library | gardencitypl.libcal.com | robots.txt disallows |
| Athens Regional Library System | athenslibrary.libcal.com | robots.txt disallows |
| Thomas Branigan Memorial Library (Las Cruces) | lascruceslibrary.libcal.com | robots.txt disallows |
| Brazoria County Library System | tx-brazoriacountylibrary.civicplus.com | robots.txt disallows |
| St. Louis County Library | slcl.events.mylibrary.digital | HTTP 403 to this User-Agent (treated as refusal) |
| San Diego Public Library | sandiego.events.mylibrary.digital | HTTP 403 to this User-Agent (treated as refusal) |
| Weber County Library / Ypsilanti / Clermont County / Lake County IN / Duluth / Danbury / Rio Rancho / San Marcos TX / Old Bridge | *.events.mylibrary.digital | HTTP 403 to this User-Agent (treated as refusal) |
| Howard County Library System | hclibrary.org | HTTP 403 to this User-Agent (treated as refusal) |
| Harford County Public Library website | www.hcplonline.org | HTTP 403 to this User-Agent (treated as refusal) (events collected from hcpl.libnet.info instead) |
| Columbus Metropolitan Library website | www.columbuslibrary.org | HTTP 403 to this User-Agent (treated as refusal) (events collected from columbus.libnet.info instead) |
| Nashville Public Library | library.nashville.gov | HTTP 403 to this User-Agent (treated as refusal) |
| Richland Library | www.richlandlibrary.com | HTTP 403 to this User-Agent (treated as refusal) |
| Toledo Lucas County website | www.toledolibrary.org | HTTP 403 to this User-Agent (treated as refusal) (events collected from toledo.libnet.info instead) |
| Memphis (Evanced calendar) | memphislibrary.evanced.info | no response; book-club directory page on memphislibrary.org used instead |
| Mecklenburg / Johnson County KS / Arapahoe / Jefferson County CO / Pima / Omaha / Palm Beach / Santa Clara County / Contra Costa / Alameda County / San Mateo County / Sno-Isle / Ramsey / Kent District / Hennepin / Frisco / Chandler / Denton / Cincinnati / Dayton / Stark / Westerville / Fulton / Harris County / San Diego County / Kitsap / Timberland / Fort Vancouver / Tacoma / Yuma / Lawrence KS / Kenton County | *.bibliocommons.com | events on BiblioCommons (left to library-bibliocommons collector, RSS-only per BiblioCommons Terms) |
| Mid-Continent Public Library | www.mymcpl.org | custom site; public search returned no results without scripting — not collected |
| Cobb County Public Library | www.cobbcounty.gov | county-wide Drupal calendar; no library-only listing found in time — not collected |
| Greenville County Library System / Madison PL / Ann Arbor DL / Capital Area DL / Kansas City KS / El Paso / Detroit / Collier / Kern County | various | custom calendars; not attempted in the time box |
| Mesa Public Library | events.mesalibrary.org | robots.txt disallows |
| Maricopa-area cities with own sites (Peoria AZ, Surprise, Avondale) | various | HTTP 403 to this User-Agent (treated as refusal) |
| Seattle Public Library (Communico tenant) | spl.libnet.info | tenant feed returned no events (not in use) |
| Scottsdale / Newport Beach / Westminster CO (Communico tenants) | *.libnet.info | tenant feed returned no events or HTML |
| Mercer County Library System / Camden County Library System (NJ) | events.mcl.org, events.camdencountylibrary.org | different calendar version: public search endpoint returned 404; not collected |
| Anderson Public Library (IN) | andersonlibrary.libcal.com | robots.txt disallows |
| Enoch Pratt Free Library, Los Angeles PL, Yolo County, Solano County, Lafayette (LA), Sioux City | various | collected meanwhile by library-other / library-bibliocommons (host appeared in their output before this run reached it) |
