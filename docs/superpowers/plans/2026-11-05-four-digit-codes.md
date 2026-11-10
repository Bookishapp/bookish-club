# Four-Digit Bookish Codes Implementation Plan

**Goal:** Add opt-in four-digit email codes while preserving the hosted six to ten digit flow for build 6.

**Architecture:** The shared handler generates and hashes short codes. Service-role storage maintains one code per email hash, and a row-locked RPC atomically counts failures or consumes a valid code. After consumption, the existing admin magiclink and email verification transports mint the session and sync the account.

**Tech Stack:** TypeScript, Deno, PostgreSQL, Node test runner, and PGlite.

**Spec:** The ticket in this session, also recorded in the existing `.codex-brief.md`.

## Constraints

- Four digits, unbiased cryptographic randomness, a random salt, SHA-256, a ten-minute lifetime, and five wrong attempts.
- No plaintext code or email in code storage. RLS enabled, no client grants, and service-role access only.
- Existing throttles, identity guards, session checks, copy, and legacy code behavior remain.
- No migration application, deployment, Auth configuration change, Codemagic build, Xcode build, or App Store Connect access.
- Draft PR against main, required attribution trailers, proper capitalization, the Oxford comma, and no em dash.

## Review Focus

- Concurrent verification must permit one success and count every wrong attempt against the same code.
- Replacing a code must invalidate pending operations against the previous salt.
- Expiry or lockout between reading and consuming must fail closed.
- Foreign identities and failed delivery must never produce a session.
- Web and native sign-in must opt in together without changing legacy callers.

## Task 1: Server and Storage

Files: `_shared/bookish-auth.ts`, `bookish-auth/index.ts`, `supabase/sql/012_bookish_auth_codes.sql`, and backend auth tests.

- [x] Write handler tests for start, hashing, verify, replay, expiry, lockout, replacement, legacy codes, throttling, and identity guards. Run them and confirm missing-feature failures.
- [x] Add handler dependencies `codes.put(record)`, `codes.get(emailHash)`, and `codes.finish(emailHash, salt, matched)`.
- [x] Write database tests for RLS, grants, replacement, expiry, attempts, stale salts, and one-time consumption. Confirm missing migration failure, then implement the migration and production transport.
- [x] Run backend tests and edge typecheck.

## Task 2: Clients and Delivery

Files: `app/src/account.ts`, `app/src/community.ts`, `app/tests/account.test.ts`, and `app/tests/ui-smoke.mjs`.

- [x] Add client opt-in and rendered-field validation tests. Confirm they fail before changing the client.
- [x] Send `short: true`, enforce exactly four numeric digits, and update smoke-test input.
- [x] Run app tests and UI smoke checks.
- [x] Run repo lint, edge typecheck, full tests, and fixture-backed web build.
- [x] Obtain fresh-context code review and resolve findings.

Delivery: Commit with the requested trailers and CI skip marker, push the feature branch, open a draft PR against main, and verify the draft state and URL.

## Verification Record

- Full repo suite: 177 backend, 26 confirmation, 19 server, and 5 operations tests passed.
- App unit tests: 21 passed. App UI smoke passed.
- Web tests: 18 passed. Visibility tests: 26 passed.
- Repo lint, edge typecheck, formatting, and fixture-backed web build passed.
- Fresh-context review found no critical or important issues. Its delivery-failure hardening suggestion was implemented with failing-then-passing tests for false sends, throwing sends, and replacement safety.
- Database tests execute only in local PGlite. No hosted migration, function deployment, Auth change, native build, or store action was performed.

## PR 36 Review Blocker Repair

The later review in `/Users/vahallo/ted-ops/oneshots/1105-bookish36-review/VERDICT.md` identified the missing cumulative guess budget and unsafe first-entry X-Forwarded-For selection. The repair follows the user's explicit fix instructions.

