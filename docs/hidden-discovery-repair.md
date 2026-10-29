# Hidden-club discovery repair

The backend previously treated `listed=true` as enough to discover a club or request membership. PR21 adds a separate visibility field, so a Hidden club could still appear through backend RPCs. Reapplying backend aggregate hardening after visibility also restored Hidden contributions to public aggregates.

The repaired backend checks visibility when that field is present, preserves the pre-visibility behavior when it is absent, and excludes null or unknown visibility states. Valid invite redemption is unchanged. Aggregate hardening retains the three-member, fourteen-day, and disjoint-club qualifications.

`tests/backend/fixtures/visibility-009.sql` is an exact, test-only copy of PR21's 009 at 94a152b108121383d2a91d122660d7070d0f3949. It is installed only in disposable in-memory PGlite. The regression exercises both installation orders, Hidden discovery and guessed-ID join denial, valid Hidden invites, unlisting, and Hidden aggregate exclusion.

This repairs source only. The existing backend and visibility production packets must not be stacked. Identity provisioning, direct member-table access versus server-mediated visibility access, seeding preconditions, old clients, static discovery, and coordinated deployment remain prerequisites for a combined rollout. The production target did not have the social routines or visibility column at the October 29 SELECT-only read-back. No applied migration was rewritten, and no database mutation was performed.

The exact narrow SQL repair, SELECT-only backup capture, fail-closed operational recovery, and database-lane handoff remain local in job card-c-f94e330416. They are not a complete installation proposal, and they are not approved for application. The parent backend PR remains draft.
