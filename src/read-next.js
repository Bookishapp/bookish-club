// "Stuck on what to read next?" Cold-start taps + deterministic picks. No dependencies.
// Ranking is fixed rules over data/books.json (no per-request calls). Community
// numbers come only from data/community.json, which the build fills from the
// bookish-community function: every row there already passed the privacy floor.
// Taps and saved books live in localStorage on this device only.
(() => {
  const root = document.getElementById("rn");
  if (!root) return;
  const BASE = document.documentElement.dataset.base || "";
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const PLUS = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
  const CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>`;
  const PACE = 120; // pages per week when we don't know the club's pace (spec)

  let BOOKS = [], BY = new Map(), COMM = { city: [], state: [], national: [], next: [] };
  const ready = Promise.all([
    fetch(`${BASE}/data/books.json`).then((r) => r.json()),
    fetch(`${BASE}/data/community.json`).then((r) => r.ok ? r.json() : COMM).catch(() => COMM),
  ]).then(([b, c]) => { BOOKS = b; BY = new Map(b.map((x) => [x.id, x])); COMM = c; });

  // ---------- covers ----------
  // Real covers: Open Library Covers API by cover id (not rate-limited), medium
  // size, shown whole (never cropped or overlaid) and linked to the book's
  // Open Library page. No cover, or it fails to load: the typographic cover.
  const typo = (b, w) => {
    const st = b.st || {}, words = b.t.split(" "), lw = Math.max(...words.map((x) => x.length));
    const fs = Math.min(b.t.length < 14 ? w / 6.2 : b.t.length < 24 ? w / 7.6 : w / 9.4, (w * 0.74) / (lw * 0.58));
    return `<span class="tc m-${st.m || "frame"}" style="width:${w}px;height:${Math.round(w * 1.5)}px;--cb:${st.cb || "#7a1a2a"};--ci:${st.ci || "#f3e6cf"};--fs:${fs.toFixed(1)}px;--as:${(w / 13).toFixed(1)}px;padding:0 ${(w * 0.09).toFixed(1)}px ${(w * 0.11).toFixed(1)}px ${(w * 0.14).toFixed(1)}px" aria-hidden="true"><i class="mo"></i><span class="tt">${esc(b.t)}</span>${w >= 44 ? `<span class="ta">${esc(b.a)}</span>` : ""}</span>`;
  };
  const cover = (b, w) => {
    const inner = b.c
      ? `<img class="rn-cover" src="https://covers.openlibrary.org/b/id/${b.c}-M.jpg?default=false" width="${w}" alt="" loading="lazy" decoding="async" data-id="${esc(b.id)}" data-w="${w}">`
      : typo(b, w);
    const label = `${b.t} by ${b.a}${b.ol ? " on Open Library (opens in a new tab)" : ""}`;
    return b.ol
      ? `<a class="cv" style="width:${w}px" href="https://openlibrary.org/works/${esc(b.ol)}" target="_blank" rel="noopener" aria-label="${esc(label)}">${inner}</a>`
      : `<span class="cv" style="width:${w}px" role="img" aria-label="${esc(label)}">${inner}</span>`;
  };
  root.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.classList.contains("rn-cover")) return;
    const b = BY.get(img.dataset.id);
    if (b) img.outerHTML = typo(b, +img.dataset.w);
  }, true);
  // Open Library serves a 1x1 placeholder for some ids even with default=false.
  root.addEventListener("load", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.classList.contains("rn-cover") && img.naturalWidth < 10) img.dispatchEvent(new Event("error"));
  }, true);

  // ---------- the three taps ----------
  const taste = store.get("bk_taste", { moods: [], length: null, loved: null });
  let step = 1;
  const COPY = {
    1: ["Something that'll start a fight? A slow burn? A mystery?", "Read next · 1 of 3", "What's the next one for?", "Three taps and Lunair stops guessing. Pick any.", "Next: how long?", "After that: one book you loved"],
    2: ["Weekend read or a doorstop? Be honest.", "Read next · 2 of 3", "How long can it be?", "Pick one. Your book club will thank you.", "Next: one you loved", "Then Lunair picks"],
    3: ["Name one you loved. I'll take it from there.", "Read next · 3 of 3", "One book you loved?", "Search for it. Lunair reads between the lines.", "Show me what to read", ""],
  };
  const paint = () => {
    root.dataset.step = step;
    $$(".rn-step").forEach((s) => (s.hidden = +s.dataset.s !== step));
    $$(".rn-dots i").forEach((d, i) => d.classList.toggle("on", i < step));
    const [bub, eb, h, sub, go, after] = COPY[step];
    $("#rn-bub").textContent = bub; $("#rn-eb").textContent = eb; $("#rn-h").textContent = h; $("#rn-sub").textContent = sub;
    $("#rn-go").textContent = go; $("#rn-after").textContent = after; $("#rn-after").hidden = !after;
    $("#rn-skip").textContent = step === 3 ? "Skip this one" : "Skip. Show me what clubs love.";
    $$('.rn-step[data-s="1"] .rn-opt').forEach((b) => b.setAttribute("aria-pressed", String(taste.moods.includes(b.dataset.v))));
    $$('.rn-step[data-s="2"] .rn-opt').forEach((b) => { b.setAttribute("aria-pressed", String(taste.length === b.dataset.v)); b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(taste.length === b.dataset.v)); });
    const lv = $("#rn-loved"), b = taste.loved && BY.get(taste.loved);
    lv.hidden = !b;
    if (b) lv.innerHTML = `${cover(b, 44)}<div><b>${esc(b.t)}</b><span>${esc(b.a)}</span></div><button type="button" class="rn-clear" aria-label="Pick a different book">Change</button>`;
  };
  root.addEventListener("click", (e) => {
    const o = e.target.closest(".rn-opt");
    if (o) {
      const v = o.dataset.v;
      if (step === 1) taste.moods = taste.moods.includes(v) ? taste.moods.filter((m) => m !== v) : [...taste.moods, v];
      else taste.length = taste.length === v ? null : v;
      paint(); return;
    }
    if (e.target.closest(".rn-clear")) { taste.loved = null; paint(); $("#rn-q").focus(); return; }
    const sg = e.target.closest("[data-pick]");
    if (sg) { taste.loved = sg.dataset.pick; $("#rn-q").value = ""; $("#rn-sug").hidden = true; paint(); $("#rn-go").focus(); }
  });
  $("#rn-go").addEventListener("click", () => {
    if (step < 3) { step++; paint(); window.scrollTo({ top: 0 }); return; }
    store.set("bk_taste", taste); show("taps");
  });
  $("#rn-skip").addEventListener("click", () => {
    if (step === 3) { taste.loved = null; store.set("bk_taste", taste); show("taps"); return; }
    show("skip");
  });
  // typeahead over the catalog (local, no network)
  const q = $("#rn-q"), sug = $("#rn-sug");
  q.addEventListener("input", async () => {
    await ready;
    const v = norm(q.value);
    if (v.length < 2) { sug.hidden = true; return; }
    const hits = BOOKS.filter((b) => norm(b.t).includes(v) || norm(b.a).includes(v))
      .sort((a, b) => norm(b.t).startsWith(v) - norm(a.t).startsWith(v)).slice(0, 6);
    sug.innerHTML = hits.length
      ? hits.map((b) => `<li><button type="button" role="option" data-pick="${esc(b.id)}"><b>${esc(b.t)}</b><span>${esc(b.a)}</span></button></li>`).join("")
      : `<li class="rn-none">Not in Lunair's catalog yet. Try another one you loved, or skip.</li>`;
    sug.hidden = false;
  });

  // ---------- ranking ----------
  const MOOD_LINE = { fight: "Built to split the room.", slow_burn: "All yearning, no hurry.", mystery: "Whodunit first, then the arguing.",
    cry: "Bring tissues. And wine.", big_fantasy: "Maps included. Clear the calendar.", short: "Done in a weekend." };
  const MOOD_NOUN = { fight: "bite", slow_burn: "slow burn", mystery: "whodunit pull", cry: "heartbreak", big_fantasy: "big-world sweep", short: "pace" };
  const ROW_TITLE = { fight: "Ones that start a fight", slow_burn: "Slow burns", mystery: "Whodunits", cry: "Bring tissues",
    big_fantasy: "Big fantasy, maps included", short: "Short. You're busy." };
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  const lenFit = (p, L) => {
    if (!L || L === "any" || !p) return 1;
    if (L === "short") return p < 300 ? 1 : p < 350 ? 0.5 : 0;
    if (L === "mid") return p >= 300 && p <= 450 ? 1 : p >= 250 && p <= 500 ? 0.5 : 0;
    return p > 450 ? 1 : p > 400 ? 0.5 : 0;
  };
  const shared = (a, b) => a.m.filter((m) => b.m.includes(m));
  const national = () => new Map(COMM.national.map((r) => [r.book_id, r]));

  function rank(t) {
    const loved = t.loved && BY.get(t.loved), nat = national();
    const nextFrom = new Map((loved ? COMM.next.filter((r) => r.from_book === loved.id) : []).map((r) => [r.to_book, r.clubs]));
    const maxNext = Math.max(1, ...nextFrom.values());
    const maxClubs = Math.max(1, ...COMM.national.map((r) => r.clubs));
    return BOOKS.filter((b) => b !== loved && !(loved && loved.s && b.s && b.s[0] === loved.s[0] && b.s[1] <= loved.s[1]))
      .map((b) => {
        const moodHits = t.moods.filter((m) => b.m.includes(m)).length;
        const tasteS = ((t.moods.length ? moodHits / t.moods.length : 0.5) + lenFit(b.p, t.length)) / 2;
        const sequel = !!(loved && loved.s && b.s && b.s[0] === loved.s[0] && b.s[1] === loved.s[1] + 1);
        const lovedS = loved ? shared(b, loved).length / Math.max(1, loved.m.length) + (b.a === loved.a ? 0.15 : 0) : 0;
        const hist = sequel ? 1 : (nextFrom.get(b.id) || 0) / maxNext;
        const n = nat.get(b.id);
        const commS = n ? 0.5 * (n.clubs / maxClubs) + 0.5 * (((n.mean_pour ?? 3) * n.clubs + 3 * 5) / (n.clubs + 5) / 5) : 0;
        // Spec weights: own 0.35, history 0.20, community 0.20, taste 0.15. At cold start
        // "own" is the loved book; with no loved book its weight moves to taste.
        const score = (loved ? 0.35 * lovedS + 0.15 * tasteS : 0.5 * tasteS) + 0.2 * hist + 0.2 * commS + 0.001 * hash(b.id);
        return { b, score, tasteS, lovedS, hist, sequel, n, next: nextFrom.get(b.id), moodHits };
      })
      .sort((x, y) => y.score - x.score);
  }

  function picks(t, ranked) {
    const loved = t.loved && BY.get(t.loved);
    const out = [], authors = new Set(), ok = (r) => r && !out.includes(r) && !authors.has(r.b.a) && !(r.sequel && out.some((o) => o.sequel));
    const add = (r, slot) => { if (ok(r)) { out.push(Object.assign(r, { slot })); authors.add(r.b.a); } };
    const okLen = (r) => lenFit(r.b.p, t.length) > 0;
    // A sequel or the community's "went here next" beats the length tap: it's the obvious one.
    add(ranked.find((r) => r.sequel || r.next) || (loved && [...ranked].filter(okLen).sort((x, y) => y.lovedS - x.lovedS || y.score - x.score).find(ok)) || ranked.find((r) => ok(r) && okLen(r)), "obvious");
    add([...ranked].sort((x, y) => y.tasteS - x.tasteS || y.score - x.score).find((r) => ok(r) && okLen(r)), "fit");
    add(ranked.find((r) => ok(r) && okLen(r) && r.b.m.includes("fight")) || ranked.find((r) => ok(r) && okLen(r)) || ranked.find(ok), "wildcard");
    return out;
  }

  // Why lines: fixed templates; numbers only from floor-passing community rows.
  function why(r, t) {
    const loved = t.loved && BY.get(t.loved), b = r.b;
    if (r.slot === "obvious" && r.next && loved) return `The obvious one. ${r.next} clubs went straight here after ${loved.t}.`;
    if (r.slot === "obvious" && r.sequel && loved) return `The obvious one. It picks up where ${loved.t} left off.`;
    if (r.slot === "wildcard" && b.m.includes("fight")) return "The wildcard. Someone at the table will pick a fight.";
    if (r.n && r.n.mean_pour != null && r.slot !== "fit") return `${r.n.clubs} clubs on Bookish poured it ${r.n.mean_pour} glasses.`;
    if (r.slot === "obvious" && loved) {
      const s = shared(b, loved)[0];
      if (s) return `If ${loved.t} worked, this has the same ${MOOD_NOUN[s]}.`;
    }
    const m = t.moods.find((x) => b.m.includes(x)) || b.m[0];
    if (m) return MOOD_LINE[m];
    return `${b.p} pages. The length you asked for.`;
  }
  const chips = (b, n) => [
    b.p ? `<span class="ch">${b.p} pages · ~${Math.max(1, Math.round(b.p / PACE))} wk${Math.round(b.p / PACE) > 1 ? "s" : ""}</span>` : "",
    b.p >= 550 ? `<span class="ch b">Long haul</span>` : "",
    n && n.finish_rate >= 0.9 ? `<span class="ch g">${Math.round(n.finish_rate * 100)}% finish</span>` : "",
  ].join("");

  // ---------- results ----------
  const saved = new Set(store.get("bk_saved", []));
  const saveBtn = (b, cls) => `<button type="button" class="${cls}${saved.has(b.id) ? " on" : ""}" data-save="${esc(b.id)}" aria-pressed="${saved.has(b.id)}" aria-label="${saved.has(b.id) ? "Saved" : "Save"} ${esc(b.t)}">${saved.has(b.id) ? CHECK : PLUS}<span>${saved.has(b.id) ? "Saved" : cls === "tla" ? "save" : "Save"}</span></button>`;
  const LF = `<img class="lf" src="${BASE}/img/lunair-face-40.webp" srcset="${BASE}/img/lunair-face-40.webp 1x, ${BASE}/img/lunair-face-80.webp 2x" width="20" height="20" alt="">`;
  const sugRow = (r, t) => `<li class="sug">${cover(r.b, 62)}<div class="sb2"><h3 class="st">${esc(r.b.t)}</h3><p class="sa">${esc(r.b.a)}${r.b.p ? ` · ${r.b.p} pages` : ""}</p>
<p class="why">${LF}<span>${esc(why(r, t))}</span></p><div class="chs">${chips(r.b, r.n)}</div>${saveBtn(r.b, "add")}</div></li>`;
  const GLASS = (f, i) => `<svg width="9" height="14" viewBox="0 0 22 36" aria-hidden="true"><defs><clipPath id="rg${i}"><path d="M4 2h14c.4 6-1 11.5-7 12C5 13.5 3.6 8 4 2z"/></clipPath></defs><rect x="0" y="${(3 + (1 - f) * 14).toFixed(1)}" width="22" height="14" fill="#e6a2ac" clip-path="url(#rg${i})"/><path d="M4 2h14c.4 6-1 11.5-7 12C5 13.5 3.6 8 4 2zM11 14v14M6.5 32c2-1 7-1 9 0" fill="none" stroke="#f8ecd8" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  let gid = 0;
  const pour = (s) => `<span class="pourg" role="img" aria-label="${s} of 5 glasses">${[0, 1, 2, 3, 4].map((i) => GLASS(Math.max(0, Math.min(1, s - i)), ++gid)).join("")}</span><span class="pn">${s}</span>`;
  // The save button sits under the cover, never on it (covers are shown unaltered).
  const tile = (b, line, score) => `<li class="tl">${cover(b, 92)}<p class="tlt">${esc(b.t)}</p>${score != null ? `<p class="tls">${pour(score)}</p>` : ""}<p class="tlw">${esc(line)}</p>${saveBtn(b, "tla")}</li>`;
  const row = (title, items) => items.length ? `<section class="rn-row"><h2 class="rowh">${esc(title)}</h2><ul class="tiles">${items.join("")}</ul></section>` : "";

  async function cityRows() {
    const slug = store.get("bk_city", null); // set by site.js on the last city page this reader opened
    let place = null;
    if (slug && (COMM.city.length || COMM.state.length)) {
      const cities = await fetch(`${BASE}/data/cities.json`).then((r) => r.json()).catch(() => []);
      const c = cities.find((x) => x.u === slug);
      if (c) place = c;
    }
    const tiles = (rows) => rows.filter((r) => BY.has(r.book_id)).slice(0, 8).map((r) => tile(BY.get(r.book_id), `${r.clubs} clubs here`, r.mean_pour));
    if (place) {
      const cr = COMM.city.filter((r) => r.city === place.n && r.state === place.s);
      if (cr.length) return row(`Clubs in ${place.n} loved`, tiles(cr));
      const sr = COMM.state.filter((r) => r.state === place.s);
      if (sr.length) return row(`Clubs in ${STATE[place.s] || place.s} loved`, tiles(sr));
    }
    return COMM.national.length ? row("Clubs on Bookish loved", tiles([...COMM.national].sort((a, b) => (b.mean_pour ?? 0) - (a.mean_pour ?? 0)))) : "";
  }
  const STATE = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

  async function show(mode) {
    await ready;
    const res = $(".rn-res"), t = mode === "skip" ? { moods: [], length: null, loved: null } : taste;
    const loved = t.loved && BY.get(t.loved);
    const ranked = rank(t), top = mode === "skip" ? [] : picks(t, ranked), used = new Set(top.map((r) => r.b.id));
    const rows = [await cityRows()];
    if (loved) {
      const nx = COMM.next.filter((r) => r.from_book === loved.id && BY.has(r.to_book));
      rows.push(nx.length ? row(`After ${loved.t}, clubs read`, nx.slice(0, 8).map((r) => tile(BY.get(r.to_book), `${r.clubs} clubs`)))
        : row(`Because you loved ${loved.t}`, [...ranked].sort((x, y) => y.lovedS - x.lovedS || y.score - x.score).filter((r) => !used.has(r.b.id)).slice(0, 8).map((r) => (used.add(r.b.id), tile(r.b, r.b.p ? `${r.b.p} pages` : "")))));
    }
    const moodRows = (t.moods.length ? t.moods : ["fight", "short", "cry"]).slice(0, 3);
    for (const m of moodRows) {
      const list = ranked.filter((r) => r.b.m.includes(m) && !used.has(r.b.id)).slice(0, 8);
      list.forEach((r) => used.add(r.b.id));
      rows.push(row(ROW_TITLE[m], list.map((r) => tile(r.b, r.b.p ? `${r.b.p} pages` : ""))));
    }
    const noComm = !COMM.national.length;
    res.innerHTML = `<div class="rn-rhead">${`<img class="lunair rn-peek" src="${BASE}/img/lunair-behind-book-170.webp" srcset="${BASE}/img/lunair-behind-book-170.webp 1x, ${BASE}/img/lunair-behind-book-340.webp 2x" width="161" height="170" alt="Lunair grinning behind a book">`}
