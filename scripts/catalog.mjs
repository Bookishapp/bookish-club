// Read next catalog: data/books.seed.json -> data/books.json (committed).
//   node scripts/catalog.mjs
// Looks each seed book up ONCE on the Open Library Search API (metadata only)
// and stores its work id, cover id, page count and first year. The site never
// calls Open Library at build time or by ISBN at runtime: pages show
// covers.openlibrary.org/b/id/<cover id>-M.jpg, and cover-id URLs are not
// rate-limited (https://openlibrary.org/dev/docs/api/covers).
// Policy we follow (https://openlibrary.org/developers/api): identified
// User-Agent, at most 1 request per second, responses cached in .cache/
// (gitignored) so re-runs don't re-hit the API, no HTML scraping.
// Covers are shown as identification thumbnails linked to the book's Open
// Library page. Never cropped, altered, overlaid, or used in ads/marketing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(ROOT, ".cache/openlibrary");
const UA = "BookishClub/1.0 (book club directory; https://github.com/fictora/bookish-club; hello@getkres.com)";
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data/books.seed.json"), "utf8")).books;
fs.mkdirSync(CACHE, { recursive: true });

const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = 0;
async function search(t, a) {
  const u = `https://openlibrary.org/search.json?title=${encodeURIComponent(t)}${a ? `&author=${encodeURIComponent(a)}` : ""}&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year,edition_count&limit=8`;
  const f = path.join(CACHE, crypto.createHash("sha1").update(u).digest("hex") + ".json");
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const wait = last + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${t}`);
  const j = await r.json();
  fs.writeFileSync(f, JSON.stringify(j));
  return j;
}

// Typographic fallback colourways (theme palette), picked deterministically per title.
const WAYS = [["#7a1a2a", "#f3e6cf"], ["#1d5a46", "#ecb74e"], ["#22325a", "#f3e6cf"], ["#ecb74e", "#1d1712"], ["#e6a2ac", "#33101a"],
  ["#c9dcc0", "#17443a"], ["#d97a52", "#1d1712"], ["#efe2c6", "#7a1a2a"], ["#1d1712", "#ecb74e"], ["#a9c487", "#1d1712"], ["#c4485a", "#fdfaf2"]];
const MOTIFS = ["sun", "band", "frame", "key"];
const styleFor = (t) => {
  const h = crypto.createHash("md5").update(t).digest();
  const [cb, ci] = WAYS[h[0] % WAYS.length];
  return { cb, ci, m: MOTIFS[h[1] % MOTIFS.length] };
};

const out = [], misses = [];
for (const b of seed) {
  const j = await search(b.t, b.ol_any_author ? "" : b.a);
  const want = norm(b.t), who = norm(b.a).split(" ").pop();
  const docs = (j.docs ?? []).filter((d) => b.ol_any_author || (d.author_name ?? []).some((n) => norm(n).includes(who)));
  const exact = docs.filter((d) => norm(d.title) === want);
  const pool = exact.length ? exact : docs.filter((d) => norm(d.title).startsWith(want));
  const d = pool.sort((x, y) => (!!y.cover_i - !!x.cover_i) || (y.edition_count ?? 0) - (x.edition_count ?? 0))[0];
  if (!d) misses.push(b.t);
  const pages = d?.number_of_pages_median ?? b.pages ?? null;
  const moods = [...b.moods];
  if (pages && pages < 300 && !moods.includes("short")) moods.push("short");
  out.push({
    id: slug(b.t), t: b.t, a: b.a, pages, year: d?.first_publish_year ?? null,
    ol: d ? d.key.replace("/works/", "") : null, cover: d?.cover_i ?? null,
    moods, ...(b.series ? { series: b.series } : {}), style: b.style ?? styleFor(b.t),
  });
}
fs.writeFileSync(path.join(ROOT, "data/books.json"), JSON.stringify({ source: "Open Library (openlibrary.org), metadata + cover ids", fetched: new Date().toISOString().slice(0, 10), books: out }, null, 1) + "\n");
console.log(`${out.length} books, ${out.filter((b) => b.cover).length} with covers, ${out.filter((b) => b.pages).length} with page counts`);
if (misses.length) console.log("no Open Library match:", misses.join(" | "));

// Same catalog as an idempotent upsert for the bookish_books table (003).
const q = (v) => v == null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => `array[${a.map(q).join(",")}]::text[]`;
const rows = out.map((b) => `(${[q(b.id), q(b.ol), q(b.t), arr([b.a]), q(b.pages), q(b.year), q(b.cover), arr(b.moods), q(b.series?.[0]), q(b.series?.[1]), `${q(JSON.stringify(b.style))}::jsonb`].join(", ")})`);
fs.writeFileSync(path.join(ROOT, "supabase/sql/004_bookish_books_seed.sql"), `-- Generated by scripts/catalog.mjs from data/books.json. Re-run that script, then this file.
insert into public.bookish_books (id, ol_work_id, title, authors, pages, first_year, cover_id, moods, series_key, series_pos, cover_style) values
${rows.join(",\n")}
on conflict (id) do update set ol_work_id = excluded.ol_work_id, title = excluded.title, authors = excluded.authors, pages = excluded.pages,
  first_year = excluded.first_year, cover_id = excluded.cover_id, moods = excluded.moods, series_key = excluded.series_key,
  series_pos = excluded.series_pos, cover_style = excluded.cover_style;
`);
