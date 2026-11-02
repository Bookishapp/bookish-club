# Bookish Inbound Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the handler, and independent workers for documentation, SQL, and review. Track progress here.

**Goal:** Receive signed Resend events and forward Bookish mail safely.

**Architecture:** A thin edge entrypoint wires a testable shared handler to secrets, Resend, and service-only deduplication RPCs. A durable received-ID record complements Resend's 24-hour send idempotency cache. Unresolved attempts stop after 23 hours to prevent ambiguous resends.

**Tech Stack:** Deno, TypeScript, Web Crypto, Node tests, PostgreSQL, and PGlite.

**Spec:** `.ted/BRIEF.md`.

## Global Constraints

- Do not call the Resend account API, change DNS, apply SQL, merge, or deploy.
- Secrets come through `readBookishSecret`; never print secret values.
- Forward from `Bookish Inbox <inbox@meetbookish.com>` to `BOOKISH_INBOX_FORWARD_TO`, with the original sender as `reply_to`.
- Prefix subjects with `[Bookish] `, preserve text and HTML, and include attachments totaling at most 10 MB.
- Use the Oxford comma, and never use U+2014.
- Commit on `feat/inbound-forward`, open a PR to `main`, and finish with `.ted/REPORT.md`.

## Review Focus

- Verify raw bytes, timestamp tolerance, and multiple Svix signatures before any email API access.
- Reject malformed upstream responses without acknowledging undelivered mail.
- Prevent duplicates across concurrent requests, delayed replay, and an uncertain send response.
- Enforce the attachment limit against downloaded bytes, pagination, and declared metadata.
- Escape sender and recipient metadata in HTML, and identify mailbox loops case-insensitively.

### Task 1: Confirm current receiving contracts

**Files:** `.ted/INBOUND.md`.

- [x] Read primary docs and record exact dry-run setup calls, receiving records, payloads, retrieval, attachments, signatures, retries, and limits.
- [x] Cross-check implementation assumptions against those contracts.

### Task 2: Durable service-only deduplication

**Files:** `supabase/sql/011_bookish_inbound.sql`, `tests/backend/inbound-sql.test.mjs`.

**Interfaces:** `bookish_inbound_begin(p_email_id uuid)` returns `send`, `done`, or `expired`; `bookish_inbound_complete(p_email_id uuid)` returns void. Expand the Vault secret allowlist for both new secrets.

- [x] Write and run failing local SQL tests for fresh/repeated attempts, completed replay, expired ambiguity, access restrictions, secret names, guards, and reapplication.
- [x] Implement the guarded, transactional migration without applying it remotely.
- [x] Run `node --test tests/backend/inbound-sql.test.mjs` and inspect results.

### Task 3: Signed inbound forwarding

**Files:** `supabase/functions/_shared/inbound.ts`, `supabase/functions/bookish-inbound/index.ts`, `supabase/functions/_shared/secrets.ts`, `supabase/config.toml`, and `tests/backend/inbound.test.mjs`.

**Interfaces:** `inboundHandler({secret, apiKey, forwardTo, begin, complete, fetcher?, now?})` returns a request handler. Verify Svix HMAC with Web Crypto. RPC dependencies use Task 2's exact contracts. HTTP dependencies are fixture transports in tests.

- [x] Write failing behavior tests for unsigned/bad/stale signatures, valid and rotated signatures, unrelated events, text/HTML/reply forwarding, loops, attachments at and above 10 MB, replay, concurrency, uncertain sends, and failed upstream operations.
- [x] Implement the handler and entrypoint, register `verify_jwt=false`, and allow both new secret names.
- [x] Run `node --test tests/backend/inbound.test.mjs`, `npm run check:edge`, and targeted lint.

### Task 4: Verify, review, and deliver

**Files:** `.ted/REPORT.md`, plus fixes justified by review.

- [x] Run `npm run test:release`, inspect failures by name, and verify `git diff --check`.
- [x] Request an independent whole-change review, and address material findings with reproducing tests.
- [x] Write a short report with validation and Ted's remaining setup work.
- [ ] Commit, push `feat/inbound-forward`, create the PR with `gh pr create`, and verify it remains open and unmerged.

## Progress

- Existing linked worktree verified on the requested branch.
- Baseline `npm test`: 154 passed. App unit tests: 20 passed. Standalone visibility run: four missing-build failures; final release command builds prerequisites first.
- Required legacy `~/.Codex/superpowers/AGENTS.md` is absent. Supplied instructions and installed skills apply.
- The detailed brief authorizes end-to-end execution; routine implementation choices do not require another approval round.

- Current official Resend documentation confirmed in `.ted/INBOUND.md`; no account requests performed.
- Task 2: SQL tests failed before the migration existed, then passed 8/8.
- Task 3: handler tests failed before implementation, then passed. Independent review reproduced two recipient defects; both regressions failed before the fix and passed afterward. Final new tests: 27/27.
- Review: no remaining material findings. Operator limitations for unsupported attachments and unresolved sends are documented.
- Final `npm run test:release` passed: backend 131, confirmation 26, server 19, operations 5, visibility 26, website 18, app unit 20, UI smoke, builds, lint, and all 14 Deno entrypoints.
- Existing hash manifest included a stale auth entry from committed fix #34; verified no auth source changes and refreshed that hash with the inbound additions.
