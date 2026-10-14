#!/usr/bin/env node
// Library book clubs from public library systems on the BiblioCommons events platform.
//
// Access route: the official public events RSS feed that BiblioCommons exposes for every
// events-enabled library: https://gateway.bibliocommons.com/v2/libraries/<id>/rss/events
// The BiblioCommons Terms of Use forbid automated harvesting "except as may be specifically
// permitted using RSS/XML feeds", so this script ONLY reads that RSS feed. It never calls the
// JSON events API and never requests pages on <id>.bibliocommons.com (those hosts declare
// Crawl-delay: 120 in robots.txt). See data/raw/library-bibliocommons.SOURCES.md.
//
// Node 24, zero dependencies. Re-runnable: raw responses are cached under
// .cache/library-bibliocommons/ and re-used (pass --refresh to re-fetch).
//
// Usage: node scripts/sources/library-bibliocommons.mjs [--refresh] [--only=id,id]

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- config
// BiblioCommons site ids to try. Big-30 metro systems first, then other US systems.
// Ids that are not on BiblioCommons, have events disabled, or are not US are recorded
// as skipped in the run log and SOURCES.md.
export const LIBRARIES = [
  // --- 30 biggest metros (systems we could identify; many big-metro systems are not on BiblioCommons events)
  'nypl', 'brooklyn', 'queens', 'lapl', 'lacountylibrary', 'colapl', 'chipublib', 'dallaslibrary', 'dallas',
  'houston', 'hpl', 'hcpl', 'fulcolibrary', 'afpls', 'gwinnettpl', 'dekalb', 'cobbcat', 'dcpl', 'dclibrary',
  'freelibrary', 'mdpls', 'phoenixpubliclibrary', 'phoenix', 'mcldaz', 'bpl', 'rivlib', 'riverside',
  'sfpl', 'oaklandlibrary', 'sjpl', 'aclibrary', 'sccl', 'smcl', 'ccclib', 'contracosta', 'detroit', 'detroitpubliclibrary',
  'seattle', 'kcls', 'hclib', 'sppl', 'hcplc', 'tampa', 'pinellas', 'sdcl', 'sandiego', 'sdpl', 'denverlibrary',
  'denver', 'ocls', 'cmlibrary', 'prattlibrary', 'epfl', 'bcpl', 'slpl', 'slcl', 'sapl', 'mysapl', 'austin',
  'multcolib', 'saclibrary', 'sacramento', 'clp', 'carnegielibrary', 'lvccld', 'cincinnatilibrary',
  // --- other US systems (suburban county systems count)
  'ocpl', 'sdcounty', 'marinlibrary', 'sonomalibrary', 'solano', 'santacruzpl', 'slolibrary', 'sbpl', 'smpl',
  'lbpl', 'pasadena', 'glendale', 'burbank', 'santaclara', 'paloalto', 'mvpl', 'sunnyvale', 'fremont', 'berkeley',
  'ventura', 'fresnolibrary', 'kerncountylibrary', 'placer', 'yolocounty', 'sjcl', 'stanislaus', 'mppl',
  'tacoma', 'piercecountylibrary', 'sno-isle', 'snoisle', 'fvrl', 'krl', 'spokanelibrary', 'scld', 'trl', 'everett',
  'epls', 'bellingham', 'wcls', 'olympia',
  'wccls', 'clackamas', 'lcd', 'eugene', 'salem', 'deschutes',
  'jeffcolibrary', 'arapahoelibraries', 'arapahoe', 'boulderlibrary', 'anythink', 'dcl', 'ppld', 'poudre', 'mesacounty',
  'pima', 'scottsdale', 'tempe', 'mesa', 'chandler', 'gilbert', 'glendaleaz', 'peoria',
  'slcolibrary', 'slcpl', 'slco', 'washoe', 'boise', 'abqlibrary', 'santafe',
  'jocolibrary', 'kclibrary', 'mymcpl', 'kckpl', 'wichita', 'omahalibrary', 'lincoln', 'tulsalibrary', 'metrolibrary',
  'friscolibrary', 'plano', 'fortworth', 'fwpl', 'arlingtontx', 'irving', 'denton', 'mckinney', 'richardson',
  'garland', 'carrollton', 'lewisville', 'elpaso', 'elpasolibrary', 'ccpl', 'wtx', 'roundrock', 'williamson',
  'gplibrary', 'sugarland', 'fortbend', 'mcpl', 'montgomerycountytx', 'galveston',
  'hclibrary', 'aacpl', 'mcplmd', 'montgomerycountymd', 'fcpl', 'fcplmd', 'carr', 'ccpl-md', 'hcplmd', 'pgcmls',
  'fairfaxcounty', 'fairfax', 'loudoun', 'arlingtonva', 'alexlibrary', 'pwcls', 'rampl', 'richmond', 'yourlibrary',
  'henrico', 'chesterfield', 'npl', 'vbpl', 'hampton', 'jrlibrary', 'jmrl', 'rcpl',
  'bclsnj', 'oceancity', 'mcl', 'somerset', 'sclsnj', 'mcplnj', 'bccls', 'jcpl', 'ocean', 'ocln', 'princeton',
  'hunterdon', 'morris', 'camden', 'gloucester', 'atlantic', 'mclib',
  'mclinc', 'bucks', 'buckslib', 'mcpl-pa', 'ccls', 'delco', 'lancaster', 'yorklibraries', 'dauphin', 'acld', 'allegheny',
  'cplmd', 'nashville', 'library.nashville', 'knox', 'memphis', 'chattanooga',
  'cmlibrary', 'wake', 'wakegov', 'durham', 'durhamcounty', 'guilford', 'greensboro', 'forsyth', 'cumberland',
  'greenvillelibrary', 'greenelibrary', 'richland', 'charleston', 'ccpl-sc', 'spartanburg', 'horry',
  'jaxpubliclibrary', 'jpl', 'broward', 'pbclibrary', 'mylibrary', 'leelibrary', 'collier', 'sarasota', 'manatee',
  'polk', 'volusia', 'seminole', 'brevard', 'alachua', 'tallahassee', 'leon', 'pasco', 'stjohns', 'osceola', 'lake',
  'escambia', 'westfloridalibrary', 'cobb', 'gcpl', 'athens', 'chatham', 'liveoakpl', 'columbus', 'macon',
  'mobile', 'bham', 'huntsville', 'jackson', 'neworleans', 'nolalibrary', 'ebrpl', 'jefferson', 'shreveport',
  'cml', 'columbuslibrary', 'cuyahoga', 'cuyahogalibrary', 'cpl', 'clevelandpubliclibrary', 'akronlibrary', 'dayton',
  'toledo', 'toledolibrary', 'grpl', 'kdl', 'cantonpl', 'aadl', 'troy', 'novi', 'farmington', 'westbloomfield',
  'lansing', 'cadl', 'kpl', 'flint', 'indypl', 'acpl', 'hamilton', 'hepl', 'carmel', 'evpl', 'mcpl-in',
  'lfpl', 'kentonlibrary', 'bcpl-ky', 'campbell', 'lexpublib', 'mkepl', 'mpl', 'madison', 'waukesha', 'appleton',
  'glenviewpl', 'evanstonlibrary', 'skokie', 'oppl', 'oakpark', 'naperville', 'ahml', 'schaumburg', 'palatine',
  'wilmette', 'winnetka', 'highlandpark', 'deerfield', 'northbrook', 'lakeforest', 'eapl', 'aurora', 'joliet',
  'elmhurst', 'downers', 'hinsdale', 'lagrange', 'wheaton', 'gail', 'gailborden', 'champaign', 'urbana', 'rockford',
  'peoriapl', 'bloomington', 'springfield', 'ramsey', 'dakota', 'anoka', 'washington', 'scott', 'carver', 'duluth',
  'rochester', 'desmoines', 'dmpl', 'cedarrapids', 'iowacity', 'stl', 'stlouis', 'kcpl',
  'boston', 'cambridge', 'newton', 'brookline', 'somerville', 'worcester', 'minuteman', 'noble', 'ocln-ma', 'cwmars',
  'providence', 'provlib', 'hartford', 'hplct', 'newhaven', 'stamford', 'fergusonlibrary', 'greenwich', 'westport',
  'norwalk', 'burlington', 'fletcherfree', 'portland', 'portlandlibrary', 'nhpl', 'manchester',
  'buffalo', 'buffalolib', 'rochesterpl', 'monroe', 'syracuse', 'onlib', 'albany', 'westchester', 'wls', 'yonkers',
  'nassau', 'suffolk', 'smithtown', 'huntington', 'hempstead', 'nyack', 'whiteplains', 'scarsdale',
  'honolulu', 'hawaii', 'anchorage', 'alaska', 'vpl', 'tpl', 'opl', 'calgary', 'epl',
];

