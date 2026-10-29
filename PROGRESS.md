Plan: PLAN.md
Base: fb917cd
Decision: approved card PRD is the design; execute inline without another approval loop.
Decision: preserve existing confirmed email capabilities for host management; do not depend on unmerged backend PR 15.
Decision: no subagents, per the card instruction against independent background workers.

Task 1: complete. Database and actual public edge entrypoints verified locally.
Task 2: complete. Geographic website, host controls, invite-code joins, and iOS fresh discovery verified.
Task 3: author review complete; code and SQL remain pending Ted review and deployment.
Final review: self-review, per the no-worker card instruction. All decisions and rollout limitations are in docs/club-visibility.md.
Validation: 24 local privacy/integration tests, five iOS domain tests, UI smoke, website and app builds, and eight Edge Function type checks.
Production: read-only inspection only.
Final review fix: live public-calendar cards retain the scoped claim link, so an existing host changes the same directory record rather than creating a duplicate. Browser regression verified RED to GREEN.
Final review fix: a valid invite or Open visibility promotes a prior Private request, and retries do not consume another invite use. Database regression verified RED to GREEN.

October 23 resume: fetched main and rebased; base remains fb917cd. Production SELECTs show SQL 009 is unapplied.
Guard regression: missing attempts UPDATE grant and procedural rollback restoration reproduced RED, then corrected to literal inspectable SQL and verified GREEN. Copied the unchanged grant guard and its 17 regressions, added two direct Bookish SQL-package checks, and included them in npm test and CI. Historical cutoffs are unchanged.
Rollback regression: fixtures match the read-only production ACL inventory; apply and rollback preserve all nine legacy ACLs and restore the original aggregate view. Local full apply and guarded rollback pass.
Chrome QA: synthetic local records, actual handlers, no email transport. Private selected at creation, Open and Private discovery, host approval controls, Hidden save, invite rotation, and immediate discovery removal verified. Desktop and mobile screenshots are in docs/screenshots/club-visibility.
