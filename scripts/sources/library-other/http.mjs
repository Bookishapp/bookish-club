// Polite HTTP helper: per-host throttle (>=1.5s), robots.txt check, disk cache, backoff.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../../..');
export const CACHE_DIR = path.join(ROOT, '.cache/library-other');
export const UA = 'BookishClubDirectory/0.1 (public book club listings)';
const MIN_GAP_MS = 1600;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_HOURS ?? 20) * 3600e3;

const lastHit = new Map();
export const hostDelay = new Map(); // host -> ms (from robots Crawl-delay)
const robotsCache = new Map();
export const robotsLog = new Map(); // host -> {status, note}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(host) {
  const prev = lastHit.get(host) ?? 0;
  const gap = Math.max(MIN_GAP_MS, hostDelay.get(host) ?? 0);
  const wait = prev + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

function cachePath(url, method, body) {
  const h = createHash('sha1').update(method + ' ' + url + ' ' + (body ?? '')).digest('hex').slice(0, 16);
  const u = new URL(url);
  return path.join(CACHE_DIR, u.host, h + '.raw');
}

async function rawFetch(url, opts = {}) {
  const u = new URL(url);
  let delay = 5000;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(u.host);
    let res;
    try {
      res = await fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: { 'User-Agent': UA, Accept: opts.accept ?? '*/*', ...(opts.headers ?? {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(delay); delay *= 2; continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60000) : delay);
      delay *= 2;
      if (attempt === 3) return { status: res.status, text: await res.text(), url: res.url };
      continue;
    }
    return { status: res.status, text: await res.text(), url: res.url, ctype: res.headers.get('content-type') };
  }
}

// --- robots.txt ---
function parseRobots(txt) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (k === 'allow' || k === 'disallow') cur.rules.push({ allow: k === 'allow', path: v });
      if (k === 'crawl-delay') cur.rules.push({ delay: Number(v) });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && 'bookishclubdirectory'.includes(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return pick.flatMap((g) => g.rules);
}
function ruleMatch(rulePath, p) {
  if (!rulePath) return -1;
  let re = '^' + rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (re.endsWith('\\$')) re = re.slice(0, -2) + '$';
  return new RegExp(re).test(p) ? rulePath.length : -1;
}
export async function robotsAllowed(url) {
  const u = new URL(url);
  let rules = robotsCache.get(u.host);
  if (!rules) {
    const r = await cachedFetch(`${u.protocol}//${u.host}/robots.txt`, { skipRobots: true });
    if (r.status >= 400 && r.status < 500) { rules = []; robotsLog.set(u.host, { status: `robots.txt ${r.status} (none => allowed)` }); }
    else if (r.status >= 500) { rules = [{ allow: false, path: '/' }]; robotsLog.set(u.host, { status: `robots.txt ${r.status} (treated as disallow)` }); }
    else { rules = parseRobots(/<html/i.test(r.text.slice(0, 500)) ? '' : r.text); robotsLog.set(u.host, { status: 'robots.txt 200', raw: r.text.slice(0, 4000) }); }
    const d = rules.find((r) => r.delay != null);
    if (d && d.delay > 0) hostDelay.set(u.host, Math.min(d.delay, 30) * 1000 + 100);
    rules = rules.filter((r) => r.delay == null);
    robotsCache.set(u.host, rules);
  }
  const p = u.pathname + u.search;
  let best = { len: -1, allow: true };
  for (const r of rules) {
    if (!r.allow && r.path === '') continue;
    const len = ruleMatch(r.path, p);
    if (len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best.allow;
}

export class RobotsDisallowed extends Error {}

export async function cachedFetch(url, opts = {}) {
  const method = opts.method ?? 'GET';
  const file = cachePath(url, method, opts.body);
  if (existsSync(file) && !opts.noCache) {
    const raw = await readFile(file, 'utf8');
    const nl = raw.indexOf('\n');
    const meta = JSON.parse(raw.slice(0, nl));
    if (Date.now() - meta.t < CACHE_TTL_MS) return { ...meta, text: raw.slice(nl + 1), cached: true };
  }
  if (!opts.skipRobots && !(await robotsAllowed(url))) throw new RobotsDisallowed(`robots.txt disallows ${url}`);
  const r = await rawFetch(url, opts);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ t: Date.now(), url, status: r.status, final: r.url, ctype: r.ctype ?? null }) + '\n' + r.text);
  return { ...r, final: r.url };
}

export async function getText(url, opts) {
  const r = await cachedFetch(url, opts);
  if (r.status >= 400) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text;
}
export async function getJSON(url, opts) {
  const t = await getText(url, { accept: 'application/json', ...opts });
  return JSON.parse(t);
}
