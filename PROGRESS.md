Plan: PLAN.md
Base: fb917cd
Decision: approved card PRD is the design; execute inline without another approval loop.
Decision: preserve existing confirmed email capabilities for host management; do not depend on unmerged backend PR 15.
Decision: no subagents, per the card instruction against independent background workers.

Task 1: complete. Database and actual public edge entrypoints verified locally.
Task 2: complete. Geographic website, host controls, invite-code joins, and iOS fresh discovery verified.
Task 3: author review complete; code and SQL remain pending Ted review and deployment.
Final review: self-review, per the no-worker card instruction. All decisions and rollout limitations are in docs/club-visibility.md.
Validation: 23 local privacy/integration tests, five iOS domain tests, UI smoke, website and app builds, and eight Edge Function type checks.
Production: read-only inspection only.
