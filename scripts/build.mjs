// Static site generator for Bookish. Zero dependencies.
//   SITE_URL=https://bookishclub.com node scripts/build.mjs   -> dist/
// SITE_URL decides canonical URLs and the base path (e.g. /bookish-club on
// a GitHub Pages project URL, empty on a custom domain).
import fs from "node:fs";
import path from "node:path";
import { GENRES_LIST, STATE_NAMES } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE_URL = (process.env.SITE_URL || "https://fictora.github.io/bookish-club").replace(/\/$/, "");
const BASE = new URL(SITE_URL).pathname.replace(/\/$/, "");
const API = process.env.BOOKISH_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-submit";
const OUT = path.join(ROOT, "dist");
const JOIN_API = process.env.BOOKISH_JOIN_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-join";
const TODAY = new Date().toISOString().slice(0, 10);

const GENRES = Object.fromEntries(GENRES_LIST);
const KEEP_CASE = new Set(["spanish-language", "lgbtq"]);
const lc = (g) => KEEP_CASE.has(g) ? GENRES[g] : GENRES[g].toLowerCase();
const clubs = JSON.parse(fs.readFileSync(path.join(ROOT, "data/clubs.json"), "utf8"));

// ---------- verified vs unclaimed ----------
// VERIFIED ("On Bookish"): a host claimed or started the club and confirmed
// by email. Only these can be requested-to-join (the bookish-join function
// enforces the same rule server-side). UNCLAIMED: listed from public library
// and bookstore calendars; readers get the source link and a claim link only.
// Source of truth: the public bookish-verified edge function, read at build
// time (the deploy workflow also rebuilds hourly). BOOKISH_VERIFIED_FILE
// points at a local JSON file instead (previews / tests).
const VERIFIED_API = process.env.BOOKISH_VERIFIED_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-verified";
async function loadVerified() {
  if (process.env.BOOKISH_VERIFIED_FILE) return JSON.parse(fs.readFileSync(process.env.BOOKISH_VERIFIED_FILE, "utf8")).clubs ?? [];
  try {
    const r = await fetch(VERIFIED_API, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (!r.ok || !j.ok || !Array.isArray(j.clubs)) throw new Error(`HTTP ${r.status}`);
    return j.clubs;
  } catch (e) {
    // In CI a failed fetch fails the build, so the live site keeps its last
    // good deploy instead of silently demoting verified clubs.
    if (process.env.CI) throw new Error(`verified clubs fetch failed: ${e.message}`);
    console.warn(`verified clubs fetch failed (${e.message}); building with none verified`);
    return [];
  }
}
const verifiedList = await loadVerified();
const places = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ref/places.json"), "utf8"));
{
  const byId = new Map(verifiedList.map((v) => [v.id, v]));
  // A host who turned off "List my club in <city>" is not shown anywhere.
  for (let i = clubs.length - 1; i >= 0; i--) {
    const v = byId.get(clubs[i].id);
    if (v && v.listed === false) clubs.splice(i, 1); else clubs[i].verified = !!v;
  }
  // Clubs started on Bookish: city-level facts only.
  for (const v of verifiedList) {
    if (v.kind !== "start" || !v.listed || !v.name || !v.city || !v.state) continue;
    const key = `${v.state}|${v.city.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f']/g, "").replace(/\s+/g, " ").trim()}`;
    const geo = places[key];
    clubs.push({
      id: v.id, name: v.name, city: geo?.[2] ?? v.city, state: v.state,
      genres: v.genre && GENRES[v.genre] ? [v.genre] : [], vibe: null, cadence: v.cadence ?? null,
      format: ["in-person", "online", "hybrid"].includes(v.format) ? v.format : null,
      host_type: "community", source: "bookish", source_name: null, source_url: null, last_seen: TODAY,
      lat: geo?.[0] ?? null, lng: geo?.[1] ?? null, verified: true,
    });
  }
}
const verifiedTotal = clubs.filter((c) => c.verified).length;

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fmt = (n) => n.toLocaleString("en-US");
const plural = (n, w, p = w + "s") => `${fmt(n)} ${n === 1 ? w : p}`;
const url = (p) => `${BASE}${p}`;
const abs = (p) => `${SITE_URL}${p}`;
const monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
const niceDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const miles = (a, b, c, d) => {
  const R = 3958.8, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const stateSlug = (st) => slug(STATE_NAMES[st] ?? st);

fs.rmSync(OUT, { recursive: true, force: true }); // stale pages must never linger

function write(rel, html) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// ---------- index the data ----------
const cityMap = new Map();
for (const c of clubs) {
  const k = `${c.city}|${c.state}`;
  if (!cityMap.has(k)) cityMap.set(k, { name: c.city, st: c.state, u: `${slug(c.city)}-${c.state.toLowerCase()}`, clubs: [], lat: c.lat, lng: c.lng });
  const city = cityMap.get(k);
  city.clubs.push(c);
  if (city.lat == null && c.lat != null) { city.lat = c.lat; city.lng = c.lng; }
}
const cities = [...cityMap.values()];
for (const city of cities) {
  city.genres = {};
  for (const c of city.clubs) for (const g of c.genres) city.genres[g] = (city.genres[g] ?? 0) + 1;
  city.genrePages = Object.entries(city.genres).filter(([, n]) => n >= 3).map(([g]) => g);
  city.v = city.clubs.filter((c) => c.verified).length;
  city.vg = {};
  for (const c of city.clubs) if (c.verified) for (const g of c.genres) city.vg[g] = (city.vg[g] ?? 0) + 1;
  city.clubs.sort((a, b) => (b.verified - a.verified) || (b.genres.length + (b.cadence ? 1 : 0)) - (a.genres.length + (a.cadence ? 1 : 0)) || a.name.localeCompare(b.name));
}
cities.sort((a, b) => b.clubs.length - a.clubs.length || a.name.localeCompare(b.name));
const byState = new Map();
for (const city of cities) { if (!byState.has(city.st)) byState.set(city.st, []); byState.get(city.st).push(city); }
const states = [...byState.keys()].sort((a, b) => (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b));
const genreTotals = {};
for (const c of clubs) for (const g of c.genres) genreTotals[g] = (genreTotals[g] ?? 0) + 1;
const nearbyCities = (city, max = 40) => city.lat == null ? [] : cities
  .filter((o) => o !== city && o.lat != null)
  .map((o) => ({ o, d: miles(city.lat, city.lng, o.lat, o.lng) }))
  .filter((x) => x.d <= max).sort((a, b) => a.d - b.d);

const sitemap = [];
const page = (p, prio = 0.6) => sitemap.push({ loc: abs(p), prio });

// ---------- layout ----------
// R2-04 "ish reply" wordmark, Oxblood recolour (scripts/wordmark.mjs). Fixed box, so no layout shift.
const WORDMARK = (eager) => `<img src="${url("/img/wordmark-160.webp")}" srcset="${url("/img/wordmark-160.webp")} 1x, ${url("/img/wordmark-320.webp")} 2x, ${url("/img/wordmark-480.webp")} 3x" width="160" height="62" alt="Bookish"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
const CSS = (fs.readFileSync(path.join(ROOT, "src/theme.css"), "utf8") + fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8")).replaceAll("__BASE__", BASE).replace(/\n\s*/g, "\n");

function layout({ title, desc, path: p, body, jsonld = [], noindex = false }) {
  const canonical = abs(p);
  return `<!doctype html>
<html lang="en" data-base="${BASE}" data-api="${API}" data-join-api="${JOIN_API}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="theme-color" content="#4a1420">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bookish: Book Club Night">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${url("/favicon.svg")}" type="image/svg+xml">
<link rel="preload" href="${url("/fonts/manrope-400_800.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${url("/fonts/unbounded-400_900.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${url("/fonts/youngserif-400.woff2")}" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="mast"><div class="wrap">
<a class="wordmark" href="${url("/")}">${WORDMARK(true)}</a>
<nav class="nav" aria-label="Main"><a class="hide-sm" href="${url("/book-clubs/")}">Browse</a><a class="hide-sm" href="${url("/hosts/")}">For hosts</a><a class="hide-sm" href="${url("/resources/")}">Resources</a><a class="btn-sm" href="${url("/start/")}">Start a club</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot-site"><div class="wrap cols">
<div><a class="wordmark" href="${url("/")}">${WORDMARK(false)}</a>
<p>A directory of real book clubs that meet near you, gathered from the public pages of libraries and bookstores. Every listing links to its source. Details change, so check there before you go.</p></div>
<div><p class="h">Find</p><ul><li><a href="${url("/book-clubs/")}">All cities</a></li>${["romance", "mystery-thriller", "fantasy", "nonfiction"].filter((g) => genreTotals[g] >= 5).map((g) => `<li><a href="${url(`/genres/${g}/`)}">${GENRES[g]} clubs</a></li>`).join("")}</ul></div>
<div><p class="h">Hosts</p><ul><li><a href="${url("/start/")}">Start a club</a></li><li><a href="${url("/claim/")}">Claim your club</a></li><li><a href="${url("/hosts/")}">Host tools</a></li><li><a href="${url("/resources/")}">Resources</a></li><li><a href="${url("/about/")}">About &amp; sources</a></li><li><a href="${url("/privacy/")}">Privacy</a> · <a href="${url("/terms/")}">Terms</a></li></ul></div>
</div></footer>
<script src="${url("/site.js")}" defer></script>
${body.includes('id="club-map"') ? `<script src="${url("/map.js")}" defer></script>` : ""}
</body>
</html>`;
}

const lunair = (name, h1x, w1x, h2x, w2x, alt, cls = "", eager = false) =>
  `<img class="lunair ${cls}" src="${url(`/img/${name}-${h1x}.webp`)}" srcset="${url(`/img/${name}-${h1x}.webp`)} 1x, ${url(`/img/${name}-${h2x}.webp`)} 2x" width="${w1x}" height="${h1x}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([label, href]) => href ? `<a href="${url(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`).join(" &rsaquo; ")}</nav>`;
const crumbsLd = (items) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, ...(href ? { item: abs(href) } : {}) })),
});

const ARROW = `<svg aria-hidden="true" viewBox="0 0 18 12" width="15" height="10"><path d="M1 6h15M11 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const prop = (name, w, h, cls, eager = false) => `<img class="${cls}" src="${url(`/img/${name}`)}" width="${w}" height="${h}" alt=""${eager ? "" : ' loading="lazy"'} decoding="async">`;
const GENRE_OPTIONS = (sel = "") => `<option value="">Any genre</option>${GENRES_LIST.filter(([g]) => genreTotals[g]).map(([g, l]) => `<option value="${g}"${g === sel ? " selected" : ""}>${l}</option>`).join("")}`;
const searchBox = (sel = "", placeholder = "Sacramento, or a ZIP code", extra = "") => `
<form id="search" class="search" role="search" action="${url("/")}" autocomplete="off">
  <div class="field loc"><label for="q">City or ZIP</label><input id="q" name="q" type="search" placeholder="${esc(placeholder)}" inputmode="search" aria-autocomplete="list" aria-controls="suggest"></div>
  <div class="field"><label for="genre">Genre</label><select id="genre" name="genre">${GENRE_OPTIONS(sel)}</select></div>
  <button class="btn" type="submit">Find clubs ${ARROW}</button>${extra}
  <ul id="suggest" class="suggest" hidden role="listbox"></ul>
</form>
<div id="results" class="results" aria-live="polite"></div>`;

// Shared "On Bookish · 1" count text for tiles, map and eyebrows.
const countLine = (n, v) => `${plural(n, "club")}${v ? ` · ${fmt(v)} on Bookish` : ""}`;
const KIND = { library: "Library book club", bookstore: "Bookstore book club" };
const SRC_KIND = { library: "a public library calendar", bookstore: "a bookstore's event calendar" };

function clubCard(c, { hidden = false } = {}) {
  // City-level only: never a venue, branch, neighborhood or address. For
  // unclaimed clubs the outbound source link is the only path to the venue.
  const kind = KIND[c.host_type] ?? "Community book club";
  const where = `${kind} · ${c.city}, ${c.state}`;
  const tags = [
    ...c.genres.map((g) => `<span class="tag g">${esc(GENRES[g])}</span>`),
    c.cadence ? `<span class="tag">${esc(c.cadence)}</span>` : "",
    c.format && c.format !== "in-person" ? `<span class="tag">${c.format === "online" ? "Online" : "In person &amp; online"}</span>` : "",
  ].join("");
  const q = `club_id=${encodeURIComponent(c.id)}&club_name=${encodeURIComponent(c.name)}&club_city=${encodeURIComponent(`${c.city}, ${c.state}`)}`;
  const head = `<h3>${esc(c.name)}</h3>
<p class="where">${esc(where)}</p>
${tags ? `<div class="meta">${tags}</div>` : ""}
${c.vibe ? `<p class="vibe">${esc(c.vibe)}</p>` : ""}`;
  if (c.verified) {
    return `<li class="club on" id="${esc(c.id)}" data-g="${c.genres.join(" ")}" data-v="1"${hidden ? " hidden" : ""}>
<span class="badge on">On Bookish</span>
${head}
<div class="foot"><span>The host runs this club on Bookish and says yes or no to each request. Time and place are shared once you're in.</span><span class="acts"><a class="join" href="${url(`/join/?${q}`)}" rel="nofollow">Request to join</a></span></div>
</li>`;
  }
  return `<li class="club off" id="${esc(c.id)}" data-g="${c.genres.join(" ")}" data-v="0"${hidden ? " hidden" : ""}>
<span class="badge off">Not on Bookish yet</span>
${head}
<div class="foot"><span>Listed from ${SRC_KIND[c.host_type] ?? "a public event calendar"}, seen ${niceDate(c.last_seen)}.</span><span class="acts"><a class="out" href="${esc(c.source_url)}" rel="nofollow noopener" target="_blank">See where it meets&nbsp;↗<span class="sr-only"> (opens the source page)</span></a><a href="${url(`/claim/?${q}`)}" rel="nofollow">Run this club? Claim it</a></span></div>
</li>`;
}

// The segmented toggle at the top of every club list: "On Bookish" vs
// "Listed from public calendars". Defaults to verified when any exist.
// Server-rendered in its default state (works without JS); site.js flips it.
const segMode = (v) => (v > 0 ? "on" : "listed");
function segToggle({ v, u, where, scope = "clubs", none = "" }) {
  const mode = segMode(v);
  const noneTxt = none || `No host has claimed a club${where ? ` in ${esc(where)}` : " here"} yet.`;
  const claimHref = url("/claim/");
  return `<div class="seg-wrap" data-seg-scope="${scope}" data-mode="${mode}">
<div class="seg" role="group" aria-label="Which clubs to show">
<button type="button" class="seg-b" data-mode="on" aria-pressed="${mode === "on"}"><span class="seg-l">On Bookish</span> <span class="c" data-count="on">${fmt(v)}</span></button>
<button type="button" class="seg-b" data-mode="listed" aria-pressed="${mode === "listed"}"><span class="seg-l">Listed from public calendars</span> <span class="c" data-count="listed">${fmt(u)}</span></button>
</div>
<p class="seg-note" data-note="on"${mode === "on" ? "" : " hidden"}>${v ? `Hosts run these clubs on Bookish. Request to join and the host says yes or no.` : `${noneTxt.replace(/\.$/, "")}, so there's nobody on Bookish to ask. <a href="${url("/start/")}">Start one</a> or <a href="${claimHref}">claim yours</a>.`}</p>
<p class="seg-note" data-note="listed"${mode === "listed" ? "" : " hidden"}>${v ? "" : `<b>${noneTxt}</b> `}These come from public library and bookstore calendars. They're not on Bookish, so you can't request to join. Tap "See where it meets" for the time and place.</p>
</div>`;
}

// schema.org: only verified clubs carry a JoinAction. Unclaimed clubs are
// described as listings from a public calendar, pointing at that source.
const clubsLd = (list, name) => ({
  "@context": "https://schema.org", "@type": "ItemList", name, numberOfItems: list.length,
  itemListElement: list.slice(0, 100).map((c, i) => ({
    "@type": "ListItem", position: i + 1,
    item: {
      "@type": "Organization", name: c.name,
      ...(c.verified
        ? { url: abs(`/book-clubs/${slug(c.city)}-${c.state.toLowerCase()}/#${c.id}`), description: "On Bookish: the host approves requests to join.",
            potentialAction: { "@type": "JoinAction", target: abs(`/join/?club_id=${encodeURIComponent(c.id)}`) } }
        : { sameAs: c.source_url, description: `Listed from ${SRC_KIND[c.host_type] ?? "a public event calendar"}. Not on Bookish; see the source page for time and place.` }),
      ...(c.genres.length ? { knowsAbout: c.genres.map((g) => GENRES[g]) } : {}),
      address: { "@type": "PostalAddress", addressLocality: c.city, addressRegion: c.state, addressCountry: "US" },
    },
  })),
});

