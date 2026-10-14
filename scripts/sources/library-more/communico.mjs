// Communico "Attend" adapter: public JSON feed the events page itself loads (/eeventcaldata).
import { getJSON, getText } from './http.mjs';
import { TODAY, HORIZON_DAYS, collapse, stateCode } from '../library-other/common.mjs';

const SEARCHES = ['book', 'read', 'lectura', 'novel'];
const locCache = new Map(); // host|location_id -> {city, state}

async function cityForEvent(host, ev) {
  const k = `${host}|${ev.location_id}`;
  if (locCache.has(k)) return locCache.get(k);
  let res = null;
  try {
    const html = await getText(`https://${host}/event/${ev.id}`);
    const m = html.match(/"addressLocality"\s*:\s*"([^"]*)"\s*,\s*"addressRegion"\s*:\s*"([^"]*)"/);
    if (m && m[1]) res = { city: m[1].replace(/\\\//g, '/').trim(), state: stateCode(m[2]) };
  } catch { /* ignore */ }
  locCache.set(k, res);
  return res;
}

export async function scrape(lib) {
  const host = lib.host;
  const seen = new Map();
  for (const search of SEARCHES) {
    const req = { private: false, date: TODAY, days: HORIZON_DAYS, locations: [], ages: [], types: [], search };
    const url = `https://${host}/eeventcaldata?event_type=0&req=${encodeURIComponent(JSON.stringify(req))}`;
    let arr;
    try { arr = await getJSON(url); } catch (e) { console.warn(`  ${host} search=${search}: ${e.message}`); continue; }
    if (!Array.isArray(arr)) continue;
    for (const e of arr) seen.set(e.id, e);
  }
  const occs = [];
  for (const e of seen.values()) {
    if (e.private_event === '1') continue;
    const branch = (e.library || e.location || '').trim() || null;
    const online = /online|virtual|zoom/i.test(`${e.location} ${e.library}`) || /ONLINE|VIRTUAL/.test(e.event_type ?? '');
    occs.push({
      _ev: e,
      title: e.title, branch, branchKey: e.location_id || branch, start: e.raw_start_time || e.event_start,
      desc: `${e.description ?? ''} ${e.long_description ?? ''}`, tags: e.tagsArray ?? (e.tags ?? '').split(','),
      ages: e.agesArray ?? (e.ages ?? '').split(','), url: e.url?.startsWith('http') ? `https://${host}/event/${e.id}` : `https://${host}/event/${e.id}`,
      online, inperson: !online || /HYBRID/.test(e.event_type ?? ''),
    });
  }
  // resolve city per branch (one event page per location id, cached) only for clubs that pass filters
  const clubs = collapse(occs, lib);
  const firstByUrl = new Map(occs.map((o) => [o.url, o]));
  for (const c of clubs) {
    const o = firstByUrl.get(c.source_url);
    if (!c.city && o && !o.online && lib.resolveCity !== false) {
      const r = await cityForEvent(host, o._ev);
      if (r) { c.city = r.city; if (r.state) c.state = r.state; }
    }
    if (!c.city) c.city = lib.cityMap?.[c.venue] ?? lib.city;
  }
  return clubs;
}
