# Bookish 1.1 deployment packet

This is a proposal for Ted. Nothing here authorizes a production write or records one as completed. The Supabase project `wqnrortftkffmbeugjky` also belongs to Fictora. Do not run `db push`, apply the old PR21/PR30 visibility packets, import the separate-project Auth example, change shared Auth templates/provider settings, deploy all functions, or use `--prune`.

Run `.ted/preflight.sql` read-only against the Dashboard-confirmed project. Review unexpected policies, duplicate club references, invalid club names, and memberships without trusted Bookish identities. The latter must be resolved deliberately before 005 adds its profile foreign keys. Never mark an existing Fictora identity as Bookish to pass this check. Take an encrypted off-project database backup and preserve the existing Bookish function bundles. Pause Bookish intake during the database/function cutover.

Apply `.ted/apply.sql` as one transaction, with stop-on-error enabled. It contains ordered SQL 001 through 010, the book catalog, the public directory seed, city centers, and protected Bookish-only snapshots in `bookish_release_20261101`. It never copies shared Auth identities into the snapshot or changes an unmarked identity. Confirm the actual project in the Dashboard, then set the following session guard before executing the file:

```sql
set bookish.target_ref = 'wqnrortftkffmbeugjky';
```

The guard is an explicit operator check, not independent proof of the connected project's identity. Reapplying is supported. The first seed retains existing host privacy choices, and subsequent applies do not overwrite them. The packet stores no venue coordinates in public data. All 2,538 source-calendar listings remain in directory/list results. Of these, 138 have unavailable/invalid city-center references and return null coordinates, so they cannot be plotted until their reference data is corrected.

File hashes for the final SQL packet and edge sources are recorded in `.ted/SHA256SUMS`. Verify them before cutover.

## Edge source and exact settings

All twelve functions use `verify_jwt = false` as explicitly declared in `supabase/config.toml`. Public website handlers enforce their capability or input contracts. Authenticated account handlers verify the bearer token with Supabase Auth, check trusted Bookish app metadata, and execute member RPCs with that user's token. The deletion handler revokes sessions before hard deletion. Do not turn gateway verification into an authorization substitute.

| Function | Exact source path | verify_jwt |
| --- | --- | --- |
| bookish-auth | supabase/functions/bookish-auth/index.ts | false |
| bookish-account-join | supabase/functions/bookish-account-join/index.ts | false |
| bookish-delete-account | supabase/functions/bookish-delete-account/index.ts | false |
| bookish-house-rules | supabase/functions/bookish-house-rules/index.ts | false |
| bookish-directory | supabase/functions/bookish-directory/index.ts | false |
| bookish-verified | supabase/functions/bookish-verified/index.ts | false |
| bookish-community | supabase/functions/bookish-community/index.ts | false |
| bookish-club-settings | supabase/functions/bookish-club-settings/index.ts | false |
| bookish-join | supabase/functions/bookish-join/index.ts | false |
| bookish-join-respond | supabase/functions/bookish-join-respond/index.ts | false |
| bookish-submit | supabase/functions/bookish-submit/index.ts | false |
| bookish-confirm | supabase/functions/bookish-confirm/index.ts | false |

The pinned SDK is `@supabase/supabase-js@2.118.0`, resolved by `supabase/functions/deno.json`, with its lockfile in the same directory. The locally inspected CLI is 2.105.0. From the repository root, Ted can run these exact commands individually after review. The explicit import map avoids depending on CLI parent-directory discovery.

```sh
supabase functions deploy bookish-auth --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-account-join --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-delete-account --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-house-rules --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-directory --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-verified --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-community --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-club-settings --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-join --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-join-respond --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-submit --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
supabase functions deploy bookish-confirm --project-ref wqnrortftkffmbeugjky --no-verify-jwt --use-api --import-map supabase/functions/deno.json
```

