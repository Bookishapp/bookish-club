const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function renderLunairLibrary({ siteUrl, config }) {
  const base = new URL(siteUrl).pathname.replace(/\/$/, '');
  const asset = pathname => `${base}${pathname}`;
  const apiUrl = config.apiUrl || '';
  if (apiUrl) {
    let endpoint;
    try { endpoint = new URL(apiUrl); } catch { throw new Error('Lunair library API must be a valid Supabase HTTPS endpoint'); }
    if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/functions/v1/lunair-library') {
      throw new Error('Lunair library API must be a Supabase HTTPS lunair-library endpoint without credentials, a port, a query, or a fragment');
    }
  }
  return `<!doctype html>
<html lang="en" data-library-api="${esc(apiUrl)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#4B3866">
<title>Your library | Lunair &amp; Midnight</title>
<meta name="description" content="Find your Lunair and Midnight wallpaper packs.">
<script src="${asset('/lunair-library.js')}"></script>
<link rel="icon" href="${asset('/favicon.ico')}">
<link rel="preload" href="${asset('/fonts/youngserif-400.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/lunair.css')}">
<link rel="stylesheet" href="${asset('/lunair-library.css')}">
</head>
<body class="library-page">
<a class="skip" href="#library-main">Skip to your library</a>
<div class="hub library-hub">
  <nav class="library-nav" aria-label="Lunair"><a data-library-home href="${asset('/lunair/')}">Lunair &amp; Midnight</a><span>Your library</span></nav>
  <p id="library-test-mode" class="library-test-mode"${config.testMode === true ? '' : ' hidden'}><strong>Test mode.</strong> This library is for test purchases.</p>
  <main id="library-main">
    <header class="library-intro">
      <div><h1>Your little<br>spells.</h1><p class="lede">A little Soft, a little Unbothered,<br>and a little Feral. All yours.</p></div>
      <figure class="library-art"><img src="${asset('/img/lunair/small-rooms.webp')}" width="480" height="600" alt="Lunair and Midnight beside a tiny house: You were never too much. They just had small rooms."><figcaption>midnight is keeping your place.</figcaption></figure>
    </header>
    <section class="library-panel" aria-label="Your wallpaper library">
      <p id="library-status" class="library-status" role="status" aria-live="polite" aria-atomic="true">Loading your library…</p>
      <form id="library-form" novalidate>
        <h2>Open your library</h2>
        <p id="library-email-help">Use the email address from checkout. We’ll send you a private link, valid for 15 minutes.</p>
        <label for="library-email">Email address</label>
        <input id="library-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" aria-describedby="library-email-help library-status" required disabled>
        <button id="library-submit" class="buy" type="submit" disabled>Email my library link</button>
        <p class="library-small">No password to remember. Just a little inbox magic.</p>
      </form>
      <section id="library-owned" aria-labelledby="library-owned-heading" hidden>
        <div class="library-owned-heading"><h2 id="library-owned-heading" tabindex="-1">Your wallpapers</h2><button id="library-sign-out" class="library-text-button" type="button">Sign out</button></div>
        <p id="library-grimoire" class="library-grimoire" hidden><strong>The Grimoire is yours.</strong> Every pack, every future drop, and a new wallpaper each new moon. Future packs appear here as they arrive. One payment, lifetime access.</p>
        <ul id="library-packs" class="library-packs"></ul>
        <p id="library-empty" class="library-empty" hidden>No wallpaper packs are ready in your library yet. If you just checked out, try refreshing in a moment. <a href="${asset('/lunair/')}">Visit the shop</a>.</p>
        <div class="library-refresh-row"><button id="library-refresh" class="library-secondary" type="button">Refresh downloads</button><p>Download links expire for privacy.<br>You can get fresh links here.</p></div>
      </section>
      <noscript><p>Turn on JavaScript to open your private library. You can also use the download link in your purchase email.</p></noscript>
    </section>
    <p class="library-help">Looking for your next little spell? <a href="${asset('/lunair/')}">Back to the shop</a>.</p>
  </main>
  <footer><p>© Fictora. Wallpapers are for personal use only.<br>No resale or reuploading.</p><p><a href="${asset('/privacy/')}">Privacy</a><a href="${asset('/terms/')}">Terms</a></p></footer>
</div>
</body>
</html>`;
}
