# Confirmation email activation

The website's claim, start, and host-tools waitlist forms already use `bookish-submit` and `bookish-confirm`. Sender activation is an operational change. It requires no new table or migration. This guide does not authorize activation, deployment, database writes, or a real test send.

## What happens today

1. After validation, consent, bot checks, and rate limits pass, `bookish-submit` saves a `pending` submission.
2. The code gate is secret presence only: with both `BOOKISH_EMAIL_FROM` and `RESEND_API_KEY` present, it attempts a plain-text confirmation email through Resend. It does not check DNS or domain verification. Without either setting, it saves the submission and returns `confirm_sent: false`. An unverified `meetbookish.com` fails closed only because Resend rejects the send. The real activation control is to verify the sending DNS in Resend before setting `BOOKISH_EMAIL_FROM`.
3. Resend acceptance produces `confirm_sent: true` and an `email_sent_at` timestamp. The row remains pending. An HTTP rejection, including 403 for an unverified sender, or a thrown Resend fetch leaves `email_sent_at` unset and returns HTTP 200 with `ok: true` and `confirm_sent: false` for the saved row. Provider acceptance is not proof of inbox delivery.
4. A matching confirmation link marks a non-spam submission confirmed and redirects to `BOOKISH_SITE_URL`, which defaults to `https://meetbookish.com`. Malformed, missing, unknown, and spam tokens redirect with `?status=invalid`.

There is no retry worker or automatic resend of existing pending rows. A caught transport exception preserves submission success but does not retry delivery. Do not promise that the backlog will send when the domain is verified. Any backlog resend needs its own reviewed recipient scope and draft approval.

The shared `BOOKISH_EMAIL_FROM` and `RESEND_API_KEY` also control join-request and join-result emails. Review those functions before enabling the sender. This flow is separate from Supabase Auth SMTP, email OTP, and Apple sign-in. Do not change shared Auth settings to activate these website emails.

## Verify the sender domain

In the correct [Resend team and Domains dashboard](https://resend.com/domains), open or prepare `meetbookish.com`. Use the exact record names, values, priorities, and region from that domain's dashboard. Do not copy another domain's DKIM key, guess a region's MX target, or replace unrelated root mail records. If the domain is absent, obtain setup approval before creating it.

Resend requires a verified domain. Once verified, addresses at that domain do not require individual sender registration. See [verified domains](https://resend.com/docs/dashboard/domains/introduction) and [domain details](https://resend.com/docs/api-reference/domains/get-domain). Confirm ownership of the proposed mailbox and reply handling before using `Bookish <hello@meetbookish.com>`.

Read-only evidence collected on October 23, 2026, Pacific time:

| Authoritative query to dns1.registrar-servers.com | Result |
| --- | --- |
| `TXT resend._domainkey.meetbookish.com` | NXDOMAIN |
| `MX send.meetbookish.com` | NXDOMAIN |
| `TXT send.meetbookish.com` | NXDOMAIN |

These are Resend's default hostnames, not a substitute for the account's exact configuration. The dashboard redirected to login, so account verification status, domain-specific DNS values, and current production sender secrets were not verified. Recheck the provider and DNS before activation. Domain registration, website DNS, and email sending verification are separate checks.

## Reviewed rollout, performed by Ted

1. Review and merge the PR after its confirmation checks pass. It adds tests, CI, and documentation, catches Resend transport failures after saving a submission, and corrects the shared helper's sender comment. Merging it does not deploy Edge Functions.
2. Review the deployment revision against the current live handlers, including the separate backend and visibility PRs. Preserve any deployed privacy or security changes. If a function deployment is required, get separate deployment approval and deploy the reviewed revision of `bookish-submit` and `bookish-confirm` together using the existing public function settings. Do not deploy from a stale main checkout over a newer live handler.
3. Capture the current Bookish sender and site settings privately for rollback. In project `wqnrortftkffmbeugjky`, verify the presence of `RESEND_API_KEY`, verify that its allowed domain includes `meetbookish.com`, and review the exact `BOOKISH_EMAIL_FROM` and `BOOKISH_SITE_URL` values. Never copy secret values into the PR, card, logs, or screenshots.
4. After setup approval, publish the exact DNS records from Resend and wait for the domain's sending verification to pass. Preserve existing website, inbound mail, and forwarding records.
5. Verify the domain's sending DNS in Resend before setting `BOOKISH_EMAIL_FROM`, because code checks only that both sender secrets are present. Treat setting `BOOKISH_EMAIL_FROM` as the send activation step. After explicit activation approval, Ted sets the approved sender in Supabase's Edge Function secrets. Keep the existing shared Resend key unless a separately reviewed replacement is required. Updating project secrets affects all consumers, so changing `RESEND_API_KEY` is not a Bookish-only operation.
6. Live acceptance remains pending. A real end-to-end test is a separate send and database write, requiring a separately approved plan. Before any send, prepare `draft-email.json` in the card job directory with one already known, approved recipient, exact sender, subject, text including the actual confirmation link, and execution instructions. Any required test-data SQL follows the database review gate below. Submitting a live form while the sender is enabled sends immediately, so it must not be used to prepare an unapproved draft. General model turns must not perform the test, submit production forms, or click a real confirmation token. This PR includes no live test command.

After an approved test, Ted checks provider delivery or bounce events and the inbox, then follows the link and verifies the redirect and row status. `confirm_sent: true` alone does not meet that acceptance check. Do not enable bulk delivery or replay pending records as part of the test.

No SQL is part of this rollout. Do not rerun `001_bookish_submissions.sql`, use `db push`, or touch shared migration history. If a read-only review identifies a required database change, stop and stage exact SQL, a backup, and a rollback in the job directory's `apply.sql` with `REPORT.md` marked `NEEDS TED REVIEW`.

## Rollback

Before activation, retain the previous sender and site settings in the secret store. If activation causes problems, Ted restores the previous `BOOKISH_EMAIL_FROM`, or removes it if it was previously absent. This stops future Bookish email attempts and also affects join emails. Do not remove or rotate the shared Resend key to disable Bookish.

If a reviewed function deployment was part of the rollout, Ted can redeploy the captured prior versions after checking their compatibility. Restore `BOOKISH_SITE_URL` if it changed. Preserve submissions, confirmation tokens, and delivery timestamps for review. Already accepted emails cannot be recalled by removing the sender. Reverting this readiness PR alone does not disable production delivery.

## Offline verification

Requires Node 24, with no new dependencies:

```sh
npm run test:confirmation
BOOKISH_VERIFIED_FILE=tests/confirmation/fixtures/verified.json \
BOOKISH_COMMUNITY_FILE=tests/confirmation/fixtures/community.json \
SITE_URL=https://meetbookish.com npm run build
npm --prefix app test
```

The 21 tests execute the actual handler source. Their context replaces Supabase with in-memory rows and `fetch` with a fake Resend transport, and has no production credentials or real network transport. They check credential gating, all three form kinds, HTTP 403 rejection for a `meetbookish.com` sender, a thrown email request, consent, bot and rate limits, failed persistence, and confirmation tokens. They do not prove live database grants, deployed function versions, secret configuration, DNS verification, inbox delivery, Auth email behavior, or the invalid-token page's UI. Node may print its standard experimental warning for `stripTypeScriptTypes`.

The PR workflow runs these tests and a static build with local fixtures. No UI or artwork changes are included, so new screenshots and an art process strip are not needed for this PR.
