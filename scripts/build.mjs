// Static site generator for Bookish Club. Zero dependencies.
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
const TODAY = new Date().toISOString().slice(0, 10);

const GENRES = Object.fromEntries(GENRES_LIST);
const KEEP_CASE = new Set(["spanish-language", "lgbtq"]);
const lc = (g) => KEEP_CASE.has(g) ? GENRES[g] : GENRES[g].toLowerCase();
const clubs = JSON.parse(fs.readFileSync(path.join(ROOT, "data/clubs.json"), "utf8"));

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
  city.clubs.sort((a, b) => (b.genres.length + (b.cadence ? 1 : 0)) - (a.genres.length + (a.cadence ? 1 : 0)) || a.name.localeCompare(b.name));
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
const CSS = (fs.readFileSync(path.join(ROOT, "src/theme.css"), "utf8") + fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8")).replaceAll("__BASE__", BASE).replace(/\n\s*/g, "\n");

function layout({ title, desc, path: p, body, jsonld = [], noindex = false }) {
  const canonical = abs(p);
  return `<!doctype html>
<html lang="en" data-base="${BASE}" data-api="${API}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="theme-color" content="#f6f0e4">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bookish Club">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${url("/favicon.svg")}" type="image/svg+xml">
<link rel="preload" href="${url("/fonts/newsreader.woff2")}" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="mast"><div class="wrap">
<a class="wordmark" href="${url("/")}"><span class="wm-b">Bookish</span><span class="wm-c">Club</span></a>
<nav class="nav" aria-label="Main"><a class="hide-sm" href="${url("/book-clubs/")}">Browse</a><a class="hide-sm" href="${url("/hosts/")}">For hosts</a><a class="hide-sm" href="${url("/resources/")}">Resources</a><a class="btn-sm" href="${url("/start/")}">Start a club</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot-site"><div class="wrap cols">
<div><a class="wordmark" href="${url("/")}"><span class="wm-b">Bookish</span><span class="wm-c">Club</span></a>
<p>A directory of real book clubs that meet near you, gathered from the public pages of libraries and bookstores. Every listing links to its source. Details change, so check there before you go.</p></div>
<div><p class="h">Find</p><ul><li><a href="${url("/book-clubs/")}">All cities</a></li>${["romance", "mystery-thriller", "fantasy", "nonfiction"].filter((g) => genreTotals[g] >= 5).map((g) => `<li><a href="${url(`/genres/${g}/`)}">${GENRES[g]} clubs</a></li>`).join("")}</ul></div>
<div><p class="h">Hosts</p><ul><li><a href="${url("/start/")}">Start a club</a></li><li><a href="${url("/claim/")}">Claim your club</a></li><li><a href="${url("/hosts/")}">Host tools</a></li><li><a href="${url("/resources/")}">Resources</a></li><li><a href="${url("/about/")}">About &amp; sources</a></li><li><a href="${url("/privacy/")}">Privacy</a> · <a href="${url("/terms/")}">Terms</a></li></ul></div>
</div></footer>
<script src="${url("/site.js")}" defer></script>
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

const HOST_IMG = lunair("lunair-host", 440, 225, 880, 447, "Bookish Club host, a witch in a sage hat, welcoming you in", "", true);
const GENRE_OPTIONS = (sel = "") => `<option value="">Any genre</option>${GENRES_LIST.filter(([g]) => genreTotals[g]).map(([g, l]) => `<option value="${g}"${g === sel ? " selected" : ""}>${l}</option>`).join("")}`;
const searchBox = (sel = "", placeholder = "Sacramento, or a ZIP code") => `
<form id="search" class="search" role="search" action="${url("/")}" autocomplete="off">
  <div class="field"><label for="q">City or ZIP</label><input id="q" name="q" type="search" placeholder="${esc(placeholder)}" inputmode="search" aria-autocomplete="list" aria-controls="suggest"></div>
  <div class="field"><label for="genre">Genre</label><select id="genre" name="genre">${GENRE_OPTIONS(sel)}</select></div>
  <button class="btn" type="submit">Find clubs</button>
  <ul id="suggest" class="suggest" hidden role="listbox"></ul>
</form>
<div id="results" class="results" aria-live="polite"></div>`;

function clubCard(c, { showCity = false } = {}) {
  const where = [c.venue, c.neighborhood && c.neighborhood !== c.venue ? c.neighborhood : null, showCity ? `${c.city}, ${c.state}` : null].filter(Boolean).join(" · ") || `${c.city}, ${c.state}`;
  const tags = [
    ...c.genres.map((g) => `<span class="tag g">${esc(GENRES[g])}</span>`),
    c.cadence ? `<span class="tag">${esc(c.cadence)}</span>` : "",
    c.format && c.format !== "in-person" ? `<span class="tag">${c.format === "online" ? "Online" : "In person &amp; online"}</span>` : "",
  ].join("");
  const claim = url(`/claim/?club_id=${encodeURIComponent(c.id)}&club_name=${encodeURIComponent(c.name)}&club_city=${encodeURIComponent(`${c.city}, ${c.state}`)}`);
  let host = c.source_name || "source";
  try { if (!c.source_name) host = new URL(c.source_url).hostname.replace(/^www\./, ""); } catch {}
  return `<li class="club" id="${esc(c.id)}" data-g="${c.genres.join(" ")}">
<h3>${esc(c.name)}</h3>
<p class="where">${esc(where)}</p>
${tags ? `<div class="meta">${tags}</div>` : ""}
${c.vibe ? `<p class="vibe">${esc(c.vibe)}</p>` : ""}
<div class="foot"><span>Listed by <a href="${esc(c.source_url)}" rel="nofollow noopener" target="_blank">${esc(host)}&nbsp;↗</a> · seen ${niceDate(c.last_seen)}</span><a href="${claim}" rel="nofollow">Is this your club? Claim it</a></div>
</li>`;
}

const clubsLd = (list, name) => ({
  "@context": "https://schema.org", "@type": "ItemList", name, numberOfItems: list.length,
  itemListElement: list.slice(0, 100).map((c, i) => ({
    "@type": "ListItem", position: i + 1,
    item: {
      "@type": "Organization", name: c.name, url: c.source_url,
      ...(c.genres.length ? { knowsAbout: c.genres.map((g) => GENRES[g]) } : {}),
      address: { "@type": "PostalAddress", addressLocality: c.city, addressRegion: c.state, addressCountry: "US" },
      ...(c.venue ? { location: { "@type": "Place", name: c.venue, address: { "@type": "PostalAddress", addressLocality: c.city, addressRegion: c.state, addressCountry: "US" } } } : {}),
    },
  })),
});

const hostCallout = (where) => `<section><div class="wrap"><div class="callout">
<div><h2>Hosting a club${where ? ` in ${esc(where)}` : ""}?</h2><p>List it for free so readers nearby can find you. Takes two minutes, no account needed.</p></div>
<a class="btn" href="${url("/start/")}">Add your club</a></div></div></section>`;

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
for (const city of cities) {
  const label = `${city.name}, ${city.st}`;
  const p = `/book-clubs/${city.u}/`;
  const n = city.clubs.length;
  const near = nearbyCities(city);
  const topGenres = Object.entries(city.genres).sort((a, b) => b[1] - a[1]);
  const nearClubs = n < 8 ? near.flatMap(({ o, d }) => o.clubs.slice(0, 3).map((c) => ({ c, d }))).slice(0, 8 - Math.min(n, 4)) : [];
  const genreText = topGenres.length ? ` Genres include ${topGenres.slice(0, 4).map(([g, k]) => `${lc(g)} (${k})`).join(", ")}.` : "";
  const cr = [["Book clubs", "/book-clubs/"], [STATE_NAMES[city.st] ?? city.st, `/book-clubs/${stateSlug(city.st)}/`], [city.name, null]];
  const body = `<div class="wrap">${crumbs(cr)}
<header class="page-head"><p class="eyebrow">${plural(n, "club")} · updated ${monthYear}</p>
<h1>Book clubs in <em>${esc(city.name)}</em>,&nbsp;${city.st}</h1>
<p class="lede">${summarize(city.clubs)}${genreText} Pick one, check the details at the source, and just show up. Most welcome newcomers.</p>
</header></div>
${topGenres.length ? `<div class="filterbar"><div class="wrap"><div id="filter" class="chips" role="toolbar" aria-label="Filter by genre"><button class="chip" type="button" data-g="" aria-pressed="true">All <span class="c">${n}</span></button>${topGenres.map(([g, k]) => `<button class="chip" type="button" data-g="${g}" aria-pressed="false">${esc(GENRES[g])} <span class="c">${k}</span></button>`).join("")}</div></div></div>` : `<div style="height:28px"></div>`}
<div class="wrap">
<ul class="clubs">${city.clubs.map((c) => clubCard(c)).join("\n")}</ul>
<div id="filter-empty" class="empty" hidden>${lunair("lunair-peek", 130, 215, 260, 421, "", "peek")}<p>No clubs in that genre here yet. <a href="${url("/start/")}">Start the first one</a> and we'll send readers your way.</p></div>
${nearClubs.length ? `<hr class="rule"><h2>More clubs <em>nearby</em></h2><p class="lede">A short drive from ${esc(city.name)}.</p><ul class="clubs">${nearClubs.map(({ c }) => clubCard(c, { showCity: true })).join("\n")}</ul>` : ""}
${city.genrePages.length ? `<hr class="rule"><h2>By genre in ${esc(city.name)}</h2><ul class="chips">${city.genrePages.map((g) => `<li><a class="chip" href="${url(`${p}${g}/`)}">${esc(GENRES[g])} book clubs in ${esc(city.name)}</a></li>`).join("")}</ul>` : ""}
${near.length ? `<hr class="rule"><h2>Nearby cities</h2><div class="grid cols-3">${near.slice(0, 9).map(({ o, d }) => `<a class="city-tile" href="${url(`/book-clubs/${o.u}/`)}"><b>${esc(o.name)}, ${o.st}</b><span>${plural(o.clubs.length, "club")} · ${Math.round(d)} mi</span></a>`).join("")}</div>` : ""}
</div>
${hostCallout(city.name)}`;
  write(`book-clubs/${city.u}/index.html`, layout({
    title: `Book Clubs in ${label}: ${plural(n, "club")} to join (${monthYear}) | Bookish Club`,
    desc: `Find ${plural(n, "book club")} in ${label}${topGenres.length ? `, including ${topGenres.slice(0, 3).map(([g]) => lc(g)).join(", ")} clubs` : ""}. Library and bookstore clubs with meeting times and where to join.`,
    path: p, body, jsonld: [crumbsLd(cr), clubsLd(city.clubs, `Book clubs in ${label}`)],
  }));
  page(p, n >= 10 ? 0.8 : 0.6);

  for (const g of city.genrePages) {
    const list = city.clubs.filter((c) => c.genres.includes(g));
    const gp = `${p}${g}/`;
    const others = city.clubs.filter((c) => !c.genres.includes(g)).slice(0, 4);
    const gcr = [...cr.slice(0, 2), [city.name, p], [GENRES[g], null]];
    const gbody = `<div class="wrap">${crumbs(gcr)}
<header class="page-head"><p class="eyebrow">${plural(list.length, "club")} · updated ${monthYear}</p>
<h1>${esc(GENRES[g])} book clubs in <em>${esc(city.name)}</em></h1>
<p class="lede">${plural(list.length, `${lc(g)} book club`)} meet in ${esc(label)}. ${summarize(list)}</p>
<a class="chip" href="${url(p)}">See all ${n} clubs in ${esc(city.name)} →</a>
</header>
<div style="height:28px"></div>
<ul class="clubs">${list.map((c) => clubCard(c)).join("\n")}</ul>
${others.length ? `<hr class="rule"><h2>Other clubs in ${esc(city.name)}</h2><ul class="clubs">${others.map((c) => clubCard(c)).join("\n")}</ul>` : ""}
</div>${hostCallout(city.name)}`;
    write(`book-clubs/${city.u}/${g}/index.html`, layout({
      title: `${GENRES[g]} Book Clubs in ${label} (${monthYear}) | Bookish Club`,
      desc: `${plural(list.length, `${lc(g)} book club`)} in ${label}, with meeting times, venues and how to join.`,
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
<section style="padding-top:28px"><div class="grid cols-3">${list.map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/`)}"><b>${esc(c.name)}</b><span>${plural(c.clubs.length, "club")}</span></a>`).join("")}</div></section></div>${hostCallout(name)}`;
  write(`book-clubs/${stateSlug(st)}/index.html`, layout({
    title: `Book Clubs in ${name}: ${plural(total, "club")} in ${plural(list.length, "city", "cities")} | Bookish Club`,
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
<section><h2>Biggest club cities</h2><div class="grid cols-3">${cities.slice(0, 30).map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/`)}"><b>${esc(c.name)}, ${c.st}</b><span>${plural(c.clubs.length, "club")}</span></a>`).join("")}</div></section>
<section><h2>All states</h2><div class="states">${states.map((st) => `<div><a href="${url(`/book-clubs/${stateSlug(st)}/`)}">${esc(STATE_NAMES[st] ?? st)}</a> <span class="muted">${byState.get(st).reduce((s, c) => s + c.clubs.length, 0)}</span></div>`).join("")}</div></section></div>`;
  write("book-clubs/index.html", layout({ title: "Book Clubs Near You, by State and City | Bookish Club", desc: `Browse ${plural(clubs.length, "book club")} in ${plural(cities.length, "US city", "US cities")}, by state and city.`, path: "/book-clubs/", body, jsonld: [crumbsLd(cr)] }));
  page("/book-clubs/", 0.9);
}

// ---------- national genre hubs ----------
for (const [g, label] of GENRES_LIST) {
  const total = genreTotals[g] ?? 0;
  if (total < 5) continue;
  const gc = cities.filter((c) => c.genres[g]).sort((a, b) => b.genres[g] - a.genres[g]);
  const sample = gc.slice(0, 6).flatMap((c) => c.clubs.filter((x) => x.genres.includes(g)).slice(0, 1));
  const p = `/genres/${g}/`;
  const cr = [["Book clubs", "/book-clubs/"], [label, null]];
  const body = `<div class="wrap">${crumbs(cr)}
<header class="page-head"><p class="eyebrow">${plural(total, "club")} in ${plural(gc.length, "city", "cities")}</p>
<h1>${esc(label)} <em>book clubs</em> near you</h1><p class="lede">Find a ${esc(lc(g))} book club that meets in your city.</p>${searchBox(g)}</header>
<section><h2>Cities with ${esc(lc(g))} clubs</h2><div class="grid cols-3">${gc.slice(0, 60).map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/${c.genrePages.includes(g) ? g + "/" : "#" + g}`)}"><b>${esc(c.name)}, ${c.st}</b><span>${plural(c.genres[g], "club")}</span></a>`).join("")}</div></section>
<section style="padding-top:0"><h2>A few to start with</h2><ul class="clubs">${sample.map((c) => clubCard(c, { showCity: true })).join("\n")}</ul></section></div>${hostCallout()}`;
  write(`genres/${g}/index.html`, layout({ title: `${label} Book Clubs Near You (${monthYear}) | Bookish Club`, desc: `${plural(total, `${lc(g)} book club`)} across ${plural(gc.length, "US city", "US cities")}. Find one that meets near you.`, path: p, body, jsonld: [crumbsLd(cr), clubsLd(sample, `${label} book clubs`)] }));
  page(p, 0.8);
}

// ---------- home ----------
{
  const featured = cities.slice(0, 12).map((c) => c.clubs.find((x) => x.genres.length && x.cadence) ?? c.clubs[0]).slice(0, 6);
  const genreChips = GENRES_LIST.filter(([g]) => (genreTotals[g] ?? 0) >= 5);
  const body = `<section class="hero"><div class="wrap hero-grid"><div class="hero-copy">
<p class="eyebrow">A directory of real book clubs</p>
<h1>Find, start, or run a local <em>book club</em>.</h1>
<p class="lede">Library circles, bookstore clubs, mystery nights and romance meetups. Search by city or ZIP, or start your own and we'll help readers find it.</p>
${searchBox()}
<p class="hero-count"><b>${fmt(clubs.length)}</b> clubs in <b>${fmt(cities.length)}</b> cities, gathered from ${fmt(new Set(clubs.map((c) => c.source_name ?? c.source)).size)} library systems and bookstores.</p>
</div>
<figure class="hero-host">${HOST_IMG}<figcaption>Pull up a chair.</figcaption></figure>
</div></section>
<section><div class="wrap">
<p class="eyebrow">Browse by genre</p>
<ul class="chips">${genreChips.map(([g, l]) => `<li><a class="chip" href="${url(`/genres/${g}/`)}">${esc(l)} <span class="c">${fmt(genreTotals[g])}</span></a></li>`).join("")}</ul>
</div></section>
<section style="padding-top:0"><div class="wrap">
<h2>Where readers are <em>meeting</em></h2>
<div class="grid cols-3">${cities.slice(0, 18).map((c) => `<a class="city-tile" href="${url(`/book-clubs/${c.u}/`)}"><b>${esc(c.name)}, ${c.st}</b><span>${plural(c.clubs.length, "club")}</span></a>`).join("")}</div>
<p style="margin-top:18px"><a href="${url("/book-clubs/")}">See every city →</a></p>
</div></section>
<section style="padding-top:0"><div class="wrap">
<h2>A few clubs <em>to start with</em></h2>
<p class="lede">Picked from around the country. Every one is real, and every one links to where it was listed.</p>
<ul class="clubs">${featured.map((c) => clubCard(c, { showCity: true })).join("\n")}</ul>
</div></section>
<section><div class="wrap grid cols-3">
<div><p class="eyebrow">01</p><h3>Search your city</h3><p class="muted">Type a city or ZIP. We'll show the clubs that meet nearby and how often.</p></div>
<div><p class="eyebrow">02</p><h3>Check the details</h3><p class="muted">Every listing links to the library or bookstore page it came from, so you see the latest date and book.</p></div>
<div><p class="eyebrow">03</p><h3>Just show up</h3><p class="muted">Most clubs welcome newcomers. Bring the book, or don't. Nobody checks.</p></div>
</div></section>
${hostCallout()}
<section style="padding-top:0"><div class="wrap"><div class="note">Run a club already? <a href="${url("/claim/")}">Claim your listing</a> to fix the details, or <a href="${url("/hosts/")}">join the waitlist</a> for simple host tools: scheduling, book voting and invite links.</div></div></section>`;
  write("index.html", layout({
    title: "Bookish Club: Find, Start & Run a Local Book Club",
    desc: `Find, start, or run a local book club. ${fmt(clubs.length)} library, bookstore and community book clubs in ${fmt(cities.length)} US cities, searchable by city, ZIP and genre. Free for hosts.`,
    path: "/", body,
    jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", name: "Bookish Club", url: abs("/"),
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${abs("/")}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
      { "@context": "https://schema.org", "@type": "Organization", name: "Bookish Club", url: abs("/") }],
  }));
  page("/", 1.0);
}

// ---------- host funnel ----------
const consent = `<label class="check"><input type="checkbox" name="consent" required> <span>Email me about this. You can unsubscribe any time; see our <a href="${url("/privacy/")}">privacy note</a>.</span></label>`;
const hp = `<div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>`;
const stateOptions = Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
const genreSelect = `<option value="">Mixed / anything goes</option>${GENRES_LIST.map(([g, l]) => `<option value="${g}">${l}</option>`).join("")}`;

write("claim/index.html", layout({
  title: "Claim Your Book Club Listing | Bookish Club", desc: "Run one of the clubs on Bookish Club? Claim the listing to correct details and hear about host tools first.", path: "/claim/", noindex: true,
  body: `<div class="wrap">${crumbs([["Home", "/"], ["Claim your club", null]])}
<header class="page-head"><p class="eyebrow">For hosts</p><h1>Is this <em>your</em> club?</h1>
<p class="lede">We list clubs from public library and bookstore pages. If you host or organize one, tell us and we'll verify it with you by email. You'll be able to fix the details and you'll hear first when host tools open.</p></header>
<section><form class="form" data-kind="claim" novalidate>
<input type="hidden" name="club_id">
<div class="row two"><label>Club name<input name="club_name" required maxlength="160"></label><label>City<input name="club_city" maxlength="80" placeholder="Austin, TX"></label></div>
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>Your role<select name="role"><option>I host it</option><option>I co-host it</option><option>I'm staff at the venue</option><option>I'm a member</option></select></label></div>
<label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
<label>Anything we should change? <span class="muted">(optional)</span><textarea name="message" maxlength="1000" placeholder="New meeting day, a different venue, what you're reading…"></textarea></label>
${hp}${consent}
<button class="btn" type="submit">Claim this club</button>
<p class="form-msg" role="status"></p>
</form></section></div>`,
}));

write("start/index.html", layout({
  title: "Start a Book Club or List Yours Free | Bookish Club", desc: "Add your book club to Bookish Club for free so readers nearby can find it, or start a new one in your city.", path: "/start/",
  body: `<div class="wrap">${crumbs([["Home", "/"], ["Start a club", null]])}
<header class="page-head with-art">${lunair("lunair-wave", 360, 153, 720, 301, "Bookish Club host waving hello", "head-art", true)}<p class="eyebrow">Free for hosts</p><h1>Start a book club, or <em>list yours</em>.</h1>
<p class="lede">Tell us about your club and we'll add it to the directory once we've confirmed your email. Starting from scratch? Tell us the city and the kind of books, and we'll let readers nearby know.</p></header>
<section><form class="form" data-kind="start" novalidate>
<label>Club name<input name="club_name" required maxlength="160" placeholder="The Tuesday Night Mystery Society"></label>
<div class="row two"><label>City<input name="city" required maxlength="80" autocomplete="address-level2"></label><label>State<select name="state" required><option value="">Choose…</option>${stateOptions}</select></label></div>
<div class="row two"><label>ZIP <span class="muted">(optional)</span><input name="zip" inputmode="numeric" maxlength="10" autocomplete="postal-code"></label><label>What you read<select name="genre">${genreSelect}</select></label></div>
<div class="row two"><label>How often you meet<input name="cadence" maxlength="80" placeholder="First Sunday, monthly"></label><label>Format<select name="format"><option value="in-person">In person</option><option value="online">Online</option><option value="hybrid">Both</option></select></label></div>
<label>About the club <span class="muted">(optional)</span><textarea name="about" maxlength="1000" placeholder="Where you meet, the vibe, who it's for."></textarea></label>
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label></div>
<p class="small">We never show your email on the site. Readers who want to join will be able to contact you through Bookish Club once host tools open.</p>
${hp}${consent}
<button class="btn" type="submit">Add my club</button>
<p class="form-msg" role="status"></p>
</form></section></div>`,
}));
page("/start/", 0.6);

write("hosts/index.html", layout({
  title: "Host Tools for Book Clubs: Coming Soon | Bookish Club", desc: "Simple tools for book club hosts: schedule the next meeting, let members vote on the book, track reading progress and share one invite link. Join the waitlist.", path: "/hosts/",
  body: `<div class="wrap">${crumbs([["Home", "/"], ["For hosts", null]])}
<header class="page-head"><p class="eyebrow">For hosts · coming soon</p><h1>Less admin, <em>more books</em>.</h1>
<p class="lede">We're building a small set of tools for the person who keeps the club going. No group-chat archaeology to find the date, no spreadsheet of who's read what. These aren't live yet. Join the waitlist and we'll invite hosts in small groups.</p></header>
<section><div class="tools">
<div class="tool"><span class="soon">Coming soon</span><h3>Next-meeting scheduling</h3><p>Propose a few dates, members tap what works, and the winner goes on everyone's calendar.</p>
<div class="mock" aria-hidden="true"><div class="l"><span class="t">Thu, Nov 6 · 7pm</span><span class="pill">8 can come</span></div><div class="l"><span>Sun, Nov 9 · 2pm</span><span>5 can come</span></div><div class="l"><span>Tue, Nov 11 · 7pm</span><span>3 can come</span></div></div></div>
<div class="tool"><span class="soon">Coming soon</span><h3>Book voting</h3><p>Everyone nominates, everyone votes, and the pick is settled before the meeting ends.</p>
<div class="mock" aria-hidden="true"><div class="l"><span class="t">The Thursday Murder Club</span><div class="bar"><i style="width:72%"></i></div><span>9</span></div><div class="l"><span class="t">Lessons in Chemistry</span><div class="bar"><i style="width:48%"></i></div><span>6</span></div><div class="l"><span class="t">Piranesi</span><div class="bar"><i style="width:24%"></i></div><span>3</span></div></div></div>
<div class="tool"><span class="soon">Coming soon</span><h3>Reading progress</h3><p>See who's on track for the meeting, with no spoilers past the page you're on.</p>
<div class="mock" aria-hidden="true"><div class="l"><span>Maya</span><div class="bar"><i style="width:100%"></i></div><span>Done</span></div><div class="l"><span>Jordan</span><div class="bar"><i style="width:64%"></i></div><span>p. 212</span></div><div class="l"><span>Priya</span><div class="bar"><i style="width:30%"></i></div><span>p. 98</span></div></div></div>
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

write("confirmed/index.html", layout({
  title: "Email confirmed | Bookish Club", desc: "Thanks for confirming your email.", path: "/confirmed/", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">All set</p><h1>Thank you, <em>you're confirmed</em>.</h1>
<p class="lede" id="cmsg">We'll be in touch by email. In the meantime, see what's being read near you.</p><a class="btn" href="${url("/")}">Find book clubs</a></header></div>
<script>if(new URLSearchParams(location.search).get("status")==="invalid"){document.querySelector("h1").textContent="That link has expired.";document.getElementById("cmsg").textContent="It may have been used already. If you still need help, send the form again.";}</script>`,
}));

const prose = (p, title, desc, h, html) => { write(`${p.slice(1)}index.html`, layout({ title, desc, path: p, body: `<div class="wrap">${crumbs([["Home", "/"], [h, null]])}<header class="page-head"><h1>${h}</h1></header><section class="prose">${html}</section></div>` })); page(p, 0.3); };
prose("/about/", "About Bookish Club and Our Sources", "How Bookish Club finds and lists book clubs, and how to fix or remove a listing.", "About Bookish Club", `
<p>Bookish Club is a directory of book clubs that meet in person across the United States. Finding one shouldn't take an evening of searching library calendars and bookstore newsletters, so we gather them in one place.</p>
<h2>Where listings come from</h2>
<p>Listings come from the public event pages of libraries and independent bookstores. We read those pages slowly and politely, follow each site's robots.txt and terms, and store only the basics: the club's name, city, venue, genre and meeting rhythm as published, plus a link to the source and the date we last saw it. We don't collect anyone's personal email address or phone number.</p>
<p>Clubs change. Always check the source page, linked on every listing, for the current book and date.</p>
<h2>Fix or remove a listing</h2>
<p>If you host a club, <a href="${url("/claim/")}">claim it</a> and we'll update it with you. If you'd like a listing removed, use the same form and say so in the message. We'll take it down.</p>`);
prose("/privacy/", "Privacy | Bookish Club", "What Bookish Club collects and why.", "Privacy", `
<p>Updated ${niceDate(TODAY)}.</p>
<p><b>Directory listings.</b> We list clubs from public pages and store only club-level details (name, city, venue, genre, meeting rhythm, source link, date seen). No personal contact details.</p>
<p><b>Forms.</b> When you claim a club, add a club or join the waitlist, we store what you type plus your email address. We use it only to verify your club and to email you about Bookish Club. We keep a one-way hash of your IP address for a short time to stop spam. We don't sell your data.</p>
<p><b>Your choices.</b> Every email has an unsubscribe link. To delete what you sent us, reply to any of our emails or use the claim form and say so.</p>
<p><b>Cookies.</b> This site sets no tracking cookies.</p>`);
prose("/terms/", "Terms | Bookish Club", "Terms of use for Bookish Club.", "Terms", `
<p>Bookish Club is a free directory. Listings are gathered from public sources and may be out of date; check the linked source before attending. Clubs are run by their hosts and venues, not by Bookish Club. Don't submit anything that isn't yours to share, and be kind at meetings.</p>`);

write("404.html", layout({ title: "Page not found | Bookish Club", desc: "This page has wandered off the shelf.", path: "/404.html", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">404</p>${lunair("lunair-shrug", 260, 279, 520, 553, "Bookish Club host shrugging", "shrug", true)}<h1>This page has wandered <em>off the shelf</em>.</h1><p class="lede">Try searching for your city instead.</p>${searchBox()}</header></div>` }));

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
<p class="small">Some links on this page may earn Bookish Club a small commission in future. If they do, we'll say so on the card. Picks are never paid for unless they're labelled "Sponsored".</p>
</div>${hostCallout()}`;
  write("resources/index.html", layout({ title: "Book Club Resources: Discussion Guides, Printables & Hosting Tips | Bookish Club", desc: "Free discussion guides, where to get the book, library apps, printable bookmarks and RSVP cards, hosting tips and snack pairings for your book club.", path: "/resources/", body }));
  page("/resources/", 0.7);
  write("data/resources.json", JSON.stringify({ categories: R.categories, entries: live }));

  const article = (p, title, desc, h, html) => {
    const cr = [["Home", "/"], ["Resources", "/resources/"], [h.replace(/<[^>]+>/g, ""), null]];
    write(`${p.slice(1)}index.html`, layout({ title, desc, path: p, jsonld: [crumbsLd(cr)], body: `<div class="wrap">${crumbs(cr)}<header class="page-head"><p class="eyebrow">Resources</p><h1>${h}</h1></header><section class="prose">${html}<p><a href="${url("/resources/")}">← All resources</a></p></section></div>${hostCallout()}` }));
    page(p, 0.6);
  };
  article("/resources/hosting-tips/", "How to Host a Book Club That Lasts | Bookish Club", "Practical tips for hosting a book club: picking books, setting a rhythm, running the discussion and welcoming new members.", "How to host a book club <em>that lasts</em>", `
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
<p>New members keep a club alive. <a href="${url("/start/")}">List your club</a> on Bookish Club so readers nearby can find it, and keep the meeting details current.</p>`);
  article("/resources/pairings/", "Book Club Snack and Wine Pairings by Genre | Bookish Club", "Easy themed snack and drink ideas for your next book club meeting, from mystery nights to romance picks.", "Snack and wine pairings <em>by genre</em>", `
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
  const bm = Array.from({ length: 4 }, () => `<div class="bm"><div class="pw"><span class="wm-b">Bookish</span><span class="wm-c">Club</span></div><p class="pl">Our next book</p><span class="ln"></span><span class="ln"></span><p class="pl">Meeting</p><span class="ln"></span><p class="pl">Where</p><span class="ln"></span><p class="pq">"Come even if you didn't finish."</p></div>`).join("");
  const rsvp = Array.from({ length: 4 }, () => `<div class="rsvp"><div class="pw"><span class="wm-b">Bookish</span><span class="wm-c">Club</span></div><p class="pt">You're invited to book club</p><p class="pl">Book</p><span class="ln"></span><p class="pl">Date &amp; time</p><span class="ln"></span><p class="pl">Place</p><span class="ln"></span><p class="pl">RSVP to</p><span class="ln"></span></div>`).join("");
  const pcss = `<style>
.sheet{display:grid;gap:14px;margin:18px 0 34px}.bms{grid-template-columns:repeat(4,1fr)}.rsvps{grid-template-columns:repeat(2,1fr)}
.bm,.rsvp{border:1.5px dashed var(--ink-3);border-radius:6px;padding:16px 14px;background:#fff;color:var(--ink)}
.bm{min-height:440px;display:flex;flex-direction:column}.pw{display:flex;align-items:baseline;gap:.4em;margin-bottom:14px}.pw .wm-b{font-size:20px}
.pl{font:600 10px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:14px 0 4px}.ln{display:block;border-bottom:1px solid var(--ink-3);height:24px}
.pq{margin-top:auto;font-style:italic;font-size:14px;color:var(--ink-2)}.pt{font:italic 500 20px/1.2 var(--serif);margin:0 0 6px}
@media (max-width:700px){.bms{grid-template-columns:repeat(2,1fr)}.rsvps{grid-template-columns:1fr}}
@media print{.mast,.foot-site,.crumbs,.noprint,.callout{display:none!important}body{background:#fff}.page-head{border:0;padding:0}.sheet{break-inside:avoid}.bms{grid-template-columns:repeat(4,1fr)}.rsvps{grid-template-columns:repeat(2,1fr);break-before:page}}
</style>`;
  const pcr = [["Home", "/"], ["Resources", "/resources/"], ["Printables", null]];
  write("resources/printables/index.html", layout({ title: "Printable Book Club Bookmarks and RSVP Cards (Free) | Bookish Club", desc: "Free printable bookmarks and RSVP cards for your book club. Print at home, fill in the book and date, and cut along the lines.", path: "/resources/printables/", jsonld: [crumbsLd(pcr)],
    body: `${pcss}<div class="wrap">${crumbs(pcr)}<header class="page-head"><p class="eyebrow noprint">Resources</p><h1 class="noprint">Printable bookmarks &amp; <em>RSVP cards</em></h1><p class="lede noprint">Print on card stock if you have it. Bookmarks print four to a page; RSVP cards print on the second page. Cut along the dashed lines.</p><button class="btn noprint" type="button" onclick="window.print()">Print this page</button></header>
<h2 class="noprint" style="margin-top:30px">Bookmarks</h2><div class="sheet bms">${bm}</div><h2 class="noprint">RSVP cards</h2><div class="sheet rsvps">${rsvp}</div></div>` }));
  page("/resources/printables/", 0.6);
}

// ---------- data, assets, sitemap ----------
const citiesJson = cities.map((c) => ({ n: c.name, s: c.st, u: c.u, c: c.clubs.length, g: c.genres, gp: c.genrePages, la: c.lat, lo: c.lng }));
copyDir(path.join(ROOT, "public"), OUT);
write("data/cities.json", JSON.stringify(citiesJson));
write("site.js", fs.readFileSync(path.join(ROOT, "src/site.js"), "utf8"));
write("favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#2d4a3a"/><text x="32" y="45" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="700" font-size="40" fill="#f6f0e4">B</text></svg>`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /claim/\nDisallow: /confirmed/\n\nSitemap: ${abs("/sitemap.xml")}\n`);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((s) => `<url><loc>${esc(s.loc)}</loc><lastmod>${TODAY}</lastmod><priority>${s.prio.toFixed(1)}</priority></url>`).join("\n")}\n</urlset>\n`);
write(".nojekyll", "");
if (process.env.CUSTOM_DOMAIN) write("CNAME", process.env.CUSTOM_DOMAIN + "\n");

console.log(`built ${sitemap.length} indexable pages: ${cities.length} cities, ${cities.reduce((s, c) => s + c.genrePages.length, 0)} genre-city pages, ${states.length} states, ${clubs.length} clubs -> ${path.relative(ROOT, OUT)}/ (base "${BASE}")`);
