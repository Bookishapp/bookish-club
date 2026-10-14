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
  const PIN = C("--map-pin", "#2d4a3a"), CLUSTER = C("--map-cluster", "#7b2d26");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const load = (tag, attrs) => new Promise((res, rej) => { const n = document.createElement(tag); Object.assign(n, attrs); n.onload = res; n.onerror = rej; document.head.appendChild(n); });

  async function init() {
    el.classList.add("loading");
    await Promise.all([
      load("link", { rel: "stylesheet", href: `https://unpkg.com/maplibre-gl@${MLV}/dist/maplibre-gl.css` }),
      load("script", { src: `https://unpkg.com/maplibre-gl@${MLV}/dist/maplibre-gl.js` }),
    ]);
    const data = await fetch(`${BASE}/data/clubs.geojson`).then((r) => r.json());
    const focus = el.dataset.city;
    const here = focus && data.features.find((f) => f.properties.u === focus);
    const map = new maplibregl.Map({
      container: el, style: STYLE, attributionControl: { compact: true }, maxZoom: 11,
      center: here ? here.geometry.coordinates : [-96.5, 38.5], zoom: here ? 8.2 : 3.1, cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      el.classList.remove("loading");
      map.addSource("cities", { type: "geojson", data, cluster: true, clusterRadius: 44, clusterMaxZoom: 7,
        clusterProperties: { total: ["+", ["get", "n"]] } });
      map.addLayer({ id: "clusters", type: "circle", source: "cities", filter: ["has", "point_count"], paint: {
        "circle-color": CLUSTER, "circle-opacity": 0.92, "circle-stroke-color": "#fff", "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "total"], 15, 10, 19, 50, 24, 200, 30] } });
      map.addLayer({ id: "cluster-count", type: "symbol", source: "cities", filter: ["has", "point_count"],
        layout: { "text-field": ["to-string", ["get", "total"]], "text-size": 12, "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#fff" } });
      map.addLayer({ id: "city", type: "circle", source: "cities", filter: ["!", ["has", "point_count"]], paint: {
        "circle-color": ["case", ["==", ["get", "u"], focus || ""], CLUSTER, PIN], "circle-stroke-color": "#fff", "circle-stroke-width": 2,
        "circle-radius": ["interpolate", ["linear"], ["get", "n"], 1, 7, 10, 11, 50, 16] } });
      map.addLayer({ id: "city-label", type: "symbol", source: "cities", filter: ["!", ["has", "point_count"]],
        layout: { "text-field": ["concat", ["get", "c"], " · ", ["to-string", ["get", "n"]]], "text-size": 12, "text-font": ["Noto Sans Bold"],
          "text-offset": [0, 1.4], "text-anchor": "top", "text-optional": true },
        paint: { "text-color": "#2b241e", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

      map.on("click", "clusters", async (e) => {
        const f = e.features[0];
        const z = await map.getSource("cities").getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3 });
      });
      map.on("click", "city", (e) => {
        const p = e.features[0].properties;
        const names = String(p.top || "").split("\u001f").filter(Boolean);
        new maplibregl.Popup({ offset: 12, maxWidth: "300px", className: "club-pop" }).setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<p class="pop-name">${esc(p.c)} · ${p.n} club${p.n == 1 ? "" : "s"}</p>
<ul class="pop-list">${names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
<p class="pop-actions"><a href="${BASE}/book-clubs/${p.u}/">See ${p.n > names.length ? `all ${p.n}` : "them"} &amp; ask to join →</a></p>`).addTo(map);
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
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "200px" });
    io.observe(el);
  } else go();
})();