The runtime must have `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`. Only the public anon key is returned to the app after sign-in, never the service key. Bookish email requires a verified `BOOKISH_EMAIL_FROM`, the existing Resend integration's `RESEND_API_KEY`, and `BOOKISH_SITE_URL=https://meetbookish.com`. House rules require reachable `BOOKISH_TERMS_URL`, `BOOKISH_PRIVACY_URL`, and a monitored `BOOKISH_MODERATION_EMAIL`. Keep secret values in the deployment secret store, never in this repository or command output. No Apple provider is introduced by this release. Existing Apple-linked Bookish identities still require the already-supported Apple revocation credentials and a fresh authorization code before deletion.

## Trusted accounts and app contract

The app calls `bookish-auth` using JSON. `{action:"start",email}` provisions only an absent email identity through the Auth admin API, using trusted `app_metadata.app="bookish"` and `email_confirm=false`. It then generates an email OTP through Auth's admin generate-link endpoint and delivers the code through Bookish's Resend sender. Neither a global Auth email template nor a provider setting changes. An existing unmarked identity receives no change and no email; the public start response remains `{ok:true}`. User metadata is never trusted. A unique-email creation race rechecks the winning identity's trusted marker before generating a code.

`{action:"verify",email,token}`, `{action:"refresh",refresh_token}`, and `{action:"password",email,password}` return `{ok:true,public_key,session}` only for a trusted Bookish identity. Password sign-in is for an existing reviewer/demo account, not public password signup. `{action:"logout"}` requires its bearer access token. A service-only SQL rate limiter serializes attempts by hashed IP and email, limits starts to five per email/hour and fifteen per IP/hour, limits verification/password attempts to ten per email/hour, and bounds all actions to one hundred per IP/hour. Attempts older than thirty days are pruned on requests. Account deletion clears the current email hash and verified-email join-attempt records.

Successful verification/refresh calls `bookish_sync_account()` under the user token. This creates a missing profile and connects a confirmed legacy host listing only when the verified Auth email matches its first confirmed owner and no account host already owns the club. Every active-user authorization checks the live trusted metadata, confirmed email, profile existence, and ban state, so deleted/banned accounts do not retain member privileges through an old access token.

The app uses its returned public key as REST `apikey`, and its access token as `Authorization: Bearer ...`. Accept terms with `bookish_accept_terms(p_version:"2026-10-15",p_adult:true)`. `bookish_my_account()` returns the safe profile and acceptance state. Member profile edits are limited to the granted `display_name` and `home_city` columns.

`bookish_create_club(p_name,p_city,p_state)` returns a UUID and creates a private, unlisted club. `bookish_set_visibility(p_club,p_visibility)` publishes Open/Private or hides Hidden, with city-center validation for publishing. `bookish_set_club_city(p_club,p_city,p_state)` is a host-only supported-city correction, accepting no coordinates. `bookish_club_detail(p_ref)` returns public fields and `club_id` or null, including for safe UUID/ref lookups.

Account joins use `bookish-account-join` with bearer token and `{p_ref,p_note}`. Success is top-level `{ok:true,club_id,status,request_id?,host_notified?}`. Open joins immediately. Private creates a host request, including for a legacy host who has not signed into the app. Hidden requires `bookish_redeem_invite(p_code)`. The edge sends the private request email to the confirmed legacy owner or account host without returning that email to the app. Host notices are claimed under a row lock, with five-minute retry spacing after failed delivery and permanent acknowledgement after success. Repeated joins reuse the pending request. A reader can create at most ten requests per hour. The host queue remains authoritative if email fails.

Host management uses `bookish_join_queue(p_club)`, `bookish_decide_join(p_request,p_approve)`, `bookish_remove_member(p_club,p_user)`, and `bookish_rotate_invite(p_club)`. Rotation invalidates both account and legacy directory invites for the club. Legacy email approval also inserts authenticated requesters into members. Legacy email-only requests do not authenticate a caller or create an account membership. An approved reader can explicitly join after proving their email ownership. Removed members cannot replay an invite.

