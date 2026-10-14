// Custom adapters for individual library sites.
import { getText } from './http.mjs';
import { collapse, decodeEntities, TODAY, HORIZON_DAYS } from './common.mjs';

// Los Angeles Public Library (Drupal): /events/search?category=<Book Clubs>&audience=<Adults|Seniors>
async function lapl(lib) {
  const occs = [];
  const horizon = new Date(Date.parse(TODAY) + HORIZON_DAYS * 864e5).toISOString().slice(0, 10);
  for (const aud of ['1554', '1558']) {
    for (let page = 0; page < 10; page++) {
      const html = await getText(`https://${lib.host}/events/search?category=3038&audience=${aud}&items_per_page=96${page ? `&page=${page}` : ''}`);
      const arts = html.split('<article').slice(1);
      let past = false;
      for (const a of arts) {
        const href = a.match(/data-href=\/?([^\s>]+)/)?.[1];
        const title = a.match(/e-link__text">([^<]+)/)?.[1];
        const text = a.match(/c-teaser-standard__text">([\s\S]*?)<\/div>/)?.[1] ?? '';
        const date = a.match(/c-teaser-standard__date">[\s\S]*?<\/span>\s*([\d/]+)/)?.[1];
        const loc = a.match(/c-teaser-standard__location">[\s\S]*?<a[^>]*>([^<]+)</)?.[1]?.trim();
        if (!title || !date) continue;
        const [m, d, y] = date.split('/');
        const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (iso > horizon) { past = true; continue; }
        const online = /virtual|online|zoom/i.test(`${title} ${loc ?? ''}`);
        occs.push({ title: decodeEntities(title), branch: loc ? (/central/i.test(loc) ? 'Central Library' : `${loc} Branch Library`) : (online ? 'Online' : null),
          neighborhood: loc && !/central|virtual|online/i.test(loc) ? loc : null, start: iso, desc: text, tags: ['Book Clubs'], ages: ['Adults'],
          url: `https://${lib.host}/${href.replace(/^\//, '')}`, online, inperson: !online, city: 'Los Angeles', state: 'CA' });
      }
      if (past || arts.length < 96) break;
    }
  }
  return collapse(occs, lib);
}

const SITES = { lapl };
export async function scrape(lib) {
  const fn = SITES[lib.site];
  if (!fn) throw new Error(`no custom adapter for ${lib.site}`);
  return fn(lib);
}
