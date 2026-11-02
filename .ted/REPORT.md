# Bookish inbound report

[PR #35](https://github.com/Bookishapp/bookish-club/pull/35) is open to `main` from `feat/inbound-forward`. Implementation commit: `d7665ca`.

Implemented signed `email.received` forwarding, original reply addresses, text and HTML, Cc/Bcc handling, attachments up to 10 MB, loop suppression, and durable deduplication. Uncertain sends stop after 23 hours to avoid duplicates beyond Resend's idempotency window.

`npm run test:release` passed: backend 131, confirmation 26, server 19, operations 5, visibility 26, website 18, and app unit 20 tests, plus builds, UI smoke, lint, and `deno check` for all 14 entrypoints. The 27 new tests passed. Independent review's two recipient defects were reproduced and fixed; no material findings remain. All 93 artifact hashes verify.

Ted's remaining setup is in `.ted/INBOUND.md` and `.ted/DEPLOY.md`: apply the guarded `supabase/sql/011_bookish_inbound.sql`, deploy only `bookish-inbound`, configure its secrets, and complete Resend/DNS setup and live delivery checks. The SQL migration remains unapplied. No Resend account API calls, DNS changes, deployment, or merge occurred. Live delivery remains unverified.

The legacy `~/.Codex/superpowers/AGENTS.md` is absent; supplied instructions and installed skills were followed.
