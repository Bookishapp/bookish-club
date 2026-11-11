// Release destinations are configured here. Keep Google Play empty until public.
export const STORE_URLS = Object.freeze({
  appStore: 'https://apps.apple.com/us/app/bookish-book-club-night/id6823470101',
  googlePlay: '',
});

const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function renderStoreDownloads(base = '', stores = STORE_URLS) {
  const android = stores.googlePlay
    ? `<a class="store-downloads__badge store-downloads__play" href="${esc(stores.googlePlay)}"><img src="${base}/img/get-it-on-google-play.png" alt="Get it on Google Play" width="191" height="74"></a>`
    : '<p class="store-downloads__android">Android is coming soon.</p>';
  return `<section id="get-app" class="store-downloads" data-store-downloads aria-label="Get the app">
<h2 class="store-downloads__title">Get the app</h2>
<p class="store-downloads__intro">Keep your book club close.</p>
<div class="store-downloads__platforms"><a class="store-downloads__badge" href="${esc(stores.appStore)}"><img src="${base}/img/download-on-the-app-store.svg" alt="Download on the App Store" width="144" height="48"></a>${android}</div>
</section>`;
}

// Shared by static layouts and the web-only app packaging step.
export const STORE_CSS = `
.store-downloads{box-sizing:border-box;position:relative;isolation:isolate;width:100%;padding:32px 20px;margin:0;background:#f6eedf;color:#351722;text-align:center;font:400 16px/1.5 system-ui,sans-serif}
.store-downloads .store-downloads__title{margin:0;color:#351722;font:700 25px/1.2 Georgia,serif;letter-spacing:0;text-transform:none}
.store-downloads .store-downloads__intro{margin:10px 0 12px;color:#351722}
.store-downloads__platforms{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 20px}
.store-downloads .store-downloads__badge{display:inline-flex;flex:none;padding:12px;line-height:0;transform:none;background:none;border:0;box-shadow:none}
.store-downloads .store-downloads__badge img{display:block;width:auto;height:48px;max-width:none;margin:0;border:0;border-radius:0;transform:none;filter:none;box-shadow:none}
.store-downloads .store-downloads__play{padding:2px}
.store-downloads .store-downloads__play img{height:74px}
.store-downloads .store-downloads__android{margin:12px;color:#351722;font:400 16px/1.5 system-ui,sans-serif}
.store-downloads__badge:focus-visible{outline:3px solid #651d32;outline-offset:2px}
@media print{.store-downloads{display:none}}
`;
