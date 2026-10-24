// Static site generator for Bookish. Zero dependencies.
//   SITE_URL=https://bookishclub.com node scripts/build.mjs   -> dist/
// SITE_URL decides canonical URLs and the base path (e.g. /bookish-club on
// a GitHub Pages project URL, empty on a custom domain).
import fs from "node:fs";
import path from "node:path";
import { GENRES_LIST, STATE_NAMES } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE_URL = (process.env.SITE_URL || "https://meetbookish.com").replace(/\/$/, "");
const BASE = new URL(SITE_URL).pathname.replace(/\/$/, "");
const API = process.env.BOOKISH_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-submit";
const OUT = path.join(ROOT, "dist");
const JOIN_API = process.env.BOOKISH_JOIN_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-join";
const TODAY = new Date().toISOString().slice(0, 10);

const GENRES = Object.fromEntries(GENRES_LIST);
const KEEP_CASE = new Set(["spanish-language", "lgbtq"]);
const lc = (g) => KEEP_CASE.has(g) ? GENRES[g] : GENRES[g].toLowerCase();
// Only geographic route names are static. Club facts come from fresh server reads.
const routeMap=new Map();
for(const c of JSON.parse(fs.readFileSync(path.join(ROOT,"data/clubs.json"),"utf8"))){
 const key=`${c.city}|${c.state}`;
 if(!routeMap.has(key))routeMap.set(key,{city:c.city,state:c.state,genres:{}});
 for(const g of c.genres||[]){const counts=routeMap.get(key).genres;counts[g]=(counts[g]||0)+1;}
}
const geographicRoutes=[...routeMap.values()];
const VERIFIED_API = "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-verified";
const DIRECTORY_API = process.env.BOOKISH_DIRECTORY_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-directory";

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

const genreTotals = Object.fromEntries(GENRES_LIST.map(([g])=>[g,1]));
const sitemap = [];
const page = (p, prio = 0.6) => sitemap.push({ loc: abs(p), prio });

// ---------- layout ----------
// R2-04 "ish reply" wordmark, Oxblood recolour (scripts/wordmark.mjs). Fixed box, so no layout shift.
const WORDMARK = (eager) => `<img src="${url("/img/wordmark-160.webp")}" srcset="${url("/img/wordmark-160.webp")} 1x, ${url("/img/wordmark-320.webp")} 2x, ${url("/img/wordmark-480.webp")} 3x" width="160" height="62" alt="Bookish"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
const CSS = (fs.readFileSync(path.join(ROOT, "src/theme.css"), "utf8") + fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8")).replaceAll("__BASE__", BASE).replace(/\n\s*/g, "\n");

function layout({ title, desc, path: p, body, jsonld = [], noindex = false }) {
  const canonical = abs(p);
  return `<!doctype html>