- [x] Add a separate rolling 24-hour ledger, charged only for accepted wrong guesses inside `bookish_auth_code_finish`. Replacement, success, and failed delivery cannot reset it.
- [x] At ten failures, reject short starts and outstanding short-code verification. Recheck the budget in a guarded put RPC under the shared per-email advisory lock to close the admitted-start race.
- [x] Limit short starts to three per hour and ten per day per email, preserving the existing combined start and verify/password limits.
- [x] Round 1 attempted `cf-connecting-ip` with an `unknown` fallback. Round 2 supersedes that choice below because it could impose an app-wide sign-in limit.
- [x] Unify the differing failed-verification messages.
- [x] Exercise actual edge transports and local SQL across code replacements, hourly expiry, rolling daily expiry, and six-digit legacy authentication during short lockout.
- [x] Verify all verdict commands, obtain a fresh read-only review, and prepare the branch-only push and PR-body update.

The original gateway rationale covered the Data API and logs, rather than Edge Functions. Round 2 replaces it with the Edge Functions-specific documentation and safe missing-IP behavior below. No hosted header rewriting was probed.

Verification: 189 backend, 26 confirmation, 19 server, 5 operations, 21 app, 26 visibility, and 18 web tests passed, plus UI smoke. Lint, edge typecheck, both builds, Deno formatting, and Git whitespace checks passed. The visibility suite was rerun successfully after a concurrent build replaced its output directory. A temporary isolated mutation with the ledger insert removed made the edge-route regression fail, and the real implementation passed. Fresh review reported no findings; real multi-connection PostgreSQL contention and hosted infrastructure were not exercised locally.

Deferred verdict LOW items: a server-only pepper needs secret provisioning and rollout; successful short verification still replaces any pending hosted OTP; and dead code rows still have no periodic purge, with one row retained per email. Failure-ledger events older than 24 hours are pruned by the throttle. No routine, hosted SQL, deployment, or merge was performed.


## PR 36 Round 2 Repair

The round 2 verdict in `/Users/vahallo/ted-ops/oneshots/1105-bookish36-rereview/VERDICT.md` identified the shared fallback bucket and the app's generic response to a calm 429.

- [x] Read only `x-forwarded-for`, which Supabase uses in its [Edge Functions Turnstile example](https://supabase.com/docs/guides/functions/examples/cloudflare-turnstile). Accept exactly one well-formed IPv4 or IPv6 address, and normalize IPv6 spellings before hashing.
- [x] Reject multi-hop values because that example does not establish trustworthy hop ordering. Ignore `cf-connecting-ip` and `x-real-ip`. Missing, malformed, or ambiguous headers pass SQL NULL, never a shared fallback key.
- [x] Allow NULL in the existing attempt table, skip IP locks and counts when NULL, and retain per-email start/verify/password limits, short-start daily limits, and the rolling failure ledger. Known IPs retain the 15-start and 100-call hourly caps.
- [x] Add failing-then-passing regressions for present, missing, malformed, and multi-hop headers, IPv6 normalization, 120 distinct no-IP users completing 240 start/verify calls through real SQL, retained email/ledger limits without IPs, and known-IP caps.
- [x] Select the existing calm rate-limit copy by HTTP 429 in the app. Exercise code requests, verification, and password forms in the bundled UI smoke test.
- [x] Run every test suite and both builds, and obtain an independent read-only review with no code blockers.

Accepted trade-off: an attacker who knows a victim's email can request two short codes and submit ten wrong guesses to deny that email four-digit sign-in for a rolling 24-hour window. This bounds online guessing of four-digit codes. Replacement, successful sign-in, and delivery failure do not reset the ledger; access resumes as failures age out. Password sign-in remains available if the user has a password, and the legacy hosted six to ten digit path remains available to live 1.1. The new client has no automatic six-digit fallback. Designing a future recovery flow is deferred.

When no usable IP is present, IP throttling is intentionally unavailable. The per-email controls and daily failure ledger remain the security controls, independent of forwarded-header availability. Supabase's example establishes Edge Functions header usage, not guaranteed ingress authenticity or chain ordering. No hosted probe is needed to prevent absent-header app-wide lockout.

Validation: 193 backend, 26 confirmation, 19 server, 5 operations, 21 app, 26 visibility, and 18 web tests passed, plus UI smoke. Lint, edge type checks, app release prerequisites, both builds, formatting, and whitespace checks passed. SQL ran only in local PGlite. No hosted SQL, deployment, Auth configuration change, native build, or merge was performed.
