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

// Queens Public Library: server-rendered /calendar search (load-more endpoint /search/call is robots-disallowed,
// so we split by branch facet to keep each query under the 12-result first page).
function qplParse(t) {
  const out = [];
  for (const m of t.matchAll(/arrJsonData_cal\['([^']+)'\] = '(.*?)';/g)) {
    try { out.push(JSON.parse(m[2].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&'))); } catch { /* skip */ }
  }
  const facets = JSON.parse((t.match(/facetsInfoCal = '(.*?)';\n/)?.[1] ?? '{}').replace(/\\\//g, '/') || '{}');
  return { items: out, total: Number(t.match(/facetsTotal = '(\d+)'/)?.[1] ?? 0), facets };
}
async function qpl(lib) {
  const base = `https://${lib.host}/calendar?searchField=*&category=calendar&searchFilter=`;
  const typeF = ' sm_prgmtype:Book Discussion Group';
  const first = qplParse(await getText(base + encodeURIComponent(typeF)));
  const branches = Object.keys(first.facets.sm_pSsnBranch ?? {});
  const items = new Map(first.items.map((d) => [d.jobID, d]));
  if (first.total > first.items.length) {
    for (const b of branches) {
      const r = qplParse(await getText(base + encodeURIComponent(`${typeF} sm_pSsnBranch:${b}`)));
      for (const d of r.items) items.set(d.jobID, d);
      if (r.total > r.items.length) {
        for (const age of ['Adults', 'Seniors']) {
          const r2 = qplParse(await getText(base + encodeURIComponent(`${typeF} sm_pSsnBranch:${b} sm_prgmage:${age}`)));
          for (const d of r2.items) items.set(d.jobID, d);
        }
      }
    }
  }
  lib._coverage = `${items.size} of ${first.total} book-discussion programs retrieved`;
  const occs = [];
  for (const d of items.values()) {
    const online = /virtual/i.test(`${d.delivery_format} ${d.branch_name}`);
    const branch = online ? 'Virtual' : d.branch_name;
    for (const ts of d.set_of_timestamp ?? [d.date_show_timestamp]) {
      const iso = new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      occs.push({ title: d.title, branch, neighborhood: online ? null : d.branch_name, start: iso, desc: d.descr ?? '', tags: [d.prgm_type],
        ages: String(d.prgm_age ?? '').split(','), url: `https://${lib.host}${d.callUrl}`, online, inperson: !online, city: 'Queens', state: 'NY' });
    }
  }
  return collapse(occs, lib);
}

const SITES = { lapl, qpl };
export async function scrape(lib) {
  const fn = SITES[lib.site];
  if (!fn) throw new Error(`no custom adapter for ${lib.site}`);
  return fn(lib);
}