<html lang="en" data-base="${BASE}" data-api="${API}" data-join-api="${JOIN_API}" data-directory-api="${DIRECTORY_API}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#4a1420">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bookish: Book Club Night">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${url("/favicon.ico")}" sizes="any">
<link rel="icon" href="${url("/favicon-32x32.png")}" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${url("/apple-touch-icon.png")}" sizes="180x180">
<link rel="manifest" href="${url("/site.webmanifest")}">
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
<nav class="nav" aria-label="Main"><a class="hide-sm" href="${url("/book-clubs/")}">Browse</a><a class="hide-sm" href="${url("/read-next/")}">Read next</a><a class="hide-sm" href="${url("/hosts/")}">For hosts</a><a class="hide-sm" href="${url("/resources/")}">Resources</a><a class="btn-sm" href="${url("/start/")}">Start a club</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot-site"><div class="wrap cols">
<div><a class="wordmark" href="${url("/")}">${WORDMARK(false)}</a>
<p>A directory of real book clubs that meet near you, gathered from the public pages of libraries and bookstores. Every listing links to its source. Details change, so check there before you go.</p>
<p class="credit">Book covers and book details from <a href="https://openlibrary.org/" rel="noopener">Open Library</a>.</p></div>
<div><p class="h">Find</p><ul><li><a href="${url("/book-clubs/")}">All cities</a></li><li><a href="${url("/read-next/")}">What to read next</a></li>${["romance", "mystery-thriller", "fantasy", "nonfiction"].filter((g) => genreTotals[g] >= 5).map((g) => `<li><a href="${url(`/genres/${g}/`)}">${GENRES[g]} clubs</a></li>`).join("")}</ul></div>
<div><p class="h">Hosts</p><ul><li><a href="${url("/start/")}">Start a club</a></li><li><a href="${url("/claim/")}">Claim your club</a></li><li><a href="${url("/hosts/")}">Host tools</a></li><li><a href="${url("/resources/")}">Resources</a></li><li><a href="${url("/about/")}">About &amp; sources</a></li><li><a href="${url("/privacy/")}">Privacy</a> · <a href="${url("/terms/")}">Terms</a></li></ul></div>
</div></footer>
<script src="${url("/discovery.js")}" defer></script>
<script src="${url("/site.js")}" defer></script>
${body.includes('id="club-map"') ? `<script src="${url("/map.js")}" defer></script>` : ""}
${body.includes('id="rn"') ? `<script src="${url("/read-next.js")}" defer></script>` : ""}
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
// Geographic shells never embed club facts, ids, counts, or structured listings.
const hostCallout = () => `<section><div class="wrap"><div class="callout-card"><h2>A seat for your club.</h2><p>Choose Open, Private, or Hidden, and bring your readers together.</p><a class="btn" href="${url('/start/')}">Start a club</a> <a href="${url('/club-settings/')}">Club settings</a></div></div></section>`;
function discoveryPage(p,title,scope={}) {
 const body=`<div class="wrap"><header class="page-head"><p class="eyebrow">Good books. Your people.</p><h1>${esc(title)}</h1><p class="lede">Open clubs welcome anyone. Private clubs ask the host to approve. Hosts share meeting details with their members.</p></header>${searchBox()}<div id="club-map" class="club-map" role="region" aria-label="Book clubs by city"></div><section id="live-directory" data-city="${esc(scope.city||'')}" data-state="${esc(scope.state||'')}" data-genre="${esc(scope.genre||'')}"><h2>Find your people</h2><label>Search clubs<input id="live-query" type="search" placeholder="Club name, city, or genre"></label><p id="live-status" role="status">Loading current clubs…</p><ul class="clubs" id="live-clubs"></ul><button class="btn" id="live-more" hidden>More clubs</button></section></div>${hostCallout()}`;
 write(p==='/'?'index.html':`${p.slice(1)}index.html`,layout({title:`${title} | Bookish`,desc:'Find Open and Private book clubs. Club listings are checked live so hosts control who can find their club.',path:p,body}));
 page(p,p==='/'?1:0.6);
}
discoveryPage('/','Pull up a chair.');
discoveryPage('/book-clubs/','Find a book club');
for(const [genre,label] of GENRES_LIST) discoveryPage(`/genres/${genre}/`,`${label} book clubs`,{genre});
for(const state of [...new Set(geographicRoutes.map(c=>c.state))]) discoveryPage(`/book-clubs/${stateSlug(state)}/`,`Book clubs in ${STATE_NAMES[state]||state}`,{state});
for(const {city,state,genres} of geographicRoutes){
 const route=`/book-clubs/${slug(city)}-${state.toLowerCase()}/`;
 discoveryPage(route,`Book clubs in ${city}, ${state}`,{city,state});
 for(const [genre,count] of Object.entries(genres))if(count>=3&&GENRES[genre])discoveryPage(`${route}${genre}/`,`${GENRES[genre]} book clubs in ${city}, ${state}`,{city,state,genre});
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
</fieldset>
<fieldset class="mapq"><legend>Who can find and join your club?</legend>
<label class="check"><input type="radio" name="visibility" value="open" required> Open: shown on the map and in search; anyone can join.</label>
<label class="check"><input type="radio" name="visibility" value="private" required checked> Private: shown with your name, area, and current book; you approve requests.</label>
<label class="check"><input type="radio" name="visibility" value="hidden" required> Hidden: invite code or link only.</label>
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
<p class="lede">Choose who can find your club, and confirm your email to open its settings. Starting from scratch? Tell us the city and the kind of books, and we'll let readers nearby know.</p></header>
<section><form class="form" data-kind="start" novalidate>
<label>Club name<input name="club_name" required maxlength="160" placeholder="The Tuesday Night Mystery Society"></label>
<div class="row two"><label>City<input name="city" required maxlength="80" autocomplete="address-level2"></label><label>State<select name="state" required><option value="">Choose…</option>${stateOptions}</select></label></div>
<div class="row two"><label>ZIP <span class="muted">(optional)</span><input name="zip" inputmode="numeric" maxlength="10" autocomplete="postal-code"></label><label>What you read<select name="genre">${genreSelect}</select></label></div>
<div class="row two"><label>How often you meet<input name="cadence" maxlength="80" placeholder="First Sunday, monthly"></label><label>Format<select name="format"><option value="in-person">In person</option><option value="online">Online</option><option value="hybrid">Both</option></select></label></div>
<fieldset class="mapq"><legend>Where does the club meet?</legend>
<label class="check"><input type="radio" name="meets_at" value="public" checked> A public place (library, bookstore, café)</label>
<label class="check"><input type="radio" name="meets_at" value="home"> Someone's home</label>
<label class="check"><input type="radio" name="meets_at" value="online"> Online</label>
</fieldset>
<fieldset class="mapq"><legend>Who can find and join your club?</legend>
<label class="check"><input type="radio" name="visibility" value="open" required> Open: shown on the map and in search; anyone can join.</label>
<label class="check"><input type="radio" name="visibility" value="private" required checked> Private: shown with your name, area, and current book; you approve requests.</label>
<label class="check"><input type="radio" name="visibility" value="hidden" required> Hidden: invite code or link only.</label>
</fieldset>
<label>About the club <span class="muted">(optional)</span><textarea name="about" maxlength="1000" placeholder="Where you meet, the vibe, who it's for."></textarea></label>
<div class="row two"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label></div>
<p class="small">Your email stays off the public listing. After confirming it, you can change visibility, rotate invites, and review requests in club settings.</p>
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
<p class="lede">Visibility, invites, and join approvals are ready in <a href="${url('/club-settings/')}">club settings</a>. Open your original host confirmation link to manage your club. We're building more tools for the person who keeps the club going. No group-chat archaeology to find the date, no spreadsheet of who's read what. These aren't live yet. Join the waitlist and we'll invite hosts in small groups.</p></header>
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
<div class="row two"><label>Do you host a club now?<select name="is_host"><option value="yes">Yes</option><option value="soon">Starting one</option><option value="no">No, I'm a member</option></select></label><label>Club size<select name="club_size"><option value="">Select</option><option>2–5</option><option>6–12</option><option>13–25</option><option>26+</option></select></label></div>
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
<p class="lede">Send the host a short hello. They'll see your first name, email, and note, and can approve your request in club settings. Got an invite link or code from the host? Add the code and you're in straight away.</p></header>
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
`,
}));
write("join/done/index.html", layout({
  title: "Request update | Bookish", desc: "Join request update.", path: "/join/done/", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">Join requests</p><h1 id="jd-h">Done.</h1><p class="lede" id="jd-p">Your response was saved.</p><a class="btn" href="${url("/")}">Back to Bookish</a></header></div>
<script>(function(){var r=new URLSearchParams(location.search).get("result"),h=document.getElementById("jd-h"),p=document.getElementById("jd-p");if(r==="approved"){h.textContent="You said yes.";p.textContent="The reader is approved. You can share the next meeting with them.";}else if(r==="declined"){h.textContent="Request declined.";p.textContent="The request is now declined.";}else{h.textContent="That link has already been used.";p.textContent="Each request can only be answered once.";}})();</script>`,
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
<p><b>Club visibility.</b> Open clubs appear in discovery and welcome anyone. Private clubs appear with their name, area, and current book, and the host approves requests. Hidden clubs stay out of discovery and require a current invite code or link. Hosts can change this in club settings.</p>
<p><b>Your choices.</b> Every email has an unsubscribe link. To delete what you sent us, reply to any of our emails or use the claim form and say so.</p>
<p><b>Read next.</b> Your three taps, the books you save and the last city page you opened stay on your device (browser storage). We don't receive them. Book covers load from Open Library, which sees a normal image request.</p>
<p><b>Cookies.</b> This site sets no tracking cookies.</p>`);
prose("/terms/", "Terms | Bookish", "Terms of use for Bookish.", "Terms", `
<p>Bookish is a free directory. Listings are gathered from public sources and may be out of date; check the linked source before attending. Clubs are run by their hosts and venues, not by Bookish. Don't submit anything that isn't yours to share, and be kind at meetings.</p>`);

write("404.html", layout({ title: "Page not found | Bookish", desc: "This page has wandered off the shelf.", path: "/404.html", noindex: true,
  body: `<div class="wrap"><header class="page-head" style="padding-top:60px"><p class="eyebrow">404</p>${lunair("lunair-shrug", 260, 279, 520, 553, "Bookish host shrugging", "shrug", true)}<h1>This page has wandered <em>off the shelf</em>.</h1><p class="lede">Try searching for your city instead.</p>${searchBox()}</header></div>` }));

// ---------- read next ("Stuck on what to read next?") ----------
// Catalog: data/books.json (scripts/catalog.mjs, Open Library metadata +
// cover ids, fetched once and committed; this build never calls Open Library).
// Community stats: the bookish-community edge function, which only returns
// rows that pass the privacy floor (bookish_privacy_floor() in sql/003).
// A failed fetch builds with no community rows, so nothing un-floored can
// ever show. BOOKISH_COMMUNITY_FILE points at a local JSON file (previews).
const COMMUNITY_API = process.env.BOOKISH_COMMUNITY_API || "https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-community";
async function loadCommunity() { return {city:[],state:[],national:[],next:[]}; }

{
  const books = JSON.parse(fs.readFileSync(path.join(ROOT, "data/books.json"), "utf8")).books;
  const community = await loadCommunity();
  write("data/books.json", JSON.stringify(books.map(({ id, t, a, pages, ol, cover, moods, series, style }) => ({ id, t, a, p: pages, ol, c: cover, m: moods, ...(series ? { s: series } : {}), st: style }))));
  write("data/community.json", JSON.stringify(community));
  console.log(`read next: ${books.length} books, community rows city ${community.city.length} / state ${community.state.length} / national ${community.national.length} / next ${community.next.length}`);
  const MOODS = [["fight", "Start a fight", "the club picks sides"], ["slow_burn", "A slow burn", "yearning, mostly"], ["mystery", "A mystery", "whodunit, then discuss"],
    ["cry", "Make me cry", "bring tissues and wine"], ["short", "Short. We're busy.", "under 300 pages"], ["big_fantasy", "Big fantasy", "maps included"]];
  const CHECK = `<i class="rn-ck" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></i>`;
  const opt = ([k, t, s]) => `<button type="button" class="rn-opt" data-v="${k}" aria-pressed="false"><b>${esc(t)}</b><span>${esc(s)}</span>${CHECK}</button>`;
  const body = `<div id="rn" class="rn" data-step="1">
<div class="wrap rn-wrap">
<section class="rn-taps" aria-labelledby="rn-h">
<div class="rn-top"><a class="rn-x" href="${url("/")}" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></a><div class="rn-dots" aria-hidden="true"><i class="on"></i><i></i><i></i></div><span class="rn-sp"></span></div>
<div class="rn-hero">${lunair("lunair-explain", 240, 231, 480, 461, "Lunair, the Bookish host, explaining", "rn-lun", true)}<p class="rn-bub" id="rn-bub">Something that'll start a fight? A slow burn? A mystery?</p></div>
<p class="eyebrow" id="rn-eb">Read next · 1 of 3</p>
<h1 class="rn-h" id="rn-h">What's the next one for?</h1>
<p class="rn-sub" id="rn-sub">Three taps and Lunair stops guessing. Pick any.</p>
<div class="rn-step" data-s="1"><div class="rn-opts" role="group" aria-label="Moods">${MOODS.map(opt).join("")}</div></div>
<div class="rn-step" data-s="2" hidden><div class="rn-opts" role="radiogroup" aria-label="Length">${[["short", "Short", "under 300 pages"], ["mid", "Middle of the road", "300 to 450 pages"], ["long", "A doorstop", "450 pages and up"], ["any", "Any length", "it's just a number"]].map(opt).join("")}</div></div>
<div class="rn-step" data-s="3" hidden><div class="rn-find"><label class="sr-only" for="rn-q">Search for a book you loved</label><input id="rn-q" type="search" placeholder="Search a title or author" autocomplete="off" aria-autocomplete="list" aria-controls="rn-sug"><ul id="rn-sug" class="rn-sug" role="listbox" hidden></ul><div id="rn-loved" class="rn-loved" hidden></div></div></div>
<div class="rn-acts"><button type="button" class="rn-go" id="rn-go">Next: how long?</button>
<p class="rn-after" id="rn-after">After that: one book you loved</p>
<button type="button" class="rn-skip" id="rn-skip">Skip. Show me what clubs love.</button></div>
<noscript><p class="note">This part of Bookish needs JavaScript to pick your books.</p></noscript>
</section>
<section class="rn-res" hidden aria-labelledby="rn-rh"></section>
</div></div>`;
  write("read-next/index.html", layout({
    title: "Stuck on What to Read Next? Book Club Picks in Three Taps | Bookish",
    desc: "Tell Lunair the mood, the length and one book you loved. Get three books to read next, picked for book clubs, plus what clubs on Bookish are reading.",
    path: "/read-next/", body,
  }));
  page("/read-next/", 0.7);
}

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
copyDir(path.join(ROOT, "public"), OUT);
write("data/cities.json", "[]");
write("data/clubs.json", "[]");
write("data/clubs.geojson", JSON.stringify({type:"FeatureCollection",features:[]}));
for (const file of ["site.js","discovery.js","club-settings.js","read-next.js","map.js"]) write(file, fs.readFileSync(path.join(ROOT,`src/${file}`),"utf8"));
write("club-settings/index.html",layout({title:"Club settings | Bookish",desc:"Manage your club visibility, invites, and join requests.",path:"/club-settings/",noindex:true,body:`<div class="wrap"><header class="page-head"><h1>Club settings</h1><p>Open your host link from the club confirmation email. Keep it private: it controls your club.</p></header><section id="host-settings"><form id="host-link" class="form"><label>Host link<input name="link" type="password" required autocomplete="off"></label><button class="btn">Open settings</button></form><p id="host-status" role="status"></p><div id="host-controls"></div></section></div><script src="${url('/club-settings.js')}" defer></script>`}));
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /claim/\nDisallow: /confirmed/\nDisallow: /join/\n\nSitemap: ${abs("/sitemap.xml")}\n`);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((s) => `<url><loc>${esc(s.loc)}</loc><lastmod>${TODAY}</lastmod><priority>${s.prio.toFixed(1)}</priority></url>`).join("\n")}\n</urlset>\n`);
write(".nojekyll", "");
if (process.env.CUSTOM_DOMAIN) write("CNAME", process.env.CUSTOM_DOMAIN + "\n");

console.log(`built ${sitemap.length} geographic and resource pages; club discovery is live and never bundled.`);
