// Springshare LibCal adapter: the public JSON list endpoint the calendar page itself calls
// (/ajax/calendar/list?c=-1&date=0000-00-00 = "upcoming events"), paged until past the horizon.
import { getJSON } from './http.mjs';
import { TODAY, HORIZON_DAYS, collapse } from './common.mjs';

export async function scrape(lib) {
  const host = lib.host;
  const horizon = new Date(Date.parse(TODAY) + HORIZON_DAYS * 864e5).toISOString().slice(0, 10);
  const occs = [];
  const perpage = 100;
  const cats = lib.cats ?? '';
  for (let page = 1; page <= (lib.maxPages ?? 60); page++) {
    const url = `https://${host}/ajax/calendar/list?c=${lib.cid ?? -1}&date=0000-00-00&perpage=${perpage}&page=${page}&audience=&cats=${cats}&camps=&inc=0`;
    const j = await getJSON(url);
    const rs = j.results ?? [];
    let past = false;
    for (const e of rs) {
      const start = e.startdt ?? e.start;
      if (String(start).slice(0, 10) > horizon) { past = true; continue; }
      const cats = (e.categories_arr ?? []).map((c) => c.name);
      const ages = (e.audiences ?? []).map((a) => a.name);
      const branch = (e.campus || e.calendar || '').trim() || null;
      const online = !!e.online_event;
      const loc = (e.location ?? '').trim();
      occs.push({
        title: e.title, branch: online && !loc && !e.campus ? 'Online' : branch, start,
        desc: `${e.shortdesc ?? ''} ${e.description ?? ''}`, tags: cats, ages, url: e.url,
        online, inperson: !online || !!loc,
        city: lib.cityMap?.[branch] ?? null,
      });
    }
    if (past || rs.length < perpage || page * perpage >= (j.total_results ?? 0)) break;
  }
  const clubs = collapse(occs, lib);
  for (const c of clubs) if (!c.city) c.city = lib.cityMap?.[c.venue] ?? lib.city;
  return clubs;
}
