// The shop uses provider-hosted checkout and delivery. Empty URLs stay unavailable.
const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function renderLunair({ siteUrl, checkout }) {
  const base = new URL(siteUrl).pathname.replace(/\/$/, '');
  const asset = pathname => `${base}${pathname}`;
  const canonical = `${siteUrl.replace(/\/$/, '')}/lunair/`;
  const destinations = new Set();
  function buy(key, label, product) {
    const value = checkout[key];
    if (value === '' || value == null) return `<button class="buy" type="button" data-checkout="${key}" aria-label="${product}, coming soon" disabled>Coming soon</button>`;
    let destination;
    try { destination = new URL(value); } catch { throw new Error(`${key} checkout must be a valid https URL`); }
    if (destination.protocol !== 'https:' || destination.username || destination.password) throw new Error(`${key} checkout must be a valid https URL without credentials`);
    if (destinations.has(destination.href)) throw new Error('Checkout URLs must point to different products');
    destinations.add(destination.href);
    return `<a class="buy" data-checkout="${key}" href="${esc(destination.href)}">${label}</a>`;
  }
  const packButton = buy('vol1', 'Get Vol. 1 for $9', 'Spells for Grown-Ups, Vol. 1');
  const vaultButton = buy('grimoire', 'Get The Grimoire for $19', 'The Grimoire');
  const unavailable = !checkout.vol1 && !checkout.grimoire;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#4B3866">
<title>Lunair &amp; Midnight | Wallpapers &amp; little spells</title>
<meta name="description" content="A grown-up witch, her deeply unimpressed cat, and a little magic for your lock screen. Explore Spells for Grown-Ups and The Grimoire.">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="Lunair &amp; Midnight">
<meta property="og:description" content="A little magic for your very human life. Wallpapers, little spells, and a cat with opinions.">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(siteUrl.replace(/\/$/, '') + '/img/lunair/social.png')}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Lunair and Midnight, with three illustrated little spells.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${asset('/favicon.ico')}">
<link rel="preload" href="${asset('/fonts/youngserif-400.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/lunair.css')}">
<script src="${asset('/lunair.js')}" defer></script>
</head>
<body>
<a class="skip" href="#shop">Skip to the shop</a>
<main class="hub">
  <header class="intro">
    <div class="hello">
      <p class="signature">a witch, a cat, and a few little spells.</p>
      <h1>Lunair &amp;<br>Midnight</h1>
      <p class="lede">A little magic for your<br>very human life.</p>
      <p class="aside">(midnight remains unconvinced.)</p>
    </div>
    <figure class="art">
      <div class="posters">
        <img class="poster first" src="${asset('/img/lunair/manifest.webp')}" width="480" height="600" alt="Lunair and Midnight in the Manifest it illustration.">
        <img class="poster middle" src="${asset('/img/lunair/small-rooms.webp')}" width="480" height="600" alt="Lunair and Midnight beside a tiny house: You were never too much. They just had small rooms.">
        <img class="poster last" src="${asset('/img/lunair/brunch.webp')}" width="480" height="600" alt="Lunair and Midnight share pancakes beneath a ringed planet: Ego death, then brunch.">
      </div>
      <figcaption>little spells. big lock-screen energy.</figcaption>
    </figure>
  </header>

  <section id="shop" aria-labelledby="shop-heading">
    <h2 class="section-title" id="shop-heading">Keep a little magic close.</h2>
    ${unavailable ? '<p class="opening-note">The wallpaper shop is opening soon. Have a look around while Midnight supervises.</p>' : ''}
    <div class="products">
      <article class="product pack">
        <div class="product-top"><p class="edition">The wallpaper collection</p><p class="price">$9</p></div>
        <h3>Spells for<br>Grown-Ups</h3>
        <p class="volume">Vol. 1</p>
        <p>30 wallpapers for the stuff therapy didn’t cover. A little Soft, a little Unbothered, and a little Feral.</p>
        <p class="detail">iPhone and Android sizes. Yours to keep.</p>
        ${packButton}
      </article>
      <article class="product vault">
        <div class="product-top"><p class="edition">The lifetime collection</p><p class="price">$19</p></div>
        <h3>The Grimoire</h3>
        <p class="volume">One payment. Every little spell.</p>
        <p>Every wallpaper pack, every future drop, and a new wallpaper with each new moon.</p>
        <p class="detail">Lifetime access. For the witch who wants it all.</p>
        ${vaultButton}
      </article>
    </div>
    <article class="merch">
      <div><h3>Off the screen,<br>into your everyday.</h3><p>Tees, prints, and other little comforts.</p></div>
      <span class="soon">Merch coming soon</span>
    </article>
  </section>

  <nav class="elsewhere" aria-label="More from Lunair and Midnight">
    <a href="https://www.instagram.com/lunairandmidnight/"><span class="link-title">Find us on Instagram</span><span class="link-detail">@lunairandmidnight</span></a>
    <a data-pass-utm href="https://fictora.co/?utm_source=instagram&amp;utm_campaign=lunairandmidnight"><span class="link-title">Lunair’s day job: talk to your favorite book characters</span><span class="link-detail">Step into Fictora</span></a>
  </nav>
  <footer>
    <p>A grown-up witch and her deeply unimpressed cat.</p>
    <p>© Fictora. Wallpapers are for personal use only.<br>No resale or reuploading.</p>
    <p><a href="${asset('/privacy/')}">Privacy</a><a href="${asset('/terms/')}">Terms</a><a href="${asset('/')}">Meet Bookish</a></p>
  </footer>
</main>
</body>
</html>`;
  const target = asset('/lunair/');
  // A normal link remains usable with scripting disabled. JS preserves attribution.
  const redirect = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lunair &amp; Midnight</title><link rel="canonical" href="${esc(canonical)}"><meta name="robots" content="noindex"></head><body><p>Find Lunair &amp; Midnight at <a href="${target}">their new home</a>.</p><script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script></body></html>`;
  return { html, redirect };
}
