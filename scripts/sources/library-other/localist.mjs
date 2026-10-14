// Localist adapter: public API /api/2/events (robots allows /api; /search is disallowed so we filter by event type id).
import { getJSON } from './http.mjs';
import { HORIZON_DAYS, collapse, stripHtml } from './common.mjs';

export async function scrape(lib) {
  const occs = [];
  for (let page = 1; page <= 20; page++) {
    const j = await getJSON(`https://${lib.host}/api/2/events?days=${HORIZON_DAYS}&pp=100&page=${page}${lib.typeIds ? lib.typeIds.map((t) => `&type[]=${t}`).join('') : ''}`);
    for (const x of j.events ?? []) {
      const e = x.event;
      const f = e.filters ?? {};
      const types = [...(f.event_types ?? []), ...(f.event_compass_sections ?? [])].map((t) => t.name);
      const ages = (f.event_target_audience ?? []).map((t) => t.name);
      const online = !!e.experience && /virtual/i.test(e.experience) && !/hybrid/i.test(e.experience);
      const loc = e.location_name || null;
      for (const ii of e.event_instances ?? []) {
        occs.push({ title: e.title, branch: online ? 'Online' : loc, neighborhood: loc && !/central|online|virtual/i.test(loc) && !e.venue_url ? loc : null,
          start: ii.event_instance.start, desc: stripHtml(e.description_text ?? e.description ?? ''), tags: types, ages,
          url: e.localist_url, online, inperson: !online, city: e.geo?.city || lib.city, state: e.geo?.state || lib.state });
      }
    }
    if (!j.page?.next_page) break;
  }
  return collapse(occs, lib);
}
