// Rolls data/raw/*.SOURCES.md into SOURCES.md with live counts from data/clubs.json.
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const clubs = JSON.parse(fs.readFileSync(path.join(ROOT, "data/clubs.json"), "utf8"));
const by = {};
for (const c of clubs) by[c.source] = (by[c.source] ?? 0) + 1;
const order = ["library-bibliocommons", "library-other", "bookstores", "silent-book-club", "bookclubs-com", "meetup", "eventbrite"];
const files = fs.readdirSync(path.join(ROOT, "data/raw")).filter((f) => f.endsWith(".SOURCES.md"))
  .sort((a, b) => (order.indexOf(a.split(".")[0]) + 99) % 99 - (order.indexOf(b.split(".")[0]) + 99) % 99 || a.localeCompare(b));
const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `| ${s} | ${n.toLocaleString("en-US")} |`).join("\n");
const out = `# Sources

Every listing on Bookish Club comes from a public, logged-out page. Before we used any source, we read its robots.txt and its terms of use. This file records what we checked and what we decided. Sources whose terms forbid automated collection are listed here as **not used**.

Collection rules:
- We make at most one request every 1.5 to 2 seconds per host, sequentially.
- We back off on 429 and 5xx responses.
- We send the user agent \`BookishClubDirectory/0.1\`.
- Raw responses are cached so that re-runs don't hit the site again.
- We store only the club name, city, neighborhood or venue, genre or vibe (if stated), cadence (if stated), source URL and last-seen date.
- We never store personal emails, phone numbers or the names of hosts or staff.
- We list adult clubs only.

## Records in the current build (${new Date().toISOString().slice(0, 10)})

| Source | Clubs |
|---|---|
${rows}
| **Total** | **${clubs.length.toLocaleString("en-US")}** |

---

${files.map((f) => fs.readFileSync(path.join(ROOT, "data/raw", f), "utf8").trim()).join("\n\n---\n\n")}
`;
fs.writeFileSync(path.join(ROOT, "SOURCES.md"), out);
console.log(`SOURCES.md: ${files.length} source notes`);
