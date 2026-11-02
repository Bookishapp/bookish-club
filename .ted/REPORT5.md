# Inbound forwarding follow-ups

Spec: `.ted/BRIEF5.md`. Work stays on `feat/inbound-forward` for PR #35.

## Execution plan

- [x] Reproduce permanent send failures, add attachment-free and plain-text notice fallbacks, preserve stable keys per payload, and log expired received IDs.
- [x] Reproduce address failures, skip unparseable addresses, accept valid DNS labels, and retain loop protection.
- [x] Restore `.ted/BRIEF.md` and `.ted/REPORT.md` from `origin/main`, run the repository checks, and obtain an independent review.
- [ ] Commit, push the same branch, and verify PR #35 remains open and unmerged. Do not deploy.

## Decisions

- Each send variant has its own stable idempotency key so a changed fallback payload never reuses another variant's key.
- Retryable send responses stop fallback progression and return 503. The existing concurrent-idempotent-request 409 also remains retryable.
- A conflicting idempotency payload requires operator review, since a previous payload may already have been accepted. Do not send a different fallback after this conflict.
- A final permanent rejection is logged with the received email ID and acknowledged for operator review without recording successful delivery. Expired unsent attempts also log the received ID.
- A new service-only read-only status RPC checks completed and expired attempts before content retrieval, without creating state or starting the retry clock. The final pre-send check still handles races.
- Round 1 replaced the build-6 brief and report. Restore both exactly from the fetched `origin/main`; this round's notes live here.

## Validation

- Baseline inbound handler tests: 19 passed.
- Address regressions: six tests failed before implementation, then passed.
- Delivery regressions: eight tests failed before implementation, then passed. Additional regressions reproduced idempotency conflicts and expiry before content retrieval, then passed after their fixes.
- Read-only SQL status: five expected failures before implementation, then all 11 SQL tests passed. Tests cover no writes, state precedence, 23-hour wall-clock expiry, null identifiers, restricted grants, and safe reapplication.
- Final `npm run test:release`: passed. Backend 152, confirmation 26, server 19, operations 5, visibility 26, website 18, app unit 20, UI smoke, builds, syntax, lint, TypeScript, and all 14 Deno entrypoints passed. The backend total includes 37 inbound handler tests and 11 inbound SQL tests.
- `deno fmt --check` for both changed TypeScript files, `git diff --check`, and all 93 artifact checksums passed.
- Independent review found expiry logging could be bypassed by failed content retrieval. Reproducing tests failed first, then passed with the read-only status check; the full release suite passed afterward. No other material findings were reported.
- Verified `.ted/BRIEF.md` and `.ted/REPORT.md` match `origin/main` exactly.

## Delivery

- Existing PR: https://github.com/Bookishapp/bookish-club/pull/35.
- Commit and push: pending.
- No merge, deployment, hosted SQL execution, Resend account API call, or DNS change occurred. The updated 011 migration and new edge function remain prepared for Ted's later setup work.
