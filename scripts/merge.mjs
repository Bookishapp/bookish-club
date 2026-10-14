// Merge every data/raw/<source>.json into data/clubs.json.
// Normalises, filters (adults only, US only), geocodes the city against
// Census places, dedupes and assigns stable ids.
// Usage: node scripts/merge.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GENRES_LIST } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const RAW = path.join(ROOT, "data/raw");
const places = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ref/places.json"), "utf8"));

const GENRES = Object.fromEntries(GENRES_LIST);
const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" "));

// Name keywords -> genre (only applied to what the listing itself says).
const KEYWORDS = [
  [/\bromance|romantasy|bodice|love stories\b/i, "romance"], [/\bromantasy|fantasy|dragons?\b/i, "fantasy"],
  [/\bsci[- ]?fi|science fiction|speculative\b/i, "sci-fi"], [/\bmystery|mysteries|thriller|crime|whodunit|true crime|noir\b/i, "mystery-thriller"],
  [/\bhorror|spooky|scary\b/i, "horror"], [/\bliterary\b/i, "literary"], [/\bclassics?\b|great books/i, "classics"],
  [/\bhistorical fiction|history buffs|historical\b/i, "historical-fiction"], [/\bnon-?fiction|science book|history book club\b/i, "nonfiction"],
  [/\bmemoir|biograph/i, "memoir"], [/\b(ya|young adult)\b/i, "ya"], [/\blgbtq|queer|pride|rainbow\b/i, "lgbtq"],
  [/\bpoetry|poets?\b/i, "poetry"], [/\bgraphic novel|comics?|manga\b/i, "graphic-novels"],
  [/\bsilent (book|reading)\b|read in silence/i, "silent-reading"], [/\bespañol|spanish|en español|lectura\b/i, "spanish-language"],
];
const NOT_ADULT = /\b(kids?|children'?s?|teens?|tweens?|juniors?|family|families|homeschool|middle[- ]grade|grades? \d|ages? \d|storytime|story time|parent[- ]child|mother[- ]daughter|father[- ]son|elementary|youth)\b/i;
const NOT_CLUB = /\b(author talk|book signing|book sale|cancel+ed|postponed|open hours)\b/i;

const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "") || null;
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function geocode(city, st) {
  const c = city.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f\u02bb\u2018\u2019']/g, "").replace(/\s+/g, " ").trim();
  const tries = [c, c.replace(/^st\.? /, "saint "), c.replace(/^saint /, "st. "), c.replace(/^ft\.? /, "fort "),
    c.replace(/^mt\.? /, "mount "), c.replace(/ city$/, ""), c.split("-")[0]];
  for (const t of tries) { const hit = places[`${st}|${t}`]; if (hit) return hit; }
  return null;
}

const near = (a, b) => {
  const R = 3958.8, r = Math.PI / 180, x = (b[0] - a[0]) * r, y = (b[1] - a[1]) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) ** 2));
};

const VENUEISH = /\b(meets? (at|in)|at the|library|branch|room|caf[eé]|coffee|bar|brewery|brewing|taproom|pub|winery|restaurant|store|shop|park|center|centre|street|st\.|ave|avenue|road|blvd|suite|floor|address)\b/i;
const SOURCE_LABEL = { "library-other": "library", bookstores: "bookstore" };

