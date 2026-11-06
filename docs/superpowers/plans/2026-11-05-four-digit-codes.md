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
- [x] Use the platform-set `cf-connecting-ip` header, with a shared `unknown` bucket if absent. Ignore X-Forwarded-For and X-Real-IP for throttle attribution.
- [x] Unify the differing failed-verification messages.
- [x] Exercise actual edge transports and local SQL across code replacements, hourly expiry, rolling daily expiry, and six-digit legacy authentication during short lockout.
- [x] Verify all verdict commands, obtain a fresh read-only review, and prepare the branch-only push and PR-body update.

Gateway evidence is documentation-based, with no live probe: [Supabase's platform-set IP header](https://supabase.com/docs/guides/api/query-plans#production-use-with-pre-request-protection), [Supabase gateway log headers](https://supabase.com/docs/guides/observability/log-field-reference#captured-http-headers), and [Cloudflare's forwarded-header behavior](https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-for). Cloudflare appends to existing X-Forwarded-For values, so the first entry cannot establish a trusted client address. Supabase does not document a guarantee that its gateway strips that prefix. The selected header follows the platform documentation; hosted rewriting was not independently probed.

Verification: 189 backend, 26 confirmation, 19 server, 5 operations, 21 app, 26 visibility, and 18 web tests passed, plus UI smoke. Lint, edge typecheck, both builds, Deno formatting, and Git whitespace checks passed. The visibility suite was rerun successfully after a concurrent build replaced its output directory. A temporary isolated mutation with the ledger insert removed made the edge-route regression fail, and the real implementation passed. Fresh review reported no findings; real multi-connection PostgreSQL contention and hosted infrastructure were not exercised locally.

Deferred verdict LOW items: a server-only pepper needs secret provisioning and rollout; successful short verification still replaces any pending hosted OTP; and dead code rows still have no periodic purge, with one row retained per email. Failure-ledger events older than 24 hours are pruned by the throttle. No routine, hosted SQL, deployment, or merge was performed.