const hostCallout = (where) => `<section><div class="wrap"><div class="callout-card">${lunair("lunair-reading", 200, 201, 400, 402, "", "cameo")}
<div><h2>Hosting a club${where ? ` in ${esc(where)}` : ""}?</h2><p>List it for free so readers nearby can find you. Takes two minutes, no account needed.</p></div>
<a class="btn" href="${url("/start/")}">Add your club ${ARROW}</a></div></div></section>`;

function summarize(list) {
  const lib = list.filter((c) => c.host_type === "library").length;
  const store = list.filter((c) => c.host_type === "bookstore").length;
  const monthly = list.filter((c) => /month/i.test(c.cadence ?? "")).length;
  const parts = [];
  if (lib) parts.push(lib === 1 ? "1 club at a public library branch" : `${fmt(lib)} clubs at public library branches`);
  if (store) parts.push(store === 1 ? "1 club at a bookstore" : `${fmt(store)} clubs at bookstores`);
  const other = list.length - lib - store;
  if (other) parts.push(`${plural(other, "community club")}`);
  let s = parts.length ? `${parts.join(", ")}.` : "";
  if (monthly) s += list.length === 1 ? " It meets monthly." : monthly === list.length ? " All of them meet monthly." : ` ${fmt(monthly)} meet${monthly === 1 ? "s" : ""} monthly.`;
  return s.trim();
}

