// Springshare LibCal adapter: the public JSON list endpoint the calendar page itself calls
// (/ajax/calendar/list?c=-1&date=0000-00-00 = "upcoming events"), paged until past the horizon.
import { getJSON, getText } from './http.mjs';
import { TODAY, HORIZON_DAYS, collapse } from './common.mjs';

const CAT_RE = /book|literat|reading|readers|discussion|lectura|authors?\b/i;

async function bookCategories(lib) {
  if (lib.cats) return String(lib.cats).split(',');
  const html = await getText(`https://${lib.host}/calendar?cid=${lib.cid ?? -1}&t=d&d=0000-00-00&cal=${lib.cid ?? -1}&inc=0`);
  const out = [];
  for (const m of html.matchAll(/tempCategoryName\s*=\s*"((?:[^"\\]|\\.)*)";[\s\S]{0,250}?push\(\{\s*id:\s*(\d+)/g)) {
    const name = JSON.parse(`"${m[1]}"`);
    if (CAT_RE.test(name)) out.push(m[2]);
  }
  return [...new Set(out)];
}

export async function scrape(lib) {
  const host = lib.host;
  const horizon = new Date(Date.parse(TODAY) + HORIZON_DAYS * 864e5).toISOString().slice(0, 10);
  const occs = [];
  const cats = await bookCategories(lib);
  // with a category filter the "upcoming" list spans months; without one it only covers a few days,
  // so fall back to one request per day across the horizon.
  const queries = cats.length
    ? cats.map((c) => ({ date: '0000-00-00', cats: c }))
    : Array.from({ length: lib.dailyDays ?? HORIZON_DAYS }, (_, i) => ({ date: new Date(Date.parse(TODAY) + i * 864e5).toISOString().slice(0, 10), cats: '' }));
  lib._libcalMode = cats.length ? `categories ${cats.join(',')}` : 'daily';
  for (const q of queries) await pageThrough(lib, q, horizon, occs);
  const seen = new Set();
  const uniq = occs.filter((o) => (seen.has(o.url + o.start) ? false : seen.add(o.url + o.start)));
  const clubs = collapse(uniq, lib);
  for (const c of clubs) if (!c.city) c.city = lib.cityMap?.[c.venue] ?? lib.city;
  return clubs;
}

async function pageThrough(lib, q, horizon, occs) {
  const host = lib.host;
  const perpage = 100;
  for (let page = 1; page <= (lib.maxPages ?? 30); page++) {
    const url = `https://${host}/ajax/calendar/list?c=${lib.cid ?? -1}&date=${q.date}&perpage=${perpage}&page=${page}&audience=&cats=${q.cats}&camps=&inc=0`;
    const j = await getJSON(url);
    const rs = j.results ?? [];
    let past = false;
    for (const e of rs) {
      const start = e.startdt ?? e.start;
      if (String(start).slice(0, 10) > horizon) { past = true; continue; }
      const cats = (e.categories_arr ?? []).map((c) => c.name);
      const ages = (e.audiences ?? []).map((a) => a.name);
      let branch = (e.campus || e.calendar || '').trim() || null;
      // some systems embed the address in the campus name: "Library! at Cole & Ustick - 7557 W. Ustick Rd., Boise, ID 83704"
      let addrCity = null;
      const am = branch?.match(/,\s*([A-Za-z .'-]+),?\s+([A-Z]{2})\.?\s+\d{5}/);
      if (am) addrCity = am[1].trim();
      if (branch) branch = branch.replace(/,\s*\d+\s.*$/, '').replace(/\s*[-–(]\s*\d+\s+[^)]*\)?\s*$/, '').trim();
      const online = !!e.online_event;
      const loc = (e.location ?? '').trim();
      occs.push({
        title: e.title, branch: online && !loc && !e.campus ? 'Online' : branch, start,
        desc: `${e.shortdesc ?? ''} ${e.description ?? ''}`, tags: cats, ages, url: e.url,
        online, inperson: !online || !!loc,
        city: lib.cityMap?.[branch] ?? addrCity ?? null,
      });
    }
    if (past || rs.length < perpage || page * perpage >= (j.total_results ?? 0)) break;
  }
}
