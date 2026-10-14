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
  "VA|henrico": [37.5407, -77.4360, "Henrico"], "NY|astoria": [40.7644, -73.9235, "Astoria"],
  "PA|havertown": [39.9809, -75.3085, "Havertown"], "VA|chesterfield": [37.3771, -77.5050, "Chesterfield"],
  "PA|wallingford": [39.8907, -75.3627, "Wallingford"], "PA|chester springs": [40.0937, -75.6205, "Chester Springs"],
  "PA|glen mills": [39.9154, -75.4955, "Glen Mills"], "PA|essington": [39.8618, -75.2952, "Essington"],
  "NJ|south orange": [40.7490, -74.2613, "South Orange"], "VA|james city county": [37.2707, -76.7075, "Williamsburg"],
  "MD|belcamp": [39.4760, -76.2380, "Belcamp"], "HI|o‘ahu": [21.3069, -157.8583, "Honolulu"],
  "CA|tahoe city": [39.1677, -120.1452, "Tahoe City"], "VA|bent mountain": [37.1532, -80.1173, "Bent Mountain"],
  "FL|clearwater beach": [27.9775, -82.8271, "Clearwater"], "HI|kapa'au": [20.2333, -155.8000, "Kapaau"],
  "MA|west roxbury": [42.2793, -71.1494, "West Roxbury"], "MA|brighton": [42.3484, -71.1563, "Brighton"],
  "MA|jamaica plain": [42.3097, -71.1151, "Jamaica Plain"], "MA|roslindale": [42.2912, -71.1245, "Roslindale"],
  "MA|allston": [42.3539, -71.1337, "Allston"], "MA|dorchester": [42.3016, -71.0676, "Dorchester"],
  "MA|charlestown": [42.3782, -71.0602, "Charlestown"], "MA|roxbury": [42.3152, -71.0914, "Roxbury"],
  "MA|hyde park": [42.2565, -71.1241, "Hyde Park"], "MA|mattapan": [42.2771, -71.0914, "Mattapan"],
  "MA|east boston": [42.3702, -71.0389, "East Boston"], "MA|south boston": [42.3381, -71.0476, "South Boston"],
  "TX|cypress": [29.9691, -95.6972, "Cypress"], "TX|kingwood": [30.0499, -95.1844, "Kingwood"],
  "MD|whiteford": [39.7068, -76.3469, "Whiteford"], "MD|joppa": [39.4337, -76.3580, "Joppa"], "MD|white hall": [39.6573, -76.6077, "White Hall"],
  "FL|loxahatchee": [26.6837, -80.2795, "Loxahatchee"], "CA|cardiff-by-the-sea": [33.0203, -117.2795, "Cardiff-by-the-Sea"],
  "VA|spotsylvania": [38.2015, -77.5878, "Spotsylvania"], "VA|stafford": [38.4221, -77.4083, "Stafford"],
  "UT|salt lake": [40.7608, -111.8910, "Salt Lake City"], "TN|nashville": [36.1627, -86.7816, "Nashville"], "KY|lexington": [38.0406, -84.5037, "Lexington"],
  "GA|athens": [33.9519, -83.3576, "Athens"], "GA|augusta": [33.4735, -82.0105, "Augusta"],
  "GA|columbus": [32.4610, -84.9877, "Columbus"], "HI|honolulu": [21.3069, -157.8583, "Honolulu"],
  "KS|kansas city": [39.1141, -94.6275, "Kansas City"], "IN|indianapolis": [39.7684, -86.1581, "Indianapolis"],
};
// County subdivisions fill the gaps for New England / NJ / PA / MI / NY towns
// and townships that aren't Census "places" (e.g. Montclair, NJ).
for (const r of get("2024_Gaz_cousubs_national")) {
  const [st, , , name, , , aland, , , , lat, lng] = r;
  if (/^County subdivisions not defined|^Census County|unorganized/i.test(name)) continue;
  const clean = name.replace(/ (township|town|city|village|borough|charter township|plantation|CCD|district|precinct|gore|grant|purchase|location)$/i, "").trim();
  const key = `${st}|${clean.toLowerCase()}`;
  if (!places[key]) places[key] = [+(+lat).toFixed(4), +(+lng).toFixed(4), clean, Number(aland)];
  const full = `${st}|${name.toLowerCase()}`;
  if (!places[full]) places[full] = [+(+lat).toFixed(4), +(+lng).toFixed(4), name, Number(aland)];
}
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