// ---------- city pages ----------
// A secondary list ("More clubs nearby", "Other clubs in X") follows the
// page's toggle; the whole section hides when it has nothing in that mode.
const secList = (list, mode, head) => {
  if (!list.length) return "";
  const shown = list.filter((c) => c.verified === (mode === "on")).length;
  return `<section class="seg-sec"${shown ? "" : " hidden"}><hr class="rule">${head}<ul class="clubs">${list.map((c) => clubCard(c, { hidden: c.verified !== (mode === "on") })).join("\n")}</ul></section>`;
};
const mainList = (list, mode) => `<ul class="clubs" id="club-list">${list.map((c) => clubCard(c, { hidden: c.verified !== (mode === "on") })).join("\n")}</ul>`;
// Hide the on-Bookish count on the home card until it is big enough not to read as empty (Sebastian 10-14).
const SHOW_VERIFIED_MIN = 20;
const modeEmpty = (where) => `<div class="empty seg-empty" data-empty="on" hidden><p>No clubs${where ? ` in ${esc(where)}` : " here"} are on Bookish yet. <a href="${url("/start/")}">Start one</a>, or see the clubs listed from public calendars.</p></div>
<div class="empty seg-empty" data-empty="listed" hidden><p>Every club${where ? ` in ${esc(where)}` : " here"} is on Bookish. Nice.</p></div>`;
const verifiedLede = (v, n) => v
  ? ` ${v === n ? (n === 1 ? "It's" : "All of them are") : `${fmt(v)} ${v === 1 ? "is" : "are"}`} on Bookish, so you can request to join and the host replies.${v < n ? ` The other ${fmt(n - v)} ${n - v === 1 ? "is" : "are"} listed from public calendars. Check the source page for the time and place.` : ""}`
  : ` None of them is on Bookish yet. They're listed from public library and bookstore calendars, so check the source page for the time and place.`;

for (const city of cities) {
  const label = `${city.name}, ${city.st}`;
  const p = `/book-clubs/${city.u}/`;
  const n = city.clubs.length, v = city.v, mode = segMode(v);
  const near = nearbyCities(city);
  const topGenres = Object.entries(city.genres).sort((a, b) => b[1] - a[1]);
  const nearClubs = n < 8 ? near.flatMap(({ o }) => [...o.clubs.filter((c) => c.verified).slice(0, 2), ...o.clubs.filter((c) => !c.verified).slice(0, 3)]).slice(0, 8 - Math.min(n, 4)) : [];
  const genreText = topGenres.length ? ` Genres include ${topGenres.slice(0, 4).map(([g, k]) => `${lc(g)} (${k})`).join(", ")}.` : "";
  const cr = [["Book clubs", "/book-clubs/"], [STATE_NAMES[city.st] ?? city.st, `/book-clubs/${stateSlug(city.st)}/`], [city.name, null]];
  const inMode = city.clubs.filter((c) => c.verified === (mode === "on"));
  const chipCount = (g) => inMode.filter((c) => !g || c.genres.includes(g)).length;
  const body = `<div class="wrap">${crumbs(cr)}
<header class="page-head"><p class="eyebrow">${countLine(n, v)} · updated ${monthYear}</p>
<h1>Book clubs in <em>${esc(city.name)}</em>,&nbsp;${city.st}</h1>
<p class="lede">${summarize(city.clubs)}${genreText}${verifiedLede(v, n)}</p>
</header>
<div id="club-map" class="club-map city" data-city="${city.u}" role="region" aria-label="Map of book clubs in ${esc(city.name)}"><p class="map-hint">Loading the club map…</p></div>
${segToggle({ v, u: n - v, where: city.name })}
</div>
${topGenres.length ? `<div class="filterbar"><div class="wrap"><div id="filter" class="chips" role="toolbar" aria-label="Filter by genre"><button class="chip" type="button" data-g="" aria-pressed="true">All <span class="c">${chipCount("")}</span></button>${topGenres.map(([g]) => `<button class="chip" type="button" data-g="${g}" aria-pressed="false"${chipCount(g) ? "" : " data-empty-mode"}>${esc(GENRES[g])} <span class="c">${chipCount(g)}</span></button>`).join("")}</div></div></div>` : `<div style="height:20px"></div>`}
<div class="wrap">
<h2 class="sr-only">Clubs in ${esc(city.name)}</h2>
${mainList(city.clubs, mode)}
${modeEmpty(city.name)}
<div id="filter-empty" class="empty" hidden>${lunair("lunair-peek", 130, 215, 260, 421, "", "peek")}<p>No clubs in that genre here yet. <a href="${url("/start/")}">Start the first one</a> and we'll send readers your way.</p></div>
${secList(nearClubs, mode, `<h2>More clubs <em>nearby</em></h2><p class="lede">A short drive from ${esc(city.name)}.</p>`)}
${city.genrePages.length ? `<hr class="rule"><h2>By genre in ${esc(city.name)}</h2><ul class="chips">${city.genrePages.map((g) => `<li><a class="chip" href="${url(`${p}${g}/`)}">${esc(GENRES[g])} book clubs in ${esc(city.name)}</a></li>`).join("")}</ul>` : ""}
${near.length ? `<hr class="rule"><h2>Nearby cities</h2><div class="grid cols-3">${near.slice(0, 9).map(({ o, d }) => `<a class="city-tile" href="${url(`/book-clubs/${o.u}/`)}"><b>${esc(o.name)}, ${o.st}</b><span>${countLine(o.clubs.length, o.v)} · ${Math.round(d)} mi</span></a>`).join("")}</div>` : ""}
</div>
${hostCallout(city.name)}`;
  write(`book-clubs/${city.u}/index.html`, layout({
    title: `Book Clubs in ${label}: ${plural(n, "club")}${v ? `, ${fmt(v)} on Bookish` : ""} (${monthYear}) | Bookish`,
    desc: `Find ${plural(n, "book club")} in ${label}${topGenres.length ? `, including ${topGenres.slice(0, 3).map(([g]) => lc(g)).join(", ")} clubs` : ""}.${v ? ` ${fmt(v)} on Bookish to request to join;` : ""} library and bookstore clubs link to their own pages for time and place.`,
    path: p, body, jsonld: [crumbsLd(cr), clubsLd(city.clubs, `Book clubs in ${label}`)],
  }));
  page(p, n >= 10 ? 0.8 : 0.6);

  for (const g of city.genrePages) {
    const list = city.clubs.filter((c) => c.genres.includes(g));
    const gv = list.filter((c) => c.verified).length, gmode = segMode(gv);
    const gp = `${p}${g}/`;
    const others = [...city.clubs.filter((c) => !c.genres.includes(g) && c.verified).slice(0, 4), ...city.clubs.filter((c) => !c.genres.includes(g) && !c.verified).slice(0, 4)];
    const gcr = [...cr.slice(0, 2), [city.name, p], [GENRES[g], null]];
    const gbody = `<div class="wrap">${crumbs(gcr)}
<header class="page-head"><p class="eyebrow">${countLine(list.length, gv)} · updated ${monthYear}</p>
<h1>${esc(GENRES[g])} book clubs in <em>${esc(city.name)}</em></h1>
<p class="lede">${plural(list.length, `${lc(g)} book club`)} meet in ${esc(label)}. ${summarize(list)}${verifiedLede(gv, list.length)}</p>
<a class="chip" href="${url(p)}">See all ${n} clubs in ${esc(city.name)} →</a>
</header>
${segToggle({ v: gv, u: list.length - gv, where: city.name })}
<h2 class="sr-only">${esc(GENRES[g])} book clubs</h2>
${mainList(list, gmode)}
${modeEmpty(city.name)}
${secList(others, gmode, `<h2>Other clubs in ${esc(city.name)}</h2>`)}
</div>${hostCallout(city.name)}`;
    write(`book-clubs/${city.u}/${g}/index.html`, layout({
      title: `${GENRES[g]} Book Clubs in ${label} (${monthYear}) | Bookish`,
      desc: `${plural(list.length, `${lc(g)} book club`)} in ${label}${gv ? `, ${fmt(gv)} on Bookish` : ""}, with how often they meet and where to find the details.`,
      path: gp, body: gbody, jsonld: [crumbsLd(gcr), clubsLd(list, `${GENRES[g]} book clubs in ${label}`)],
    }));
    page(gp, 0.7);
  }
}

