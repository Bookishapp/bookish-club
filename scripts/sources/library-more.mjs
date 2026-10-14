#!/usr/bin/env node
// More public-library book clubs: large suburban county systems and metros ~31-100 that the
// library-bibliocommons and library-other collectors do not cover.
// Usage: node scripts/sources/library-more.mjs [--only <substring>] [--concurrency N]
// Node 24, zero deps. Polite: robots.txt honoured (incl. Crawl-delay), >=1.6s/host sequential,
// raw responses cached under .cache/library-more/. Re-runnable; output merged per library.
//
// Reuses the platform adapters of library-other (Communico, LibCal, WordPress tribe); copies of
// those adapters live in ./library-more/ only so that requests go through this collector's own
// cache directory. Classification/collapsing logic is imported from ./library-other/common.mjs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, robotsLog, hostDelay, RobotsDisallowed, robotsAllowed } from './library-more/http.mjs';
import { LIBRARIES } from './library-more/registry.mjs';
import { stateCode } from './library-other/common.mjs';
import * as communico from './library-more/communico.mjs';
import * as libcal from './library-more/libcal.mjs';
import * as tribe from './library-more/tribe.mjs';
import * as extra from './library-more/extra.mjs';

const ADAPTERS = { communico, libcal, tribe, ...extra.ADAPTERS };
const LAST_SEEN = '2026-10-13';
const OUT = path.join(ROOT, 'data/raw/library-more.json');
const STATUS = path.join(ROOT, '.cache/library-more/_status.json');
const OTHER_FILES = ['data/raw/library-bibliocommons.json', 'data/raw/library-other.json'].map((f) => path.join(ROOT, f));
const OTHER_REGISTRY = path.join(ROOT, 'scripts/sources/library-other/registry.mjs');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].toLowerCase() : null;
const concurrency = Number(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : 8);

const existing = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : [];
const status = existsSync(STATUS) ? JSON.parse(await readFile(STATUS, 'utf8')) : {};
const byLib = new Map();
for (const r of existing) { if (!byLib.has(r.library)) byLib.set(r.library, []); byLib.get(r.library).push(r); }

// Hosts already collected (or queued) by the other two library collectors. Re-read before every library.
async function coveredHosts() {
  const hosts = new Set();
  for (const f of OTHER_FILES) {
    try {
      for (const r of JSON.parse(await readFile(f, 'utf8'))) {
        try { const u = new URL(r.source_url); hosts.add(u.host); const m = u.pathname.match(/calendars\/([^/.?]+)/); if (u.host.endsWith('trumba.com') && m) hosts.add(`trumba:${m[1]}`); } catch { /* */ }
      }
    } catch { /* file mid-write or absent */ }
  }
  try { for (const m of (await readFile(OTHER_REGISTRY, 'utf8')).matchAll(/host:\s*'([^']+)'/g)) hosts.add(m[1]); } catch { /* */ }
  return hosts;
}

let writing = Promise.resolve();
const touched = new Set(); // libraries processed by this run
function flush() {
  writing = writing.then(async () => {
    // merge with what is on disk now so that concurrent runs over disjoint library sets don't clobber each other
    let disk = [];
    try { disk = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* */ }
    const mine = new Set(touched);
    const seen = new Set(); const out = [];
    for (const r of [...disk.filter((r) => !mine.has(r.library)), ...[...byLib.values()].flat().filter((r) => mine.has(r.library))]) {
      const k = `${r.library}|${r.name.toLowerCase()}|${(r.venue ?? '').toLowerCase()}`;
      if (!seen.has(k)) { seen.add(k); out.push(r); }
    }
    out.sort((a, b) => a.state.localeCompare(b.state) || a.library.localeCompare(b.library) || (a.venue ?? '').localeCompare(b.venue ?? '') || a.name.localeCompare(b.name));
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
    await writeFile(STATUS, JSON.stringify(status, null, 1));
  });
  return writing;
}

const PERSON_RE = /\s+(with|hosted by|led by|w\/)\s+(Ms\.?\s*|Mr\.?\s*|Mrs\.?\s*|Dr\.?\s*|Miss\s+)?\p{Lu}[\p{Ll}'’]+(\s+\p{Lu}[\p{Ll}'’.]*)?\s*$/u;
const NOT_PERSON = /^(with|hosted by|led by|w\/)\s+(the|friends?|us|author|authors|coffee|tea|wine|snacks|bite|bites|brews?|beer|cocktails?|cookies|donuts|dessert|lunch|breakfast|brunch|pride|spirit|style|heart|class|grace|purpose|love|pals|neighbors|strangers|wit|food|treats|music|art|dogs?|cats?|pets?|kids|family|sci|book|books|zoom|a|an|your|our|refreshments|friends)\b/i;