`bookish_my_clubs()` returns safe clubs and the caller's role. `bookish_club_home(p_club)` returns `{club,role,current_book,members,meetings,votes}`. Members have `user_id`, `role`, `display_name`, and `joined_at`; meetings include `bring_items` and `rsvps`; votes include `options` and grouped `tally`, with no voter identities. Reading, meeting, RSVP, and vote RPCs keep the signatures in SQL 006. Tea, spoiler shields, reports, and moderation keep the scoped SQL 007 signatures, with author-wide anonymous blocking added in SQL 010.

`bookish_content_action(p_kind,p_id,p_action,p_reason)` covers `club`, `member`, `request`, `meeting`, `vote`, and `take`; actions are `report`, `block`, or `hide`. Reports immediately hide the item for the reporter. Member/take blocks suppress the author's other and future Tea without exposing anonymous identities. Host request reads, club-home reads, and applicable Data API policies honor content hides and blocks. `bookish_my_content_filters()` gives the caller's hidden kind/UUID pairs so the signed-in app can filter public directory responses.

Trusted account deletion is `POST bookish-delete-account` with its bearer token and `{}`. The server verifies the user, revokes sessions, and hard-deletes only a trusted Bookish identity. Bookish triggers delete its content and personal records. A host's club transfers to its longest-standing eligible member or is deleted if empty. Legacy owner-submission references clear safely when a transferred club survives. No unmarked Fictora identity is promoted or deleted.

## Reviewer and operations gates

Ted must create the demo identity in Auth with a verified email, a strong unique password stored in the secure deployment store, and trusted `app_metadata.app="bookish"`. Use the reviewer email agreed in REPORT.md, and provide its real password privately in App Review Notes when a future review submission is authorized. Do not hardcode a password, OTP, or review bypass. Provision two demo identities and a club in a supported city, accept the current terms, make one the host, and have the second request to join so the reviewer can approve the pending request. Seed a current catalog book, a future meeting, and an open vote through the same RPCs as the app. After approval, the second account can exercise member voting. Test the invite flow separately with a current code. No production demo identity was created in this session.

Before allowing real traffic, Ted must verify actual email delivery, OTP verification, refresh, reviewer-password sign-in, approval emails, invite rotation, safe map/list results, votes, reports, and account deletion with dedicated Bookish test accounts. PGlite tests prove local SQL and authorization behavior; they do not prove hosted Auth, SMTP/Resend, Data API configuration, or deployment settings. Check that Data API access is enabled for the reviewed public schema and that CORS accepts the actual Capacitor origin.

Moderation must have a real human owner. The service-only `bookish_content_report_queue()` returns generic pending reports with a twenty-four-hour due time. Existing `bookish_host_reports`, `bookish_moderate_take`, and service-only safety-review RPCs cover Tea. Generic reported targets can be read through the service role's scoped Bookish tables. Resolve them through service-only `bookish_review_content(p_report,p_action,p_reviewer,p_note)`, using `dismiss`, `hide`, or `ban` (member reports only). Every resolution is audited. A club hide removes public discovery and invalidates invitations; a member ban stops existing tokens at the live profile check. No production monitoring routine or external outreach was created here. Establish the response coverage before promising a live twenty-four-hour service.

The protected baseline snapshot is a deployment aid, not a permanent data-retention system. Ted must assign a short retention deadline, remove it after validation, and honor account-deletion requests against any retained backup under the published policy. The packet does not schedule this work. Any durable follow-up routine belongs on the Mac mini.

## Rollback

`.ted/rollback.sql` is a non-destructive, fail-closed operational rollback, not a destructive schema downgrade. First serve a maintenance app and pause Bookish intake. Set the same project guard and execute the file with stop-on-error. It empties discovery, disables new Auth attempts, revokes client RPC/table/column access, and revokes Bookish service table writes and legacy capability mutations. It preserves all accepted data, Bookish identities, protected snapshots, and Fictora objects. The verified deletion edge remains available. Never redeploy old public club snapshots after any club becomes Hidden. Reapply the reviewed packet, redeploy the listed functions, and repeat the live checks to resume.