// ---------- state pages + index ----------
for (const st of states) {
  const list = byState.get(st);
  const total = list.reduce((s, c) => s + c.clubs.length, 0);
  const name = STATE_NAMES[st] ?? st;
  const p = `/book-clubs/${stateSlug(st)}/`;
  const cr = [["Book clubs", "/book-clubs/"], [name, null]];
  const body = `<div class="wrap">${crumbs(cr)}
<header class="page-head"><p class="eyebrow">${plural(total, "club")} in ${plural(list.length, "city", "cities")}</p>
<h1>Book clubs in <em>${esc(name)}</em></h1><p class="lede">Choose a city to see its clubs, when they meet and where.</p></header>
<section style="padding-top:28px"><div class="grid cols-3">${list.map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/`)}"><b>${esc(c.name)}</b><span>${countLine(c.clubs.length, c.v)}</span></a>`).join("")}</div></section></div>${hostCallout(name)}`;
  write(`book-clubs/${stateSlug(st)}/index.html`, layout({
    title: `Book Clubs in ${name}: ${plural(total, "club")} in ${plural(list.length, "city", "cities")} | Bookish`,
    desc: `Browse ${plural(total, "book club")} across ${plural(list.length, "city", "cities")} in ${name}. Library and bookstore clubs with meeting details.`,
    path: p, body, jsonld: [crumbsLd(cr)],
  }));
  page(p, 0.7);
}
{
  const cr = [["Book clubs", null]];
  const body = `<div class="wrap">${crumbs(cr)}
<header class="page-head"><p class="eyebrow">${plural(clubs.length, "club")} · ${plural(cities.length, "city", "cities")}</p>
<h1>Book clubs <em>by state</em></h1><p class="lede">Every club we list, sorted by where it meets.</p>${searchBox()}</header>
<section><h2>Biggest club cities</h2><div class="grid cols-3">${cities.slice(0, 30).map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/`)}"><b>${esc(c.name)}, ${c.st}</b><span>${countLine(c.clubs.length, c.v)}</span></a>`).join("")}</div></section>
<section><h2>All states</h2><div class="states">${states.map((st) => `<div><a href="${url(`/book-clubs/${stateSlug(st)}/`)}">${esc(STATE_NAMES[st] ?? st)}</a> <span class="muted">${byState.get(st).reduce((s, c) => s + c.clubs.length, 0)}</span></div>`).join("")}</div></section></div>`;
  write("book-clubs/index.html", layout({ title: "Book Clubs Near You, by State and City | Bookish", desc: `Browse ${plural(clubs.length, "book club")} in ${plural(cities.length, "US city", "US cities")}, by state and city.`, path: "/book-clubs/", body, jsonld: [crumbsLd(cr)] }));
  page("/book-clubs/", 0.9);
}

// ---------- national genre hubs ----------
for (const [g, label] of GENRES_LIST) {
  const total = genreTotals[g] ?? 0;
  if (total < 5) continue;
  const gc = cities.filter((c) => c.genres[g]).sort((a, b) => (b.vg[g] ?? 0) - (a.vg[g] ?? 0) || b.genres[g] - a.genres[g]);
  const gvTotal = gc.reduce((s, c) => s + (c.vg[g] ?? 0), 0), mode = segMode(gvTotal);
  const sampleOn = clubs.filter((c) => c.verified && c.genres.includes(g)).slice(0, 6);
  const sampleOff = gc.slice(0, 6).flatMap((c) => c.clubs.filter((x) => !x.verified && x.genres.includes(g)).slice(0, 1));
  const sample = [...sampleOn, ...sampleOff];
  const p = `/genres/${g}/`;
  const cr = [["Book clubs", "/book-clubs/"], [label, null]];
  const tile = (c) => {
    const n = c.genres[g], v = c.vg[g] ?? 0, base = `/book-clubs/${c.u}/${c.genrePages.includes(g) ? g + "/" : ""}`;
    const hidden = mode === "on" ? !v : !(n - v);
    return `<a class="city-tile" data-n="${n}" data-v="${v}" data-href="${url(base)}" href="${url(base)}${c.genrePages.includes(g) ? "" : "#" + g}"${hidden ? " hidden" : ""}><b>${esc(c.name)}, ${c.st}</b><span>${countLine(n, v)}</span></a>`;
  };
  const body = `<div class="wrap">${crumbs(cr)}
<header class="page-head"><p class="eyebrow">${countLine(total, gvTotal)} in ${plural(gc.length, "city", "cities")}</p>
<h1>${esc(label)} <em>book clubs</em> near you</h1><p class="lede">Find a ${esc(lc(g))} book club that meets in your city.</p>${searchBox(g)}</header>
${segToggle({ v: gvTotal, u: total - gvTotal, where: "", scope: "genre", none: `No host has claimed a ${esc(lc(g))} club yet.` })}
<section style="padding-top:18px"><h2>Cities with ${esc(lc(g))} clubs</h2><div class="grid cols-3" data-seg-tiles>${gc.slice(0, 60).map(tile).join("")}</div></section>
<section style="padding-top:0"><h2>A few to start with</h2>${mainList(sample, mode)}${modeEmpty("")}</section></div>${hostCallout()}`;
  write(`genres/${g}/index.html`, layout({ title: `${label} Book Clubs Near You (${monthYear}) | Bookish`, desc: `${plural(total, `${lc(g)} book club`)} across ${plural(gc.length, "US city", "US cities")}${gvTotal ? `, ${fmt(gvTotal)} on Bookish` : ""}. Find one that meets near you.`, path: p, body, jsonld: [crumbsLd(cr), clubsLd(sample, `${label} book clubs`)] }));
  page(p, 0.8);
}

