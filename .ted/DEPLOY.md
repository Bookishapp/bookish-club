# Dedicated Bookish deployment packet

Target `tkrsrnlasinmlftkcufi`, URL `https://tkrsrnlasinmlftkcufi.supabase.co`, region `us-east-1`. This packet is prepared for Ted's deployment tooling. This session does not apply hosted SQL or deploy functions. All Bookish clients and functions must use the dedicated project. Do not import shared-project Auth identities, reuse another project's backend, deploy unrelated functions, or use pruning.

## Database and configuration order

1. Confirm the actual project in the Dashboard, run `.ted/preflight.sql` read-only, and preserve any existing dedicated-project data and deployed Bookish bundles before a repeat release.
2. Set `bookish.target_ref` to `tkrsrnlasinmlftkcufi` in every SQL session. The guard is an operator assertion, so confirm the connection independently.
3. Apply the numbered `.ted/apply-NN.sql` chunks in ascending filename order, with stop-on-error enabled. Each chunk is at most 200 KB and includes its own transaction, target guard, and predecessor check. `.ted/apply.sql` contains the original base transaction (01 through 19). Always apply chunk 20 after that base file, or use all 20 ordered chunks. Reapplication preserves existing host privacy choices.
4. Populate the dedicated project's Vault names using `.ted/SECRETS.md`. Owner-supplied values are still needed where that file says UNKNOWN. Platform-injected credentials remain in the edge runtime.
5. Deploy all thirteen Bookish functions using the exact file manifests below, then complete the hosted checks before enabling traffic.

Example operator guard:

```sql
set bookish.target_ref = 'tkrsrnlasinmlftkcufi';
```

The packet seeds 2,538 directory listings. Listings with missing or invalid city centers remain in list results with null map coordinates. Verify final SQL and source hashes against `.ted/SHA256SUMS` before cutover.

## Function file manifests

For every function, set `verify_jwt: false`, use the listed `index.ts` as the entrypoint, and use `supabase/functions/deno.json` as the import map/configuration. This setting is explicitly declared for all thirteen in `supabase/config.toml`; application handlers enforce their own public capability or verified-user authorization contracts. Keep that configuration file as deployment metadata. Upload exactly the listed files together, preserving their paths relative to the repository root, or preserving the equivalent `functions/` subtree if the API uses that as its virtual root. Do not flatten `_shared` imports.

Each manifest includes the recursive local import closure, type-only imports, `deno.json`, and its referenced `deno.lock`. The pinned external dependency is `npm:@supabase/supabase-js@2.118.0`, resolved through `deno.json`. The deployment bundler resolves those npm imports; no `node_modules` directory is uploaded. None of these bundles includes an environment file or a secret value.

### bookish-account-join

Entrypoint: `supabase/functions/bookish-account-join/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-account-join/index.ts
supabase/functions/_shared/account-deletion.ts
supabase/functions/_shared/account-join.ts
supabase/functions/_shared/auth-admin.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/club-notice.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-auth

Entrypoint: `supabase/functions/bookish-auth/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-auth/index.ts
supabase/functions/_shared/auth-admin.ts
supabase/functions/_shared/bookish-auth.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-club-settings

Entrypoint: `supabase/functions/bookish-club-settings/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-club-settings/index.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/club-http.ts
supabase/functions/_shared/club-notice.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-community

Entrypoint: `supabase/functions/bookish-community/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-community/index.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-confirm

Entrypoint: `supabase/functions/bookish-confirm/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-confirm/index.ts
supabase/functions/_shared/secrets.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-delete-account

Entrypoint: `supabase/functions/bookish-delete-account/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-delete-account/index.ts
supabase/functions/_shared/account-deletion.ts
supabase/functions/_shared/auth-admin.ts
supabase/functions/_shared/secrets.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-directory

Entrypoint: `supabase/functions/bookish-directory/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-directory/index.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/club-http.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-house-rules

Entrypoint: `supabase/functions/bookish-house-rules/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-house-rules/index.ts
supabase/functions/_shared/house-rules.ts
supabase/functions/_shared/secrets.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-join

Entrypoint: `supabase/functions/bookish-join/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-join/index.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/club-http.ts
supabase/functions/_shared/club-notice.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-join-respond

Entrypoint: `supabase/functions/bookish-join-respond/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-join-respond/index.ts
supabase/functions/_shared/join-respond.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/club-notice.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-submit

Entrypoint: `supabase/functions/bookish-submit/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-submit/index.ts
supabase/functions/_shared/secrets.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

### bookish-verified

Entrypoint: `supabase/functions/bookish-verified/index.ts`. `verify_jwt: false`.

```text
supabase/functions/bookish-verified/index.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/club-http.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

