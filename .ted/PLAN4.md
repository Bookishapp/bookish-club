# App Review findings implementation plan

Spec: `.ted/BRIEF4.md`. Execute in the existing `release/bookish-full-1101` checkout. The brief authorizes commit, push, PR #33 updates, and build 6 upload, with no review submission. Retain the earlier uncommitted auth fix and demo-attempt report.

Architecture: apply additive database hardening in one guarded, idempotent chunk after 01 through 19. Keep edge handlers independently testable, and use the existing Ted board card helper for a Mac mini polling job.

Constraints: only `tkrsrnlasinmlftkcufi`; no hosted SQL or function deployment requested; no plist installation; no secret output; Google Chrome only; Oxford commas, and no em dashes.

Review focus: claimant email confirmation and later account sync never confer ownership; host contact stays out of automatic public joins; account email stays out of the web host desk; link scanners cannot decide requests; repeated alert runs and more than 100 reports cannot lose alerts.

- [x] Task 1: add real PGlite regressions after the exact 01 through 19 packet for caller-only ballots, membership and execution permissions, emailed public joins, pending claims and sync, and web host-desk projections. Watch them fail. Implement all SQL in `.ted/apply-20.sql`, including rollback-compatible grants, and prove repeat application, predecessor rejection, wrong-target rejection, and rollback.
- [x] Task 2: test the requested missing-email message and GET versus POST decisions. Preserve lazy auth configuration, implement a confirmation form with strict POST validation and a website-rendered form, and keep claim confirmations away from host settings. Disable signup and Apple in the example configuration. Verify backend and edge tests.
- [x] Task 3: add a worker-key-protected report queue endpoint with bounded pagination, and a Python polling script that creates deterministic Ted board cards only for unseen pending reports. Test authorization, pagination, deduplication, retries, and failures using local transports. Put the script and 900-second launchd plist in `ops/`, without installing them. Document the new secret and deploy manifest.
- [x] Task 4: run the full release suite, supplemental checks, and builds. Set internal-only export false, bump all targets to build 6, sync, archive, export, verify, validate, and upload. Read back App Store Connect until build 6 is VALID and not internal-only. Preserve the existing review submission.
- [ ] Task 5: request one independent whole-change review, fix material findings, refresh checksums, append the requested handoff to REPORT.md, commit, push, and update PR #33.

Ruling: the supplied brief fully specifies the changes and asks for execution, so proceed inline without an extra design-approval pause. The existing dedicated release checkout is the requested workspace. Production rollout belongs to Ted, as the brief explicitly requests a redeploy list.

Final review ruling: the Supabase gateway rewrites GET HTML to plain text, so GET redirects to the existing website confirmation page. Chrome also proved that no-referrer makes the form Origin null. Use strict-origin only on this page, with fragment removal, so no capability leaves in the referrer. Website deployment is a prerequisite for the function rollout.

Final verification: release suite green after the review fix; 89 artifact hashes verified; build 6 VALID and APP_STORE_ELIGIBLE. The source, receipt, and documentation commit is prepared for the explicitly authorized push and draft PR update.