// ---------- home ----------
{
  const featured = [...clubs.filter((c) => c.verified).slice(0, 3), ...cities.slice(0, 12).map((c) => c.clubs.find((x) => !x.verified && x.genres.length && x.cadence) ?? c.clubs.find((x) => !x.verified)).filter(Boolean)].slice(0, 6);
  const genreChips = GENRES_LIST.filter(([g]) => (genreTotals[g] ?? 0) >= 5);
  const topCities = cities.slice(0, 6);
  const cityChips = `<ul class="chips" aria-label="Popular cities">${topCities.map((c) => `<li><a class="chip" href="${url(`/book-clubs/${c.u}/`)}">${esc(c.name)}</a></li>`).join("")}</ul>`;
  const body = `<section class="lander"><div class="wrap">
<div class="l-sheet"><p class="l-tag">Bookish: book club night</p>
<div class="hsheet"><h1>Find a club, make it more <span class="fun">fun.<svg aria-hidden="true" viewBox="0 0 226 20" preserveAspectRatio="none"><path d="M4 12C50 5 100 16 150 9s55 2 72 1" fill="none" stroke="#f4a6bf" stroke-width="6" stroke-linecap="round"/></svg></span></h1>
<p class="sub">Real book clubs at libraries, bookstores and cafés near you. Ask to join one, or bring Bookish to the club you already have.</p></div>
${prop("prop-sun-240.webp", 240, 243, "l-sun", true)}</div>
<div class="l-art">${lunair("lunair-hug", 300, 252, 600, 503, "Lunair, the Bookish host, hugging a book", "", true)}<p class="bubble">Pull up a chair. I saved you a seat!</p>${prop("prop-daisy-240.webp", 240, 243, "daisy", true)}</div>
<div class="l-search">${prop("prop-washi3-240.webp", 240, 151, "washi", true)}${searchBox("", "Sacramento, or a ZIP code", cityChips)}</div>
<div class="l-count"><div class="libcard"><p class="lc-h"><span>The directory</span><span>Updated ${monthYear}</span></p><p class="hero-count"><b>${fmt(clubs.length)}</b> clubs in <b>${fmt(cities.length)}</b> cities${verifiedTotal >= SHOW_VERIFIED_MIN ? `, <b>${fmt(verifiedTotal)}</b> on Bookish. The rest are listed from ${fmt(new Set(clubs.filter((c) => !c.verified).map((c) => c.source_name ?? c.source)).size)} library and bookstore calendars.` : `, gathered from ${fmt(new Set(clubs.filter((c) => !c.verified).map((c) => c.source_name ?? c.source)).size)} library and bookstore calendars.`}</p></div></div>
<div class="l-own"><a class="startown" href="${url("/start/")}">No club nearby? <b>Start your own</b> ${ARROW}</a></div>
</div></section>
<section><div class="wrap">
<div class="sh"><h2>A few clubs <em>to start with</em></h2></div>
<p class="lede">Picked from around the country. Clubs marked "On Bookish" take requests to join. The rest link to the library or bookstore page they were listed on.</p>
<ul class="clubs lander-clubs">${featured.map((c) => clubCard(c)).join("\n")}</ul>
</div></section>
<section><div class="wrap">
<div class="sh"><h2>How it works <em>three things</em></h2></div>
<div class="steps">
<div class="step">${prop("prop-washi2-240.webp", 240, 144, "wt")}${prop("prop-daisy-240.webp", 240, 243, "")}<h3>Search your city</h3><p>Type a city or ZIP. See the clubs that meet nearby and how often.</p></div>
<div class="step">${prop("prop-sun-240.webp", 240, 243, "")}<h3>On Bookish? Ask to join</h3><p>Clubs marked "On Bookish" have a host here. Send a note and they'll say yes or no.</p></div>
<div class="step">${prop("prop-washi3-240.webp", 240, 151, "wt")}${prop("prop-daisy-240.webp", 240, 243, "")}<h3>From a calendar? Just go</h3><p>Library and bookstore clubs link to their own page for the date, time and book.</p></div>
</div></div></section>
<section><div class="wrap">
<div class="sh"><h2>The map <em>city by city</em></h2></div>
<p class="lede">Every city with book clubs, and how many are on Bookish. Tap a city to see its clubs.</p>
<div id="club-map" class="club-map" role="region" aria-label="Map of book clubs"><p class="map-hint">Loading the club map…</p></div>
<p class="small">The map shows cities, never addresses. Exact place and time are shared only with members a host approves.</p>
</div></section>
<section style="padding-top:0"><div class="wrap">
<p class="eyebrow">Browse by genre</p>
<ul class="chips">${genreChips.map(([g, l]) => `<li><a class="chip" href="${url(`/genres/${g}/`)}">${esc(l)} <span class="c">${fmt(genreTotals[g])}</span></a></li>`).join("")}</ul>
</div></section>
<section style="padding-top:0"><div class="wrap">
<div class="sh"><h2>Where readers <em>are meeting</em></h2></div>
<div class="grid cols-3 home-cities">${cities.slice(0, 18).map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/`)}"><b>${esc(c.name)}, ${c.st}</b><span>${countLine(c.clubs.length, c.v)}</span></a>`).join("")}</div>
<p style="margin-top:18px"><a href="${url("/book-clubs/")}">See every city →</a></p>
</div></section>
<section><div class="wrap"><div class="own-wrap">${lunair("lunair-gossip", 220, 209, 440, 417, "Lunair whispering behind her hand")}
<div class="own"><h2>No club nearby? Start your own.</h2><p>Pick a book, pick a night. List it free and readers nearby can find you.</p><a class="btn" href="${url("/start/")}">Start a club ${ARROW}</a></div></div></div></section>
<section style="padding-top:0"><div class="wrap"><div class="note">Run a club already? <a href="${url("/claim/")}">Claim your listing</a> to fix the details, or <a href="${url("/hosts/")}">join the waitlist</a> for simple host tools: scheduling, book voting and invite links.</div></div></section>`;
  write("index.html", layout({
    title: "Bookish: Book Club Night | Find a club, make it more fun",
    desc: `Find a club, make it more fun. ${fmt(clubs.length)} library, bookstore and community book clubs in ${fmt(cities.length)} US cities, searchable by city, ZIP and genre. Free for hosts.`,
    path: "/", body,
    jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", name: "Bookish: Book Club Night", alternateName: "Bookish", url: abs("/"),
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${abs("/")}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
      { "@context": "https://schema.org", "@type": "Organization", name: "Bookish", url: abs("/") }],
  }));
  page("/", 1.0);
}

// ---------- host funnel ----------
const consent = `<label class="check"><input type="checkbox" name="consent" required> <span>Email me about this. You can unsubscribe any time; see our <a href="${url("/privacy/")}">privacy note</a>.</span></label>`;
const hp = `<div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>`;
const stateOptions = Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
const genreSelect = `<option value="">Mixed / anything goes</option>${GENRES_LIST.map(([g, l]) => `<option value="${g}">${l}</option>`).join("")}`;

write("claim/index.html", layout({
  title: "Claim Your Book Club Listing | Bookish", desc: "Run one of the clubs on Bookish? Claim the listing to correct details and hear about host tools first.", path: "/claim/", noindex: true,
  body: `<div class="wrap">${crumbs([["Home", "/"], ["Claim your club", null]])}
<header class="page-head"><p class="eyebrow">For hosts</p><h1>Is this <em>your</em> club?</h1>
<p class="lede">We list clubs from public library and bookstore pages. If you host or organize one, tell us and we'll verify it with you by email. You'll be able to fix the details and you'll hear first when host tools open.</p></header>
<section><form class="form" data-kind="claim" novalidate>
<input type="hidden" name="club_id">
<div class="row two"><label>Club name<input name="club_name" required maxlength="160"></label><label>City<input name="club_city" maxlength="80" placeholder="Austin, TX"></label></div>
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>Your role<select name="role"><option>I host it</option><option>I co-host it</option><option>I'm staff at the venue</option><option>I'm a member</option></select></label></div>
<label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
<fieldset class="mapq"><legend>Where does the club meet?</legend>
<label class="check"><input type="radio" name="meets_at" value="public" checked> A public place (library, bookstore, café)</label>
<label class="check"><input type="radio" name="meets_at" value="home"> Someone's home</label>
<label class="check"><input type="radio" name="meets_at" value="online"> Online</label>
<label class="check toggle"><input type="checkbox" name="show_on_map" checked> <span><b>List my club in <span class="list-city">my city</span>.</b> <span class="map-note">Readers see the club and your city, never the address. Exact place and time are only shared with members you approve.</span></span></label>
</fieldset>
<label>Anything we should change? <span class="muted">(optional)</span><textarea name="message" maxlength="1000" placeholder="New meeting day, a different venue, what you're reading…"></textarea></label>
${hp}${consent}
<button class="btn" type="submit">Claim this club</button>
<p class="form-msg" role="status"></p>
</form></section></div>`,
}));

write("start/index.html", layout({
  title: "Start a Book Club or List Yours Free | Bookish", desc: "Add your book club to Bookish for free so readers nearby can find it, or start a new one in your city.", path: "/start/",
  body: `<div class="wrap">${crumbs([["Home", "/"], ["Start a club", null]])}
