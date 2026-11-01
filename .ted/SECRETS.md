# Dedicated Bookish edge configuration

Target only `tkrsrnlasinmlftkcufi`. No secret values are included here. The functions read configured environment values first, then call `public.bookish_get_secret(p_name text)` with Supabase's injected service role. The RPC returns one text value or null, permits only the ten names below, and denies execution to PUBLIC, anon, and authenticated. Never call it from a browser or forward the caller's Authorization header to it.

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`. Keep these in the runtime, and do not put them in Vault for this fallback. The functions currently read the first three; none reads `SUPABASE_DB_URL`. The database password file `/Users/vahallo/ted-ops/keys/bookish-supabase/db.env` is an operator database credential source only. It does not supply any of these edge values.

## Complete non-platform inventory

`UNKNOWN` means no authoritative local value source was found. It is a deployment dependency, not a suggestion to copy a value from another business. A checked-in example with a blank assignment is not a secret source.

| Name | Consumers, including shared helpers | Existing local value source, path only |
| --- | --- | --- |
| `BOOKISH_SITE_URL` | confirmation and approval redirects, and club-decline notices | `/Users/vahallo/.codex/worktrees/bookish-full-1101/supabase/functions/_shared/bookish.ts`, `/Users/vahallo/.codex/worktrees/bookish-full-1101/supabase/functions/bookish-confirm/index.ts`, and `/Users/vahallo/.codex/worktrees/bookish-full-1101/supabase/.env.bookish.example` contain the public default |
| `BOOKISH_EMAIL_FROM` | auth OTP, host/join notices, and submission confirmation mail | UNKNOWN |
| `RESEND_API_KEY` | auth OTP, host/join notices, and submission confirmation mail | UNKNOWN |
| `BOOKISH_TERMS_URL` | house rules | UNKNOWN |
| `BOOKISH_PRIVACY_URL` | house rules | UNKNOWN |
| `BOOKISH_MODERATION_EMAIL` | house rules | UNKNOWN |
| `BOOKISH_APPLE_CLIENT_ID` | deletion of Apple-linked accounts only | UNKNOWN |
| `BOOKISH_APPLE_TEAM_ID` | deletion of Apple-linked accounts only | UNKNOWN |
| `BOOKISH_APPLE_KEY_ID` | deletion of Apple-linked accounts only | UNKNOWN |
| `BOOKISH_APPLE_PRIVATE_KEY` | deletion of Apple-linked accounts only | UNKNOWN |

Searched local credential/configuration candidates in `/Users/vahallo/ted-ops/keys`, `/Users/vahallo/ted-ops/secrets`, `/Users/vahallo/ted-ops/keys.env`, `/Users/vahallo/.config`, and Bookish environment files. Existing App Store Connect `.p8` keys are not verified Sign in with Apple revocation keys, so they are not listed as sources. The template for all names is `/Users/vahallo/.codex/worktrees/bookish-full-1101/supabase/.env.bookish.example`; its empty assignments do not unblock deployment. `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` appears only in that provider-configuration example and is not read by any of the twelve functions.

The owner must supply a Bookish-authorized Resend credential, a verified sender, published policy URLs, and a monitored moderation inbox before enabling sign-in and intake. Supply Apple credentials only when supporting Apple-linked account deletion. No Apple provider is introduced by this release. If those credentials are missing, ordinary email-account deletion remains available, and Apple-linked deletion fails closed.

## Exact insertion shapes for Ted

First apply the reviewed dedicated-project SQL packet, which installs the Vault extension and the restricted RPC. In the Dashboard-confirmed dedicated project, replace each placeholder privately with the owner-approved value. Run each statement only when that name is absent. These are insertion shapes, not a script ready to execute unchanged. Do not commit, log, or paste the populated SQL into a PR.

```sql
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_SITE_URL', 'Bookish public site URL');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_EMAIL_FROM', 'Bookish verified Resend sender');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'RESEND_API_KEY', 'Bookish Resend API credential');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_TERMS_URL', 'Bookish published terms URL');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_PRIVACY_URL', 'Bookish published privacy URL');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_MODERATION_EMAIL', 'Bookish monitored moderation inbox');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_APPLE_CLIENT_ID', 'Bookish Apple client identifier');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_APPLE_TEAM_ID', 'Bookish Apple team identifier');
select vault.create_secret('<OWNER_SUPPLIED_VALUE>', 'BOOKISH_APPLE_KEY_ID', 'Bookish Sign in with Apple key identifier');
select vault.create_secret($bookish_private_key$<OWNER_SUPPLIED_MULTILINE_PEM>$bookish_private_key$, 'BOOKISH_APPLE_PRIVATE_KEY', 'Bookish Sign in with Apple private key');
```

Use SQL parameter binding where supported. Preserve real newlines in the Apple PEM. Vault names are unique; for rotation, privately locate the existing name's ID and use `vault.update_secret` rather than inserting a duplicate. The helper does not cache decrypted values, so the next read observes a Vault rotation. Any nonempty runtime environment override still wins and must be rotated or removed separately.

A missing name, denied lookup, network failure, or malformed RPC result resolves as absent configuration. Auth and house rules fail closed through their existing generic responses. Submission intake still records a valid submission but reports that confirmation mail was not sent. The public site URL retains its existing public default. Lookup failures never print keys, decrypted values, network exceptions, or database response bodies.

Read-only hosted verification must inspect privileges and name presence without selecting decrypted values. Confirm the RPC is denied to anon and authenticated, and confirm actual email delivery and Apple revocation separately. Local offline tests cannot prove hosted Vault encryption, Auth, Resend domain verification, or external Apple behavior.

References: [Supabase environment variables](https://supabase.com/docs/guides/functions/secrets), and [Supabase Vault](https://supabase.com/docs/guides/database/vault).

BRIEF4 adds `BOOKISH_REPORT_WORKER_KEY`, a new Bookish-only random worker credential with at least 32 URL-safe characters. It is intentionally not generated or installed by this source preparation. Ted provisions the same value in the dedicated project environment or Vault and `/Users/vahallo/ted-ops/keys/bookish-report-alerts.env` (owner-only, mode 0600). The shared env-first, Vault-fallback reader and chunk 20's exact SQL allowlist support it. Never reuse a platform credential or the Ted board worker key. Do not put it into the plist, command arguments, git, card bodies, or logs. `ops/README.md` describes the installation and offline tests.
