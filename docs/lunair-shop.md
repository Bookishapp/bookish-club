# Lunair & Midnight shop

The public hub is `/lunair/`. `/midnight/` forwards visitors to it, preserving the query string and fragment when JavaScript is enabled. With JavaScript disabled, the redirect page has a direct link.

The bio URL is `https://meetbookish.com/lunair?utm_source=instagram&utm_campaign=lunairandmidnight`.

## Checkout and delivery

`public/lunair/checkout.json` is the only checkout configuration:

```json
{
  "vol1": "",
  "grimoire": ""
}
```

Empty values show disabled “Coming soon” buttons. Each nonempty value must be an HTTPS URL with no embedded credentials. The URLs must point to different products. The build fails on unsafe or duplicate URLs. Configuration is public, so put only customer-facing checkout URLs here, never API keys or private download URLs.

Before adding URLs, configure two one-time digital products with the chosen merchant:

- Spells for Grown-Ups, Vol. 1: $9 USD, 30 wallpapers in iPhone and Android sizes, with personal-use terms and instant file delivery.
- The Grimoire: $19 USD, one-time lifetime access to every pack, every future drop, and a new wallpaper each new moon. Set up immediate access to the current files, plus ongoing access to future files, using the buyer’s checkout identity.

The merchant handles checkout, receipts, and delivery. Confirm those work with a test purchase before activating each URL. A payment-only link without file delivery is incomplete. Set refund and support information in the merchant store. The site does not collect payment details, verify payments, or host paid downloads.

After updating the JSON file, rebuild and deploy. Buttons are rendered at build time and work without JavaScript. No purchase is required to verify the unavailable state.

## Attribution and assets

The Fictora link includes the Instagram source and Lunair & Midnight campaign by default, including when JavaScript is disabled. With JavaScript enabled, `src/lunair.js` forwards nonempty inbound `utm_*` values to Fictora, lowercases keys, and preserves the first nonempty value for duplicate keys. Custom inbound UTM forwarding requires JavaScript. Unrelated query parameters are excluded. The canonical page URL remains clean.

The three preview images are optimized WebP copies of existing Lunair & Midnight illustrations. No character art was generated or repainted for this page. All fonts are served locally. The previews illustrate the collection; they are not public download files.

## Verification

Build using the same `SITE_URL` and `CUSTOM_DOMAIN` variables as production, then run `node --test scripts/test-site.mjs scripts/test-lunair.mjs`. Existing site CI runs both, plus the app checks. Verify mobile layout and `/midnight/` in Google Chrome.
