# Lunair test delivery backend

These functions belong to the separate Lunair test shop. They do not change Fictora's existing `stripe-webhook`. The runtime accepts only the approved test project, `txpdaqqjuavxpjsjrztq`, and rejects live Stripe keys and events.

Run from this directory:

```sh
deno task test:lunair
deno task check:lunair
deno lint functions/_shared/lunair functions/lunair-shop-webhook functions/lunair-library tests/lunair
```

The tests use local PostgreSQL through PGlite, fake external transports, and the real Stripe signature verifier. They do not call a remote database, send mail, or charge a card. Dependencies are version-pinned, and `deno.lock` is committed. Inline pinned imports keep Edge Function bundling independent of a shared import map.

## HTTP contract

Both functions require JWT gateway verification disabled. The webhook authenticates raw request bytes using its distinct Stripe signing secret. The library authenticates its own opaque tokens and accepts browser calls only from exact configured origins. Service credentials never reach the browser.

`POST /functions/v1/lunair-library`, content type `application/json`:

| Request | Response |
| --- | --- |
| `{action:"request_link",email}` | 202 `{message}` for every valid email, regardless of ownership or email-specific rate limiting |
| `{action:"redeem",token}` | 200 `{accessToken,expiresAt}` after atomic single-use exchange |
| `{action:"list"}`, with `Authorization: Bearer <accessToken>` | 200 `{expiresAt,packs,grimoire}` with fresh signed URLs |

Persist the bearer immediately after redemption, then call `list` separately. A failed pack read or signing request returns 503 from `list`, while the authenticated session remains usable for retry. Each pack is `{id,title,downloadUrl,expiresAt}`. Every expiry is an ISO 8601 date string. Opaque magic and access tokens are 43 base64url characters, generated from 32 random bytes. The emailed link is `https://meetbookish.com/lunair/library/#token=...`. Remove the fragment immediately, keep access tokens in memory, and never send them through URL query strings or analytics.

Responses use `Cache-Control: no-store`. Errors use `{error}` with 400 for input, 401 for invalid or expired tokens, 403 for an unapproved origin, 429 for IP or global API throttling, and 503 for backend unavailability. Signed downloads are on the configured Supabase origin, under `/storage/v1/object/sign/lunair-packs-test/packs/<slug>.zip`.

## Purchases, access, and delivery

The webhook refetches the completed Checkout Session and actual Stripe line items. It verifies test mode, paid state, one-time pricing, product ID, price ID, quantity one, USD, and exact totals of $9 or $19. Metadata and client claims never determine ownership. After checking the signature and authoritative test session, the handler reads every line-item page. Sessions with no configured Lunair product or price are acknowledged with `{received:true,ignored:true}`, because the Stripe account also serves Fictora. Any Lunair product or price match still undergoes all payment checks. A session ID uniquely identifies a purchase. An immutable outbox payload, database lease, and stable provider idempotency key protect retries. Provider retries stop after 23 hours and require reconciliation before another send, because Resend retains its idempotency keys for 24 hours.

The private `lunair-packs-test` bucket is protected by restrictive Storage policies, so broad existing policies cannot expose Lunair objects. Only server credentials read purchases, redeem tokens, and sign downloads. Vol. 1 ownership grants `packs/spells-for-grown-ups-vol-1.zip`. Grimoire ownership grants every current and future object matching `packs/<lowercase-hyphenated-slug>.zip` in that bucket. Upload only approved buyer-facing ZIPs into that path. Grimoire is a one-time purchase, with no subscription.

Magic-link sends retry up to three times per background invocation, with one-second and three-second backoff for transient transport, 408, 429, and 5xx failures. Permanent provider errors stop immediately. A subsequent email request resumes the existing pending job before spending another per-email allowance or generating a new token. Database enqueue serialization prevents duplicate pending jobs. The database refuses to send consumed links or links with less than two minutes left, and caps each magic job at nine claims. Expired jobs can be replaced through the normal rate-limited request flow. No durable schedule is added. Magic links expire in 15 minutes and can be redeemed once. Library sessions expire in one hour, library downloads in 15 minutes, and receipt downloads in 24 hours. Verification tokens are stored as purpose-separated HMAC hashes. The service-only outbox retains email bodies and their bearer links for deterministic retries, so do not export those bodies into logs or reports.

## Configuration and deployment gate

`SUPABASE_URL` must be `https://txpdaqqjuavxpjsjrztq.supabase.co`. The functions require built-in `SUPABASE_SERVICE_ROLE_KEY`, existing `RESEND_API_KEY`, `LUNAIR_EMAIL_FROM`, and `LUNAIR_TOKEN_PEPPER` of at least 32 characters. The default site origin is `https://meetbookish.com`; `LUNAIR_EXTRA_ORIGINS` optionally allows explicit preview origins. Do not use a wildcard.

The webhook additionally requires `LUNAIR_STRIPE_TEST_SECRET_KEY`, `LUNAIR_STRIPE_WEBHOOK_SECRET`, `LUNAIR_VOL1_PRODUCT_ID`, `LUNAIR_VOL1_PRICE_ID`, `LUNAIR_GRIMOIRE_PRODUCT_ID`, and `LUNAIR_GRIMOIRE_PRICE_ID`. An existing `STRIPE_SECRET_KEY` can be used only if it is a test key. The separate Lunair webhook must never use Fictora's existing webhook signing secret.

Migration `migrations/20261027190044_lunair_shop_test.sql` is staged for Ted's review. Do not apply it to production or use a blanket `db push`. Deployment must explicitly name only `lunair-shop-webhook` and `lunair-library`, with the test project ref and `--no-verify-jwt`. Do not deploy all functions or use `--prune`.

No runtime configuration, remote deployment, provider delivery, or real checkout is proven by local tests. The portable operational handoff and exact SQL are in [`APPLY.md`](APPLY.md). Missing credentials fail closed. No routine, retry schedule, account, or live billing change is created by these files.