<p class="eyebrow">${mode === "skip" ? "What clubs love" : "Just for you"}</p><h1 id="rn-rh" tabindex="-1">Read next</h1>
<p class="rn-sub">${mode === "skip" ? (noComm ? "Clubs on Bookish are just getting started, so these are Lunair's book-club staples for now." : "What clubs on Bookish are reading and loving.") : "Picked from your three taps and what clubs on Bookish are reading."}</p>
<button type="button" class="rn-redo" id="rn-redo">${mode === "skip" ? "Do the three taps" : "Change my taps"}</button></div>
${top.length ? `<div class="rn-card"><p class="eb2"><span>Just for you</span><span class="muted2">from your taps</span></p><h2 class="rn-ch">Three I'd hand you.</h2><ul class="sugs">${top.map((r) => sugRow(r, t)).join("")}</ul></div>` : ""}
${rows.join("")}
<div class="rn-saved-wrap"></div>
<p class="note rn-host">Reading with a club? <a href="${BASE}/resources/">Find discussion guides and hosting resources</a>.</p>
<p class="small rn-credit">Covers and book details from <a href="https://openlibrary.org/" rel="noopener">Open Library</a>. Tap a cover to see the book there.</p>`;
    paintSaved();
    $(".rn-taps").hidden = true; res.hidden = false; root.dataset.view = "results";
    history.replaceState(null, "", "#picks");
    window.scrollTo({ top: 0 });
    $("#rn-rh").focus({ preventScroll: true });
  }
  const paintSaved = () => {
    const w = $(".rn-saved-wrap");
    if (w) w.innerHTML = row("Saved for later", [...saved].filter((id) => BY.has(id)).map((id) => tile(BY.get(id), BY.get(id).a)));
  };
  root.addEventListener("click", (e) => {
    const s = e.target.closest("[data-save]");
    if (s) {
      const id = s.dataset.save;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      store.set("bk_saved", [...saved]);
      $$(`[data-save="${CSS.escape(id)}"]`).forEach((b) => { b.outerHTML = saveBtn(BY.get(id), b.classList.contains("tla") ? "tla" : "add"); });
      const keep = document.activeElement === document.body;
      paintSaved();
      const nb = $(`.sug [data-save="${CSS.escape(id)}"], .tiles [data-save="${CSS.escape(id)}"]`);
      if (nb && keep) nb.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest("#rn-redo")) {
      $(".rn-res").hidden = true; $(".rn-taps").hidden = false; root.dataset.view = "taps";
      step = 1; paint(); history.replaceState(null, "", location.pathname); window.scrollTo({ top: 0 });
    }
  });

  paint();
  // Returning reader with saved taps: go straight to their picks.
  if (location.hash === "#picks" && (taste.moods.length || taste.length || taste.loved)) show("taps");
  else if (location.hash === "#clubs") show("skip");
})();
