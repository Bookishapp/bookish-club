# Club visibility review and rollout

Delivery state: blocked pending Ted's SQL review, PR review, coordinated deployment, and iOS release. Production was inspected using read-only schema, count, privilege, and function-inventory queries. No database writes, function deployments, emails, Telegram messages, purchases, or independent workers ran in this job.

The October 20 brief is implemented in the existing email-confirmed host workflow. Open clubs accept a join immediately. Private clubs publish their name, area, and current book, and require host approval. Hidden clubs publish no records, ids, map points, search results, sitemap entries, or aggregate contributions. A valid invite code or link grants entry. Codes contain 60 cryptographic random bits in 12 characters, expire after seven days or 20 uses, and are invalidated immediately when the host rotates them. Joins, invite consumption, rotation, and visibility changes serialize on the same club row.

Creation requires an explicit visibility value, with Private selected in the form. Hosts open settings using the original email confirmation capability. The capability travels in a fragment and then an Authorization header, is removed from URL history, is never persisted by the settings page, and is scoped to its original club. A later confirmed claim cannot replace an established owner. This retains the existing email-based claim trust model; it does not introduce a separate account system. The iOS app opens creation, host settings, and code-only joining in the browser.

All raw club, submission, invite, and request tables deny client access. The two new tables have RLS and explicit role privileges, including explicit denial for anon and authenticated. Server-only RPCs project public fields and enforce joining rules. The six previously deployed public functions and the two new functions are covered by tests that load the actual entrypoints against local PostgreSQL. Internal notification payloads and host contact details are removed from HTTP responses. Tests disable external email transport.

Static publishing now retains geographic and genre routes while omitting club facts, ids, counts, structured listings, and aggregate snapshots. Discovery responses use no-store, and the clients clear old results when revalidating. The hourly GitHub rebuild is removed because discovery is live. No new scheduled routine was created. iOS packages no club snapshot, purges earlier persisted feeds, stores saved club ids, and requires a fresh server response to display or reopen clubs. Book recommendations remain available offline.

## Verification

`npm test` builds the website, regenerates the safe app assets, runs 23 privacy and integration tests, runs five iOS domain tests, builds the iOS web bundle, and runs the existing UI smoke scenarios with the new offline and cache checks. Tests execute PostgreSQL locally through PGlite. The complete generated apply, protected backup, backfill, checks, and rollback execute locally, and rollback is proven to reject changes made after apply. Deno type checking passes for all eight entrypoints. Chrome inspection verifies the creation controls and Private selection without submitting a form. The author performed the final review inline because the card prohibits independent workers. This is not an independent code review or an on-device iOS validation.

The existing app development dependency Vite 8.0.10 reports one high-severity advisory in npm audit. Its version and dependency tree were inherited from main and were not changed here. The production iOS and website artifacts are static bundles. Handle the development dependency update separately.

## Ted's database package

Run `node scripts/stage-visibility.mjs /absolute/review-directory` to reproduce `apply.sql`, `rollback.sql`, `check.sql`, and `preflight.sql`. The generated SQL is staged in the card job directory. Never run db push on the shared project. The feature SQL file alone is incomplete: apply.sql also includes the protected backup, geographic seed, 2,538 public directory listings, legacy visibility backfill, and rollback fingerprints.

Read-only inspection on October 20 found the 001-004 schema, no Bookish client policies, zero app clubs, zero confirmed host submissions, no duplicate club refs, and an existing service-role grant for the privacy-floor function. The apply transaction rejects duplicate refs, policy drift, and the unmerged v1.1 backend schema. It will also fail safely if the feature has already been applied. Existing public directory records remain Open. Existing unlisted or ambiguous legacy submissions stay Hidden. Existing app-only clubs without a public listing stay Private. Legacy invites expire during the migration, and hosts rotate a fresh code in settings.

The backup schema contains private records and capabilities. It denies access to PUBLIC, anon, authenticated, and service_role. Keep it protected, and never print or publish its contents. Apply preserves table ACLs and the original aggregate-view definition for rollback. Rollback is only for the maintenance window before real changes. If any watched data changes, the guard refuses rollback. Preserve the migration and fix forward instead. The backup is retained, with no purge scheduled.

## Coordinated rollout

1. Review this PR and the exact SQL package. Reconcile the separate unmerged backend PR 15 before applying its SQL or merging overlapping club code. This PR targets the verified current 001-004 schema and has no dependency on PR 15.
2. Pause Bookish form, confirmation, join, and host-setting traffic for the maintenance window. Retain the six existing function bundles and a normal database backup. Do not change shared Supabase Auth settings.
3. Publish the safe geographic website from this branch, and confirm old HTML and JSON club snapshots have been replaced. Discovery may be unavailable until the remaining steps finish. Do not enable host visibility changes while the previous static pages are still being served.
4. Ted runs preflight.sql, reviews and applies apply.sql, and runs check.sql. Expected hidden discovery and aggregate leak counts are zero. No anon or authenticated role can execute the visibility RPCs or select the raw tables. Service-role grants are explicit for the new objects.
5. Deploy the updated bookish-verified, bookish-community, bookish-join, bookish-join-respond, and bookish-directory functions before enabling updated creation or host settings. Then deploy bookish-submit, bookish-confirm, and bookish-club-settings, using supabase/config.toml. Keep traffic paused until all eight are current. Do not deploy unrelated functions.
6. Exercise one Open join, one Private approval, one Hidden code-only join, one Hidden invite link, and invite rotation. Change a listed club to Hidden, and query directory, verified, cities, geojson, search, and community again. Resume traffic only after these checks pass.
7. Build and release the iOS app from this updated code before launching visibility to native users. Earlier binaries contain frozen directory snapshots that cannot be remotely erased. Retire or expire those earlier TestFlight builds, and reconcile the pending release PR before shipping. No TestFlight upload or App Store release was performed here.

## Review decisions

- Use the existing host email capability rather than depending on the unmerged account backend. Cost if unsuitable: migrate settings authorization when that backend is integrated.
- Serve club discovery at request time, retaining only geographic shells in static output. Cost: club details are no longer static SEO content, and native discovery requires a connection.
- Use 12-character, rate-limited invites with seven-day and 20-join defaults. Cost if a different guest scope is needed: add host-configurable limits in a separate change.
- Keep earlier ambiguous submissions Hidden and expire legacy invite codes. Cost: affected hosts need to confirm settings and rotate a new code.
- Restrict new club locations to city centers with valid coordinates in the existing reference data. Malformed reference rows are excluded rather than producing incorrect map pins. Cost: unsupported or misspelled cities need correction or a reference-data addition.

Deferred limitations: independent review, on-device iOS validation, the existing Vite advisory, old binary retirement, and integration with the separate backend PR remain rollout work. None is represented as delivered.

The raw-table boundary follows Supabase's documented combination of [RLS and role grants](https://supabase.com/docs/guides/database/postgres/row-level-security). Local SQL tests use the [PGlite API](https://pglite.dev/docs/api).
