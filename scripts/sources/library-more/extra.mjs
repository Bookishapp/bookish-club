// Adapters for platforms not covered by library-other.
import { cachedFetch } from './http.mjs';
import { collapse, decodeEntities, cadenceFromText, genresFor, isAdult } from '../library-other/common.mjs';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const AGE_RE = /adult|senior|teen|tween|youth|kid|child|family|families|baby|babies|toddler|preschool|all ages|years\)|grade|\b\d+\+/i;

// Infer the year for "Wed Oct 14" style dates (list covers the next few months from 2026-10-13).
function isoFromMonthDay(mon, day, year) {
  const m = MONTHS[mon.slice(0, 3).toLowerCase()];
  if (m == null) return null;
  const y = year ? Number(year) : (m >= 9 ? 2026 : 2027);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

// "Events Calendar" SaaS used by some library districts (pages: /search, /event?id=N).
// The public search page loads its results with POST /update {fetch_search_results:true, query, outlook:future};
// the response is JSON wrapping an HTML <li> list. robots.txt on these hosts only disallows /staff/.
async function evcal(lib) {
  const occs = [];
  for (const query of lib.searches ?? ['book club', 'book discussion', 'reading group', 'readers']) {
    const body = new URLSearchParams({ fetch_search_results: 'true', category_id: '', category_filter_groups: '', location_id: '', outlook: 'future', sort_by: '', query }).toString();
    const r = await cachedFetch(`https://${lib.host}/update`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } });
    if (r.status >= 400) throw new Error(`HTTP ${r.status} /update`);
    let j; try { j = JSON.parse(r.text); } catch { throw new Error('non-JSON /update response'); }
    const html = j?.content?.upcoming_events_list_html ?? '';
    for (const it of html.split('role="listitem"').slice(1)) {
      const id = it.match(/data-event-id="(\d+)"/)?.[1];
      const title = decodeEntities(it.match(/<h3[^>]*>\s*([^<]*)/)?.[1]?.trim() ?? '');
      const small = decodeEntities(it.match(/<small[^>]*>([^<]*)/)?.[1] ?? '');
      const toks = small.split(' / ').map((s) => s.trim()).filter(Boolean);
      const ages = toks.filter((t) => AGE_RE.test(t));
      const tags = toks.filter((t) => !AGE_RE.test(t) && !/^language:/i.test(t));
      const span = decodeEntities(it.match(/<span class="mr-2">\s*([^<]*)/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
      // single: "Queen Creek Library - Wed Oct 14 12:30 PM"; grouped: "Fountain Hills Library - Oct 14 2026 – Jan 27 2027, 4:00PM ..."
      const bm = span.match(/^(.*?)\s+-\s+(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+)?([A-Z][a-z]{2})\w*\s+(\d{1,2})(?:\s+(\d{4}))?/);
      if (!bm) continue;
      const branch = bm[1].trim();
      const dates = [];
      const sess = [...it.matchAll(/session-date-header[^>]*>\s*([A-Z][a-z]{2})\w*\s+(\d{1,2})\s+(\d{4})/g)];
      if (sess.length) for (const s of sess) dates.push(isoFromMonthDay(s[1], s[2], s[3]));
      else dates.push(isoFromMonthDay(bm[2], bm[3], bm[4]));
      const online = /virtual|online|zoom/i.test(branch);
      for (const d of dates.filter(Boolean)) {
        occs.push({ title, branch, start: d, desc: '', tags, ages, url: `https://${lib.host}/event?id=${id}`, online, inperson: !online, city: null });
      }
    }
  }
  const seen = new Set();
  const uniq = occs.filter((o) => { const k = `${o.title}|${o.branch}|${o.start}`; return seen.has(k) ? false : seen.add(k); });
  return collapse(uniq, lib);
}

// Los Angeles Public Library (Drupal): public HTML search listing /events/search?search=...&page=N.
async function lapl(lib) {
  const occs = [];
  for (const q of lib.searches ?? ['book club', 'book discussion', 'reading group']) {
    for (let page = 0; page < 45; page++) {
      const r = await cachedFetch(`https://${lib.host}/events/search?search=${encodeURIComponent(q)}${page ? `&page=${page}` : ''}`);
      if (r.status >= 400) break;
      const arts = r.text.split('<article').slice(1).filter((a) => /c-teaser-standard--event/.test(a.slice(0, 200)));
      if (!arts.length) break;
      for (const a of arts) {
        const href = a.match(/<h3[^>]*>\s*<a href="([^"]+)"/)?.[1];
        const title = decodeEntities(a.match(/e-link__text">([^<]*)/)?.[1]?.trim() ?? '');
        const desc = decodeEntities((a.match(/c-teaser-standard__text">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        const dm = a.match(/c-teaser-standard__date">[\s\S]*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const branch = decodeEntities(a.match(/c-teaser-standard__location">[\s\S]*?<a [^>]*>([^<]*)/)?.[1]?.trim() ?? '') || (/virtual|online/i.test(a) ? 'Online' : null);
        if (!title || !dm) continue;
        const start = `${dm[3]}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}`;
        const online = /^online$|virtual/i.test(branch ?? '');
        occs.push({ title, branch, start, desc, tags: [], ages: [], url: `https://${lib.host}${href}`, online, inperson: !online, city: null });
      }
      if (!new RegExp(`page=${page + 1}\\b`).test(r.text)) break;
    }
  }
  const seen = new Set();
  return collapse(occs.filter((o) => { const k = `${o.title}|${o.branch}|${o.start}`; return seen.has(k) ? false : seen.add(k); }), lib);
}

// Trumba hosted calendars: public JSON feed https://www.trumba.com/calendars/<webName>.json (robots.txt allows all).
// Staff contact custom fields are ignored; only title/description/location/address/audience/event type are read.
async function trumba(lib) {
  const occs = [];
  const strip = (h) => decodeEntities(String(h ?? '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  for (const q of lib.searches ?? ['book', 'read', 'lectura', 'literary']) {
    const r = await cachedFetch(`https://www.trumba.com/calendars/${lib.webName}.json?months=3&search=${encodeURIComponent(q)}`);
    if (r.status >= 400) throw new Error(`HTTP ${r.status} trumba ${lib.webName}`);
    let arr; try { arr = JSON.parse(r.text); } catch { throw new Error('trumba: non-JSON'); }
    for (const e of arr) {
      if (e.canceled) continue;
      const cf = Object.fromEntries((e.customFields ?? []).map((c) => [String(c.label).toLowerCase(), strip(c.value)]));
      const branch = strip(cf['branch location'] || e.location) || null;
      const addr = cf.address || '';
      const am = addr.match(/,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+\d{5}/);
      const ages = [cf.audience, cf['age group'], cf['age groups']].filter(Boolean).flatMap((x) => x.split(/,\s*/));
      const tags = [cf['event type(s)'], cf.category, cf['event type']].filter(Boolean).flatMap((x) => x.split(/,\s*/));
      const online = /virtual|online|zoom/i.test(`${branch} ${e.locationType ?? ''}`);
      occs.push({ title: decodeEntities(e.title), branch, start: e.startDateTime, desc: e.description ?? '', tags, ages,
        url: e.permaLinkUrl || e.webLink || `https://www.trumba.com/calendars/${lib.webName}`, online, inperson: !online,
        city: am ? am[1].trim() : null, state: am ? am[2] : null });
    }
  }
  const seen = new Set();
  return collapse(occs.filter((o) => { const k = `${o.title}|${o.branch}|${o.start}`; return seen.has(k) ? false : seen.add(k); }), lib);
}

// CivicPlus (CivicEngage) calendar module: public RSS feed /RSSFeed.aspx?ModID=58&CID=All-calendar.xml.
// Location is an address; venue = lib.addrMap[street] (branch name) or "<short name> (<street>)".
async function civicplus(lib) {
  const r = await cachedFetch(`https://${lib.host}/RSSFeed.aspx?ModID=58&CID=${lib.cid ?? 'All-calendar.xml'}`);
  if (r.status >= 400) throw new Error(`HTTP ${r.status} civicplus RSS`);
  const occs = [];
  for (const it of r.text.split('<item>').slice(1)) {
    const title = decodeEntities(it.match(/<title>([^<]*)/)?.[1] ?? '').trim();
    const link = decodeEntities(it.match(/<link>([^<]*)/)?.[1] ?? '').trim();
    const d = decodeEntities(it.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
    const parts = d.split(/<br\s*\/?>/i).map((x) => x.replace(/<[^>]+>/g, '').trim());
    const dates = (it.match(/EventDates>([^<]*)/)?.[1] ?? '').trim();
    const dm = dates.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
    if (!title || !dm) continue;
    if (/\s-\s/.test(dates)) continue; // multi-day spans (displays, closures), not meetings
    const start = isoFromMonthDay(dm[1], dm[2], dm[3]);
    const li = parts.findIndex((x) => /^Location:/i.test(x));
    let street = null, city = null, state = null;
    for (const x of parts.slice(li + 1, li + 4)) {
      const cm = x.match(/^([A-Za-z .'-]+),\s*([A-Z]{2})\s+\d{5}/);
      if (cm) { city = cm[1].trim(); state = cm[2]; break; }
      if (x && !/^(Description|Event)/i.test(x) && !street) street = x;
    }
    const desc = parts.slice(parts.findIndex((x) => /^Description:/i.test(x)) + 1).join(' ');
    const online = /virtual|online|zoom/i.test(`${street ?? ''} ${title}`);
    const venue = street ? (lib.addrMap?.[street.replace(/\.$/, '')] ?? `${lib.short ?? lib.name} (${street.replace(/\.$/, '')})`) : (online ? 'Online' : lib.short ?? lib.name);
    occs.push({ title, branch: venue, start, desc, tags: [], ages: [], url: link, online, inperson: !online, city, state });
  }
  return collapse(occs, lib);
}

// Localist calendars: public JSON API /api/2/events?days=90&pp=100&page=N (documented public API).
async function localist(lib) {
  const occs = [];
  for (let page = 1; page <= 40; page++) {
    const r = await cachedFetch(`https://${lib.host}/api/2/events?days=90&pp=100&page=${page}`);
    if (r.status >= 400) throw new Error(`HTTP ${r.status} localist`);
    const j = JSON.parse(r.text);
    for (const { event: e } of j.events ?? []) {
      const f = e.filters ?? {};
      const ages = (f.event_target_audience ?? []).map((x) => x.name);
      const tags = [...(f.event_types ?? []), ...(f.event_compass_sections ?? [])].map((x) => x.name);
      const online = e.experience === 'virtual';
      for (const { event_instance: ins } of e.event_instances ?? []) {
        occs.push({ title: decodeEntities(e.title), branch: e.location_name || (online ? 'Online' : null), start: ins.start,
          desc: e.description_text ?? '', tags, ages, url: e.localist_url, online, inperson: e.experience !== 'virtual',
          city: e.geo?.city || null, state: e.geo?.state || null });
      }
    }
    if (!j.page?.next_page) break;
  }
  const seen = new Set();
  return collapse(occs.filter((o) => { const k = `${o.title}|${o.branch}|${o.start}`; return seen.has(k) ? false : seen.add(k); }), lib);
}

// Austin Public Library (Drupal): the public "Book Clubs" event category listing /events/book-clubs?page=N.
async function austin(lib) {
  const occs = [];
  for (let page = 0; page < 15; page++) {
    const r = await cachedFetch(`https://${lib.host}/events/book-clubs${page ? `?page=${page}` : ''}`);
    if (r.status >= 400) break;
    const arts = r.text.split('<article').slice(1);
    if (!arts.length) break;
    for (const a of arts) {
      const href = a.match(/href="(\/event\/[^"]+)"/)?.[1];
      const title = decodeEntities(a.match(/<span>([^<]+)<\/span>/)?.[1]?.trim() ?? '');
      const dm = a.match(/event_time">\s*\w+,\s+([A-Z][a-z]+)\s+(\d{1,2})/);
      const branch = decodeEntities(a.match(/event_location"><div>([^<]*)/)?.[1]?.trim() ?? '') || null;
      const ages = [...a.matchAll(/taxonomy\/term\/\d+">([^<]*)/g)].map((m) => decodeEntities(m[1]));
      if (!title || !dm || !href) continue;
      const online = /virtual|online/i.test(branch ?? '');
      occs.push({ title, branch, start: isoFromMonthDay(dm[1], dm[2]), desc: '', tags: ['Book Clubs'], ages, url: `https://${lib.host}${href}`, online, inperson: !online, city: null });
    }
    if (!new RegExp(`page=${page + 1}\\b`).test(r.text)) break;
  }
  return collapse(occs, lib);
}

// Memphis Public Libraries: the public "Library Book Clubs" directory page lists each branch's clubs with a
// stated meeting schedule. Contact lines (staff names/phones/emails) are never read into the output.
async function memphis(lib) {
  const r = await cachedFetch(`https://${lib.host}/events/book-clubs/`);
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  const h = r.text.replace(/<script[\s\S]*?<\/script>/g, '');
  const start = h.indexOf('Library Book Clubs</h2>') > 0 ? h.indexOf('Library Book Clubs</h2>') : h.indexOf('Library Book Clubs');
  const body = h.slice(start, h.indexOf('All Book Club Events', start) > 0 ? h.indexOf('All Book Club Events', start) : undefined);
  const blocks = body.split(/<h[234][^>]*>/).slice(1).map((b) => {
    const head = decodeEntities(b.slice(0, b.search(/<\/h[234]>/)).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const rest = decodeEntities(b.slice(b.search(/<\/h[234]>/)).replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ');
    return { head, rest };
  });
  const out = []; let branch = null;
  for (const b of blocks) {
    if (/\b(library|branch)$/i.test(b.head) && !/club/i.test(b.head)) { branch = b.head.replace(/\s+Branch Library$/i, ' Branch').trim(); continue; }
    const mt = b.rest.match(/Meeting Time:\s*([^\n]*)/i)?.[1]?.trim() ?? '';
    if (!branch || !b.head || !mt) continue;
    if (!isAdult({ title: b.head, ages: [], desc: '' })) continue;
    let cadence = cadenceFromText(mt);
    if (!cadence && /monthly|each month|a month/i.test(mt)) cadence = 'Monthly';
    out.push({ name: b.head, city: null, state: lib.state, venue: branch, genres: genresFor(b.head, '', []), vibe: null, cadence,
      format: 'in-person', source_url: `https://${lib.host}/events/book-clubs/` });
  }
  return out;
}

export const ADAPTERS = { memphis: { scrape: memphis }, austin: { scrape: austin }, localist: { scrape: localist }, evcal: { scrape: evcal }, lapl: { scrape: lapl }, trumba: { scrape: trumba }, civicplus: { scrape: civicplus } };
