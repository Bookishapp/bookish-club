# Club visibility implementation plan

Final operational delivery state is recorded in the job REPORT.md after the PR and SQL package are prepared.

Goal: Implement the approved October 20 brief in Bookish, using the existing email-confirmed host flow.
Architecture: bookish_clubs is the authoritative directory, with visibility, a city-level public projection, and a scoped owner submission. All public discovery reads fresh database state. Host settings use the existing confirmation capability in an Authorization header. No production database operations or external sends run in this job.
Stack: JavaScript, TypeScript, Supabase Edge Functions, PostgreSQL, and local PGlite tests.

Constraints: Private preselected and explicit required choice; preserve existing public clubs as Open; hidden means invite only; no hidden public data or cached club snapshots; explicit role grants; SQL staged for Ted; code in this isolated branch and PR; no background workers; Oxford comma; no em dash.

Review focus: stale static output and iOS saved records; arbitrary host token access; invite rotation and concurrent use limits; legacy endpoint bypasses; hidden contributions in aggregate views.

## Task 1: Authoritative database and public edge endpoints
- [x] Add failing integration tests exercising local PostgreSQL and edge HTTP handlers.
- [x] Stage schema, backfill, host capability checks, atomic joins, rotation, and hidden-safe aggregates.
- [x] Update verified, join, confirm, submit, and join-response paths and add directory and settings endpoints.
- [x] Verify RLS as anon and authenticated, host authorization, every visibility join, invite exhaustion, and hidden endpoint exclusion.

## Task 2: Website and iOS
- [x] Add failing output and UI tests for hidden club data and stale caches.
- [x] Replace static club-specific pages and feeds with generic discovery shells and live server discovery.
- [x] Add required visibility choices, host settings, approval inbox, invite rotation, and invite links.
- [x] Change iOS to fresh discovery with no club snapshots, no saved-record fallback, and browser host tools.
- [x] Verify full suites, website generation, iOS TypeScript build, and UI smoke tests.

## Task 3: Review and delivery
- [x] Self-review against the brief and security boundaries, per the no-worker instruction.
- [x] Generate apply.sql with backup, rollback.sql, and check.sql in the job directory. Never apply to production.
- [x] Commit, push the feature branch, and create a review PR with deployment order and limitations.
- [x] Write REPORT.md with NEEDS TED REVIEW and a blocked delivery state, update the card, and report in five lines.

October 23 readiness follow-up: enforce the current grant guard, preserve legacy ACLs without dynamic SQL, capture Chrome QA screenshots, rerun CI on the review commit, and hand back to Ted. Production application and coordinated release remain gated.