<header class="page-head with-art">${lunair("lunair-wave", 360, 153, 720, 301, "Bookish host waving hello", "head-art", true)}<p class="eyebrow">Free for hosts</p><h1>Start a book club, or <em>list yours</em>.</h1>
<p class="lede">Tell us about your club and we'll add it to the directory once we've confirmed your email. Starting from scratch? Tell us the city and the kind of books, and we'll let readers nearby know.</p></header>
<section><form class="form" data-kind="start" novalidate>
<label>Club name<input name="club_name" required maxlength="160" placeholder="The Tuesday Night Mystery Society"></label>
<div class="row two"><label>City<input name="city" required maxlength="80" autocomplete="address-level2"></label><label>State<select name="state" required><option value="">Choose…</option>${stateOptions}</select></label></div>
<div class="row two"><label>ZIP <span class="muted">(optional)</span><input name="zip" inputmode="numeric" maxlength="10" autocomplete="postal-code"></label><label>What you read<select name="genre">${genreSelect}</select></label></div>
<div class="row two"><label>How often you meet<input name="cadence" maxlength="80" placeholder="First Sunday, monthly"></label><label>Format<select name="format"><option value="in-person">In person</option><option value="online">Online</option><option value="hybrid">Both</option></select></label></div>
<fieldset class="mapq"><legend>Where does the club meet?</legend>
<label class="check"><input type="radio" name="meets_at" value="public" checked> A public place (library, bookstore, café)</label>
<label class="check"><input type="radio" name="meets_at" value="home"> Someone's home</label>
<label class="check"><input type="radio" name="meets_at" value="online"> Online</label>
<label class="check toggle"><input type="checkbox" name="show_on_map" checked> <span><b>List my club in <span class="list-city">my city</span>.</b> <span class="map-note">Readers see the club and your city, never the address. Exact place and time are only shared with members you approve.</span></span></label>
</fieldset>
<label>About the club <span class="muted">(optional)</span><textarea name="about" maxlength="1000" placeholder="Where you meet, the vibe, who it's for."></textarea></label>
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label></div>
<p class="small">We never show your email on the site. Readers who want to join will be able to contact you through Bookish once host tools open.</p>
${hp}${consent}
<button class="btn" type="submit">Add my club</button>
<p class="form-msg" role="status"></p>
</form></section></div>`,
}));
page("/start/", 0.6);

write("hosts/index.html", layout({
  title: "Host Tools for Book Clubs: Coming Soon | Bookish", desc: "Simple tools for book club hosts: schedule the next meeting, let members vote on the book, track reading progress and share one invite link. Join the waitlist.", path: "/hosts/",
  body: `<div class="wrap">${crumbs([["Home", "/"], ["For hosts", null]])}
<header class="page-head"><p class="eyebrow">For hosts · coming soon</p><h1>Less admin, <em>more books</em>.</h1>
<p class="lede">We're building a small set of tools for the person who keeps the club going. No group-chat archaeology to find the date, no spreadsheet of who's read what. These aren't live yet. Join the waitlist and we'll invite hosts in small groups.</p></header>
<section><h2 class="sr-only">What we're building</h2><div class="tools">
<div class="tool"><span class="soon">Coming soon</span><h3>Next-meeting scheduling</h3><p>Propose a few dates, members tap what works, and the winner goes on everyone's calendar.</p>
<div class="mock" aria-hidden="true"><div class="l"><span class="t">Thu, Nov 6 · 7pm</span><span class="pill">8 can come</span></div><div class="l"><span>Sun, Nov 9 · 2pm</span><span>5 can come</span></div><div class="l"><span>Tue, Nov 11 · 7pm</span><span>3 can come</span></div></div></div>
<div class="tool"><span class="soon">Coming soon</span><h3>Book voting</h3><p>Everyone nominates, everyone votes, and the pick is settled before the meeting ends.</p>
<div class="mock" aria-hidden="true"><div class="l"><span class="t">The Thursday Murder Club</span><div class="bar"><i style="width:72%"></i></div><span>9</span></div><div class="l"><span class="t">Lessons in Chemistry</span><div class="bar"><i style="width:48%"></i></div><span>6</span></div><div class="l"><span class="t">Piranesi</span><div class="bar"><i style="width:24%"></i></div><span>3</span></div></div></div>
<div class="tool"><span class="soon">Coming soon</span><h3>Reading progress</h3><p>See who's on track for the meeting, with no spoilers past the page you're on.</p>
${(() => {
  // The Race: pages read vs the meet page. Velvet + bookmark ribbons, brass "You".
  const total = 517, meet = 300, rows = [["Mira", 488], ["Priya", 371], ["You", 212], ["Dani", 160], ["Kat", 96], ["Elle", 40]];
  const pct = (n) => (n / total * 100).toFixed(1);
  return `<div class="race" aria-hidden="true"><div class="hd"><span class="ttl">The Race</span><span class="eb">First to the end</span><span class="pos">you're 3rd</span></div>
<div class="rows"><span class="mline" style="left:calc((100% - 48px) * ${(meet / total).toFixed(3)})"><span>Meet · p.${meet}</span></span>${rows.map(([n, p], i) => `<div class="rr${n === "You" ? " me" : ""}"><span class="rn">${n}</span><span class="rt"><span class="rf" style="width:${pct(p)}%;--c:${["#a8324a", "#efe2c6", "#ecb74e", "#e6a2ac", "#a9c487", "#d97a52"][i]}"></span><span class="rp${p / total > .8 ? " in" : ""}" style="left:${pct(p)}%">p. ${p}</span></span></div>`).join("")}</div></div>`;
})()}</div>
<div class="tool"><span class="soon">Coming soon</span><h3>One invite link</h3><p>A single link for your club. New readers see what you're reading and when you meet, then ask to join.</p>
<div class="mock" aria-hidden="true"><span class="link">bookishclub.com/c/tuesday-mysteries</span></div></div>
</div></section>
<section style="padding-top:0"><h2>Join the <em>host waitlist</em></h2>
<form class="form" data-kind="waitlist" novalidate>
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>City<input name="city" maxlength="80" autocomplete="address-level2"></label></div>
<label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
<fieldset style="border:0;padding:0;margin:0"><legend class="small" style="margin-bottom:8px">What would help most?</legend>
<div class="checks"><label class="check"><input type="checkbox" name="features" value="scheduling"> Scheduling</label><label class="check"><input type="checkbox" name="features" value="voting"> Book voting</label><label class="check"><input type="checkbox" name="features" value="progress"> Reading progress</label><label class="check"><input type="checkbox" name="features" value="invite"> Invite link</label></div></fieldset>
<div class="row two"><label>Do you host a club now?<select name="is_host"><option value="yes">Yes</option><option value="soon">Starting one</option><option value="no">No, I'm a member</option></select></label><label>Club size<select name="club_size"><option value="">—</option><option>2–5</option><option>6–12</option><option>13–25</option><option>26+</option></select></label></div>
${hp}${consent}
<button class="btn" type="submit">Join the waitlist</button>
<p class="form-msg" role="status"></p>
</form></section></div>`,
}));
page("/hosts/", 0.6);

write("join/index.html", layout({
  title: "Request to Join a Book Club | Bookish", desc: "Send a short note to a book club host on Bookish asking to join.", path: "/join/", noindex: true,
  body: `<div class="wrap">${crumbs([["Home", "/"], ["Request to join", null]])}
