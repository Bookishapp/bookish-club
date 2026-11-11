# The Tea and Hosting Server Implementation Plan

> Execute inline using the executing-plans and test-driven-development skills. The ticket is the approved specification and authorizes implementation through a draft PR.

**Goal:** Supply private, documented server contracts for the approved Bookish 1.1.1 screens.

**Architecture:** Extend the existing SQL baseline through new migrations. Keep author mappings private, expose explicit projections, reuse existing moderation, and add an independently authenticated reminder worker with claim leases and Resend idempotency.

**Tech Stack:** PostgreSQL, Supabase Edge Functions, Deno, Node.js, and PGlite.

**Spec:** The server ticket dated 2026-11-05 and the approved screen sources identified in `docs/the-tea-rpc-reference.md`.

## Global Constraints

Server, tests, and documentation only. No historical SQL edits, app edits, production SQL, deployment, scheduling, or email. Proper capitalization, the Oxford comma, and no em dash. Club data requires membership. No reading ranks, scores, or progress ordering.

## Review Focus

- Old RPCs, service RPCs, table grants, and views must not disclose take authors.
- Hidden ancestors, private page logs, and revoked memberships must remain protected.
- Reminder retries, cancellation, rescheduling, opt-outs, and stale claims must fail safely.
- Legacy write paths must enforce the same text, anonymity, and rate rules.
- Notifications and iMessage envelopes must carry no take body or sender identity.

## Tasks

- [x] Add executable database tests for anonymous takes, markers, filtering, rate limits, sips, spoilers, moderation, direct grants, and old RPCs. Watch them fail, add the Tea migration, and rerun them.
- [x] Add executable tests for optional shared reading, covers, RSVPs, bring claims, notifications, reminder eligibility, leases, and calendar authorization. Watch them fail, add the hosting migration, and rerun them.
- [x] Add worker tests for authentication, configuration, Resend payloads, retries, idempotency, and calendar output. Watch them fail, implement the worker, and rerun them with fake network dependencies.
- [x] Document the threat model and RPC contracts, run the full test suite, lint, and typecheck, request an independent review, fix material findings, and open a draft PR against main with the required trailers.

## Decisions and Progress

- Use the existing isolated task checkout on `feat/tea-hosting-server`.
- Default sharing to false. The existing `race_visible` preference is a compatibility alias for sharing.
- Use UTC calendar dates for day-before reminders until a meeting timezone is supplied. Document this contract explicitly.
- Keep existing RSVP storage values, and map Yes to `going` and Can't to `next_time` at the RPC boundary.
- Baseline: `npm test` passes after `npm ci` and `npm ci --prefix app` installed missing dependencies.

- Independent review: fixed P1 legacy chapter spoiler exposure and P2 never-attempted reminder snapshot suppression. Both reproduced with failing tests, then passed after their fixes.
- Added native and website calendar preflight coverage so authenticated downloads can be fetched by the screen client.
- Retained immutable reminder payloads after the first lease to preserve provider idempotency. A title or email change after a possible send can suppress that reminder for the same start time; documented in the threat model.
- Queue-refresh regression also confirms rescheduling never refreshes an old start-time row into a duplicate current delivery.
- Final verification: `npm test` passed 182 backend, 26 confirmation, 19 server, and five ops tests. `npm run lint`, `npm run check:edge`, and `git diff --check` passed. No app or iOS edits, hosted SQL, deployment, production scheduling, or email delivery.