// Sources we will never publish. library-bibliocommons (978 clubs) was
// collected once and then DROPPED for good (2026-10-14): BiblioCommons'
// terms allow personal, non-commercial use only and bar republishing. The
// raw data and the collector were deleted. There is no override. Any record
// whose source URL is on bibliocommons.com is dropped too, whatever source
// file it arrives in. See SOURCES.md.
const EXCLUDED = new Set(["library-bibliocommons"]);
const EXCLUDED_HOST = /(^|\.)bibliocommons\.com$/i;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const all = [];
const unmatched = new Map();
const junk = [];
const counts = {};
for (const f of fs.readdirSync(RAW).filter((f) => f.endsWith(".json")).sort()) {
  let rows;
  try { rows = JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8")); } catch (e) { console.warn(`skip ${f}: ${e.message}`); continue; }
  if (!Array.isArray(rows)) continue;
  if (EXCLUDED.has(f.replace(/\.json$/, ""))) { console.log(`excluded (never published): ${f}`); continue; }
  for (const r of rows) {
    if (EXCLUDED.has(r.source) || EXCLUDED_HOST.test(hostOf(r.source_url))) continue;
    const name = clean(r.name);
    const st = clean(r.state)?.toUpperCase();
    let city = clean(r.city);
    if (!name || !city || !st || !STATES.has(st) || !r.source_url) continue;
    city = city.replace(/'s .*$/, "").replace(/ Free$/, "").replace(/[,.;:\s]+$/, "").trim();
    if (/library|(?<!long )branch|system|archive|innovation|offsite|mobile service|department|[:@&]|^(main|downtown|central|virtual|online|south county|north county|cyrill-westside|byram shubert|headquarters.*|stryker center|domonkas|pierre moran)$/i.test(city)) { junk.push(`${city}, ${st}`); continue; }
    const text = `${name} ${r.vibe ?? ""}`;
    if (NOT_ADULT.test(text) || NOT_CLUB.test(name)) continue;
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || /\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/.test(text)) continue; // never store contact info
    let geo = geocode(city, st);
    // County systems often report HQ city for every branch; a branch named
    // after a nearby municipality ("Bedford Branch") is a better location.
    const bm = clean(r.venue)?.match(/^(.+?) (?:Branch|Branch Library|Library|Regional Library|Public Library)$/i);
    if (bm && !/^(main|central|downtown|virtual|online)/i.test(bm[1])) {
      const alt = geocode(bm[1], st);
      if (alt && alt[2] !== city && (!geo || near(geo, alt) <= 30)) { geo = alt; city = alt[2]; }
    }
    if (geo) city = geo[2]; else unmatched.set(`${city}, ${st}`, (unmatched.get(`${city}, ${st}`) ?? 0) + 1);
    const genres = new Set((r.genres ?? []).filter((g) => g in GENRES));
    for (const [re, g] of KEYWORDS) if (re.test(name)) genres.add(g);
    const venue = clean(r.venue);
    const key = `${slug(name)}|${slug(venue ?? "")}|${slug(city)}|${st}`;
    // Keep the venue out of the public name too ("Mystery Club at Yarborough Branch").
    let pubName = name;
    if (venue && venue.length > 3) pubName = pubName.replace(new RegExp(`\\s*(?:at|@|[-–—:|])?\\s*(?:the\\s+)?${venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "");
    pubName = pubName.replace(/\s+(?:at|@)\s+(?:the\s+)?[^,]*?\b(?:library|branch|bookstore|bookshop|books|caf[eé]|coffee|brewery|brewing|taproom|pub|bar)\b.*$/i, "")
      .replace(/\s*[-–—:|@]\s*$/, "").trim();
    { const m = pubName.match(/^(?:[\w.'’&-]+\s){1,4}(?:library|branch)\s+(.+)$/i);
      if (m && /book|read|club|group|discussion|circle|society/i.test(m[1])) pubName = m[1]; }
    pubName = pubName.replace(/^(?:library|branch)\s+/i, "").replace(/\s*\((?:at|@)[^)]*\)/i, "").trim();
    if (pubName.length < 4) pubName = "Book Club";
    const idName = pubName; // ids stay stable when the display-name scrub below changes
    // Second scrub (v1.1): branch / room / centre names that survived above.
    // "Regency Park Book Club" (venue "Regency Park Branch") -> "Book Club",
    // "Book Club at the Norr Community Center" -> "Book Club".
    const CLUBWORD = /book|read|club|group|discussion|circle|society|chat|talk/i;
    const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const core = venue?.replace(/\s+(?:branch(?:\s+library)?|(?:regional\s+|public\s+|community\s+|memorial\s+)?library|(?:community|senior|cultural)\s+center|center)$/i, "").trim();
    if (core && core.length > 3 && core.toLowerCase() !== city.toLowerCase()) {
      const lead = pubName.replace(new RegExp(`^(?:the\\s+)?${reEsc(core)}(?:\\s+(?:branch|library))?\\s*[-–—:|]?\\s+`, "i"), "");
      if (lead !== pubName && CLUBWORD.test(lead)) pubName = lead;
      const tail = pubName.replace(new RegExp(`\\s*\\(?\\s*(?:at|@|in|[-–—:|])?\\s*(?:the\\s+)?${reEsc(core)}\\b.*$`, "i"), "").replace(/\s*[-–—:|(@]\s*$/, "").trim();
      if (tail !== pubName && tail.length >= 8 && CLUBWORD.test(tail)) pubName = tail;
    }
    { const t = pubName.replace(/\s+(?:at|in|@)\s+(?:the\s+)?[^,]*?\b(?:center|centre|room|hall|park|branch|library|caf[eé]|coffee\s?house|brewery|taproom|pub|winery|restaurant|bookstore|bookshop)\b.*$/i, "").trim();
      if (t !== pubName && t.length >= 8 && CLUBWORD.test(t)) pubName = t; }
    { const t = pubName.replace(/\s+at\s+the\s+[A-Z][^,]*$/, "").replace(/\b[Tt]he\s+[A-Z][\w'’]+\s+Room\s+/, "").trim();
      if (t !== pubName && t.length >= 8 && CLUBWORD.test(t)) pubName = t; }
    all.push({
      key, idName,
      name: pubName.slice(0, 140),
      city, state: st,
      // Privacy rule: no venue, neighborhood or address on any public surface.
      // Location is city-level only (lat/lng below = Census city centroid).
      genres: [...genres],
      vibe: (() => { const v = clean(r.vibe); return v && !VENUEISH.test(v) && !(venue && v.toLowerCase().includes(venue.toLowerCase())) ? v.slice(0, 100) : null; })(),
      cadence: clean(r.cadence)?.slice(0, 60) ?? null,
      format: ["in-person", "online", "hybrid"].includes(r.format) ? r.format : null,
      host_type: SOURCE_LABEL[r.source] ?? (String(r.source).startsWith("library") ? "library" : "community"),
      source: r.source,
      source_name: String(r.source).startsWith("library") ? clean(r.library) : null, // library system only; never a venue
      source_url: r.source_url,
      last_seen: r.last_seen ?? new Date().toISOString().slice(0, 10),
      lat: geo?.[0] ?? null, lng: geo?.[1] ?? null,
    });
    counts[r.source] = (counts[r.source] ?? 0) + 1;
  }
}

// Dedupe: keep the most recently seen / most complete record.
const byKey = new Map();
const score = (c) => [c.cadence, c.vibe, c.venue, c.format].filter(Boolean).length + c.genres.length;
for (const c of all) {
  const prev = byKey.get(c.key);
  if (!prev || c.last_seen > prev.last_seen || (c.last_seen === prev.last_seen && score(c) > score(prev))) byKey.set(c.key, c);
}
const clubs = [...byKey.values()].map(({ key, idName, ...c }) => ({
  id: `${slug(idName).slice(0, 40)}-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 6)}`,
  ...c,
})).sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

fs.writeFileSync(path.join(ROOT, "data/clubs.json"), JSON.stringify(clubs, null, 1));
const cities = new Set(clubs.map((c) => `${c.city}|${c.state}`));
console.log(`raw rows kept per source:`, counts);
console.log(`clubs: ${clubs.length} (deduped from ${all.length}), cities: ${cities.size}, states: ${new Set(clubs.map((c) => c.state)).size}`);
if (junk.length) console.log(`dropped ${junk.length} rows with a non-city in the city field:`, [...new Set(junk)].slice(0, 10).join('; '));
if (unmatched.size) console.log(`cities not geocoded (${unmatched.size}):`, [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} (${v})`).join("; "));
