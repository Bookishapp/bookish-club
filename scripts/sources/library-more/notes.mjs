#!/usr/bin/env node
// Regenerates data/raw/library-more.SOURCES.md from the run status, the registry and the cached robots.txt files.
// Usage: node scripts/sources/library-more/notes.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, CACHE_DIR } from './http.mjs';
import { LIBRARIES } from './registry.mjs';
import { SKIPPED } from './skipped.mjs';

const status = JSON.parse(await readFile(path.join(CACHE_DIR, '_status.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(ROOT, 'data/raw/library-more.json'), 'utf8'));
const counts = {};
for (const r of data) counts[r.library] = (counts[r.library] ?? 0) + 1;

async function robotsFor(host) {
  const dir = path.join(CACHE_DIR, host);
  if (!existsSync(dir)) return null;
  for (const f of await readdir(dir)) {
    const raw = await readFile(path.join(dir, f), 'utf8');
    const nl = raw.indexOf('\n');
    const meta = JSON.parse(raw.slice(0, nl));
    if (!/\/robots\.txt$/.test(meta.url)) continue;
    if (meta.status >= 400) return `robots.txt HTTP ${meta.status} (no robots file: allowed)`;
    const body = raw.slice(nl + 1);
    if (/<html/i.test(body.slice(0, 300))) return 'robots.txt returns HTML (no rules: allowed)';
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(user-agent|disallow|crawl-delay)\s*:/i.test(l));
    const star = [];
    let inStar = false;
    for (const l of lines) {
      if (/^user-agent/i.test(l)) { inStar = /:\s*\*\s*$/.test(l); continue; }
      if (inStar) star.push(l);
    }
    const q = star.slice(0, 6).join('; ');
    return q ? `"User-agent: *; ${q}${star.length > 6 ? '; ...' : ''}"` : '"User-agent: *" with no disallow rules';
  }
  return null;
}

const PLATFORM_ROUTE = {
  communico: 'Communico public events JSON (`/eeventcaldata`, the feed the public events page loads) + one public event page per branch for the address',
  libcal: 'Springshare LibCal public calendar JSON (`/ajax/calendar/list`, the feed the public calendar page loads)',
  tribe: 'WordPress "The Events Calendar" public REST API (`/wp-json/tribe/events/v1/events`)',
  evcal: 'events.mylibrary.digital-style public search (`POST /update`, the request the public search page makes)',
  trumba: 'Trumba public calendar JSON feed (`www.trumba.com/calendars/<name>.json`)',
  civicplus: 'CivicPlus calendar public RSS feed (`/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`)',
  localist: 'Localist public API (`/api/2/events`)',
  austin: 'public "Book Clubs" category listing (`/events/book-clubs`)',
  memphis: 'public "Library Book Clubs" directory page (`/events/book-clubs/`)',
  lapl: 'public events search listing (`/events/search`)',
};

let md = `# library-more — sources and access notes

Collector: \`scripts/sources/library-more.mjs\` (registry: \`scripts/sources/library-more/registry.mjs\`).
Date of all checks: 2026-10-13. User-Agent \`BookishClubDirectory/0.1 (public book club listings)\`, one host at a time,
>= 1.6 s between requests per host (LibCal hosts declare \`Crawl-delay: 10\`, honoured as 10.1 s), back-off on 429/5xx,
raw responses cached under \`.cache/library-more/\`. Public logged-out endpoints only; no keys, no logins.

Scope: library systems whose hosts did not appear in \`library-bibliocommons.json\` / \`library-other.json\` (or in the
library-other registry) at the moment each library ran; the check is repeated immediately before every library.

Records: ${data.length} clubs, ${new Set(data.map((r) => r.city + ',' + r.state)).size} cities, ${Object.keys(counts).length} library systems.

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
`;
const rows = [];
for (const lib of LIBRARIES) {
  const st = status[lib.name];
  const rb = (await robotsFor(lib.host)) ?? st?.robots ?? 'n/a';
  let decision;
  if (!st) decision = 'not run';
  else if (st.skipped) decision = `skipped: ${st.skipped}`;
  else if (st.robots === 'DISALLOWED') decision = 'skipped: robots.txt disallows';
  else if (!st.ok) decision = `failed: ${st.error}`;
  else decision = 'collected';
  rows.push(`| ${lib.name} | ${lib.host} | ${lib.platform}: ${PLATFORM_ROUTE[lib.platform] ?? ''} | ${String(rb).replace(/\|/g, '/')} | ${decision} | ${counts[lib.name] ?? 0} |`);
}
md += rows.join('\n') + '\n\n## Skipped libraries (not attempted beyond robots.txt / homepage)\n\n| Library | Host | Reason |\n|---|---|---|\n';
md += SKIPPED.map(([n, h, why]) => `| ${n} | ${h} | ${why} |`).join('\n') + '\n';
await writeFile(path.join(ROOT, 'data/raw/library-more.SOURCES.md'), md);
console.log('wrote SOURCES.md', rows.length, 'libraries,', SKIPPED.length, 'skipped');
