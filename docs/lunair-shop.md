# Lunair & Midnight shop

The public hub is `/lunair/`. `/midnight/` forwards visitors to it, preserving the query string and fragment when JavaScript is enabled. With JavaScript disabled, the redirect page has a direct link.

The bio URL is `https://meetbookish.com/lunair?utm_source=instagram&utm_campaign=lunairandmidnight`.

## Bookish 1.1 release view

The release build renders an art showcase with the existing approved illustrations and a working `/app/` link. It does not show prices, product promises, purchase controls, unavailable buttons, or merchandise promotions. `scripts/build.mjs` calls `renderLunair` with `showcaseOnly: true`, does not load checkout configuration, and excludes `lunair/checkout.json` from the generated site.

The standalone renderer retains its historical checkout mode for source compatibility and isolated unit coverage. Its configuration is not used by the release. Adding a value to `public/lunair/checkout.json` cannot activate checkout in this build. Changing the release view or enabling purchases requires a separately authorized release change.

## Attribution and assets

The Fictora link includes the Instagram source and Lunair & Midnight campaign by default, including when JavaScript is disabled. With JavaScript enabled, `src/lunair.js` forwards nonempty inbound `utm_*` values to Fictora, lowercases keys, and preserves the first nonempty value for duplicate keys. Custom inbound UTM forwarding requires JavaScript. Unrelated query parameters are excluded. The canonical page URL remains clean.

The three preview images are optimized WebP copies of existing Lunair & Midnight illustrations. No character art was generated or repainted for this page. All fonts are served locally. The images showcase the artwork; they are not public download files.

## Verification

Build using the same `SITE_URL` and `CUSTOM_DOMAIN` variables as production, then run `node --test scripts/test-site.mjs scripts/test-lunair.mjs`. Existing site CI runs both, plus the app checks. Verify mobile layout and `/midnight/` in Google Chrome.