<header class="page-head"><p class="eyebrow">Request to join</p><h1>Join <em id="join-club">this club</em></h1>
<div id="join-off" class="note" hidden><b>This club isn't on Bookish yet.</b> It's listed from a public library or bookstore calendar, so there's no host here to ask. Check its listing for the time and place, or, if you run it, <a id="join-claim" href="${url("/claim/")}">claim it</a>.</div>
<p class="lede">Send the host a short hello. They'll see your first name and note, not your email, and can say yes or no. Got an invite link or code from the host? Add the code and you're in straight away.</p></header>
<section><form class="form" data-kind="join" data-api="${JOIN_API}" novalidate>
<input type="hidden" name="club_id"><input type="hidden" name="club_name"><input type="hidden" name="club_city">
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name" required></label><label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label></div>
<label>A note for the host <span class="muted">(optional, 500 characters)</span><textarea name="note" maxlength="500" placeholder="Hi! I just moved nearby and love mysteries. Would love to come to the next one."></textarea></label>
<label>Invite code <span class="muted">(only if the host gave you one)</span><input name="invite_code" maxlength="12" autocapitalize="characters" autocomplete="off" placeholder="e.g. TUES24"></label>
<div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="check"><input type="checkbox" name="consent" required> <span>Email me about this request. See our <a href="${url("/privacy/")}">privacy note</a>.</span></label>
<button class="btn" type="submit">Send request</button>
<p class="form-msg" role="status"></p>
</form></section></div>
<script>(function(){var q=new URLSearchParams(location.search),n=q.get("club_name"),c=q.get("club_city");if(n){var e=document.getElementById("join-club");e.textContent=n;if(c)e.insertAdjacentText("afterend"," in "+c);document.title="Request to join "+n+" | Bookish";}var i=q.get("invite");if(i){var f=document.querySelector("[name=invite_code]");f.value=i.toUpperCase().slice(0,12);}
var id=q.get("club_id"),off=function(){document.getElementById("join-off").hidden=false;var fm=document.querySelector("form[data-kind=join]");fm.hidden=true;document.querySelector(".page-head .lede").hidden=true;document.getElementById("join-claim").href+=location.search;};
if(!id){off();return;}fetch("${VERIFIED_API}").then(function(r){return r.json();}).then(function(j){if(j&&j.ok&&!j.clubs.some(function(c){return c.id===id;}))off();}).catch(function(){});})();</script>`,
}));
write("join/done/index.html", layout({
  title: "Request update | Bookish", desc: "Join request update.", path: "/join/done/", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">Join requests</p><h1 id="jd-h">Done.</h1><p class="lede" id="jd-p">We've let the reader know.</p><a class="btn" href="${url("/")}">Back to Bookish</a></header></div>
<script>(function(){var r=new URLSearchParams(location.search).get("result"),h=document.getElementById("jd-h"),p=document.getElementById("jd-p");if(r==="approved"){h.textContent="You said yes.";p.textContent="We've emailed them your reply-to address so you can share the next meeting.";}else if(r==="declined"){h.textContent="Request declined.";p.textContent="We've sent them a kind note and pointed them to other clubs nearby.";}else{h.textContent="That link has already been used.";p.textContent="Each request can only be answered once.";}})();</script>`,
}));

