#!/usr/bin/env node
// Writes data/raw/library-other.SOURCES.md from the run status (.cache/library-other/_status.json) + the skip log below.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './http.mjs';
import { LIBRARIES } from './registry.mjs';

const status = JSON.parse(await readFile(path.join(ROOT, '.cache/library-other/_status.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(ROOT, 'data/raw/library-other.json'), 'utf8'));
const counts = {};
for (const r of data) counts[r.library] = (counts[r.library] ?? 0) + 1;

// Terms-of-use checks (fetched 2026-10-13 with the same polite client; searched for automated-access / scraping clauses).
const TERMS = {
  'LA County Library': ['https://lacountylibrary.org/terms-of-use/', 'Terms of use page has no clause on automated access or scraping.'],
  'DC Public Library': ['https://www.dclibrary.org/terms-and-conditions', 'Terms and conditions have no clause on automated access or scraping.'],
  'Broward County Library': ['https://www.broward.org/terms', 'County terms have no clause on automated access or scraping.'],
  'Las Vegas-Clark County Library District': ['https://thelibrarydistrict.org/rental-facilities/terms-and-conditions/', 'Only rental-facility terms found; no automated-access clause.'],
  'Cuyahoga County Public Library': ['https://cuyahogalibrary.org/about/policies', 'Policies page has no clause on automated access or scraping.'],
  'Cleveland Public Library': ['https://cpl.org/policies/', 'Policies page has no clause on automated access or scraping.'],
  'Orange County Library System': ['https://ocls.org/using-library/library-policies/', 'Library policies have no clause on automated access or scraping.'],
  'Salt Lake County Library': ['https://www.slcolibrary.org/policies/', 'Policies page has no clause on automated access or scraping.'],
  'Houston Public Library': ['https://houstonlibrary.org/policies', 'Policies page has no clause on automated access or scraping.'],
  'Jacksonville Public Library': ['https://jaxpubliclibrary.org/policies', 'Policies page has no clause on automated access or scraping.'],
};
const PLATFORM_TERMS = {
  communico: 'Communico (vendor) privacy policy https://communico.co/privacy-policy: no automated-access clause. The endpoint is the same public JSON (/eeventcaldata) the logged-out events page loads.',
  trumba: 'Trumba public JSON calendar feed (https://www.trumba.com/calendars/<webName>.json), the documented embed feed. robots.txt allows it.',
  localist: 'Localist public API /api/2/events. robots.txt allows /api; /search is disallowed, so we filter by event-type id rather than using search. Crawl-delay 1s honoured.',
  libcal: 'Springshare LibCal: privacy page https://www.springshare.com/privacy has no automated-access clause. robots.txt sets Crawl-delay: 10, which we honour. The endpoint is the same public JSON (/ajax/calendar/list) the calendar page loads.',
  tribe: 'WordPress "The Events Calendar": public REST API /wp-json/tribe/events/v1/events (logged-out, the documented public feed).',
  custom: 'Public HTML listing pages (logged-out). LAPL: /events/search filtered to the Book Clubs category + Adults/Seniors audiences. Queens: /calendar search filtered to program type "Book Discussion Group" and split by branch facet. The load-more endpoint /search/call is robots-disallowed and is not used, so each query reads only its first 12-result page.',
};

const SKIPPED = [
  ['New York Public Library', 'www.nypl.org', 'Behind an Incapsula bot wall (it serves a JS challenge even for robots.txt). Not circumvented. Skipped.'],
  ['Free Library of Philadelphia', 'www.freelibrary.org / libwww.freelibrary.org', 'HTTP 403 to our UA (bot protection). Skipped.'],
  ['Columbus Metropolitan Library', 'www.columbuslibrary.org', 'HTTP 403 (bot protection). Skipped.'],
  ['Nashville Public Library', 'library.nashville.gov', 'HTTP 403 (bot protection). Skipped.'],
  ['San Antonio Public Library', 'www.mysapl.org', 'robots.txt disallows our path. Skipped.'],
  ['St. Louis County Library', 'www.slcl.org', 'robots.txt disallows /events-classes. Skipped.'],
  ['Denver Public Library', 'denverlibrary.libcal.com', 'LibCal robots.txt has "Disallow: /" for *. Skipped.'],
  ['Memphis Public Libraries', 'memphis.librarycalendar.com', 'LibraryCalendar (LibraryMarket) robots.txt has "User-agent: * / Disallow: /" (only named search/social bots allowed). Skipped. The same applies to every librarycalendar.com / librarymarket.com host: Dallas, Frederick County MD, Forsyth County NC, Springfield MA, Troy MI, Waterford MI, Virginia Beach, Lee County FL, Sarasota County.'],
  ['Mesa Public Library', 'events.mesalibrary.org', 'robots.txt disallows. Skipped.'],
  ['Louisville Free Public Library', 'events.lfpl.org', 'robots.txt disallows. Skipped.'],
  ['Jefferson Parish Library', 'calendar.jplibrary.net', 'robots.txt disallows. Skipped.'],
  ['Fresno County Public Library', 'fresnolibrary.libcal.com', 'robots.txt disallows. Skipped.'],
  ['New Orleans PL (LibCal host)', 'nolalibrary.libcal.com', 'robots.txt disallows. Communico host neworleans.libnet.info was used instead.'],
  ['York County Libraries (PA)', 'events.yorklibraries.org', 'robots.txt disallows. Skipped.'],
  ['Library System of Lancaster County', 'calendar.lancasterlibraries.org', 'robots.txt disallows. Skipped.'],
  ['Community Libraries of Providence', 'clpvd.org', 'robots.txt disallows /wp-json. Skipped.'],
  ['Anne Arundel County PL, Kansas City KS PL, Metropolitan Library System (OKC), Fort Bend County Libraries, Knox County PL, Ventura County Library, Seminole County FL', 'various', 'robots.txt disallows the site root for *. Skipped.'],
  ['Toledo Lucas County PL, Richland Library, Howard County (hclibrary.org), Prince William, Irving, Brevard, Hampton, Onslow, Nassau, Johnson County (jclibrary.org)', 'various', 'HTTP 403 to our UA. Skipped.'],
  ['Detroit Public Library', 'detroitpubliclibrary.org', 'Events are published on Eventbrite, which is out of scope here. Skipped.'],
  ['Brooklyn Public Library', 'discover.bklynlibrary.org', 'The event search API (/api/search/v2.php) returns {"error":"access denied"} to non-browser clients. This is treated as an access gate and not circumvented. www.bklynlibrary.org/events returns 500. Skipped.'],
  ['San Diego Public Library (city)', 'sandiego.events.mylibrary.digital', 'HTTP 403 to our UA (bot protection). Skipped.'],
  ['Maricopa County Library District', 'events.mcldaz.org', 'Already covered by the library-more source. Skipped here to avoid duplicates.'],
  ['Kansas City Public Library (MO)', 'kclibrary.org', 'Robots allow it, but it needs a bespoke Drupal parser. Not built.'],
  ['BiblioCommons Events libraries', 'Chicago, Boston, SFPL, Oakland, San Jose, Austin, Harris County, Atlanta-Fulton, Charlotte, Hennepin, KCLS, San Diego County, St. Louis City, Cincinnati, Multnomah, etc.', 'Not collected: events live on BiblioCommons, whose terms bar republishing (source excluded for good).'],
];

const today = '2026-10-13';
let md = `# library-other: sources and compliance notes\n\nGenerated by \`scripts/sources/library-other/sources-md.mjs\`. Run date ${today}.\n\n`;
md += `Client: User-Agent \`BookishClubDirectory/0.1 (public book club listings)\`. Requests are sequential per host, at least 1.6 s apart or the robots.txt Crawl-delay if larger (LibCal hosts: 10 s), with backoff on 429/5xx. Raw responses are cached under \`.cache/library-other/<host>/\`. Only public, logged-out endpoints are used, with no keys or logins. Only these fields are stored: name, city, state, venue, genre, cadence, format, vibe (a paraphrased feature list) and source URL. No staff names, emails or phone numbers.\n\n`;
md += `Total: **${data.length} clubs** from **${Object.keys(counts).length} library systems**, ${new Set(data.map((r) => r.city + ',' + r.state)).size} distinct cities.\n\n`;
md += `## Platform notes\n\n` + Object.entries(PLATFORM_TERMS).map(([k, v]) => `- **${k}**: ${v}`).join('\n') + '\n\n';
md += `## Hosts scraped\n\n| Library | Host | Platform | robots.txt (checked ${today}) | Terms check (${today}) | Decision | Records |\n|---|---|---|---|---|---|---|\n`;
for (const lib of LIBRARIES) {
  const s = status[lib.name];
  const t = TERMS[lib.name];
  const terms = t ? `${t[1]} (${t[0]})` : 'No site terms page restricting automated access found at common paths. Platform terms above apply.';
  const robots = s?.robots === 'DISALLOWED' ? 'DISALLOWS path' : `allows event endpoint${s?.crawlDelayMs ? `; Crawl-delay ${Math.round(s.crawlDelayMs / 1000)}s honoured` : ''}`;
  const decision = s?.ok ? 'scraped' : s ? `failed: ${s.error}` : 'not run';
  md += `| ${lib.name} | ${lib.host} | ${lib.platform} | ${robots} | ${terms} | ${decision} | ${counts[lib.name] ?? 0} |\n`;
}
md += `\n## Libraries skipped\n\n| Library | Host | Reason |\n|---|---|---|\n` + SKIPPED.map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n';
md += `\n## Method\n\n- Only events matching book club, book discussion, readers or reading group are kept, from the next ~90 days. Kids, teen, tween and family audiences are excluded via audience tags and title words. One-off author talks, book sales, storytimes and similar are excluded.\n- Recurring occurrences are collapsed per (library, normalised club name, branch). Cadence comes from the occurrence dates (e.g. "Monthly, 3rd Tuesday") or, failing that, from the description's own wording. It is null if neither is conclusive.\n- Genres are assigned only when the club's name, tags or self-description states them. Vocab only.\n- City is the branch's municipality. Sources, in order: Communico event JSON-LD PostalAddress; LibCal/tribe venue address; registry branch-to-city maps for county systems. It falls back to the system's home city only when the branch can't be resolved.\n`;
await writeFile(path.join(ROOT, 'data/raw/library-other.SOURCES.md'), md);
console.log('wrote SOURCES.md');