function postProcess(lib, c) {
  let name = c.name;
  for (const [re, rep] of lib.renames ?? []) name = name.replace(re, rep);
  const pm = name.match(PERSON_RE);
  if (pm && !NOT_PERSON.test(pm[0].trim())) name = name.slice(0, pm.index);
  name = name.replace(/\s+/g, ' ').replace(/\s*[-–—:|,]\s*$/, '').trim();
  const v = (c.venue ?? '').trim();
  let city = c.city ?? null;
  if (lib.cityMap) {
    const hit = lib.cityMap[v] ?? Object.entries(lib.cityMap).find(([k]) => v.toLowerCase().includes(k.toLowerCase()))?.[1];
    if (hit) city = hit;
  }
  if (lib.branchIsCity && (!city || city === lib.city) && v && !/online|virtual/i.test(v) && !lib.cityMap?.[v]) {
    const guess = v.split(/\s+[-–]\s+/)[0].replace(/^the\s+/i, '').replace(/\s+(public library|free library|regional library|community library|branch library|memorial library|district library|branch|library|regional)$/i, '').trim();
    if (guess && !/\d/.test(guess)) city = guess;
  }
  city = (lib.cityFix ?? {})[city] ?? city;
  const online = /online|virtual|zoom/i.test(v) || c.format === 'online';
  if (!city && (online || lib.singleCity)) city = lib.city; // online clubs / one-city systems: the system's city
  let vibe = c.vibe;
  if (vibe && /@|\d{3}[-.)\s]\d{3}[-.\s]\d{4}/.test(vibe)) vibe = null;
  return {
    name, city, state: stateCode(c.state) ?? lib.state, neighborhood: null,
    venue: v || null, genres: c.genres ?? [], vibe: vibe ?? null, cadence: c.cadence ?? null,
    format: c.format ?? null, source: 'library-more', library: lib.name, platform: lib.platform,
    source_url: c.source_url, last_seen: LAST_SEEN,
  };
}

const STANDING_RE = /\b(book\s*(club|group|discussion\s+group|circle|chat|talk|lovers|bunch|nook|worms?)|bookclub|readers'?\b|reading\s+(group|circle|club)|lit(erary)?\s+(club|circle|society|group)|club\s+de\s+lectura|book\s+discussion)\b/i;
const ONE_OFF_RE = /\s[-–|]\s|\b(one\s+book|big\s+read|reads:|author|launch|kickoff|kick-off|celebration|party|panel|festival|special|all\s+\w+\s+reads)\b|\b(19|20)\d\d\b/i;
function keep(lib, r) {
  // recurring clubs only: cadence derivable from occurrences/description, or a standing club name
  // (many libraries post only the next meeting, so a named club with one listed date is kept with cadence null)
  if (!r.cadence && !(STANDING_RE.test(r.name) && !ONE_OFF_RE.test(r.name))) return false;
  if (!r.city || !r.state || r.state.length !== 2) return false;
  if (/^(online|virtual)/i.test(r.city)) return false;
  if (/\b(kids?|children|teens?|tweens?|family|families|junior|jr\.?|middle school|grades?\s*\d|ages?\s*\d)\b/i.test(r.name) && !/adult/i.test(r.name)) return false;
  return true;
}

const start = Number(args.includes('--start') ? args[args.indexOf('--start') + 1] : 0); // registry index to start from
const todo = LIBRARIES.slice(start).filter((l) => (!only || l.name.toLowerCase().includes(only) || l.host.includes(only)));
console.log(`${todo.length} libraries queued`);

async function runOne(lib) {
  touched.add(lib.name);
  const t0 = Date.now();
  const base = { host: lib.host, platform: lib.platform, at: new Date().toISOString() };
  if (lib.skip) { status[lib.name] = { ...base, ok: false, skipped: lib.skip, count: 0 }; byLib.delete(lib.name); await flush(); return; }
  const covered = await coveredHosts();
  const shared = lib.platform === 'trumba'; // shared SaaS host: match on the calendar name instead
  if ((!shared && covered.has(lib.host)) || (lib.altHosts ?? []).some((h) => covered.has(h)) || (shared && covered.has(`trumba:${lib.webName}`))) {
    status[lib.name] = { ...base, ok: false, skipped: 'host already covered by library-other / library-bibliocommons', count: 0 };
    byLib.delete(lib.name); console.log(`${lib.name}: skipped (already covered)`); await flush(); return;
  }
  const adapter = ADAPTERS[lib.platform];
  try {
    if (!(await robotsAllowed(`https://${lib.host}${lib.probePath ?? '/'}`))) throw new RobotsDisallowed(`robots.txt disallows ${lib.host}${lib.probePath ?? '/'}`);
    const raw = await adapter.scrape(lib);
    const clubs = raw.map((c) => postProcess(lib, c)).filter((r) => keep(lib, r));
    byLib.set(lib.name, clubs);
    status[lib.name] = { ...base, ok: true, count: clubs.length, rawCount: raw.length, robots: robotsLog.get(lib.host)?.status ?? 'cached', crawlDelayMs: hostDelay.get(lib.host) ?? null, mode: lib._libcalMode ?? null };
    console.log(`${lib.name}: ${clubs.length} clubs (raw ${raw.length}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    const disallowed = e instanceof RobotsDisallowed;
    status[lib.name] = { ...base, ok: false, count: 0, robots: disallowed ? 'DISALLOWED' : robotsLog.get(lib.host)?.status, error: e.message };
    byLib.delete(lib.name);
    console.warn(`${lib.name}: FAILED ${e.message}`);
  }
  await flush();
}

const queue = [...todo];
await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length) await runOne(queue.shift()); }));
await writing;
const all = JSON.parse(await readFile(OUT, 'utf8'));
console.log(`TOTAL ${all.length} clubs, ${new Set(all.map((r) => r.city + ',' + r.state)).size} cities, ${new Set(all.map((r) => r.library)).size} libraries`);
