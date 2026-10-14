#!/usr/bin/env node
// Public-library book clubs from non-BiblioCommons US library event calendars.
// Usage: node scripts/sources/library-other.mjs [--only <substring>] [--platform communico]
// Zero npm deps. Polite: robots.txt honoured (incl. Crawl-delay), >=1.6s/host, raw responses cached under .cache/library-other/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, robotsLog, hostDelay, RobotsDisallowed, robotsAllowed } from './library-other/http.mjs';
import { LIBRARIES } from './library-other/registry.mjs';
import { stateCode } from './library-other/common.mjs';
import * as communico from './library-other/communico.mjs';
import * as libcal from './library-other/libcal.mjs';
import * as librarycalendar from './library-other/librarycalendar.mjs';
import * as custom from './library-other/custom.mjs';
import * as tribe from './library-other/tribe.mjs';

const ADAPTERS = { communico, libcal, librarycalendar, custom, tribe };
const OUT = path.join(ROOT, 'data/raw/library-other.json');
const STATUS = path.join(ROOT, '.cache/library-other/_status.json');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].toLowerCase() : null;
const platformOnly = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null;
const concurrency = Number(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : 6);

const existing = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : [];
const status = existsSync(STATUS) ? JSON.parse(await readFile(STATUS, 'utf8')) : {};
const byLib = new Map();
const known = new Set(LIBRARIES.map((l) => l.name));
for (const k of Object.keys(status)) if (!known.has(k)) delete status[k];
for (const r of existing) { if (!known.has(r.library)) continue; if (!byLib.has(r.library)) byLib.set(r.library, []); byLib.get(r.library).push(r); }

let writing = Promise.resolve();
async function flush() {
  writing = writing.then(async () => {
    const all = [...byLib.values()].flat();
    // de-dup across runs on (library, name, venue)
    const seen = new Set(); const out = [];
    for (const r of all) { const k = `${r.library}|${r.name.toLowerCase()}|${(r.venue ?? '').toLowerCase()}`; if (!seen.has(k)) { seen.add(k); out.push(r); } }
    out.sort((a, b) => a.state.localeCompare(b.state) || a.library.localeCompare(b.library) || (a.venue ?? '').localeCompare(b.venue ?? '') || a.name.localeCompare(b.name));
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
    await writeFile(STATUS, JSON.stringify(status, null, 1));
  });
  return writing;
}

const todo = LIBRARIES.filter((l) => (!only || l.name.toLowerCase().includes(only) || l.host.includes(only)) && (!platformOnly || l.platform === platformOnly) && !l.skip);
console.log(`${todo.length} libraries to scrape`);

// JSON-LD localities that are unincorporated/obsolete names -> municipality
const CITY_FIX = { 'East Millcreek': 'Millcreek', 'Parma-Powers': 'Parma' };
// per-library fix-ups declared in the registry: renames, branch->city maps, branch-named-after-city systems
function postProcess(lib, c) {
  let name = c.name;
  for (const [re, rep] of lib.renames ?? []) name = name.replace(re, rep).replace(/\s+/g, ' ').trim();
  if (/^["“].*["”]$/.test(name)) name = c.venue && !/offsite|virtual|online/i.test(c.venue) ? `${c.venue.replace(/\s+branch$/i, '')} Book Club` : 'Book Club';
  let city = c.city ?? lib.city;
  const v = c.venue ?? '';
  if (lib.cityMap && lib.cityMap[v]) city = lib.cityMap[v];
  else if (lib.branchIsCity === 'branch' && /^(.+?)\s+(branch|library)$/i.test(v) && c.city === lib.city) city = v.replace(/\s+(branch|library)$/i, '').trim();
  else if (lib.branchIsCity === 'pl' && /\b(public|free|memorial|township|community)\s+library\b/i.test(v) && !/branch/i.test(v) && c.city === lib.city) city = v.replace(/^the\s+/i, '').replace(/\s+(public|free|memorial|township|community)\s+library.*$/i, '').replace(/\s+(borough|township|village|city)$/i, '').trim();
  else if (lib.branchIsCity === true && v && !/online|virtual/i.test(v) && c.city === lib.city) city = v.split(/\s+[-–]\s+/)[0].replace(/\s+(public library|regional library|community library|branch library|branch|library)$/i, '').trim();
  city = String(city ?? '').replace(/^(town|city|village|borough)\s+of\s+/i, '').replace(/\s+(town|village)$/i, '').trim();
  if (!/[a-z]{2}/i.test(city)) city = lib.city;
  city = (lib.cityFix ?? {})[city] ?? CITY_FIX[city] ?? city;
  return { ...c, name, library: lib.name, platform: lib.platform, state: stateCode(c.state) ?? lib.state, city };
}

async function runOne(lib) {
  const t0 = Date.now();
  const adapter = ADAPTERS[lib.platform];
  try {
    if (!(await robotsAllowed(`https://${lib.host}${lib.probePath ?? '/'}`))) throw new RobotsDisallowed(`robots.txt disallows ${lib.host}${lib.probePath ?? '/'}`);
    const clubs = (await adapter.scrape(lib)).map((c) => postProcess(lib, c));
    byLib.set(lib.name, clubs);
    status[lib.name] = { host: lib.host, platform: lib.platform, count: clubs.length, robots: robotsLog.get(lib.host)?.status ?? 'cached', crawlDelayMs: hostDelay.get(lib.host) ?? null, at: new Date().toISOString(), ok: true };
    console.log(`${lib.name}: ${clubs.length} clubs (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    const disallowed = e instanceof RobotsDisallowed;
    status[lib.name] = { host: lib.host, platform: lib.platform, count: byLib.get(lib.name)?.length ?? 0, robots: disallowed ? 'DISALLOWED' : robotsLog.get(lib.host)?.status, error: e.message, at: new Date().toISOString(), ok: false };
    if (disallowed) byLib.delete(lib.name);
    console.warn(`${lib.name}: FAILED ${e.message}`);
  }
  await flush();
}

// run different hosts concurrently; each host is throttled independently inside http.mjs
const queue = [...todo];
await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length) await runOne(queue.shift()); }));
await writing;
const all = JSON.parse(await readFile(OUT, 'utf8'));
console.log(`TOTAL ${all.length} clubs, ${new Set(all.map((r) => r.city + ',' + r.state)).size} cities, ${new Set(all.map((r) => r.library)).size} libraries`);
