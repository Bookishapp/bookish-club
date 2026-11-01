# Bookish full version for App Store resubmission, 2026-11-01

Sebastian: "do it all, make all calls and build a great fucking app." The App Store currently has Bookish 1.0 (guest only, no accounts, build from eefd03d) waiting for review. Tonight it gets replaced with the full version. You own the build; Ted owns prod database writes, deploys, and App Store Connect.

You are in /Users/vahallo/.codex/worktrees/bookish-full-1101 (fresh clone of Bookishapp/bookish-club) on branch release/bookish-full-1101 cut from origin/main.
Business context and rules: /Users/vahallo/biz/bookish (HARD-RULES.md, CANON.md, DECISIONS.md, STATE.md). Prior submission audit and privacy answers: /Users/vahallo/ted-ops/ted-board/jobs/card-c-bookish-submit-1023/ (APP_REVIEW_AUDIT.md, APP-PRIVACY.md). Signing material for local iOS builds: /Users/vahallo/ted-ops/keys/bookish-testflight (never print secrets). App Store Connect API key: /Users/vahallo/ted-ops/keys/AuthKey_Y6WS62AL7T.p8, issuer in /Users/vahallo/.claude/projects/-Users-vahallo-Claude-Code---Fictora/memory/fictora-asc-api-access.md. Bookish app id 6823470101, bundle com.meetbookish.app.

Integrate into this branch (merge, resolve, and make it all work together):
- PR #15 feat/club-backend (accounts, clubs, members, join requests, host approval, deletion; security fixes already done: Fictora identities are never touched, deletion requires trusted Bookish metadata).
- Club visibility: PR #21 codex/club-visibility and PR #30 codex/visibility-recovery-1028. Decide which is current and complete (30 says it recovers 21 against current main); ship one coherent Open, Private, and Hidden implementation.
- PR #18 ted/bookish-calls-1016 (Resources in Me, anonymous club votes).
- PR #19 (iOS build 2 prep), then bump the iOS build number above the highest build App Store Connect has for 6823470101.
- SKIP PR #27 (Stripe test checkout). No payments, no prices in this release.

Product bar: a reader opens Bookish, finds a club near them on the map (approximate area only, never a home address), requests to join or uses an invite, gets approved by the host, and the club works (members, next book, meeting, votes). Hosts can start a club, choose visibility, approve requests. Accounts are real end to end. Guest browsing still works. Make it feel great: cozy, warm, finished, no dead ends, no placeholder text, no emoji, no AI anywhere, Lunair per the bible (OG layered hair only), Oxford commas, never an em dash.

App Review must-haves: in-app account deletion that removes only Bookish data and Bookish-marked identities; Sign in with Apple if any third-party sign-in exists; a demo reviewer account path (write the exact credentials plan in REPORT.md, do not create prod accounts yourself); user content reporting and blocking for anything users can post; privacy policy and in-app links updated for accounts (update the site page in this repo too); updated App Privacy answers file at .ted/APP-PRIVACY.md.

Backend: the prod Supabase project is wqnrortftkffmbeugjky and it is ALSO Fictora's production database. You must NOT write it, deploy to it, or call admin APIs on it. Produce: (a) one ordered SQL apply file at .ted/apply.sql that is idempotent and touches nothing Fictora owns, (b) .ted/rollback.sql, (c) .ted/preflight.sql of read-only checks, (d) the list of edge functions to deploy with their exact source paths and verify_jwt settings in .ted/DEPLOY.md. Run all backend tests locally (PGlite) plus the app test suite, lint, and build.

iOS: `npx cap sync ios`, archive and export a signed IPA locally with the bookish signing material, and upload it to App Store Connect for TestFlight processing (internal only). Do NOT submit for review, do NOT touch the existing submission, do NOT change App Store metadata.

Capture the key flows in Chrome at 390x844 (guest map, club page, sign up, request to join, host approval, club home, votes, Me, delete account) into .ted/capture/ and a contact sheet .ted/CONTACT.png. Look at every frame and fix what's off.

Finish: commit, push the branch, open a draft PR to main titled "Bookish 1.1: full version (accounts, clubs, visibility, votes)". Do not merge. Write .ted/REPORT.md in plain prose: what merged, decisions you made, test counts, the uploaded build number, the reviewer account plan, and anything unsure.
