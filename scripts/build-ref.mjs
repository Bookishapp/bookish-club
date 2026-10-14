// Builds reference geodata from US Census Gazetteer files (public domain).
//   data/ref/places.json   "ST|city name lowercased" -> [lat, lng, "Display Name"]
//   public/data/zip/<3-digit>.json  { "78701": [lat, lng], ... }  (lazy-loaded by ZIP search)
// Usage: node scripts/build-ref.mjs   (downloads into .cache/ref on first run)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(ROOT, ".cache/ref");
const BASE = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer";
fs.mkdirSync(CACHE, { recursive: true });

function get(name) {
  const txt = path.join(CACHE, `${name}.txt`);
  if (!fs.existsSync(txt)) {
    execSync(`curl -sSL -o "${CACHE}/${name}.zip" "${BASE}/${name}.zip" && unzip -o -q "${CACHE}/${name}.zip" -d "${CACHE}"`);
  }
  return fs.readFileSync(txt, "utf8").split("\n").slice(1).filter(Boolean).map((l) => l.split("\t").map((s) => s.trim()));
}

const SUFFIX = / (city and borough|city|town|township|village|borough|CDP|municipality|plantation|comunidad|zona urbana|unified government \(balance\)|metropolitan government \(balance\)|consolidated government \(balance\)|metro government \(balance\)|city \(balance\)|\(balance\))$/i;
const places = {};
for (const r of get("2024_Gaz_place_national")) {
  const [st, , , name, , , aland, , , , lat, lng] = r;
  let clean = name.replace(SUFFIX, "").replace(SUFFIX, "").replace(/-.* (metropolitan|unified|consolidated) government.*$/i, "").trim();
  const key = `${st}|${clean.toLowerCase()}`;
  // Prefer incorporated places / bigger land area on name collisions.
  if (!places[key] || Number(aland) > places[key][3]) places[key] = [+(+lat).toFixed(4), +(+lng).toFixed(4), clean, Number(aland)];
}
// Common names that are not Census places (NYC boroughs etc.).
const ALIASES = {
  "NY|brooklyn": [40.6501, -73.9496, "Brooklyn"], "NY|queens": [40.7282, -73.7949, "Queens"],
  "NY|bronx": [40.8448, -73.8648, "Bronx"], "NY|the bronx": [40.8448, -73.8648, "Bronx"],
  "NY|staten island": [40.5795, -74.1502, "Staten Island"], "NY|manhattan": [40.7831, -73.9712, "Manhattan"],
  "NY|new york city": [40.7128, -74.006, "New York"], "DC|washington dc": [38.9072, -77.0369, "Washington"],
  "DC|district of columbia": [38.9072, -77.0369, "Washington"], "CA|hollywood": [34.0928, -118.3287, "Hollywood"],
  "CA|north hollywood": [34.1870, -118.3813, "North Hollywood"], "CA|van nuys": [34.1899, -118.4514, "Van Nuys"],
  "CA|encino": [34.1592, -118.5012, "Encino"], "CA|sherman oaks": [34.1508, -118.4490, "Sherman Oaks"],
  "CA|san pedro": [33.7361, -118.2923, "San Pedro"], "CA|studio city": [34.1396, -118.3870, "Studio City"],
  "CA|woodland hills": [34.1683, -118.6059, "Woodland Hills"], "CA|northridge": [34.2283, -118.5368, "Northridge"],
  "CA|venice": [33.9850, -118.4695, "Venice"], "CA|silver lake": [34.0869, -118.2702, "Silver Lake"],
  "CA|echo park": [34.0782, -118.2606, "Echo Park"], "TX|the woodlands": [30.1658, -95.4613, "The Woodlands"],
  "TN|nashville": [36.1627, -86.7816, "Nashville"], "KY|lexington": [38.0406, -84.5037, "Lexington"],
  "GA|athens": [33.9519, -83.3576, "Athens"], "GA|augusta": [33.4735, -82.0105, "Augusta"],
  "GA|columbus": [32.4610, -84.9877, "Columbus"], "HI|honolulu": [21.3069, -157.8583, "Honolulu"],
  "KS|kansas city": [39.1141, -94.6275, "Kansas City"], "IN|indianapolis": [39.7684, -86.1581, "Indianapolis"],
};
for (const [k, v] of Object.entries(ALIASES)) places[k] = [...v, 0];
for (const k of Object.keys(places)) places[k] = places[k].slice(0, 3);
fs.mkdirSync(path.join(ROOT, "data/ref"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/ref/places.json"), JSON.stringify(places));

const zips = {};
for (const [zip, , , , , lat, lng] of get("2024_Gaz_zcta_national")) {
  const p = zip.slice(0, 3);
  (zips[p] ??= {})[zip] = [+(+lat).toFixed(3), +(+lng).toFixed(3)];
}
const zdir = path.join(ROOT, "public/data/zip");
fs.mkdirSync(zdir, { recursive: true });
for (const [p, m] of Object.entries(zips)) fs.writeFileSync(path.join(zdir, `${p}.json`), JSON.stringify(m));
console.log(`places: ${Object.keys(places).length}, zip prefixes: ${Object.keys(zips).length}`);