write("confirmed/index.html", layout({
  title: "Email confirmed | Bookish", desc: "Thanks for confirming your email.", path: "/confirmed/", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">All set</p><h1>Thank you, <em>you're confirmed</em>.</h1>
<p class="lede" id="cmsg">We'll be in touch by email. In the meantime, see what's being read near you.</p><a class="btn" href="${url("/")}">Find book clubs</a></header></div>
<script>if(new URLSearchParams(location.search).get("status")==="invalid"){document.querySelector("h1").textContent="That link has expired.";document.getElementById("cmsg").textContent="It may have been used already. If you still need help, send the form again.";}</script>`,
}));

const prose = (p, title, desc, h, html) => { write(`${p.slice(1)}index.html`, layout({ title, desc, path: p, body: `<div class="wrap">${crumbs([["Home", "/"], [h, null]])}<header class="page-head"><h1>${h}</h1></header><section class="prose">${html}</section></div>` })); page(p, 0.3); };
prose("/about/", "About Bookish and Our Sources", "How Bookish finds and lists book clubs, and how to fix or remove a listing.", "About Bookish", `
<p>Bookish is a directory of book clubs that meet in person across the United States. Finding one shouldn't take an evening of searching library calendars and bookstore newsletters, so we gather them in one place.</p>
<h2>Where listings come from</h2>
<p>Listings come from the public event pages of libraries and independent bookstores. We read those pages slowly and politely, follow each site's robots.txt and terms, and store only the basics: the club's name, city, genre and meeting rhythm as published, plus a link to the source and the date we last saw it. We don't collect anyone's personal email address or phone number, and we never show a venue or address: our pages and map are city-level only. Exact place and time are shared only with members a host approves.</p>
<p>Clubs change. Always check the source page, linked on every listing, for the current book and date.</p>
<h2>Fix or remove a listing</h2>
<p>If you host a club, <a href="${url("/claim/")}">claim it</a> and we'll update it with you. If you'd like a listing removed, use the same form and say so in the message. We'll take it down.</p>`);
prose("/privacy/", "Privacy | Bookish", "What Bookish collects and why.", "Privacy", `
<p>Updated ${niceDate(TODAY)}.</p>
<p><b>Directory listings.</b> We list clubs from public pages and store only club-level details (name, city, genre, meeting rhythm, source link, date seen). We never publish a venue, neighborhood or address, and our map is city-level only. No personal contact details.</p>
<p><b>Forms.</b> When you claim a club, add a club or join the waitlist, we store what you type plus your email address. We use it only to verify your club and to email you about Bookish. We keep a one-way hash of your IP address for a short time to stop spam. We don't sell your data.</p>
<p><b>Your choices.</b> Every email has an unsubscribe link. To delete what you sent us, reply to any of our emails or use the claim form and say so.</p>
<p><b>Cookies.</b> This site sets no tracking cookies.</p>`);
prose("/terms/", "Terms | Bookish", "Terms of use for Bookish.", "Terms", `
<p>Bookish is a free directory. Listings are gathered from public sources and may be out of date; check the linked source before attending. Clubs are run by their hosts and venues, not by Bookish. Don't submit anything that isn't yours to share, and be kind at meetings.</p>`);

write("404.html", layout({ title: "Page not found | Bookish", desc: "This page has wandered off the shelf.", path: "/404.html", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">404</p>${lunair("lunair-shrug", 260, 279, 520, 553, "Bookish host shrugging", "shrug", true)}<h1>This page has wandered <em>off the shelf</em>.</h1><p class="lede">Try searching for your city instead.</p>${searchBox()}</header></div>` }));

// ---------- resources ----------
{
  const R = JSON.parse(fs.readFileSync(path.join(ROOT, "data/resources.json"), "utf8"));
  const live = R.entries.filter((e) => e.status === "live");
  const href = (e) => e.internal ? url(e.url) : esc(e.affiliate_url || e.url);
  const card = (e) => `<li class="res${e.featured ? " featured" : ""}">
${e.featured ? `<span class="tag g">Our pick</span>` : ""}${e.label ? `<span class="res-label">${esc(e.label)}</span>` : ""}
<h3><a href="${href(e)}"${e.internal ? "" : ` rel="${e.sponsored || e.affiliate_url ? "sponsored " : ""}noopener" target="_blank"`}>${esc(e.title)}${e.internal ? "" : "&nbsp;↗"}</a></h3>
<p>${esc(e.blurb)}</p></li>`;
  const body = `<div class="wrap">${crumbs([["Home", "/"], ["Resources", null]])}
<header class="page-head"><p class="eyebrow">For readers and hosts</p><h1>Good things for <em>book clubs</em>.</h1>
<p class="lede">A short, hand-picked shelf: free discussion guides, places to get the book, and a few things we made for hosts.</p></header>
${R.categories.map(([id, name, intro]) => {
    const list = live.filter((e) => e.category === id).sort((a, b) => b.featured - a.featured);
    return list.length ? `<section class="res-sec"><h2>${esc(name)}</h2><p class="muted">${esc(intro)}</p><ul class="res-list">${list.map(card).join("")}</ul></section>` : "";
  }).join("")}
<p class="small">Some links on this page may earn Bookish a small commission in future. If they do, we'll say so on the card. Picks are never paid for unless they're labelled "Sponsored".</p>
</div>${hostCallout()}`;
  write("resources/index.html", layout({ title: "Book Club Resources: Discussion Guides, Printables & Hosting Tips | Bookish", desc: "Free discussion guides, where to get the book, library apps, printable bookmarks and RSVP cards, hosting tips and snack pairings for your book club.", path: "/resources/", body }));
  page("/resources/", 0.7);
  write("data/resources.json", JSON.stringify({ categories: R.categories, entries: live }));

  const article = (p, title, desc, h, html) => {
    const cr = [["Home", "/"], ["Resources", "/resources/"], [h.replace(/<[^>]+>/g, ""), null]];
    write(`${p.slice(1)}index.html`, layout({ title, desc, path: p, jsonld: [crumbsLd(cr)], body: `<div class="wrap">${crumbs(cr)}<header class="page-head"><p class="eyebrow">Resources</p><h1>${h}</h1></header><section class="prose">${html}<p><a href="${url("/resources/")}">← All resources</a></p></section></div>${hostCallout()}` }));
    page(p, 0.6);
  };
  article("/resources/hosting-tips/", "How to Host a Book Club That Lasts | Bookish", "Practical tips for hosting a book club: picking books, setting a rhythm, running the discussion and welcoming new members.", "How to host a book club <em>that lasts</em>", `
<p class="lede">Most book clubs don't end because people stop reading. They end because nobody's sure when the next one is. A few habits fix most of that.</p>
<h2>Set a rhythm and keep it</h2>
<p>"Second Tuesday, 7pm" beats a new poll every month. A fixed slot lets people plan around it, and the club survives the months when you're busy.</p>
<h2>Pick books people can actually finish</h2>
<p>Under 400 pages is a kind default. Alternate heavier picks with lighter ones, and check that the book is easy to borrow from the library. Choose the next two books ahead of time so people can start early.</p>
<h2>Have three questions ready</h2>
<p>You don't need a guide, just a way in: What surprised you? Who did you trust, and when did that change? What would you have done differently? Free guides on our <a href="${url("/resources/")}">resources page</a> help with harder books.</p>
<h2>Let people come unfinished</h2>
<p>Say it out loud: come even if you didn't finish. Agree on how spoilers work (most clubs talk about the whole book). People who feel welcome half-read come back fully read.</p>
<h2>Keep the group a good size</h2>
<p>Six to twelve regulars is the sweet spot for one conversation. If you grow past that, split into two tables or start a sister club with a different genre.</p>
<h2>Make it easy to find you</h2>
<p>New members keep a club alive. <a href="${url("/start/")}">List your club</a> on Bookish so readers nearby can find it, and keep the meeting details current.</p>`);
  article("/resources/pairings/", "Book Club Snack and Wine Pairings by Genre | Bookish", "Easy themed snack and drink ideas for your next book club meeting, from mystery nights to romance picks.", "Snack and wine pairings <em>by genre</em>", `
<p class="lede">Nothing fancy. Just a small nod to the book that gets the conversation started before anyone opens it.</p>
<h2>Mystery &amp; thriller</h2>
<p>A cheese board with one "suspicious" cheese nobody can identify. Pour a dry red such as Chianti, or offer black coffee for the late-night crowd.</p>
<h2>Romance</h2>
<p>Strawberries, dark chocolate and something pink and sparkling. Non-drinkers get a hibiscus spritzer with lime.</p>
<h2>Fantasy</h2>
<p>A tavern spread: crusty bread, honey, roasted nuts and a hard cheese. Cider or mead if you can find it, spiced apple juice if not.</p>
<h2>Historical fiction</h2>
<p>Cook something from the book's time and place, even something simple: shortbread for Scotland, madeleines for France. Tea service never hurts.</p>
<h2>Literary fiction &amp; classics</h2>
<p>Olives, good bread and a crisp white wine such as Sauvignon Blanc. Keep it quiet and grown-up, like the book.</p>
<h2>Horror</h2>
<p>Blood-orange anything, black licorice and a deep red. Turn the lights down.</p>
<h2>Nonfiction &amp; memoir</h2>
<p>Whatever the author would eat. If the book is set somewhere specific, order from a restaurant from that region.</p>
<p class="small">Always have a good non-alcoholic option, and drink responsibly.</p>`);

  // printables (print-optimised)
  const bm = Array.from({ length: 4 }, () => `<div class="bm"><div class="pw"><img src="${url("/img/wordmark-320.webp")}" width="120" height="47" alt="Bookish"></div><p class="pl">Our next book</p><span class="ln"></span><span class="ln"></span><p class="pl">Meeting</p><span class="ln"></span><p class="pl">Where</p><span class="ln"></span><p class="pq">"Come even if you didn't finish."</p></div>`).join("");
  const rsvp = Array.from({ length: 4 }, () => `<div class="rsvp"><div class="pw"><img src="${url("/img/wordmark-320.webp")}" width="120" height="47" alt="Bookish"></div><p class="pt">You're invited to book club</p><p class="pl">Book</p><span class="ln"></span><p class="pl">Date &amp; time</p><span class="ln"></span><p class="pl">Place</p><span class="ln"></span><p class="pl">RSVP to</p><span class="ln"></span></div>`).join("");
  const pcss = `<style>
.sheet{display:grid;gap:14px;margin:18px 0 34px}.bms{grid-template-columns:repeat(4,1fr)}.rsvps{grid-template-columns:repeat(2,1fr)}
.bm,.rsvp{border:1.5px dashed var(--ink-2);border-radius:6px;padding:16px 14px;background:#fff;color:var(--ink)}
.bm{min-height:440px;display:flex;flex-direction:column}.pw{margin-bottom:14px}.pw img{display:block;width:120px;height:auto}
.pl{font:700 10px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);margin:14px 0 4px}.ln{display:block;border-bottom:1px solid var(--ink-2);height:24px}
.pq{margin-top:auto;font:400 14px/1.35 var(--title);color:var(--ink-2)}.pt{font:400 20px/1.2 var(--title);margin:0 0 6px}
@media (max-width:700px){.bms{grid-template-columns:repeat(2,1fr)}.rsvps{grid-template-columns:1fr}}
@media print{.mast,.foot-site,.crumbs,.noprint,.callout{display:none!important}body{background:#fff}.page-head{border:0;padding:0}.sheet{break-inside:avoid}.bms{grid-template-columns:repeat(4,1fr)}.rsvps{grid-template-columns:repeat(2,1fr);break-before:page}}
</style>`;
  const pcr = [["Home", "/"], ["Resources", "/resources/"], ["Printables", null]];
  write("resources/printables/index.html", layout({ title: "Printable Book Club Bookmarks and RSVP Cards (Free) | Bookish", desc: "Free printable bookmarks and RSVP cards for your book club. Print at home, fill in the book and date, and cut along the lines.", path: "/resources/printables/", jsonld: [crumbsLd(pcr)],
    body: `${pcss}<div class="wrap">${crumbs(pcr)}<header class="page-head"><p class="eyebrow noprint">Resources</p><h1 class="noprint">Printable bookmarks &amp; <em>RSVP cards</em></h1><p class="lede noprint">Print on card stock if you have it. Bookmarks print four to a page; RSVP cards print on the second page. Cut along the dashed lines.</p><button class="btn noprint" type="button" onclick="window.print()">Print this page</button></header>
<h2 class="noprint" style="margin-top:30px">Bookmarks</h2><div class="sheet bms">${bm}</div><h2 class="noprint">RSVP cards</h2><div class="sheet rsvps">${rsvp}</div></div>` }));
  page("/resources/printables/", 0.6);
}

// ---------- data, assets, sitemap ----------
const citiesJson = cities.map((c) => ({ n: c.name, s: c.st, u: c.u, c: c.clubs.length, v: c.v, g: c.genres, vg: c.vg, gp: c.genrePages, la: c.lat, lo: c.lng }));
copyDir(path.join(ROOT, "public"), OUT);
write("data/cities.json", JSON.stringify(citiesJson));
write("site.js", fs.readFileSync(path.join(ROOT, "src/site.js"), "utf8"));
write("map.js", fs.readFileSync(path.join(ROOT, "src/map.js"), "utf8"));
{
  // Club map data: CITY LEVEL ONLY. One point per city at the Census city
  // centroid with a club count. No venue, address or neighborhood, ever.
  const features = cities.filter((c) => c.lat != null).map((c) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    properties: { n: c.clubs.length, v: c.v, c: `${c.name}, ${c.st}`, u: c.u,
      topv: c.clubs.filter((x) => x.verified).slice(0, 5).map((x) => x.name).join("\u001f"),
      top: c.clubs.filter((x) => !x.verified).slice(0, 5).map((x) => x.name).join("\u001f") },
  }));
  write("data/clubs.geojson", JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`map: ${features.length} city points`);
}

write("favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4a1420"/><text x="32" y="47" text-anchor="middle" font-family="Arial Black,Helvetica,sans-serif" font-weight="900" font-size="40" fill="#fbf1e2" stroke="#f4a6bf" stroke-width="3" paint-order="stroke">B</text></svg>`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /claim/\nDisallow: /confirmed/\nDisallow: /join/\n\nSitemap: ${abs("/sitemap.xml")}\n`);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((s) => `<url><loc>${esc(s.loc)}</loc><lastmod>${TODAY}</lastmod><priority>${s.prio.toFixed(1)}</priority></url>`).join("\n")}\n</urlset>\n`);
write(".nojekyll", "");
if (process.env.CUSTOM_DOMAIN) write("CNAME", process.env.CUSTOM_DOMAIN + "\n");

console.log(`verified clubs: ${verifiedTotal}`);
console.log(`built ${sitemap.length} indexable pages: ${cities.length} cities, ${cities.reduce((s, c) => s + c.genrePages.length, 0)} genre-city pages, ${states.length} states, ${clubs.length} clubs -> ${path.relative(ROOT, OUT)}/ (base "${BASE}")`);
