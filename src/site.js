// Bookish Club client script: city/ZIP search, genre filter, forms. No dependencies.
(() => {
  const BASE = document.documentElement.dataset.base || "";
  const API = document.documentElement.dataset.api || "";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // ---------- search ----------
  const loadCities = () => window.bookishDiscovery('cities').catch(()=>[]);
  const clearDiscovery = () => { for(const id of ['suggest','results']) {const el=document.getElementById(id);if(el)el.innerHTML='';} };
  window.addEventListener('focus', clearDiscovery);
  document.addEventListener('visibilitychange', clearDiscovery);
  const miles = (a, b, c, d) => {
    const R = 3958.8, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const cityUrl = (c, genre, mode) => `${BASE}/book-clubs/?city=${encodeURIComponent(c.n)}&state=${c.s}${genre?`&genre=${encodeURIComponent(genre)}`:''}${mode?`#${mode==='on'?'on-bookish':'listed'}`:''}`;

  const countText = (n, v) => `${n} club${n === 1 ? "" : "s"}${v ? ` · ${v} on Bookish` : ""}`;
  function renderResults(box, title, list, genre) {
    if (!list.length) {
      box.innerHTML = `<div class="empty"><img class="lunair peek" src="${BASE}/img/lunair-peek-260.webp" width="215" height="140" alt=""><p>We don't have book clubs listed there yet. <a href="${BASE}/start/">Start one</a> and we'll put it on the map.</p></div>`;
      return;
    }
    const rows = list.map((c) => ({ c, n: genre ? (c.g[genre] || 0) : c.c, v: genre ? ((c.vg || {})[genre] || 0) : (c.v || 0) }));
    const V = rows.reduce((s, r) => s + r.v, 0), U = rows.reduce((s, r) => s + r.n - r.v, 0);
    let mode = V ? "on" : "listed";
    const draw = () => {
      const shown = rows.filter((r) => (mode === "on" ? r.v : r.n - r.v) > 0);
      box.innerHTML = `<p class="eyebrow">${esc(title)}</p>
<div class="seg-wrap" data-mode="${mode}"><div class="seg" role="group" aria-label="Which clubs to show">
<button type="button" class="seg-b" data-mode="on" aria-pressed="${mode === "on"}"><span class="seg-l">On Bookish</span> <span class="c">${V}</span></button>
<button type="button" class="seg-b" data-mode="listed" aria-pressed="${mode === "listed"}"><span class="seg-l">Listed from public calendars</span> <span class="c">${U}</span></button></div>
<p class="seg-note">${mode === "on"
  ? (V ? "Hosts run these clubs on Bookish. Request to join and the host says yes or no." : `No host has claimed a club in these cities yet. <a href="${BASE}/start/">Start one</a> or <a href="${BASE}/claim/">claim yours</a>.`)
  : `${V ? "" : "<b>No host has claimed a club in these cities yet.</b> "}These come from public library and bookstore calendars. They're not on Bookish, so you can't request to join.`}</p></div>
${shown.length ? `<div class="grid cols-3">${shown.map(({ c, n, v }) =>
  `<a class="city-tile" href="${cityUrl(c, genre, mode)}"><b>${esc(c.n)}, ${c.s}</b><span>${mode === "on" ? `${v} on Bookish` : `${n - v} listed from public calendars`}${c.d != null ? ` · ${Math.round(c.d)} mi` : ""}</span></a>`).join("")}</div>` : ""}`;
      $(".seg", box).addEventListener("click", (e) => { const b = e.target.closest(".seg-b"); if (b) { mode = b.dataset.mode; draw(); $(`.seg-b[data-mode="${mode}"]`, box).focus(); } });
    };
    draw();
  }

  async function nearZip(zip, genre) {
    const pre = zip.slice(0, 3);
    const m = await fetch(`${BASE}/data/zip/${pre}.json`).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
    const pt = m[zip];
    if (!pt) return null;
    const all = await loadCities();
    return all.filter((c) => c.la != null && (!genre || c.g[genre]))
      .map((c) => ({ ...c, d: miles(pt[0], pt[1], c.la, c.lo) }))
      .filter((c) => c.d <= 60).sort((a, b) => a.d - b.d).slice(0, 12);
  }
  function matchCities(all, q, genre) {
    const n = norm(q).replace(/ (al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)$/, (m) => "|" + m.trim());
    const [name, st] = n.split("|");
    return all.filter((c) => (!genre || c.g[genre]) && (!st || c.s.toLowerCase() === st) && norm(c.n).startsWith(name))
      .concat(all.filter((c) => (!genre || c.g[genre]) && (!st || c.s.toLowerCase() === st) && !norm(c.n).startsWith(name) && norm(c.n).includes(name)))
      .slice(0, 12);
  }

  const form = $("#search");
  if (form) {
    const q = $("#q", form), g = $("#genre", form), box = $("#results"), sug = $("#suggest");
    let active = -1;
    q.addEventListener("focus", loadCities, { once: true });
    q.addEventListener("input", async () => {
      const v = q.value.trim();
      if (v.length < 2 || /^\d/.test(v)) { sug.hidden = true; return; }
      const list = matchCities(await loadCities(), v, g.value).slice(0, 6);
      active = -1;
      sug.innerHTML = list.map((c) => `<li><a href="${cityUrl(c, g.value)}"><span>${esc(c.n)}, ${c.s}</span><span class="n">${g.value ? countText(c.g[g.value] || 0, (c.vg || {})[g.value] || 0) : countText(c.c, c.v || 0)}</span></a></li>`).join("");
      sug.hidden = !list.length;
    });
    q.addEventListener("keydown", (e) => {
      const items = $$("a", sug);
      if (sug.hidden || !items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((a, i) => a.classList.toggle("on", i === active));
      } else if (e.key === "Enter" && active >= 0) { e.preventDefault(); location.href = items[active].href; }
      else if (e.key === "Escape") sug.hidden = true;
    });
    document.addEventListener("click", (e) => { if (!form.contains(e.target)) sug.hidden = true; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      sug.hidden = true;
      const v = q.value.trim(), genre = g.value;
      const gl = genre ? g.options[g.selectedIndex].text.toLowerCase() + " " : "";
      if (/^\d{5}$/.test(v)) {
        const list = await nearZip(v, genre);
        if (list === null) box.innerHTML = `<div class="empty"><img class="lunair peek" src="${BASE}/img/lunair-peek-260.webp" width="215" height="140" alt=""><p>We couldn't find ZIP ${esc(v)}. Try a city name instead.</p></div>`;
        else renderResults(box, `${gl}book clubs near ${v}`, list, genre);
      } else if (v) {
        const list = matchCities(await loadCities(), v, genre);
        if (list.length === 1) { location.href = cityUrl(list[0], genre); return; }
        renderResults(box, `${gl}book clubs matching “${v}”`, list, genre);
      } else if (genre) {
        location.href = `${BASE}/genres/${genre}/`; return;
      } else { q.focus(); return; }
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    const pre = new URLSearchParams(location.search).get("q");
    if (pre) { q.value = pre; form.requestSubmit(); }
  }

  // ---------- "On Bookish" / "Listed from public calendars" toggle ----------
  // Verified clubs (a host claimed it and is on Bookish) vs unclaimed clubs
  // (listed from public calendars). Works with the genre chips: a card shows
  // only when it matches both the mode and the genre.
  const seg = $(".seg-wrap");
  const fb = $("#filter");
  const state = { mode: seg ? seg.dataset.mode : null, genre: "" };
  const mainList = $("#club-list");
  const applyAll = () => {
    if (seg) {
      seg.dataset.mode = state.mode;
      $$(".seg-b", seg).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
      $$(".seg-note", seg).forEach((n) => (n.hidden = n.dataset.note !== state.mode));
    }
    const want = state.mode === "on" ? "1" : "0";
    const fits = (c, g) => (!seg || c.dataset.v === want) && (!g || (c.dataset.g || "").split(" ").includes(g));
    let mainShown = 0, modeTotal = 0;
    $$(".clubs").forEach((ul) => {
      const isMain = ul === mainList;
      let shown = 0;
      $$(".club", ul).forEach((c) => {
        const ok = fits(c, isMain ? state.genre : "");
        c.hidden = !ok; shown += ok;
        if (isMain && fits(c, "")) modeTotal++;
      });
      if (isMain) mainShown = shown;
      const sec = ul.closest(".seg-sec");
      if (sec) sec.hidden = !shown;
    });
    if (fb && mainList) {
      $$(".chip", fb).forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.g === state.genre));
        const n = $$(".club", mainList).filter((c) => fits(c, b.dataset.g)).length;
        const cEl = $(".c", b); if (cEl) cEl.textContent = n;
        if (b.dataset.g && !n && b.dataset.g !== state.genre) b.dataset.emptyMode = ""; else delete b.dataset.emptyMode;
      });
    }
    $$(".seg-empty").forEach((e) => (e.hidden = !(e.dataset.empty === state.mode && modeTotal === 0)));
    const fe = $("#filter-empty");
    if (fe) fe.hidden = !(modeTotal > 0 && mainShown === 0);
    // Genre hub city tiles follow the mode too.
    $$("[data-seg-tiles] .city-tile").forEach((t) => {
      const n = +t.dataset.n, v = +t.dataset.v, k = state.mode === "on" ? v : n - v;
      t.hidden = !k;
      t.href = `${t.dataset.href}#${state.mode === "on" ? "on-bookish" : "listed"}`;
    });
  };
  if (seg) seg.addEventListener("click", (e) => {
    const b = e.target.closest(".seg-b");
    if (!b) return;
    state.mode = b.dataset.mode; applyAll();
    history.replaceState(null, "", `#${state.mode === "on" ? "on-bookish" : "listed"}`);
  });
  if (fb) fb.addEventListener("click", (e) => {
    const b = e.target.closest(".chip[data-g]");
    if (!b) return;
    state.genre = b.dataset.g; applyAll();
    history.replaceState(null, "", b.dataset.g ? `#${b.dataset.g}` : location.pathname);
  });
  {
    const h = location.hash.slice(1);
    if (seg && (h === "on-bookish" || h === "listed")) state.mode = h === "listed" ? "listed" : "on";
    else if (fb && h && $(`.chip[data-g="${CSS.escape(h)}"]`, fb)) state.genre = h;
    if (seg || fb) applyAll();
  }

  // Remember the last city page opened (this device only) so Read next can show
  // "Clubs in <city> loved" when that city has enough clubs behind the number.
  { const cm = $("#club-map[data-city]"); if (cm) try { localStorage.setItem("bk_city", JSON.stringify(cm.dataset.city)); } catch {} }

  // ---------- forms ----------
  const params = new URLSearchParams(location.search);
  const invite = new URLSearchParams(location.hash.slice(1));
  if (invite.has('club')) params.set('club_id',invite.get('club'));
  if (invite.has('invite')) params.set('invite_code',invite.get('invite'));
  if (invite.has('invite')) history.replaceState(null,'',location.pathname);

  $$("form[data-kind]").forEach((f) => {
    const started = Date.now();
    for (const [k, v] of params) {
      const el = f.elements[k];
      if (el && "value" in el && el.type !== "radio" && el.type !== "checkbox" && !el.value) el.value = v.slice(0, 200);
    }
    // "List my club in <city>": on by default for public venues, OFF by
    // default for home-based clubs, n/a for online. Never an address.
    const toggle = f.elements.show_on_map, note = $(".map-note", f), lc = $(".list-city", f);
    const cityIn = f.elements.city || f.elements.club_city;
    const syncCity = () => { if (lc) lc.textContent = (cityIn && cityIn.value.trim()) || "my city"; };
    const syncMap = () => {
      const where = (f.elements.meets_at || {}).value;
      if (!toggle) return;
      toggle.checked = where !== "home";
      if (note) note.textContent = where === "home"
        ? "Off by default for clubs at someone's home. If you turn it on, readers see only the club and your city, never the address."
        : "Readers see the club and your city, never the address. Exact place and time are only shared with members you approve.";
    };
    $$("input[name=meets_at]", f).forEach((r) => r.addEventListener("change", syncMap));
    if (cityIn) cityIn.addEventListener("input", syncCity);
    syncMap(); syncCity();
    const msg = $(".form-msg", f), btn = $("button[type=submit]", f);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.className = "form-msg"; msg.textContent = "";
      if (!f.reportValidity()) return;
      const data = { kind: f.dataset.kind, elapsed_ms: Date.now() - started };
      for (const el of f.elements) {
        if (!el.name) continue;
        if (el.type === "radio") { if (el.checked) data[el.name] = el.value; continue; }
        if (el.type === "checkbox") {
          if (el.name === "consent" || el.name === "show_on_map") data[el.name] = el.checked;
          else if (el.checked) data[el.name] = data[el.name] ? `${data[el.name]}, ${el.value}` : el.value;
        } else data[el.name] = el.value;
      }
      btn.disabled = true; const label = btn.textContent; btn.textContent = "Sending…";
      try {
        const r = await fetch(f.dataset.api || API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          f.reset();
          msg.className = "form-msg ok";
          msg.textContent = f.dataset.kind === "join"
            ? ({ joined: "You're in! Ask the host for the next meeting details.",
                 already_requested: "You've already asked to join this club. We'll email you when the host replies." }[j.status]
               || "Request sent. The host can approve it in club settings.")
            : j.confirm_sent
            ? "Thank you. Check your inbox for a short note from us and tap the link to confirm."
            : "Thank you, it's in. We read every note and will be in touch by email.";
          f.querySelectorAll("input,select,textarea,button").forEach((el) => (el.disabled = true));
          return;
        }
        const why = { email: "That email address doesn't look right.", rate_limited: "You've sent a few of these already. Please try again later.",
          links_not_allowed: "Please leave links out of the message.", consent: "Please tick the box so we can email you.",
          club_details: "Please add your club's name and city.", visibility: "Choose Open, Private, or Hidden.", city: "Use a supported US city and its state. Check the city spelling.", unavailable: "This club or invite is unavailable. Check with your host.", invite_invalid: "That invite code doesn't match this club. Check it with your host, or send a request without it.",
          club: "We couldn't tell which club this is. Go back and tap Request to join on the club's listing.",
          not_on_bookish: "This club isn't on Bookish yet, so its host can't get requests here. Check its listing for the time and place." }[j.error];
        throw new Error(why || "Something went wrong on our side. Please try again in a minute.");
      } catch (err) {
        msg.className = "form-msg err";
        msg.textContent = err.message.startsWith("Failed to fetch") ? "We couldn't reach the server. Check your connection and try again." : err.message;
      } finally { if (!f.querySelector(".form-msg.ok")) { btn.disabled = false; btn.textContent = label; } }
    });
  });
})();
