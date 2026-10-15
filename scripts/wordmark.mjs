// Render the R2-04 "ish reply" wordmark (logos-1014/round2, recoloured to
// palette 05 Oxblood the same way color-1014-r2 did) to a transparent PNG.
// The wordmark keeps its own logo fonts (Lilita One + Sniglet); they are only
// used here, never shipped as web fonts.
// Usage: PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/wordmark.mjs
//        then: python3 scripts/wordmark-sizes.py
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const PW = process.env.PLAYWRIGHT || "/tmp/wcdprobe/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FONTS = path.join(os.homedir(), "ted-screenshots/bookish-club/color-1014-r2/assets/fonts");
const OUT = path.join(ROOT, "public/img/bookish-wordmark.png");

// Oxblood wm: outer = die-cut shadow, key = pink keyline, bubble = "ish" speech bubble
const WM = { outer: "#220710", key: "#f4a6bf", bubble: "#1d5a46", paper: "#fbf1e2" };
const FS = 200, k = FS / 100;
const T = ["rotate(-9deg) translateY(.06em)", "rotate(5deg) translateY(-.06em)", "rotate(-4deg) translateY(.03em)", "rotate(8deg) translateY(-.08em)"];
const inner = `<span class="wc" style="color:${WM.paper}">${[..."Book"].map((c, i) => `<span class="wc" style="transform:${T[i]}">${c}</span>`).join("")}</span>`
  + `<span class="wc" style="margin-left:.08em;transform:rotate(7deg) translateY(-.32em);font-family:Sniglet;font-weight:800;color:${WM.paper};font-size:.7em">`
  + `<span style="position:relative;display:inline-block;background:${WM.bubble};border-radius:.42em;padding:.06em .3em .14em">ish`
  + `<svg style="position:absolute;left:.2em;bottom:-.3em;width:.42em;height:.36em" viewBox="0 0 40 34"><path d="M0 0L6 34L32 0Z" fill="${WM.bubble}"/></svg></span></span>`;
const filt = (id, col, r) => `<filter id="${id}" x="-40%" y="-60%" width="180%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${(r / 1.75).toFixed(2)}"/><feComponentTransfer result="a"><feFuncA type="linear" slope="160" intercept="-8"/></feComponentTransfer><feFlood flood-color="${col}"/><feComposite operator="in" in2="a"/></filter>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Lilita One';src:url(file://${FONTS}/LilitaOne-400.woff2)}
@font-face{font-family:Sniglet;font-weight:800;src:url(file://${FONTS}/Sniglet-800.woff2)}
html,body{margin:0;background:transparent}
.wm{display:inline-block;font-family:'Lilita One';letter-spacing:.01em;line-height:1.15;padding:.3em .35em;font-size:${FS}px}
.wc{display:inline-block;position:relative}.wstk{display:inline-block;position:relative;vertical-align:baseline}
.wsl{display:block;white-space:nowrap}.wsl+.wsl{position:absolute;left:0;top:0}
</style></head><body><span class="wm" id="wm"><span style="display:inline-block;transform:rotate(-4deg)"><span class="wstk">
<span class="wsl" style="filter:url(#o);transform:translate(.05em,.07em)">${inner}</span>
<span class="wsl" style="filter:url(#o)">${inner}</span>
<span class="wsl" style="filter:url(#kl)">${inner}</span>
<span class="wsl">${inner}</span></span></span></span>
<svg width="0" height="0" style="position:absolute"><defs>${filt("o", WM.outer, 28 * k)}${filt("kl", WM.key, 14 * k)}</defs></svg></body></html>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bk-wm-"));
fs.writeFileSync(path.join(tmp, "wm.html"), html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(tmp, "wm.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
const ok = await page.evaluate(() => [...document.fonts].every((f) => f.status === "loaded"));
if (!ok) throw new Error("logo fonts did not load");
await page.locator("#wm").screenshot({ path: OUT, omitBackground: true });
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(OUT);
