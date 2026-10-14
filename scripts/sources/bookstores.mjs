#!/usr/bin/env node
// Source: bookstores — independent bookstores (and a few public venues) that publicly
// list their recurring, store-run book clubs.
//
// Usage:
//   node scripts/sources/bookstores.mjs                 # build data/raw/bookstores.json from the store config
//   node scripts/sources/bookstores.mjs fetch <url>     # polite fetch (robots check, throttle, cache) -> prints page text
//   node scripts/sources/bookstores.mjs robots <url>    # print robots verdict for our UA + path
//
// Politeness: robots.txt honoured per host, >= 2s between requests to a host (sequential),
// User-Agent below, raw HTML cached in .cache/bookstores/<host>/<sha1>.html (TTL 7 days).
// Records: the store config (bookstores.stores.mjs) lists each store's club page and the clubs
// read from it. Build re-fetches each page (cache-first) and keeps a club only if its name
// still appears on that page, so stale entries drop out on re-run. Stores whose robots or
// terms forbid collection are listed with skip reasons and never fetched.
// Stored fields only: club name, city, state, neighborhood, venue, genres, short paraphrased
// vibe, cadence, format, source_url, last_seen. No personal names, emails or phone numbers.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ID = 'bookstores';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, '.cache', SOURCE_ID);
const OUT = join(ROOT, 'data', 'raw', `${SOURCE_ID}.json`);
const UA = 'BookishClubDirectory/0.1 (public book club listings)';
const GAP_MS = 2000;
const TTL_MS = 7 * 24 * 3600e3;
const TODAY = process.env.LAST_SEEN ?? new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