const USER_AGENT = 'BookishClubDirectory/0.1 (public book club listings)';
const MIN_INTERVAL_MS = 1600; // >= 1.5 s between requests to the same host
const GATEWAY = 'https://gateway.bibliocommons.com';
const QUERIES = ['book club', 'book discussion', 'book group', 'reading group', 'club de lectura'];
const WINDOW_DAYS = 92;
const MAX_PAGES_PER_QUERY = 40; // 25 items per RSS page

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'library-bibliocommons');
const OUT_JSON = path.join(ROOT, 'data', 'raw', 'library-bibliocommons.json');
const OUT_LOG = path.join(ROOT, '.cache', 'library-bibliocommons', '_run-log.json');

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const TODAY = new Date().toISOString().slice(0, 10);
const END = new Date(Date.now() + WINDOW_DAYS * 864e5).toISOString().slice(0, 10);

// ---------------------------------------------------------------- polite fetch + cache
const lastHit = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let networkRequests = 0;

async function politeFetch(url) {
  const key = createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, key + '.json');
  if (!REFRESH && existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const host = new URL(url).host;
  let attempt = 0;
  for (;;) {
    const wait = (lastHit.get(host) || 0) + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    networkRequests++;
    let status = 0, body = '';
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/xml, */*' } });
      status = res.status;
      body = await res.text();
    } catch (e) {
      status = 0; body = String(e);
    }
    if ((status === 429 || status >= 500 || status === 0) && attempt < 4) {
      attempt++;
      const backoff = 5000 * 2 ** attempt;
      console.warn(`  ${status} on ${url} — backing off ${backoff / 1000}s`);
      await sleep(backoff);
      continue;
    }
    const rec = { url, status, fetched_at: new Date().toISOString(), body };
    await writeFile(file, JSON.stringify(rec));
    return rec;
  }
}

// ---------------------------------------------------------------- robots.txt
function robotsAllows(robotsTxt, pathname) {
  // Minimal parser: rules in the "User-agent: *" group (or a group naming our UA token).
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let applies = false, inUaRun = false;
  const rules = [];
  for (const l of lines) {
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!inUaRun) applies = false;
      inUaRun = true;
      if (v === '*' || /bookishclub/i.test(v)) applies = true;
    } else {
      inUaRun = false;
      if (applies && (k === 'allow' || k === 'disallow') && v) rules.push({ allow: k === 'allow', p: v });
    }
  }
  let best = null;
  for (const r of rules) {
    const re = new RegExp('^' + r.p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(pathname) && (!best || r.p.length > best.p.length)) best = r;
  }
  return !best || best.allow;
}

// ---------------------------------------------------------------- RSS parsing
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
};
const stripHtml = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function parseRss(xml) {
  const channelTitle = tag(xml.split('<item>')[0], 'title') || '';
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const loc = it.match(/<bc:location>([\s\S]*?)<\/bc:location>/);
    const reg = it.match(/<bc:registration_info>([\s\S]*?)<\/bc:registration_info>/);
    items.push({
      title: (tag(it, 'title') || '').replace(/\s+/g, ' ').trim(),
      description: stripHtml(decode((it.match(/<description>([\s\S]*?)<\/description>/) || [, ''])[1])),
      link: tag(it, 'link'),
      categories: [...it.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((c) => decode(c[1])),
      start: tag(it, 'bc:start_date_local'),
      cancelled: tag(it, 'bc:is_cancelled') === 'true',
      virtual: tag(it, 'bc:is_virtual') === 'true',
      regRequired: reg ? tag(reg[1], 'bc:is_required') === 'true' : null,
      location: loc
        ? {
            id: tag(loc[1], 'bc:id'),
            name: tag(loc[1], 'bc:name'),
            city: tag(loc[1], 'bc:city'),
            state: tag(loc[1], 'bc:state'),
            country: tag(loc[1], 'bc:country'),
          }
        : null,
    });
  }
  return { channelTitle, items };
}

// ---------------------------------------------------------------- classification
const CLUB_RE =
  /\bbook\s*(club|discussion|group|chat|talk|circle|lovers|bunch|nook|banter|buzz|break|brunch|social|salon|society)s?\b|\bbook-?worms?\b|\bbookies\b|\breading (group|club|circle|society)s?\b|\breaders'?\s*(club|circle|group|corner|society|guild|caf[eé]|choice|roundtable|forum)\b|\b(literary|lit|literature) (club|circle|society|salon|discussion|group|lounge)\b|\bsilent book|\bclub de (lectura|libros?|lectores)\b|\bc[ií]rculo de lectura\b|\bbooks? (and|&|n'?) (brews?|beers?|wine|coffee|cocktails|bites|bevs)\b|\b(brews?|beers?|wine|coffee|cocktails|pints?|tea) (and|&|n'?) (books?|lit)\b|\bbooks on tap\b|\bpage ?turners\b|\bnovel (idea|ideas|discussions?|thoughts|conversations?|readers)\b|\bgreat books\b|\bshort stor(y|ies) (club|discussion|group)\b|\b(mystery|mysteries|sci-?fi|fantasy|romance|horror|poetry|graphic novel|manga|classics?|nonfiction|non-fiction|history|memoir|thriller) (club|readers|book club|lovers|circle|group|discussion)s?\b|\bread(ing)? (and|&) (discuss|chat)\b|\bbook (and|&) (brew|bev)/i;
const NOT_CLUB_RE =
  /\bauthor (talk|visit|event|reading|conversation|signing|spotlight|series)|\bmeet the author|\bbook (sale|swap|signing|launch|drive|bundle|bike|fair|making|binding|repair|art|folding|exchange|tasting|giveaway|cart|bingo|walk|madness)|\bbookmobile|\bbook ?mark|\bbook club (kits?|in a bag|bags?|sets?|to go)|\bkits?\b|\bstory ?time|\bread[- ]?aloud|\breading buddies|\bread to a (dog|pet)|\bpaws to read|\btutor|\bwriters?'? (group|workshop|circle|club)|\bwriting\b|\bcraft|\bmovie|\bfilm\b|\blecture|\bworkshop|\bclass\b|\bcelebration|\bkick-?off|\bgiveaway|\bdonat|\btrivia|\bbingo|\bescape room|\bnaptime|\bcookbook club\b(?!.*book club)|\bpuzzle|\bchess|\bknit|\bcrochet|\bjigsaw|\bconversation (club|circle|group|practice|cafe)|\besl conversation|\benglish conversation|\blanguage (exchange|practice)|\bgenealogy|\bcomputer|\btech help|\bmeditation|\byoga/i;
const YOUTH_TITLE_RE =
  /\b(kids?|kiddos?|children'?s?|child|teens?|tweens?|tweeners?|family|families|junior|jr\.?|youth|youngsters|grades?\b|grade[sr]? \d|\d(st|nd|rd|th)\s*(-|–|to|&)\s*\d|homeschool(ers)?|preschool|pre-?k|parent|parents|mother[- ]daughter|mom (and|&) me|dad (and|&) me|father|baby|babies|toddlers?|elementary|middle[- ]school(ers)?|high[- ]school(ers)?|k-\d|ages? \d|young readers|early readers|beginning readers|beginner readers|chapter book|picture book|lego|pokemon|minecraft|graphic novel club for (kids|teens)|ya book club for teens|students?)\b/i;
const ADULT_AUD_RE = /\b(adults?|seniors?|older adults?|grown[- ]?ups?|18\s*\+|18 and (up|over)|21\s*\+|55\s*\+|50\s*\+|60\s*\+|65\s*\+|retirees?|everyone|all ages|general( audience| public)?|seniors and)\b/i;
const YOUTH_AUD_RE = /\b(kids?|children|child|teens?|tweens?|famil(y|ies)|babies|baby|toddlers?|preschool(ers)?|youth|grade|school[- ]age|young adults?|ages \d|birth|elementary|middle school|high school|caregivers?|parents?|students?|juvenile)\b/i;
const AUDIENCE_HINT_RE = /\b(adults?|seniors?|kids?|children|teens?|tweens?|famil|bab|toddler|preschool|youth|grade|young adults?|all ages|everyone|ages|years|older adults|caregivers?|students?|18|21|55|50|60|65)\b/i;

function isAdultOk(item) {
  const auds = item.categories.filter((c) => AUDIENCE_HINT_RE.test(c) && (ADULT_AUD_RE.test(c) || YOUTH_AUD_RE.test(c)));
  const adult = auds.some((c) => ADULT_AUD_RE.test(c) && !/young adult/i.test(c));
  const youth = auds.some((c) => YOUTH_AUD_RE.test(c) && !ADULT_AUD_RE.test(c.replace(/young adults?/i, '')));
  if (youth && !adult) return false;
  return true;
}

function isClub(item) {
  const t = item.title;
  if (YOUTH_TITLE_RE.test(t)) return false;
  if (NOT_CLUB_RE.test(t) && !/\bbook club\b|\bbook discussion\b/i.test(t.replace(NOT_CLUB_RE, ''))) return false;
  if (/\bauthor\b/i.test(t) && !/book club|book discussion/i.test(t)) return false;
  if (CLUB_RE.test(t)) return true;
  // Library tagged it as a book club / book discussion event type, and the title is not obviously something else.
  const typed = item.categories.some((c) => /^(book (clubs?|discussions?|groups?)|book clubs? (and|&) discussions?|reading groups?|book discussion groups?|clubs? de lectura)$/i.test(c.trim()));
  return typed;
}

const SPLIT_RE = /\s*(?::|\s[-–—|]\s|\s~\s)\s*/;
function clubName(title) {
  let t = title.replace(/\s+/g, ' ').trim();
  t = t.replace(/^\s*(cancel+ed|postponed|rescheduled|new date|new|updated?)\s*[:!-]\s*/i, '');
  t = t.replace(/\s*[([](virtual|online|in[- ]person|hybrid|zoom|via zoom|cancel+ed|postponed|rescheduled|registration required|drop[- ]in|offsite|off-site|adults?( only)?|18\+|ages 18\+)[)\]]\s*/gi, ' ').trim();
  const parts = t.split(SPLIT_RE).filter(Boolean);
  let name = t;
  if (parts.length > 1) {
    const hit = parts.find((p) => CLUB_RE.test(p));
    if (hit && CLUB_RE.test(parts[0])) name = parts[0];
    else if (hit) name = parts.slice(0, parts.indexOf(hit) + 1).join(': ');
    else name = parts[0];
  }
  // drop "with Jane Doe" / "led by ..." style person credits (never store staff names)
  const credit = name.match(/^(.*?)\s+(?:with|hosted by|led by|facilitated by|presented by)\s+(?!the\b|your\b|friends\b|a\b|an\b)(.+)$/i);
  if (credit && CLUB_RE.test(credit[1])) name = credit[1];
  name = name.replace(/\s*[-–—:,|]\s*$/, '').replace(/^["“”']+|["“”']+$/g, '').trim();
  return name;
}
const normKey = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- genres / format / cadence / vibe
const GENRES = [
  ['romance', /\bromance|\bromantasy|\blove stor(y|ies)\b|\brom-?coms?\b/i],
  ['fantasy', /\bfantasy\b|\bromantasy|\bsci-?fi\s*(\/|&|and)\s*fantasy/i],
  ['sci-fi', /\bsci-?fi\b|\bscience fiction|\bspeculative fiction|\bsf\s*(&|and|\/)\s*f\b/i],
  ['mystery-thriller', /\bmyster(y|ies)\b|\bthrillers?\b|\bcrime fiction|\bwhodunn?its?\b|\bsuspense\b|\bnoir\b|\bcozy myster/i],
  ['horror', /\bhorror\b/i],
  ['literary', /\bliterary fiction\b|\blit fic\b/i],
  ['classics', /\bclassics?\b(?! rock| film| movie)|\bgreat books\b/i],
  ['historical-fiction', /\bhistorical fiction\b|\bhist[- ]fic\b/i],
  ['nonfiction', /\bnon-?fiction\b|\btrue crime\b|\bbiograph(y|ies)\b|\bhistory (book|readers|club)/i],
  ['memoir', /\bmemoirs?\b/i],
  ['ya', /\bya\b(?! ?ya)|\bya fiction\b|\byoung adult (fiction|books|novels|lit)/i],
  ['lgbtq', /\blgbt|\bqueer\b|\bpride\b|\brainbow (book|reads|readers)/i],
  ['poetry', /\bpoetry\b|\bpoems?\b/i],
  ['graphic-novels', /\bgraphic novels?\b|\bcomics?\b|\bmanga\b/i],
  ['silent-reading', /\bsilent (book|reading)\b|\bread silently\b/i],
  ['spanish-language', /\bclub de (lectura|libros?|lectores)\b|\bc[ií]rculo de lectura\b|\ben espa[nñ]ol\b|\bspanish[- ]language\b|\bspanish book club\b|\bbilingual book club\b/i],
];
function genresFor(name, desc, cats) {
  const out = new Set();
  const nameAndCats = name + ' | ' + cats.join(' | ');
  for (const [g, re] of GENRES) if (re.test(nameAndCats)) out.add(g);
  // From the description, only when the genre is stated as the club's focus.
  for (const [g, re] of GENRES) {
    const src = re.source;
    const focus = new RegExp(`(?:${src})[\\w\\s,&'-]{0,25}?\\b(book club|book group|book discussion|club|readers|reading group|lovers|fans)\\b|\\b(club|group|discussion)s? (devoted to|focused on|featuring|for fans of|that reads|reading|exploring|about)\\b[\\w\\s,&'-]{0,25}?(?:${src})`, 'i');
    if (focus.test(desc)) out.add(g);
  }
  if (cats.some((c) => /^(spanish|espa[nñ]ol)$/i.test(c))) out.add('spanish-language');
  if (out.has('ya') && !/\bya\b|young adult/i.test(name) && !/\b(adults?|grown[- ]?ups?) (who )?(read|love|enjoy)\b.{0,30}\b(ya|young adult)\b/i.test(desc)) out.delete('ya');
  return [...out];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
function cadenceFromDates(dates) {
  const ds = [...new Set(dates)].sort().map((d) => new Date(d.slice(0, 10) + 'T12:00:00Z'));
  if (ds.length < 2) return null;
  const gaps = ds.slice(1).map((d, i) => Math.round((d - ds[i]) / 864e5)).sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  const wds = new Set(ds.map((d) => d.getUTCDay()));
  const oneDay = wds.size === 1 ? DAYS[[...wds][0]] : null;
  if (med >= 6 && med <= 8 && gaps.every((g) => g <= 15)) return oneDay ? `Weekly, ${oneDay}s` : 'Weekly';
  if (med >= 13 && med <= 15 && gaps.every((g) => g <= 22)) return oneDay ? `Every other week, ${oneDay}s` : 'Every other week';
  if (med >= 21 && med <= 42) {
    if (oneDay) {
      const nths = new Set(ds.map((d) => Math.ceil(d.getUTCDate() / 7)));
      const isLast = ds.every((d) => d.getUTCDate() + 7 > new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate());
      if (nths.size === 1) return `Monthly, ${ORD[[...nths][0] - 1]} ${oneDay}`;
      if (isLast) return `Monthly, last ${oneDay}`;
    }
    return 'Monthly';
  }
  if (med >= 50 && med <= 70) return 'Every other month';
  return null;
}
const WD = '(sun|mon|tues|wednes|thurs|fri|satur)day';
function cadenceFromText(desc) {
  const d = desc || '';
  let m = d.match(new RegExp(`\\b(first|second|third|fourth|last|1st|2nd|3rd|4th)\\s+${WD}s?\\s+(of\\s+)?(each|every|the|a)\\s+month`, 'i'));
  if (m) {
    const o = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', last: 'last' }[m[1].toLowerCase()] || m[1].toLowerCase();
    const day = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() + 'day';
    return `Monthly, ${o} ${day}`;
  }
  m = d.match(new RegExp(`\\b(every|each)\\s+${WD}\\b`, 'i'));
  if (m && !/\bmonth/i.test(d.slice(m.index, m.index + 40))) return `Weekly, ${m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()}days`;
  if (/\b(meets|meeting|gathers|held)\b[^.]{0,40}\bmonthly\b|\bmonthly (book|reading|meeting|discussion|club|gathering)|\bonce a month\b|\b(each|every) month\b/i.test(d)) return 'Monthly';
  if (/\b(meets|meeting|gathers)\b[^.]{0,30}\bweekly\b|\bweekly (book|reading|meeting|discussion|club)|\bonce a week\b|\bevery week\b/i.test(d)) return 'Weekly';
  return null;
}

function formatFor(group) {
  const anyVirtual = group.occ.some((o) => o.virtual);
  const anyPhysical = group.occ.some((o) => !o.virtual && o.location);
  const text = group.occ.map((o) => o.description).join(' ');
  const hybridText = /\bhybrid\b|\b(in[- ]person|at the library|at the branch) (or|and|&) (online|virtually|via zoom|on zoom)\b|\b(online|virtually|via zoom|on zoom) (or|and|&) in[- ]person\b|\bjoin (us )?(in[- ]person )?or (via|on) zoom\b/i.test(text);
  if ((anyVirtual && anyPhysical) || (anyPhysical && hybridText)) return 'hybrid';
  if (anyVirtual) return 'online';
  if (anyPhysical) return 'in-person';
  return null;
}

function vibeFor(group, format, cadence) {
  const text = group.occ.map((o) => o.description).join(' ');
  const bits = [];
  if (format === 'online') bits.push('Online library book club');
  else if (format === 'hybrid') bits.push('Library book club, in person and online');
  else if (/\b(brewery|brewing|taproom|pub\b|bar\b|winery|cafe|café|coffee shop|restaurant)\b/i.test(group.occ[0].title + ' ' + (group.occ[0].location?.name || ''))) bits.push('Library-run club meeting off-site');
  else bits.push('Library branch book club');
  if (/\bnew (members|readers|faces|participants)\b[^.]{0,20}\b(welcome|encouraged)|\ball are welcome\b|\beveryone is welcome\b|\bnewcomers\b/i.test(text)) bits.push('new members welcome');
  if (/\b(no|not) (registration|need to register|necessary to register)|\bdrop[- ]in\b|\bno sign[- ]?up\b/i.test(text)) bits.push('drop-in');
  else if (group.occ.some((o) => o.regRequired)) bits.push('registration required');
  else if (/\bcopies (are |will be )?(available|provided)|\bbook(s)? (are |is )?available (for checkout|at the)|\bpick up (a|your) copy/i.test(text)) bits.push('copies available at the library');
  let v = bits[0];
  for (const b of bits.slice(1)) if ((v + '; ' + b).length <= 80) v += '; ' + b;
  return v;
}

// ---------------------------------------------------------------- main
async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_JSON), { recursive: true });

  const robots = await politeFetch(`${GATEWAY}/robots.txt`);
  const robotsTxt = robots.status === 200 && !robots.body.trim().startsWith('{') ? robots.body : '';
  const log = {
    run_date: TODAY, window: [TODAY, END], queries: QUERIES,
    gateway_robots: { status: robots.status, has_rules: !!robotsTxt },
    libraries: {},
  };

  const ids = [...new Set(ONLY.length ? ONLY : LIBRARIES)];
  const records = [];
  for (const id of ids) {
    const rssPath = `/v2/libraries/${encodeURIComponent(id)}/rss/events`;
    if (robotsTxt && !robotsAllows(robotsTxt, rssPath)) {
      log.libraries[id] = { status: 'skipped', reason: 'robots.txt disallows RSS path' };
      continue;
    }
    const byLink = new Map();
    let channelTitle = '', firstStatus = null, firstError = null, pages = 0;
    for (const q of QUERIES) {
      for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
        const url = `${GATEWAY}${rssPath}?q=${encodeURIComponent(q)}&startDate=${TODAY}&endDate=${END}&page=${page}`;
        const res = await politeFetch(url);
        if (firstStatus === null) firstStatus = res.status;
        if (res.status !== 200) {
          if (page === 1 && q === QUERIES[0]) {
            try { firstError = JSON.parse(res.body).error?.message; } catch { firstError = res.body.slice(0, 120); }
          }
          break;
        }
        pages++;
        const parsed = parseRss(res.body);
        channelTitle ||= parsed.channelTitle;
        let fresh = 0;
        for (const it of parsed.items) if (it.link && !byLink.has(it.link)) { byLink.set(it.link, it); fresh++; }
        if (parsed.items.length < 25 || fresh === 0) break;
      }
      if (firstStatus !== 200) break;
    }
    if (firstStatus !== 200) {
      log.libraries[id] = { status: 'skipped', http: firstStatus, reason: firstError };
      console.log(`- ${id}: skipped (${firstStatus} ${firstError})`);
      continue;
    }
    const libraryName = channelTitle.replace(/^Events\s*\|\s*/i, '').trim() || id;
    const items = [...byLink.values()];
    // Library home city/state = most common branch location.
    const cityCount = new Map();
    for (const it of items) if (it.location?.city && it.location?.state) {
      const k = `${it.location.city}|${it.location.state}|${it.location.country || ''}`;
      cityCount.set(k, (cityCount.get(k) || 0) + 1);
    }
    const homeKey = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const [homeCity, homeState, homeCountry] = homeKey ? homeKey.split('|') : [null, null, null];
    const isUS = (c) => !c || c === 'US' || c === 'USA';
    if (homeKey && !isUS(homeCountry)) {
      log.libraries[id] = { status: 'skipped', reason: `not US (${homeCountry})`, library: libraryName };
      console.log(`- ${id}: skipped, not US (${libraryName})`);
      continue;
    }
    if (!homeKey) {
      log.libraries[id] = { status: items.length ? 'skipped' : 'empty', reason: items.length ? 'no location data to place clubs' : 'no matching events in window', library: libraryName, events_seen: items.length };
      console.log(`- ${id}: ${items.length ? 'no location data' : 'no matching events'} (${libraryName})`);
      continue;
    }

    const groups = new Map();
    let kept = 0;
    for (const it of items) {
      if (!it.title || !it.start) continue;
      if (it.start.slice(0, 10) < TODAY) continue;
      if (!isClub(it) || !isAdultOk(it)) continue;
      if (it.location && !isUS(it.location.country)) continue;
      const name = clubName(it.title);
      if (!name || name.length < 3) continue;
      const locKey = it.location?.id ? `loc:${it.location.id}` : it.virtual ? 'virtual' : 'none';
      const key = `${id}|${normKey(name)}|${locKey}`;
      if (!groups.has(key)) groups.set(key, { name, names: new Map(), occ: [] });
      const g = groups.get(key);
      g.names.set(name, (g.names.get(name) || 0) + 1);
      g.occ.push(it);
      kept++;
    }

    let count = 0;
    for (const g of groups.values()) {
      const live = g.occ.filter((o) => !o.cancelled);
      if (!live.length) continue;
      live.sort((a, b) => a.start.localeCompare(b.start));
      const name = [...g.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
      const loc = live.find((o) => o.location)?.location || null;
      const descs = live.map((o) => o.description).join(' ');
      const cadence = cadenceFromDates(live.map((o) => o.start)) || cadenceFromText(descs);
      const format = formatFor({ occ: live });
      const city = loc?.city || homeCity;
      const state = (loc?.state || homeState || '').toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) continue;
      records.push({
        name,
        city,
        state,
        neighborhood: null,
        venue: loc?.name || (format === 'online' ? 'Online' : null),
        genres: genresFor(name, descs, [...new Set(live.flatMap((o) => o.categories))]),
        vibe: vibeFor({ occ: live }, format, cadence),
        cadence,
        format,
        source: 'library-bibliocommons',
        library: libraryName,
        source_url: live[0].link,
        last_seen: TODAY,
      });
      count++;
    }
    log.libraries[id] = { status: 'ok', library: libraryName, home: `${homeCity}, ${homeState}`, rss_pages: pages, events_seen: items.length, club_occurrences: kept, clubs: count };
    console.log(`+ ${id}: ${libraryName} — ${items.length} events, ${count} clubs`);
  }

  records.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.library.localeCompare(b.library) || a.name.localeCompare(b.name));
  await writeFile(OUT_JSON, JSON.stringify(records, null, 2) + '\n');
  log.total_records = records.length;
  log.network_requests_this_run = networkRequests;
  await writeFile(OUT_LOG, JSON.stringify(log, null, 2));
  console.log(`\n${records.length} clubs written to ${path.relative(ROOT, OUT_JSON)} (${networkRequests} network requests this run)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
