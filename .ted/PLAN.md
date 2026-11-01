# Bookish full version implementation plan

Spec: .ted/BRIEF.md. Execution is authorized by the brief. Existing TypeScript/Capacitor UI, Supabase SQL/RPCs, and Bookish art remain the platform.

- [x] Merge PR15, PR30 (supersedes PR21), PR18, and PR19, retaining main release fixes.
- [ ] Reconcile backend auth and visibility with local regression tests. Produce idempotent ordered apply, rollback, preflight, and exact edge deployment packet without production writes.
- [ ] Implement real email accounts, club creation, invites, joins, approvals, membership, meetings, next book, anonymous votes, reporting, blocking, and scoped account deletion. Keep guest discovery and Resources in Me.
- [ ] Update site privacy, support, in-app disclosure, native manifests, and .ted/APP-PRIVACY.md for accounts. No social providers unless Apple is also configured.
- [ ] Run backend PGlite tests, app tests, UI smoke, lint, edge checks, site checks, build, and Chrome captures at 390x844. Label local fixtures honestly and inspect every frame.
- [ ] Read highest App Store Connect build, increment all shipped targets, cap sync, archive, sign, export, and upload internally. Preserve current submission and metadata.
- [ ] Review full changes, commit, push, open requested draft PR, and report exact validation, reviewer credentials plan, build state, and unresolved release dependencies.

Review focus: Fictora identities cannot be promoted or deleted; Hidden clubs cannot leak through snapshots or RPCs; authorization and membership apply to every write; session expiry recovers without losing user context; backend-unavailable states remain usable and honest.

Progress: app baseline 8/8 passed before integration. Required ~/.Codex/superpowers/AGENTS.md absent. PR19 overlapping iOS prep already exists in newer main, so retain build 3 and privacy framework fix before choosing the new build number.