## Account, email, and safety gates

Bookish auth provisions only absent email identities with trusted `app_metadata.app="bookish"`, sends an Auth-generated OTP through the Bookish Resend sender, and never promotes an unmarked identity. Password sign-in remains limited to existing trusted reviewer/demo accounts. The SQL rate limiter and live trusted-account checks remain authoritative. Public-key responses contain the injected anon key, never service-role credentials. Member RPCs run under the caller's verified token, and account deletion revokes sessions before hard deletion.

Provision the authorized demo accounts, club, current book, future meeting, pending join request, and open vote through the same supported Auth and member RPC contracts the app uses. Keep passwords private. Existing Apple-linked identities require a fresh authorization code and verified Sign in with Apple credentials before deletion. Do not introduce an Apple provider as part of this packet.

Verify hosted Data API access for the reviewed public schema, native and website CORS, Vault permissions, actual OTP delivery, OTP verification, refresh, reviewer-password sign-in, private join notifications, approval emails, invite rotation, safe map/list results, voting, reporting, and account deletion with dedicated Bookish test accounts. Never infer hosted readiness from local PGlite or offline HTTP tests.

Assign a human moderation owner and response coverage before promising a live twenty-four-hour service. The service-only moderation queue and audit RPCs remain the operations interface. Give operator backups a retention deadline, and honor deletion requests against retained data. This packet does not create baseline snapshots. No monitoring routine is created here; any durable routine belongs on the Mac mini.

## Rollback

`.ted/rollback.sql` is a non-destructive, fail-closed operational rollback. Serve maintenance content, pause intake, confirm the dedicated project, set the same target guard, and execute with stop-on-error enabled. It disables discovery and new auth attempts, and revokes client and mutation privileges while retaining accepted data, identities, and the verified deletion path. Do not redeploy stale public club snapshots after a club becomes Hidden. Reapply the reviewed packet, restore the listed function bundles, and repeat hosted checks before resuming traffic.

## App Review hardening follow-up (BRIEF4)

Chunks 01 through 19 are the already-deployed base. Apply `.ted/apply-20.sql` next, using the same explicit target guard. It must run after chunk 19, and may be repeated. All new hardening SQL lives in chunk 20. `.ted/apply.sql` remains the original base transaction: if rebuilding from that file or regenerating the base, always finish with chunk 20 before enabling traffic. The generator preserves this hand-authored chunk. Rollback revokes the new member RPC and worker queue access while preserving data and the deletion path. Restore with chunks 01 through 20 in order.

Redeploy `bookish-auth`, `bookish-confirm`, and `bookish-join-respond`. Deploy the new `bookish-report-alerts` function. The join-respond manifest above additionally requires `supabase/functions/_shared/join-respond.ts`. Use `verify_jwt: false` for all four. SQL-only changes also protect the existing join and web host-desk functions without redeploying those two.

### bookish-report-alerts

Entrypoint: `supabase/functions/bookish-report-alerts/index.ts`. `verify_jwt: false`. The handler requires a separate `BOOKISH_REPORT_WORKER_KEY` of at least 32 characters, with no CORS access. Never use a public, Auth, service-role, or Ted board key as this key.

```text
supabase/functions/bookish-report-alerts/index.ts
supabase/functions/_shared/report-alerts.ts
supabase/functions/_shared/bookish.ts
supabase/functions/_shared/secrets.ts
supabase/functions/_shared/types.ts
supabase/functions/deno.json
supabase/functions/deno.lock
```

Provision the same new worker key in this project's environment or Vault and the Mac mini's protected configuration file, as described in `ops/README.md`. The endpoint accepts only `POST` with `x-bookish-worker-key` and `{ "action": "pending", "after": null }`, and returns a page of at most 100 pending reports, plus a continuation cursor. No reporter identity or account email is returned. This alert is a notification, not a moderation decision or proof of 24-hour coverage. Ted must establish staffing, check the job's error log, and resolve reports by their due times.

Publish the generated website, including `/join/confirm/` and `/join-respond.js`, before redeploying `bookish-join-respond`. GET redirects to that website confirmation because the Supabase project gateway does not serve GET HTML. Only the page's native POST acts. It sends an origin-only referrer, requires the exact configured website Origin, and removes the capability fragment from the address bar on load. No third-party cookies or paid custom domain are needed.

Before release, verify password sign-in without email secrets, deliberate POST approval, a real caller ballot, pending claim review, host-desk email privacy, and the first report card on the deployed dedicated project. No hosted deployment or job installation occurred in this follow-up.
