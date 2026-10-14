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
const NOT_CLUB = /\b(author talk|book signing|book sale|cancel+ed|postponed)\b/i;

const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "") || null;
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function geocode(city, st) {
  const c = city.toLowerCase().replace(/\s+/g, " ").trim();
  const tries = [c, c.replace(/^st\.? /, "saint "), c.replace(/^saint /, "st. "), c.replace(/^ft\.? /, "fort "),
    c.replace(/^mt\.? /, "mount "), c.replace(/ city$/, ""), c.split("-")[0]];
  for (const t of tries) { const hit = places[`${st}|${t}`]; if (hit) return hit; }
  return null;
}

const SOURCE_LABEL = { "library-bibliocommons": "library", "library-other": "library", bookstores: "bookstore" };

const all = [];
const unmatched = new Map();
const counts = {};
for (const f of fs.readdirSync(RAW).filter((f) => f.endsWith(".json")).sort()) {
  let rows;
  try { rows = JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8")); } catch (e) { console.warn(`skip ${f}: ${e.message}`); continue; }
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    const name = clean(r.name);
    const st = clean(r.state)?.toUpperCase();
    let city = clean(r.city);
    if (!name || !city || !st || !STATES.has(st) || !r.source_url) continue;
    const text = `${name} ${r.vibe ?? ""}`;
    if (NOT_ADULT.test(text) || NOT_CLUB.test(name)) continue;
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || /\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/.test(text)) continue; // never store contact info
    const geo = geocode(city, st);
    if (geo) city = geo[2]; else unmatched.set(`${city}, ${st}`, (unmatched.get(`${city}, ${st}`) ?? 0) + 1);
    const genres = new Set((r.genres ?? []).filter((g) => g in GENRES));
    for (const [re, g] of KEYWORDS) if (re.test(name)) genres.add(g);
    const venue = clean(r.venue);
    const key = `${slug(name)}|${slug(venue ?? "")}|${slug(city)}|${st}`;
    all.push({
      key,
      name: name.slice(0, 140),
      city, state: st,
      neighborhood: clean(r.neighborhood),
      venue: venue?.slice(0, 120) ?? null,
      genres: [...genres],
      vibe: clean(r.vibe)?.slice(0, 100) ?? null,
      cadence: clean(r.cadence)?.slice(0, 60) ?? null,
      format: ["in-person", "online", "hybrid"].includes(r.format) ? r.format : null,
      host_type: SOURCE_LABEL[r.source] ?? "community",
      source: r.source,
      source_name: clean(r.library) ?? clean(r.source_name) ?? venue ?? null,
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
const clubs = [...byKey.values()].map(({ key, ...c }) => ({
  id: `${slug(c.name).slice(0, 40)}-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 6)}`,
  ...c,
})).sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

fs.writeFileSync(path.join(ROOT, "data/clubs.json"), JSON.stringify(clubs, null, 1));
const cities = new Set(clubs.map((c) => `${c.city}|${c.state}`));
console.log(`raw rows kept per source:`, counts);
console.log(`clubs: ${clubs.length} (deduped from ${all.length}), cities: ${cities.size}, states: ${new Set(clubs.map((c) => c.state)).size}`);
if (unmatched.size) console.log(`cities not geocoded (${unmatched.size}):`, [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} (${v})`).join("; "));
