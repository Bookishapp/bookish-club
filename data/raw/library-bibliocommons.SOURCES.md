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
