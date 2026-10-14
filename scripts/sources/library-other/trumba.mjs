// Trumba adapter: public JSON calendar feed https://www.trumba.com/calendars/<webName>.json (documented embed feed).
import { getJSON } from './http.mjs';
import { TODAY, HORIZON_DAYS, collapse, decodeEntities, stripHtml } from './common.mjs';

export async function scrape(lib) {
  const start = TODAY.replace(/-/g, '');
  const seen = new Map();
  for (const q of lib.searches ?? ['book club', 'book group', 'book discussion', 'books', 'reading', 'club', 'lectura', 'readers']) {
    let arr;
    try { arr = await getJSON(`https://www.trumba.com/calendars/${lib.webName}.json?search=${encodeURIComponent(q)}&startdate=${start}&months=${Math.round(HORIZON_DAYS / 30)}`); }
    catch (e) { console.warn(`  trumba ${q}: ${e.message}`); continue; }
    for (const e of arr ?? []) seen.set(e.eventID, e);
  }
  const occs = [];
  for (const e of seen.values()) {
    if (e.canceled) continue;
    const loc = stripHtml(e.location ?? '');
    const online = /online|virtual|zoom/i.test(loc) || e.locationType === 'online';
    const nonLib = /non-library/i.test(loc);
    const detail = (e.customFields ?? []).find((f) => /description/i.test(f.label))?.value ?? '';
    occs.push({
      title: decodeEntities(e.title).replace(/:\s*(Seattle Reads:\s*)?["“].*$/, ''), branch: online ? 'Online' : nonLib ? null : loc,
      neighborhood: !online && !nonLib && !/central/i.test(loc) ? loc.replace(/\s+branch$/i, '') : null,
      start: e.startDateTime, desc: `${stripHtml(e.description)} ${stripHtml(detail)}`, tags: [], ages: [],
      url: e.permaLinkUrl ?? e.webLink, online, inperson: !online, city: lib.city, state: lib.state,
    });
  }
  return collapse(occs, lib);
}
