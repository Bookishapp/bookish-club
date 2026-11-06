# Bookish Tea and Hosting UI Implementation Plan

> Use the executing-plans workflow for app work, and the dispatching-parallel-agents workflow for the independent native Messages work. The user has authorized implementation against the existing approved design.

**Goal:** Build Bookish 1.1.1 member and hosting screens on the approved-art restyle and the merged Tea server contracts.

**Architecture:** Keep the existing community navigation, account transport, and all discovery features. Add typed Tea and hosting helpers plus focused render functions and styles. Read private content only through authenticated RPCs. Native Messages uses allowlisted metadata and resource-only links.

**Tech Stack:** TypeScript, Vite, Capacitor, Swift, Node tests, JSDOM, and Google Chrome on the Mac mini.

**Spec:** `docs/the-tea-rpc-reference.md`, `/Users/vahallo/biz/bookish/design/APPROVED-ART.md`, its approved HTML and October 19 overrides, and the November 5 App Store storyboard.

## Global Constraints

- No SQL application, deployment, merge, production mutation, or routine creation.
- Anonymous takes only, one sip, strict server page gates, no tap reveal, and no feed serialization into cards.
- Reading is communal and opt-in, with no progress sorting, ranks, streaks, or scores.
- No em dashes or emoji, and use the Oxford comma.
- Preserve existing features and server parameter names. Use the existing isolated worktree and branch.
- Commit with the exact user-supplied coauthor and session trailers.

## Review Focus

- Session expiry must clear private data and preserve safe retry paths.
- Sealed takes and replies must never expose bodies through HTML, sharing, or notifications.
- Bring-list occupancy must survive redacted claimant identities.
- Calendar files must come from the authenticated endpoint, without bearer tokens in URLs.
- Pagination, failures, cancellation, and duplicate clicks must not lose input or submit duplicate reading logs.

### Task 1: Tea, reading, and notification data contracts

- [x] Add meaningful failing tests for page marker validation, sealed rendering, reading-log retry identity, authenticated calendar transport, and metadata allowlisting.
- [x] Implement typed helpers in `app/src/tea.ts` and calendar transport through `AccountClient`.
- [x] Run the focused tests and verify they pass.

### Task 2: Member and host screens

- [x] Extend `app/src/community.ts` with Tea, composer, thread, reading, log, notification, meeting detail, reminder, bring-list, edit/cancel, and moderation flows.
- [x] Add composition-specific styles in `app/src/tea.css`, preserving existing forms and role boundaries.
- [x] Extend local fixtures and meaningful JSDOM interaction coverage, including privacy, retries, and host/member boundaries.
- [x] Run the app tests, and fix failures without weakening assertions.

### Task 3: Native Messages cards

- [x] Delegate independent native work under `app/ios/` with explicit privacy and approved-composition requirements.
- [x] Integrate its bridge and resource link handling in the app.
- [x] Run Swift model tests and compile the iOS targets when available.

### Task 4: Visual parity and release checks

- [x] Capture actual production UI with local intercepted fixtures in Google Chrome at 390 by 844, including empty and failure states.
- [x] Save approved-left, built-right PNGs in the requested parity directory and inspect every image.
- [x] Run lint, typecheck, all root and app tests, browser checks, both builds, and applicable native checks.
- [ ] Request a fresh whole-change review, resolve material findings, commit, push, and open a draft PR against main.
- [ ] Write the requested external RESULT.md with evidence, limitations, and the draft PR URL.

## Execution record

- The supplied worktree was already isolated, on the requested branch, with a completed clean merge and no unresolved conflicts.
- The approved HTML and v2 renders supplied the design specification. No new design approval was needed.
- A fresh reviewer found and reproduced stale thread bodies, reply recovery loss, resource routing gaps, and asynchronous club/session races. Each material issue was fixed and verified with focused regressions. The final review reported no material blockers.
- Privacy requirements take precedence over signed posting, multiple reaction categories, tap reveal, and unavailable aggregate fields in older art.
- Final verification and release artifacts are recorded in `/Users/vahallo/ted-ops/oneshots/1106-bookish-newscreens/RESULT.md`.
