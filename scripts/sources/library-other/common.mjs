// Shared normalisation: filter book-club occurrences, collapse to clubs, derive cadence/genres/vibe.

export const TODAY = new Date().toISOString().slice(0, 10);
export const HORIZON_DAYS = 90;

export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;|&ndash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&hellip;/g, '...').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
export function stripHtml(s) {
  return decodeEntities(String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ---- classification ----
const CLUB_RE = new RegExp([
  String.raw`book\s*(club|discussion|group|chat|circle|talk(s)?\s+(club|group)|lovers|bunch|nook|worms?|buzz|banter|brunch|babes|break|social|society|exchange\s+club)`,
  String.raw`bookclub`, String.raw`\breaders?\b(?!\s*(advisory|theat))`, String.raw`\breading\s+(group|circle|club|society|social)`,
  String.raw`lit(erary)?\s+(club|circle|society|group|salon|chat|discussion)`, String.raw`\blit\s+wits`, String.raw`novel\s+(club|group|ideas|discussion)`,
  String.raw`(fiction|nonfiction|non-fiction|mystery|mysteries|romance|classics?|poetry|sci-?fi|fantasy|history|memoir|cookbook|graphic novel)s?\s+(club|discussion|group|circle)`,
  String.raw`club\s+de\s+lectura`, String.raw`tertulia`, String.raw`silent\s+book`, String.raw`books?\s*(&|and|n'?)\s*(brews?|beers?|bites|coffee|cocktails|wine|tea|pints|donuts|dessert|lunch)`,
  String.raw`(brews?|beers?|bites|coffee|cocktails|wine|tea|pints|donuts|lunch)\s*(&|and|n'?)\s*books?`, String.raw`great\s+books`, String.raw`page\s*turners`,
  String.raw`bookworms`, String.raw`between\s+the\s+(covers|lines)`, String.raw`well[- ]read`,
].join('|'), 'i');
const TAG_CLUB_RE = /book\s*(club|discussion|group)s?|reading\s+group|literature|club de lectura/i;
const NOT_CLUB_RE = /\b(author\s+(talk|visit|event|reading|signing)|book\s*(sale|signing|launch|drive|swap|bundle|bag|fair|bike|mobile|cart|making|binding|arts?)|meet\s+the\s+author|in\s+conversation|storytime|story\s*time|bookmark|book\s+folding|tutor|read(ing)?\s+to\s+(a\s+)?(dog|pet)|paws\s+to\s+read|reading\s+buddies|readers\s+theat|summer\s+reading|winter\s+reading|reading\s+challenge|1000\s+books|1,000\s+books|read[- ]?a[- ]?thon|book\s+club\s+kits?|book\s+club\s+in\s+a\s+bag|bag\s+club|poetry\s+reading|open\s+mic|writers?\s+(group|workshop|circle)|writing\s+(group|circle|workshop)|critique|esl|english\s+conversation|conversation\s+(club|group|circle)|chess|scrabble|knit|craft|crochet|lego|film|movie|cinema|board\s+game|trivia|resume|tax|blood\s+drive|book\s+bingo|bingo|recommendations?\s+(from|by)|ask\s+a\s+librarian|staff\s+picks|readers'?\s+advisory|book\s+review\s+club)\b/i;
const KID_RE = /\b(teens?|tweens?|kids?|children|child|family|families|youth|junior|juniors|jr\.?|grades?\s*\d|\d(st|nd|rd|th)?\s*[-–]\s*\d+(th)?\s+grade|middle\s+(grade|school)|high\s+school|elementary|homeschool(ers)?|parent|mother[- ]daughter|father[- ]son|ages?\s*\d|preschool|toddler|baby|babies|little|stories?\s+for|teen-?ager|student|youngsters|pre-?k|k-\d|picture\s+book|chapter\s+book|early\s+reader|beginning\s+reader|young\s+readers?|emerging\s+readers?|reluctant\s+readers?|tbc|cybils|newbery|bookworms?\s+jr)\b/i;
const ADULT_AGE_RE = /adult|senior|older|18\+|21\+|all\s*ages|general|everyone|55\+|50\+|grown/i;
const YOUTH_AGE_RE = /teen|tween|kid|child|family|families|youth|baby|babies|toddler|preschool|school[- ]age|grade|infant|young\s+adult|elementary|middle|high\s+school|juvenile|youngster|students?|0-|birth/i;

export function titleIsClub(t) { return CLUB_RE.test(t ?? '') || (/discussion\s+group/i.test(t ?? '') && /\bbooks?\b|novel|read/i.test(t ?? '')); }
export function isBookClub({ title, tags = [], desc = '' }) {
  const t = title ?? '';
  if (/discussion\s+group/i.test(t) && /\b(book|novel|read(ing)?|author|titles?)\b/i.test((desc ?? '').slice(0, 400)) && !NOT_CLUB_RE.test(t)) return true;
  if (NOT_CLUB_RE.test(t) && !/book\s*club|book\s*discussion/i.test(t)) return false;
  if (/book\s*club\s+(kit|in\s+a\s+bag|bag)/i.test(t)) return false;
  if (/(virtual\s+)?author\s+(talk|visit)/i.test(t)) return false;
  if (CLUB_RE.test(t)) return true;
  const tagStr = tags.join(' | ');
  if (TAG_CLUB_RE.test(tagStr) && !/author|book\s*sale|storytime|signing/i.test(tagStr + ' ' + t)) return true;
  // description-only signal: explicit "book club"/"book discussion" self-description, early in the text
  const d = (desc ?? '').slice(0, 300);
  if (/\b(our|this|the|a|monthly|join\s+(the|our|us\s+for)?)\s*(monthly\s+)?(adult\s+)?(book\s*(club|discussion\s+group|group)|reading\s+group)\b/i.test(d) && !/author\s+(talk|visit)|signing/i.test(d + t)) return true;
  return false;
}

export function isAdult({ title, ages = [], desc = '' }) {
  const t = title ?? '';
  if (KID_RE.test(t) && !/\b(adults?|grown[- ]?ups?)\b/i.test(t)) return false;
  if (/\b(ya|young\s+adult)\b/i.test(t) && /\bteens?\b/i.test(ages.join(' ') + ' ' + t) && !/adult(s)?\s+(who|reading)|for\s+adults/i.test(t + desc)) {
    if (!ages.some((a) => /^adults?$/i.test(a.trim()))) return false;
  }
  const a = ages.map((x) => String(x).trim()).filter(Boolean);
  if (a.length) {
    const adult = a.some((x) => ADULT_AGE_RE.test(x));
    if (!adult) return false;
    // listed for adults AND kids/teens -> intergenerational/family program; keep only if title says adult
    const youth = a.some((x) => YOUTH_AGE_RE.test(x) && !/all\s*ages/i.test(x));
    const allAges = a.some((x) => /all\s*ages/i.test(x));
    if (youth && !/adult|grown/i.test(t)) {
      const nonAdult = a.filter((x) => !ADULT_AGE_RE.test(x)).length;
      if (nonAdult >= a.length - 1 && !allAges) return false; // mostly youth audience
      if (/teen|tween/i.test(a.join(' ')) && a.length <= 2 && !allAges) return false;
    }
  }
  if (/\b(teens?|tweens?|kids|children|families)\b/i.test((desc ?? '').slice(0, 160)) && !/adult/i.test((desc ?? '').slice(0, 400))) return false;
  return true;
}

// ---- name normalisation ----
const ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function cleanName(title, branch) {
  let n = decodeEntities(title).replace(/\s+/g, ' ').trim();
  n = n.replace(/\s*[-–—:|]\s*(postponed|cancel+ed|rescheduled|new\s+date|full|waitlist).*$/i, '').replace(/^(cancel+ed|postponed)\s*[-:]\s*/i, '');
  n = n.replace(/\s*\((virtual|online|in[- ]person|hybrid|zoom|adults?|for adults|ages? 18\+|18\+|21\+)\)\s*/gi, ' ');
  n = n.replace(/\s*[-–—:|]\s*(january|february|march|april|may|june|july|august|september|october|november|december)(\s+\d{1,2})?(,?\s*\d{4})?\s*(selection|book|pick|meeting|edition)?\s*$/i, '');
  n = n.replace(/\s*[-–—]\s*["“].*$/, ''); // " - "This Month's Title""
  n = n.replace(/\s*:\s*["“][^"”]+["”].*$/, '');
  if (branch) {
    const b0 = branch.replace(/\s+(branch|library|regional|community|public)\b.*$/i, '').trim();
    if (b0.length > 2) {
      const esc0 = b0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mm = n.match(new RegExp(`^(.+?)\\s+(?:at|@)\\s+(?:the\\s+)?${esc0}(?:\\s+(?:branch|library|regional|community|public)[\\w ]*?)?\\s*[-–—:|]\\s*(.+)$`, 'i'));
      if (mm) n = /club|book|read|lit|group|circle/i.test(mm[2]) ? mm[2] : `${mm[2]} (${mm[1]})`;
    }
    const b = branch.replace(/\s+(branch|library|regional|community|public)\b.*$/i, '').trim();
    if (b.length > 2) {
      const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      n = n.replace(new RegExp(`\\s*(@|at|\\-|–|—|:|\\|)\\s*(the\\s+)?${esc}(\\s+(branch|library|regional|community|public)[\\w ]*)?\\s*$`, 'i'), '');
      n = n.replace(new RegExp(`^${esc}(\\s+(branch|library))?\\s*(:|-|–|—)\\s*`, 'i'), '');
    }
  }
  n = n.replace(/\s*[-–—:|,]\s*$/, '').replace(/\s+/g, ' ').trim();
  return n || decodeEntities(title).trim();
}

export function nameKey(s) {
  return s.toLowerCase().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
}

// ---- cadence ----
function ymd(d) { return d.toISOString().slice(0, 10); }
export function parseLocalDate(s) {
  // returns a Date at UTC midnight of the local calendar day (avoid TZ drift), or null
  const m = String(s ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
function nthOfMonth(d) { return Math.floor((d.getUTCDate() - 1) / 7) + 1; }
function isLast(d) { const n = new Date(d); n.setUTCDate(n.getUTCDate() + 7); return n.getUTCMonth() !== d.getUTCMonth(); }

const TEXT_ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, last: 'last' };

export function cadenceFromText(text) {
  const t = (text ?? '').toLowerCase();
  let m = t.match(/\b(first|second|third|fourth|last|1st|2nd|3rd|4th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b(\s+(of\s+)?(each|every|the|a)\s+month|\s+monthly|\s+of\s+the\s+month|\s+each\s+month)?/);
  if (m && (m[3] || /month/.test(t.slice(m.index, m.index + 60)))) {
    const o = TEXT_ORD[m[1]];
    return `Monthly, ${o === 'last' ? 'last' : ORD[o]} ${m[2][0].toUpperCase()}${m[2].slice(1)}`;
  }
  m = t.match(/\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) return `Weekly, ${m[1][0].toUpperCase()}${m[1].slice(1)}`;
  if (/\bmeets?\s+monthly|\bmonthly\s+(book|meeting|discussion|club|gathering)/.test(t)) return 'Monthly';
  if (/\bmeets?\s+weekly|\bweekly\s+(book|meeting|discussion)/.test(t)) return 'Weekly';
  if (/\b(bi-?monthly|every\s+other\s+month)\b/.test(t)) return 'Every other month';
  if (/\bquarterly\b/.test(t)) return 'Quarterly';
  return null;
}

export function deriveCadence(dateStrs, text) {
  const ds = [...new Set(dateStrs.map((s) => { const d = parseLocalDate(s); return d ? ymd(d) : null; }).filter(Boolean))].sort().map((s) => new Date(s + 'T00:00:00Z'));
  if (ds.length >= 2) {
    const gaps = ds.slice(1).map((d, i) => Math.round((d - ds[i]) / 864e5));
    const wd = new Set(ds.map((d) => d.getUTCDay()));
    if (wd.size === 1) {
      const day = DAYS[ds[0].getUTCDay()];
      if (gaps.every((g) => g === 7)) return `Weekly, ${day}`;
      if (gaps.every((g) => g === 14)) return `Every other ${day}`;
      const nths = new Set(ds.map(nthOfMonth));
      const lasts = ds.every(isLast);
      const monthsDistinct = new Set(ds.map((d) => d.getUTCFullYear() * 12 + d.getUTCMonth())).size === ds.length;
      if (monthsDistinct && gaps.every((g) => g >= 28 && g <= 35)) {
        if (nths.size === 1) return `Monthly, ${ORD[[...nths][0]]} ${day}`;
        if (lasts) return `Monthly, last ${day}`;
        return `Monthly, ${day}`;
      }
      if (monthsDistinct && gaps.every((g) => g >= 56 && g <= 63) && nths.size === 1) return `Every other month, ${ORD[[...nths][0]]} ${day}`;
      if (nths.size === 2 && !monthsDistinct) {
        const [a, b] = [...nths].sort();
        return `Twice monthly, ${ORD[a]} & ${ORD[b]} ${day}`;
      }
    }
    if (gaps.every((g) => g >= 28 && g <= 35)) return 'Monthly';
  }
  const fromText = cadenceFromText(text);
  if (fromText) return fromText;
  if (ds.length === 1) {
    // single scheduled meeting in window: report the day only if the text implies a recurring monthly club
    return null;
  }
  return null;
}

// ---- genres (only if stated) ----
const GENRE_RULES = [
  ['romance', /\bromance|romantasy|romcom|rom-com|swoon/i],
  ['fantasy', /\bfantasy|romantasy|sci-?fi\s*(&|and|\/)\s*fantasy|sff\b|dragons?\b/i],
  ['sci-fi', /\bsci-?fi\b|science\s+fiction|speculative|\bsff\b/i],
  ['mystery-thriller', /myster(y|ies)|thriller|\bcrime\b|whodunit|true\s+crime|suspense|detective|sleuth|noir|clues|cozy\s+mys/i],
  ['horror', /\bhorror|spooky|scary|creepy/i],
  ['classics', /\bclassics?\b|great\s+books|shakespeare|jane\s+austen|dickens/i],
  ['historical-fiction', /historical\s+fiction|hist\.?\s+fic/i],
  ['nonfiction', /non-?\s?fiction|\bhistory\b|science\s+(book|reads?)|true\s+crime|current\s+(events|affairs)|politic/i],
  ['memoir', /\bmemoirs?\b|biograph/i],
  ['literary', /literary\s+fiction|\blit\s+fic/i],
  ['ya', /\bya\b|young\s+adult/i],
  ['lgbtq', /lgbt|queer|pride\b|rainbow\s+(book|read)/i],
  ['poetry', /\bpoetry|poems?\b/i],
  ['graphic-novels', /graphic\s+novels?|comics?\b|manga|anime/i],
  ['silent-reading', /silent\s+(book|reading)|read\s+in\s+silence/i],
  ['spanish-language', /\bespañol|\bespanol|spanish|club\s+de\s+lectura|en\s+español|tertulia|lectores/i],
];
export function genresFor(name, desc, tags = []) {
  const head = name + ' | ' + tags.filter((t) => !/book\s*(club|discussion)|adult|online|in.?person/i.test(t)).join(' | ');
  const d = (desc ?? '').slice(0, 400);
  const out = [];
  for (const [g, re] of GENRE_RULES) {
    if (re.test(head)) { out.push(g); continue; }
    // description: only when it describes the club itself, e.g. "a book club for mystery lovers"
    const m = d.match(new RegExp(`(club|group|discussion)[^.]{0,40}(${re.source})|(${re.source})[^.]{0,25}(book\\s*club|lovers|fans|readers|book\\s*discussion|group)`, 'i'));
    if (m && !['nonfiction', 'horror', 'memoir'].includes(g)) out.push(g);
  }
  if (out.includes('mystery-thriller') && /clues/i.test(name) && !/myster|crime|thrill|sleuth|whodun/i.test(head + d)) out.splice(out.indexOf('mystery-thriller'), 1);
  return [...new Set(out)];
}

// ---- vibe (factual, paraphrased features) ----
export function vibeFor(desc, { venue, format, cadence } = {}) {
  const d = (desc ?? '').toLowerCase();
  const bits = [];
  if (/silent book club|read in silence|quiet reading/.test(d)) bits.push('bring your own book, read quietly together');
  if (/(brewery|brewing|taproom|tap room|pub\b|tavern|bar\b|winery|beer)/.test(d + ' ' + (venue ?? '').toLowerCase())) bits.push('meets at a local brewery or pub');
  else if (/(coffee shop|café|cafe|coffeehouse|bakery|restaurant)/.test(d + ' ' + (venue ?? '').toLowerCase())) bits.push('meets at a local café');
  if (/(copies|books?) (are |will be )?(available|provided|on hold|can be picked up|available to (borrow|check out|pick up))|pick up (a|your) copy|copies of (this|the) month|book club kits?/.test(d)) bits.push('copies available to borrow');
  if (/new (members|participants|readers) (are )?(always )?welcome|all are welcome|everyone is welcome|drop[- ]in/.test(d)) bits.push('newcomers welcome');
  if (/registration (is )?required|please register|must register|registration required/.test(d)) bits.push('registration required');
  if (/refreshments|snacks|light bites|coffee and|tea and|cookies/.test(d)) bits.push('refreshments served');
  if (/no need to finish|didn'?t finish|whether or not you/.test(d)) bits.push("come even if you haven't finished");
  if (/(choose|pick|vote on|select) (the |our |next )?(books?|titles)|member[- ]selected/.test(d)) bits.push('members pick the books');
  if (!bits.length) return null;
  let v = bits[0][0].toUpperCase() + bits[0].slice(1);
  for (const b of bits.slice(1)) { if ((v + '; ' + b).length <= 80) v += '; ' + b; }
  return v.slice(0, 80);
}

export function formatFor({ online, inperson, venue, title, desc }) {
  const t = `${title ?? ''} ${venue ?? ''}`;
  if (/hybrid/i.test(t)) return 'hybrid';
  if (online && inperson) return 'hybrid';
  if (online || /\b(virtual|online|zoom)\b/i.test(t) || /^online$|virtual/i.test(venue ?? '')) return 'online';
  if (inperson === false) return null;
  return 'in-person';
}

// ---- collapse occurrences to clubs ----
// occ: {title, branch, branchKey?, start, desc, tags, ages, url, online, inperson, city, state, neighborhood}
export function collapse(occs, { library, platform, state }) {
  const groups = new Map();
  for (const o of occs) {
    if (!o.title) continue;
    const desc = stripHtml(o.desc);
    const title = decodeEntities(o.title).trim();
    if (/cancel+ed|postponed/i.test(title)) continue;
    const tags = (o.tags ?? []).map((x) => String(x).trim()).filter(Boolean);
    const ages = (o.ages ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (!isBookClub({ title, tags, desc })) continue;
    if (!isAdult({ title, ages, desc })) continue;
    const name = cleanName(title, o.branch);
    const key = `${nameKey(name)}||${(o.branchKey ?? o.branch ?? '').toLowerCase()}`;
    let g = groups.get(key);
    if (!g) { g = { name, occs: [] }; groups.set(key, g); }
    g.occs.push({ ...o, title, desc, tags, ages });
    if (titleIsClub(title)) g.titleMatch = true;
  }
  const out = [];
  for (const g of groups.values()) {
    if (!g.titleMatch && new Set(g.occs.map((o) => String(o.start).slice(0, 10))).size < 2 && !/book\s*club|book\s*discussion\s+group|each\s+month|every\s+month|monthly|meets\s+(on\s+)?the/i.test(g.occs.map((o) => o.desc).join(' '))) continue;
    g.occs.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const first = g.occs[0];
    const descAll = g.occs.map((o) => o.desc).find((d) => d && d.length > 20) ?? first.desc ?? '';
    const cadence = deriveCadence(g.occs.map((o) => o.start), descAll + ' ' + g.name);
    const anyOnline = g.occs.some((o) => o.online), anyIn = g.occs.some((o) => o.inperson !== false && !o.online);
    const format = formatFor({ online: anyOnline, inperson: anyIn, venue: first.branch, title: g.name, desc: descAll });
    const city = g.occs.map((o) => o.city).find(Boolean) ?? null;
    out.push({
      name: g.name,
      city,
      state: g.occs.map((o) => o.state).find(Boolean) ?? state,
      neighborhood: first.neighborhood ?? null,
      venue: first.branch ?? null,
      genres: genresFor(g.name, descAll, first.tags),
      vibe: vibeFor(descAll, { venue: first.branch, format, cadence }),
      cadence,
      format,
      source: 'library-other',
      library,
      platform,
      source_url: first.url,
      last_seen: TODAY,
    });
  }
  return out;
}
