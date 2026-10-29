// Bookish club map: CITY LEVEL ONLY. One point per city (Census centroid)
// with a club count; tapping opens that city's list. No venue, address or
// neighborhood is ever plotted. MapLibre GL + free OpenFreeMap tiles (no key),
// loaded only when the map scrolls into view.
(() => {
  const el = document.getElementById("club-map");
  if (!el) return;
  const BASE = document.documentElement.dataset.base || "";
  const MLV = "4.7.1";
  const STYLE = "https://tiles.openfreemap.org/styles/positron";
  const css = getComputedStyle(document.documentElement);
  const C = (v, d) => (css.getPropertyValue(v).trim() || d);
  const PIN = C("--map-pin", "#2d4a3a"), CLUSTER = C("--map-cluster", "#7b2d26"), ON = C("--map-on", "#8a6420");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const load = (tag, attrs) => new Promise((res, rej) => { const n = document.createElement(tag); Object.assign(n, attrs); n.onload = res; n.onerror = rej; document.head.appendChild(n); });

  async function init() {
    el.classList.add("loading");
    await Promise.all([
      load("link", { rel: "stylesheet", href: `https://unpkg.com/maplibre-gl@${MLV}/dist/maplibre-gl.css` }),
      load("script", { src: `https://unpkg.com/maplibre-gl@${MLV}/dist/maplibre-gl.js` }),
    ]);
    const data = await window.bookishDiscovery('geojson');
    const focus = el.dataset.city;
    const here = focus && data.features.find((f) => f.properties.u === focus);
    const map = new maplibregl.Map({
      container: el, style: STYLE, attributionControl: { compact: true }, maxZoom: 11,
      center: here ? here.geometry.coordinates : [-96.5, 38.5], zoom: here ? 8.2 : 3.1, cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      el.classList.remove("loading");
      const attr = el.querySelector(".maplibregl-ctrl-attrib");
      if (attr) attr.classList.remove("maplibregl-compact-show");
      let revision=0;
      const revalidate=async()=>{const current=++revision;map.getSource('cities').setData({type:'FeatureCollection',features:[]});sheet.hidden=true;try{const fresh=await window.bookishDiscovery('geojson');if(current===revision)map.getSource('cities').setData(fresh);}catch{}};
      window.addEventListener('focus',revalidate);
      document.addEventListener('visibilitychange',()=>{if(document.hidden){revision++;map.getSource('cities').setData({type:'FeatureCollection',features:[]});sheet.hidden=true;}else void revalidate();});
      map.addSource("cities", { type: "geojson", data, cluster: true, clusterRadius: 44, clusterMaxZoom: 7,
        clusterProperties: { total: ["+", ["get", "n"]] } });
      map.addLayer({ id: "clusters", type: "circle", source: "cities", filter: ["has", "point_count"], paint: {
        "circle-color": CLUSTER, "circle-opacity": 0.92, "circle-stroke-color": "#fff", "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "total"], 15, 10, 19, 50, 24, 200, 30] } });
      map.addLayer({ id: "cluster-count", type: "symbol", source: "cities", filter: ["has", "point_count"],
        layout: { "text-field": ["to-string", ["get", "total"]], "text-size": 12, "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#fff" } });
      map.addLayer({ id: "city", type: "circle", source: "cities", filter: ["!", ["has", "point_count"]], paint: {
        "circle-color": ["case", ["==", ["get", "u"], focus || ""], CLUSTER, PIN], "circle-stroke-color": ["case", [">", ["get", "v"], 0], ON, "#fff"], "circle-stroke-width": ["case", [">", ["get", "v"], 0], 3, 2],
        "circle-radius": ["interpolate", ["linear"], ["get", "n"], 1, 7, 10, 11, 50, 16] } });
      map.addLayer({ id: "city-label", type: "symbol", source: "cities", filter: ["!", ["has", "point_count"]],
        // "Folsom, CA · 4 clubs · 1 on Bookish"
        layout: { "text-field": ["concat", ["get", "c"], " · ", ["to-string", ["get", "n"]], ["case", ["==", ["get", "n"], 1], " club", " clubs"],
          ["case", [">", ["get", "v"], 0], ["concat", " · ", ["to-string", ["get", "v"]], " on Bookish"], ""]], "text-size": 12, "text-font": ["Noto Sans Bold"],
          "text-offset": [0, 1.4], "text-anchor": "top", "text-optional": true },
        paint: { "text-color": "#2b241e", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

      map.on("click", "clusters", async (e) => {
        const f = e.features[0];
        const z = await map.getSource("cities").getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3 });
      });
      // City sheet (opens under the map): the same "On Bookish" / "Listed
      // from public calendars" toggle as the city page, defaulting to
      // verified when any exist. City-level only: club names, no venues.
      const sheet = document.createElement("section");
      sheet.className = "map-sheet"; sheet.hidden = true; sheet.setAttribute("aria-live", "polite");
      el.insertAdjacentElement("afterend", sheet);
      let cur = null;
      const draw = () => {
        const { p, mode } = cur;
        const n = +p.n, v = +p.v || 0, u = n - v;
        const on = String(p.topv || "").split("\u001f").filter(Boolean);
        const off = String(p.top || "").split("\u001f").filter(Boolean);
        const city = `${BASE}/book-clubs/?city=${encodeURIComponent(p.c.slice(0,-4))}&state=${encodeURIComponent(p.c.slice(-2))}`;
        sheet.innerHTML = `<div class="ms-head"><h3 class="pop-name">${esc(p.c)} <span>· ${n} club${n === 1 ? "" : "s"}${v ? ` · ${v} on Bookish` : ""}</span></h3><button type="button" class="ms-x" aria-label="Close">×</button></div>
<div class="seg seg-sm" role="group" aria-label="Which clubs to show">
<button type="button" class="seg-b" data-mode="on" aria-pressed="${mode === "on"}">On Bookish <span class="c">${v}</span></button>
<button type="button" class="seg-b" data-mode="listed" aria-pressed="${mode === "listed"}">Listed from public calendars <span class="c">${u}</span></button></div>
${mode === "on"
  ? (v ? `<ul class="pop-list on">${on.map((x) => `<li>${esc(x)} <span class="badge on sm">On Bookish</span></li>`).join("")}</ul><p class="pop-actions"><a class="btn" href="${city}#on-bookish">See ${v > on.length ? `all ${v}` : v === 1 ? "it" : "them"} &amp; request to join</a></p>`
       : `<p class="pop-note">No host has claimed a club in ${esc(p.c)} yet, so there's nobody on Bookish to ask. <a href="${BASE}/start/">Start one</a></p>`)
  : `<p class="pop-note">${v ? "" : `<b>No host has claimed a club here yet.</b> `}Listed from public library and bookstore calendars. Not on Bookish, so you can't request to join.</p><ul class="pop-list off">${off.map((x) => `<li>${esc(x)} <span class="badge off sm">Not on Bookish yet</span></li>`).join("")}</ul><p class="pop-actions"><a class="btn ghost" href="${city}#listed">See where ${u === 1 ? "it meets" : "they meet"}</a></p>`}`;
      };
      sheet.addEventListener("click", (ev) => {
        if (ev.target.closest(".ms-x")) { sheet.hidden = true; return; }
        const b = ev.target.closest(".seg-b");
        if (!b) return;
        cur.mode = b.dataset.mode; draw();
        const nb = sheet.querySelector(`.seg-b[data-mode="${cur.mode}"]`); if (nb) nb.focus();
      });
      map.on("click", "city", (e) => {
        const p = e.features[0].properties;
        cur = { p, mode: +p.v > 0 ? "on" : "listed" };
        draw(); sheet.hidden = false;
        map.easeTo({ center: e.features[0].geometry.coordinates });
        const r = sheet.getBoundingClientRect();
        if (r.bottom > innerHeight) sheet.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      for (const l of ["clusters", "city"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }
    });
  }
  let started = false;
  const go = () => { if (started) return; started = true; init().catch((e) => { el.classList.remove("loading"); el.classList.add("failed"); console.error(e); }); };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "0px", threshold: 0.35 });
    io.observe(el);
  } else go();
})();
