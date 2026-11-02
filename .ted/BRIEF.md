# Bookish: receive mail at @meetbookish.com and forward it

Today nobody receives mail at meetbookish.com (no root MX). Namecheap's own forwarding can't run alongside the Resend sending records (MX on send.meetbookish.com), so use Resend Receiving instead. The Resend domain meetbookish.com (id 6363423d-7afe-4ec0-83b2-abc2dae34aed, us-east-1) is verified for sending and shows `capabilities: {sending: enabled, receiving: disabled}`.

1. Read the current Resend docs for receiving emails (enabling receiving on a domain, the MX record it needs, the `email.received` webhook payload, how to fetch the full received email and attachments, and webhook signature verification). Write what you confirmed, with URLs, in .ted/INBOUND.md, including the exact API calls Ted must run to: enable receiving on the domain, read back the MX record to add, and create the webhook pointing at the function. Do NOT run any of those calls, do not change DNS, and do not touch the Resend account.
2. New edge function `supabase/functions/bookish-inbound/index.ts`, following the patterns in bookish-auth and `_shared/` (secrets via `readBookishSecret`, existing `sendEmail` or a direct Resend call if sendEmail can't set reply_to).
   - Verify the webhook signature with secret `RESEND_INBOUND_WEBHOOK_SECRET`. Reject unsigned or bad signatures with 401.
   - Only handle `email.received`. Fetch the full email.
   - Forward to `BOOKISH_INBOX_FORWARD_TO` (secret; Ted sets it to hello@getkres.com) from `Bookish Inbox <inbox@meetbookish.com>`, reply_to the original sender, subject `[Bookish] <original subject>`. Body starts with "From: <sender> To: <original recipient>", then the original text (and html when present). Include attachments up to 10 MB total, otherwise list their names.
   - Drop loops: ignore mail from meetbookish.com or from the forward target. Idempotent per received email id (a small table is fine if you add a migration file, but do not apply it; or use a stateless check if Resend gives a stable id you can dedupe on).
3. deno check and tests in the repo's existing style. Run the repo's test commands and report results.
4. Commit on branch feat/inbound-forward and open a PR to main with `gh pr create`. Do not merge or deploy.

Writing rule for every word a human reads (docs, PR text, email text): Oxford comma always, never an em dash (U+2014). Never print secrets. Finish with .ted/REPORT.md, short.
