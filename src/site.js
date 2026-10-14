// Bookish Club client script: city/ZIP search, genre filter, forms. No dependencies.
(() => {
  const BASE = document.documentElement.dataset.base || "";
  const API = document.documentElement.dataset.api || "";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // ---------- search ----------
  let cities = null;
  const loadCities = () => cities ? Promise.resolve(cities) :
    fetch(`${BASE}/data/cities.json`).then((r) => r.json()).then((d) => (cities = d));
  const miles = (a, b, c, d) => {
    const R = 3958.8, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const cityUrl = (c, genre) => `${BASE}/book-clubs/${c.u}/${genre && c.gp && c.gp.includes(genre) ? genre + "/" : genre ? "#" + genre : ""}`;

  function renderResults(box, title, list, genre) {
    if (!list.length) {
      box.innerHTML = `<div class="empty"><img class="lunair peek" src="${BASE}/img/lunair-peek-260.webp" width="215" height="140" alt=""><p>We don't have book clubs listed there yet. <a href="${BASE}/start/">Start one</a> and we'll put it on the map.</p></div>`;
      return;
    }
    box.innerHTML = `<p class="eyebrow">${esc(title)}</p><div class="grid cols-3">${list.map((c) =>
      `<a class="city-tile" href="${cityUrl(c, genre)}"><b>${esc(c.n)}, ${c.s}</b><span>${genre ? (c.g[genre] || 0) : c.c} club${(genre ? c.g[genre] : c.c) === 1 ? "" : "s"}${c.d != null ? ` · ${Math.round(c.d)} mi` : ""}</span></a>`).join("")}</div>`;
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
      sug.innerHTML = list.map((c) => `<li><a href="${cityUrl(c, g.value)}"><span>${esc(c.n)}, ${c.s}</span><span class="n">${g.value ? c.g[g.value] : c.c} clubs</span></a></li>`).join("");
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

  // ---------- genre filter on city pages ----------
  const fb = $("#filter");
  if (fb) {
    const cards = $$(".clubs .club");
    const empty = $("#filter-empty");
    const apply = (genre) => {
      $$(".chip", fb).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === genre)));
      let shown = 0;
      cards.forEach((c) => { const ok = !genre || (c.dataset.g || "").split(" ").includes(genre); c.hidden = !ok; shown += ok; });
      if (empty) empty.hidden = shown > 0;
    };
    fb.addEventListener("click", (e) => {
      const b = e.target.closest(".chip[data-g]");
      if (!b) return;
      apply(b.dataset.g);
      history.replaceState(null, "", b.dataset.g ? `#${b.dataset.g}` : location.pathname);
    });
    const h = location.hash.slice(1);
    if (h && $(`.chip[data-g="${CSS.escape(h)}"]`, fb)) apply(h);
  }

  // ---------- forms ----------
  const params = new URLSearchParams(location.search);
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
            ? ({ joined: "You're in! The host will see you on the list. Check your email for the details.",
                 already_requested: "You've already asked to join this club. We'll email you when the host replies." }[j.status]
               || (j.host_on_bookish
                 ? "Request sent. The host will get your note and can say yes or no. We'll email you either way."
                 : "Request saved. This club's host hasn't joined Bookish yet, so we're holding your note and will pass it on when they do. Meanwhile the listing's source page has the next meeting details."))
            : j.confirm_sent
            ? "Thank you. Check your inbox for a short note from us and tap the link to confirm."
            : "Thank you, it's in. We read every note and will be in touch by email.";
          f.querySelectorAll("input,select,textarea,button").forEach((el) => (el.disabled = true));
          return;
        }
        const why = { email: "That email address doesn't look right.", rate_limited: "You've sent a few of these already. Please try again later.",
          links_not_allowed: "Please leave links out of the message.", consent: "Please tick the box so we can email you.",
          club_details: "Please add your club's name and city.", invite_invalid: "That invite code doesn't match this club. Check it with your host, or send a request without it.",
          club: "We couldn't tell which club this is. Go back and tap Ask to join on the club's listing." }[j.error];
        throw new Error(why || "Something went wrong on our side. Please try again in a minute.");
      } catch (err) {
        msg.className = "form-msg err";
        msg.textContent = err.message.startsWith("Failed to fetch") ? "We couldn't reach the server. Check your connection and try again." : err.message;
      } finally { if (!f.querySelector(".form-msg.ok")) { btn.disabled = false; btn.textContent = label; } }
    });
  });
})();
