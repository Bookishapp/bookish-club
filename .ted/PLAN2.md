# Dedicated Supabase project implementation plan

Spec: `.ted/BRIEF2.md`. The user explicitly authorized execution, internal TestFlight upload, push, and draft PR #33 updates. Existing branch: `release/bookish-full-1101`. Use the existing workspace and TypeScript, Capacitor, Supabase, and PGlite stack.

Global constraints: target `tkrsrnlasinmlftkcufi`; never print secret values; no production SQL/function deployment by this session; preserve App Store submission and metadata; internal TestFlight only; use Oxford commas, and no em dashes.

- [x] Task 1, SQL packet: rewrite `.ted/apply.sql`, `.ted/preflight.sql`, and `.ted/rollback.sql` for the empty dedicated project. Include `bookish_get_secret(p_name text) returns text`, service-role-only, security definer, reading Vault and allowing only documented Bookish secret names. Generate idempotent ordered `apply-NN.sql` chunks no larger than about 200 KB, and prove full/chunk/reapply behavior in fresh PGlite with hosted-service shims clearly labelled.
- [x] Task 2, edge functions: inventory all `Deno.env.get` names, retain platform-injected values, and route other configuration through an async shared env-first, Vault-fallback helper calling `bookish_get_secret({p_name})` with the service role. Add meaningful offline tests for fallback and authorization expectations. Write `.ted/SECRETS.md` and exact per-function upload manifests in `.ted/DEPLOY.md`. Type check all 12 functions, and run offline tests.
- [x] Task 3, client retarget: replace every active old URL and key in app, web, site, env, and build configurations with the new URL and supplied publishable key. Inventory hidden/ignored files, build output, and tests. Validate client/site builds, and report remaining historical references.
- [x] Task 4, iOS: inspect App Store Connect build state using existing authenticated tooling. Choose the next build above 4 and the highest uploaded version, sync Capacitor, archive, export, verify embedded target/configuration/signing, validate, and upload for internal TestFlight without review or metadata mutations.
- [x] Task 5, integration: run full release tests, lint, build, and fresh independent review. Resolve material findings, refresh hashes, append concrete evidence and uncertainty to `.ted/REPORT.md`, commit, push, and update draft PR #33.

Review focus: Vault lookup denied to anon/authenticated; no old backend in shipped assets; repeat chunk application cannot destroy prior data; empty database has prerequisite schemas and extensions; Apple processing/upload status distinguished from tester availability.

The SQL task owns SQL, its proof tests, and chunk generation. The edge task owns function code, secret docs, and DEPLOY.md. The client task owns client/site config and related tests. The controller owns iOS, final integration, reports, hashes, commits, and PR updates. Shared interface is the secret RPC signature above. Do not commit independently while sharing this checkout.