export const GENRES = new Set(['romance', 'fantasy', 'sci-fi', 'mystery-thriller', 'horror', 'literary', 'classics',
  'historical-fiction', 'nonfiction', 'memoir', 'ya', 'lgbtq', 'poetry', 'graphic-novels', 'silent-reading', 'spanish-language']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map();
async function throttle(host) {
  const wait = (lastHit.get(host) ?? 0) + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

async function rawGet(url) {
  const host = new URL(url).host;
  await throttle(host);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  return { status: res.status, text: await res.text(), url: res.url };
}

// ---- robots.txt ----
const robotsMemo = new Map();
function parseRobots(txt) {
  const groups = []; let cur = null; let lastAgent = false;
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastAgent = true; }
    else { lastAgent = false; if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v }); }
  }
  return groups;
}
function ruleMatch(rule, path) {
  if (!rule) return false;
  const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path);
}
export async function robotsAllows(url) {
  const u = new URL(url);
  if (!robotsMemo.has(u.host)) {
    let groups = [], note;
    try {
      const r = await rawGet(`${u.protocol}//${u.host}/robots.txt`);
      if (r.status >= 200 && r.status < 300) { groups = parseRobots(r.text); note = 'robots.txt fetched'; }
      else note = `robots.txt HTTP ${r.status} (treated as allow-all)`;
    } catch (e) { note = `robots.txt error ${e.message} (treated as allow-all)`; }
    robotsMemo.set(u.host, { groups, note });
  }
  const { groups, note } = robotsMemo.get(u.host);
  const ua = 'bookishclubdirectory';
  const g = groups.filter((x) => x.agents.some((a) => a !== '*' && ua.includes(a)));
  const use = g.length ? g : groups.filter((x) => x.agents.includes('*'));
  const path = u.pathname + u.search;
  let best = null;
  for (const grp of use) for (const r of grp.rules) {
    if (r.path === '' ) continue;
    if (ruleMatch(r.path, path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return { allowed: !best || best.allow, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null, note };
}

export async function politeFetch(url, { force = false } = {}) {
  const u = new URL(url);
  const file = join(CACHE, u.host, createHash('sha1').update(url).digest('hex').slice(0, 16) + '.html');
  if (!force) {
    try { const s = await stat(file); if (Date.now() - s.mtimeMs < TTL_MS) return { status: 200, html: await readFile(file, 'utf8'), cached: true }; } catch {}
  }
  const rb = await robotsAllows(url);
  if (!rb.allowed) return { status: 0, html: '', blocked: rb.rule };
  const r = await rawGet(url);
  if (r.status === 200) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, r.text); }
  return { status: r.status, html: r.text, finalUrl: r.url };
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'").replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-').replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

const BAN_RE = /.{0,250}\b(scrap(e|er|ing)|robots?\b|spider|crawler|crawl(ing)?\b|data[- ]min(er|ing)|harvest(ing)?\b|automated (means|systems?|software|collection|access|processes))\b.{0,250}/gi; // sentence-agnostic window
export async function checkTerms(home) {
  const r = await politeFetch(home);
  if (r.blocked || r.status !== 200) return { home, status: r.status, blocked: r.blocked ?? null };
  const base = r.finalUrl ?? home;
  const links = new Set();
  for (const m of r.html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = m[2].replace(/<[^>]+>/g, ' ');
    if (/terms|conditions|legal|terms-of-service|terms-of-use/i.test(m[1] + ' ' + t) && !/privacy|mailto:/i.test(m[1])) {
      try { links.add(new URL(m[1], base).href); } catch {}
    }
  }
  const found = [];
  for (const l of [...links].slice(0, 3)) {
    try {
      const t = await politeFetch(l);
      if (t.blocked) { found.push({ url: l, robotsBlocked: t.blocked }); continue; }
      const txt = htmlToText(t.html);
      const hits = [...txt.replace(/\n/g, ' ').matchAll(BAN_RE)].map((m) => m[0].trim()).filter((s) => !/robots\.txt|privacy|cookie/i.test(s));
      found.push({ url: l, status: t.status, forbids: hits.length > 0, quote: hits[0]?.slice(0, 300) ?? null });
    } catch (e) { found.push({ url: l, error: e.message }); }
  }
  return { home, termsPages: found, verdict: found.some((f) => f.forbids) ? 'FORBIDS' : found.length ? 'no clause found' : 'no terms page linked' };
}


// ---- Bookmanager storefronts (React app; content served by the store's public, logged-out
// content endpoint api.bookmanager.com/customer/*, which robots.txt explicitly allows) ----
const BM_API = 'https://api.bookmanager.com/customer/';
async function politePost(endpoint, fields, { cacheKey } = {}) {
  const url = BM_API + endpoint;
  const key = cacheKey ?? JSON.stringify(fields);
  const file = join(CACHE, 'api.bookmanager.com', createHash('sha1').update(endpoint + ' ' + key).digest('hex').slice(0, 16) + '.json');
  try { const s = await stat(file); if (Date.now() - s.mtimeMs < TTL_MS) return JSON.parse(await readFile(file, 'utf8')); } catch {}
  const rb = await robotsAllows(url);
  if (!rb.allowed) throw new Error(`robots disallows ${url}`);
  await throttle('api.bookmanager.com');
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const res = await fetch(url, { method: 'POST', body: fd, headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  const json = await res.json();
  if (!json?.error) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(json)); }
  return json;
}
const KID_RE = /\b(kid|kids|teen|teens|tween|tweens|youth|child|children|children's|middle[- ]grade|picture book|story ?time|storytime|grades?|ages? \d|family|families|junior|jr\.?|homeschool|young readers|pre-?k)\b/i;
const CLUBISH_RE = /\b(book ?clubs?|book ?groups?|reading ?groups?|readers'? (club|group)|lit(erary)? (club|salon|circle)|club|salon|circle|society|readers)\b/i;
export async function bookmanagerStore(home) {
  const r = await politeFetch(home);
  const san = r.html.match(/var san="([^"]+)"/)?.[1];
  if (!san) return null;
  const settings = await politePost('store/getSettings', { webstore_name: san }, { cacheKey: 'settings ' + san });
  const info = settings.store_info;
  let sid = null;
  const session = async () => sid ??= (await politePost('session/get', { store_id: info.id }, { cacheKey: 'session ' + info.id + ' ' + TODAY })).session_id;
  const navItems = [];
  const walk = (items, parent) => { for (const it of items ?? []) { navItems.push({ ...it, parent }); walk(it.submenu, it); } };
  walk(settings.site_navigation); walk(settings.extra_navigation); walk(settings.url_shortcuts);
  const base = (settings.site_url || new URL(r.finalUrl ?? home).origin).replace(/\/$/, '');
  const clubNav = navItems.filter((n) => n.id && n.built_in_type === 'custom' && n.type !== 'unlinked' && n.path &&
    (/club|group|reading|readers|salon/i.test(n.label + ' ' + n.path) || /club|group/i.test(n.parent?.label ?? '')));
  const pages = [];
  for (const n of clubNav.slice(0, 25)) {
    const page = await politePost('site_content/getPage', { store_id: info.id, session_id: await session(), page_id: n.id }, { cacheKey: 'page ' + info.id + ' ' + n.id });
    const blocks = [];
    const visit = (x) => {
      if (Array.isArray(x)) return x.forEach(visit);
      if (!x || typeof x !== 'object') return;
      const d = x.data ?? x;
      if (typeof d.heading === 'string' || typeof d.paragraph === 'string' || typeof d.content === 'string' || typeof d.html === 'string' || typeof d.description === 'string')
        blocks.push({ heading: htmlToText(d.heading ?? d.header ?? '').trim(), text: htmlToText(d.paragraph ?? d.content ?? d.html ?? d.description ?? '').replace(/\s+/g, ' ').trim() });
      for (const v of Object.values(x)) if (v && typeof v === 'object' && v !== d) visit(v);
      if (d !== x) for (const v of Object.values(d)) if (v && typeof v === 'object') visit(v);
    };
    visit(page);
    pages.push({ nav: n, url: base + n.path, blocks: blocks.filter((b) => b.heading || b.text) });
  }
  let events = [];
  try {
    const ev = await politePost('event/getList', { store_id: info.id, session_id: await session() }, { cacheKey: 'events ' + info.id + ' ' + TODAY });
    events = (ev.rows ?? []).map((e) => ({ name: htmlToText(e.info?.name ?? e.name ?? ''), from: e.from, raw: e }));
  } catch {}
  return { san, info: { id: info.id, name: info.name, city: info.city, state: info.province }, base, pages, events };
}

const norm = (s) => s.toLowerCase().replace(/&amp;/g, '&').replace(/[’‘]/g, "'").replace(/[^a-z0-9&']+/g, ' ').trim();

function toRecord(store, page, club) {
  const genres = (club.genres ?? []).filter((g) => GENRES.has(g));
  return {
    name: club.name,
    city: club.city ?? store.city,
    state: club.state ?? store.state,
    neighborhood: club.neighborhood ?? store.neighborhood ?? null,
    venue: club.venue === undefined ? store.venue : club.venue,
    genres,
    vibe: club.vibe ? club.vibe.slice(0, 80) : null,
    cadence: club.cadence ?? null,
    format: club.format ?? store.format ?? 'in-person',
    source: SOURCE_ID,
    source_url: page.url,
    last_seen: TODAY,
  };
}

async function build() {
  const { STORES } = await import('./bookstores.stores.mjs');
  const out = [];
  const seen = new Set();
  const CUTOFF = Date.parse(TODAY) / 1000 - 365 * 86400; // club events must be within the last 12 months or upcoming
  for (const store of STORES) {
    if (store.skip) continue;
    let bm = null;
    if (store.platform === 'bookmanager') {
      try { bm = await bookmanagerStore(store.home); } catch (e) { console.error(`[${SOURCE_ID}] ${store.venue} bookmanager error ${e.message}`); continue; }
      if (!bm) { console.error(`[${SOURCE_ID}] ${store.venue} no longer a Bookmanager storefront`); continue; }
    }
    for (const page of store.pages ?? []) {
      let text;
      if (bm) {
        if (page.source === 'events') text = bm.events.filter((e) => e.from >= CUTOFF).map((e) => e.name).join('\n');
        else {
          const pg = bm.pages.find((p) => p.url.replace(/\/$/, '') === page.url.replace(/\/$/, ''));
          if (!pg) { console.error(`[${SOURCE_ID}] ${page.url} not in site navigation any more`); continue; }
          text = [pg.nav.label, ...pg.blocks.map((b) => b.heading + '\n' + b.text)].join('\n');
        }
      } else {
        let res;
        try { res = await politeFetch(page.url); } catch (e) { console.error(`[${SOURCE_ID}] ${page.url} fetch error ${e.message}`); continue; }
        if (res.status !== 200) { console.error(`[${SOURCE_ID}] ${page.url} status ${res.status}${res.blocked ? ' robots ' + res.blocked : ''}`); continue; }
        text = htmlToText(res.html);
      }
      text = norm(text);
      let kept = 0;
      for (const club of page.clubs) {
        const probe = norm(club.match ?? club.name);
        if (!text.includes(probe)) { console.error(`[${SOURCE_ID}]   dropped (not on page): ${club.name} @ ${page.url}`); continue; }
        const rec = toRecord(store, page, club);
        const key = `${rec.venue}|${rec.city}|${rec.name}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key); out.push(rec); kept++;
      }
      console.error(`[${SOURCE_ID}] ${store.venue} (${store.city}, ${store.state}): ${kept}/${page.clubs.length} clubs from ${page.url}`);
      await mkdir(dirname(OUT), { recursive: true });
      await writeFile(OUT, JSON.stringify(out, null, 2) + '\n'); // incremental
    }
  }
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  const cities = new Set(out.map((r) => `${r.city}, ${r.state}`));
  console.error(`[${SOURCE_ID}] wrote ${out.length} records, ${new Set(out.map((r) => r.venue + r.city)).size} venues, ${cities.size} cities -> ${OUT}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'fetch') {
  const r = await politeFetch(arg, { force: process.env.FORCE === '1' });
  if (r.blocked) { console.log(`BLOCKED by robots (${r.blocked})`); process.exit(2); }
  console.log(`STATUS ${r.status}${r.cached ? ' (cache)' : ''}${r.finalUrl && r.finalUrl !== arg ? ' -> ' + r.finalUrl : ''}`);
  console.log(htmlToText(r.html));
} else if (cmd === 'links') {
  // links <url> [regex] -> hrefs on the page whose href/text match (default: book club / terms links)
  const r = await politeFetch(arg);
  if (r.blocked) { console.log(`BLOCKED by robots (${r.blocked})`); process.exit(2); }
  const re = new RegExp(process.argv[4] ?? 'club|terms|conditions|legal|policies|event', 'i');
  const seenL = new Set();
  for (const m of r.html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if ((re.test(m[1]) || re.test(t)) && !seenL.has(m[1])) { seenL.add(m[1]); console.log(`${m[1]}  | ${t.slice(0, 60)}`); }
  }
} else if (cmd === 'bm') {
  const d = await bookmanagerStore(arg);
  if (!d) { console.log('not a Bookmanager storefront'); process.exit(1); }
  console.log(JSON.stringify(d.info), d.base);
  for (const p of d.pages) { console.log(`\n## PAGE ${p.nav.label} -> ${p.url}`); for (const b of p.blocks) console.log(`  [${b.heading}] ${b.text.slice(0, 400)}`); }
  const clubEv = d.events.filter((e) => /club|group|salon|circle|readers/i.test(e.name));
  console.log(`\n## EVENTS ${d.events.length} total, ${clubEv.length} club-ish`);
  for (const e of clubEv) console.log(`  ${new Date(e.from * 1000).toISOString().slice(0, 10)} ${e.name}`);
} else if (cmd === 'bmall') {
  // bmall <file-of-homepages> -> dumps every Bookmanager store sequentially (one process => shared throttle)
  const list = (await readFile(arg, 'utf8')).split(/\s+/).filter(Boolean);
  for (const home of list) {
    try {
      const d = await bookmanagerStore(home);
      if (!d) { console.log(`\n######## ${home} not Bookmanager`); continue; }
      console.log(`\n######## ${home} ${JSON.stringify(d.info)} ${d.base}`);
      for (const p of d.pages) { console.log(`## PAGE ${p.nav.label} -> ${p.url}`); for (const b of p.blocks) console.log(`  [${b.heading}] ${b.text.slice(0, 350)}`); }
      const clubEv = d.events.filter((e) => /club|group|salon|circle|readers/i.test(e.name));
      console.log(`## EVENTS ${d.events.length} total, ${clubEv.length} club-ish`);
      for (const e of clubEv) console.log(`  ${new Date(e.from * 1000).toISOString().slice(0, 10)} ${e.name}`);
    } catch (e) { console.log(`\n######## ${home} ERROR ${e.message}`); }
  }
} else if (cmd === 'terms') {
  // terms <homepage> -> finds terms-of-use style links and reports any anti-automation clause
  console.log(JSON.stringify(await checkTerms(arg)));
} else if (cmd === 'robots') {
  const r = await robotsAllows(arg); console.log(JSON.stringify(r));
} else {
  await build();
}
