// "The Events Calendar" (WordPress, tribe) adapter: public REST endpoint /wp-json/tribe/events/v1/events.
import { getJSON } from './http.mjs';
import { TODAY, HORIZON_DAYS, collapse, decodeEntities, stateCode } from '../library-other/common.mjs';

const AGE_RE = /adult|senior|teen|tween|kid|child|youth|family|families|grade|ages?\b|baby|toddler|preschool|all ages/i;

export async function scrape(lib) {
  const end = new Date(Date.parse(TODAY) + HORIZON_DAYS * 864e5).toISOString().slice(0, 10);
  const base = `https://${lib.host}${lib.apiPath ?? '/wp-json/tribe/events/v1/events'}`;
  const seen = new Map();
  for (const search of lib.searches ?? ['book', 'read']) {
    for (let page = 1; page <= 20; page++) {
      let j;
      try { j = await getJSON(`${base}?search=${encodeURIComponent(search)}&per_page=50&page=${page}&start_date=${TODAY}&end_date=${end}`); }
      catch (e) { if (page === 1) console.warn(`  ${lib.host} ${search}: ${e.message}`); break; }
      for (const e of j.events ?? []) seen.set(`${e.id}|${e.start_date}`, e);
      if (page >= (j.total_pages ?? 1)) break;
    }
  }
  const occs = [];
  for (const e of seen.values()) {
    const cats = [...(e.categories ?? []), ...(e.tags ?? [])].map((c) => decodeEntities(c.name));
    const v = Array.isArray(e.venue) ? null : e.venue;
    const venueName = v?.venue ? decodeEntities(v.venue) : null;
    const online = !!e.is_virtual || /virtual|online|zoom/i.test(venueName ?? '');
    occs.push({
      title: decodeEntities(e.title), branch: venueName ?? (online ? 'Online' : null), start: e.start_date,
      desc: `${e.excerpt ?? ''} ${e.description ?? ''}`, tags: cats.filter((c) => !AGE_RE.test(c)), ages: cats.filter((c) => AGE_RE.test(c)),
      url: e.url, online, inperson: !online || !!v?.address,
      city: v?.city ? decodeEntities(v.city) : null, state: stateCode(v?.stateprovince ?? v?.state) ?? null,
    });
  }
  const clubs = collapse(occs, lib);
  for (const c of clubs) {
    if (lib.venueStrip && c.venue) c.venue = c.venue.replace(lib.venueStrip, '').trim();
    if (!c.city) c.city = lib.city;
  }
  return clubs;
}
