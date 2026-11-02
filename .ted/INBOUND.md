# Bookish inbound mail handoff

Confirmed against current official documentation on 2026-11-02. Documentation browsing only: no Resend account API request, DNS change, deployment, or message send was performed. The commands below are a dry-run handoff for Ted, contain placeholders, and were not executed.

## Domain and webhook setup

The ticket identifies `meetbookish.com`, domain ID `6363423d-7afe-4ec0-83b2-abc2dae34aed`, region `us-east-1`, with sending enabled and receiving disabled. The documented update accepts a partial `capabilities` object, so this enables receiving while preserving sending. [Update Domain](https://resend.com/docs/api-reference/domains/update-domain).

```sh
curl --fail-with-body --silent --show-error \
  --request PATCH \
  'https://api.resend.com/domains/6363423d-7afe-4ec0-83b2-abc2dae34aed' \
  --header 'Authorization: Bearer <RESEND_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"capabilities":{"receiving":"enabled"}}'
```

Read back the domain after enabling receiving:

```sh
curl --fail-with-body --silent --show-error \
  --request GET \
  'https://api.resend.com/domains/6363423d-7afe-4ec0-83b2-abc2dae34aed' \
  --header 'Authorization: Bearer <RESEND_API_KEY>'
```

Use the `records[]` entry whose `record` is `Receiving` and `type` is `MX`. Copy its `name`, `value`, `priority`, and `ttl` exactly. The existing `SPF` MX on `send` is for sending feedback. The receiving MX value cannot safely be inferred from the region: Resend documents Forge and Amazon SES variants. For root-domain receiving, Ted must add the returned root MX at Namecheap and complete receiving verification. Its priority must be lower numerically than competing root MX records. Keep the existing sending records. No DNS changes are included in this ticket's execution. [Retrieve Domain](https://resend.com/docs/api-reference/domains/get-domain), [official receiving record type](https://github.com/resend/resend-node/blob/main/src/domains/interfaces/domain.ts), and [Custom Receiving Domains](https://resend.com/docs/dashboard/receiving/custom-domains).

The dedicated project URL is recorded in `README.md` and `.ted/DEPLOY.md`. After Ted applies the migration and deploys the function with JWT verification disabled, the endpoint is `https://tkrsrnlasinmlftkcufi.supabase.co/functions/v1/bookish-inbound`. Create a webhook subscribed only to `email.received`; the creation response contains a sensitive `signing_secret`, so save it in a private file outside this repository rather than printing or committing it. [Create Webhook](https://resend.com/docs/api-reference/webhooks/create-webhook).

```sh
curl --fail-with-body --silent --show-error \
  --request POST \
  'https://api.resend.com/webhooks' \
  --header 'Authorization: Bearer <RESEND_API_KEY>' \
  --header 'Content-Type: application/json' \
  --output '<PRIVATE_WEBHOOK_RESPONSE_FILE>' \
  --data '{"endpoint":"https://tkrsrnlasinmlftkcufi.supabase.co/functions/v1/bookish-inbound","events":["email.received"]}'
```

Ted sets the returned signing secret as `RESEND_INBOUND_WEBHOOK_SECRET`, sets `BOOKISH_INBOX_FORWARD_TO` to `hello@getkres.com`, and provides `RESEND_API_KEY` through the existing environment-first, Vault-fallback secret mechanism. Never place secret values in this document, terminal logs, or the PR.

## Event and content retrieval

The event has top-level `type`, `created_at`, and `data`. The `email.received` data includes `email_id`, `created_at`, `from`, `to[]`, `cc[]`, `bcc[]`, `received_for[]`, `message_id`, `subject`, and `attachments[]`. Attachment metadata includes `id`, `filename`, `content_type`, `content_disposition`, and `content_id`. The webhook does not contain the body, original headers, or attachment bytes. Use the provider's `email_id` as the deduplication identity. [email.received reference](https://resend.com/docs/webhooks/emails/received), and [receiving webhook guide](https://resend.com/docs/dashboard/receiving/create-receiving-webhook).

```sh
curl --fail-with-body --silent --show-error \
  'https://api.resend.com/emails/receiving/<RECEIVED_EMAIL_ID>' \
  --header 'Authorization: Bearer <RESEND_API_KEY>'

curl --fail-with-body --silent --show-error \
  'https://api.resend.com/emails/receiving/<RECEIVED_EMAIL_ID>/attachments' \
  --header 'Authorization: Bearer <RESEND_API_KEY>'

curl --fail-with-body --silent --show-error \
  'https://api.resend.com/emails/receiving/<RECEIVED_EMAIL_ID>/attachments/<ATTACHMENT_ID>' \
  --header 'Authorization: Bearer <RESEND_API_KEY>'

curl --fail-with-body --silent --show-error \
  '<ATTACHMENT_DOWNLOAD_URL_RETURNED_BY_RESEND>' \
  --output '<PRIVATE_ATTACHMENT_FILE>'
```

The received-email GET supplies `text`, `html`, `headers`, sender and recipient fields, attachment metadata with byte `size`, and optional `raw.download_url`. HTML defaults to embedded data URIs; `?html_format=cid` requests CID references, and the returned `html_format` indicates the actual format. [Retrieve Received Email](https://resend.com/docs/api-reference/emails/retrieve-received-email).

Attachment listing returns `{object:"list", has_more, data:[...]}`. Each item includes metadata, `size`, `download_url`, and `expires_at`; individual retrieval returns the same attachment details. Download bytes from that signed URL without forwarding the API authorization header. URLs last one hour; retrieve metadata again to refresh them. [List Attachments](https://resend.com/docs/api-reference/emails/list-received-email-attachments), [Retrieve Attachment](https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment), and [Process Receiving Attachments](https://resend.com/docs/dashboard/receiving/attachments).

Receiving attachment lists support optional pagination. With no `limit`, all items are returned. To paginate, request `?limit=100`, inspect `has_more`, and pass the last returned attachment ID as `after` for the next page. The limit range is 1 to 100; `before` provides reverse pagination and cannot be combined with `after`. [Pagination](https://resend.com/docs/api-reference/pagination).

## Signature, forwarding, and duplicate delivery

Verify the exact raw request body before JSON parsing, using `svix-id`, `svix-timestamp`, `svix-signature`, and the endpoint signing secret. Resend supports its SDK verifier or Svix. Manual verification uses HMAC-SHA256 over `<svix-id>.<svix-timestamp>.<raw-body>` with the base64-decoded secret after `whsec_`, checks any supported versioned signature with a constant-time comparison, and rejects timestamps outside tolerance. The Bookish handler must return 401 for missing or invalid signatures. [Resend signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests), and [Svix manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual).

Manual forwarding sends a new message through `POST /emails`, with the verified Bookish sender, original sender in `reply_to`, prefixed subject, introductory sender and recipient text, original text and HTML, and base64 attachment `content`. Preserve inline attachment `content_id` when needed. Resend's documented maximum is 40 MB per email including base64-encoded attachments, and some file types are unsupported. This ticket imposes a stricter 10 MB total attachment policy, with filenames listed when omitted. [Forward Received Emails](https://resend.com/docs/dashboard/receiving/forward-emails), [Send Email](https://resend.com/docs/api-reference/emails/send-email), and [attachment encoding and limits](https://resend.com/docs/dashboard/emails/attachments).

For sends, use a deterministic `Idempotency-Key` such as `bookish-inbound/<received-email-id>`, at most 256 characters. Resend retains keys for only 24 hours. Identical key and payload return the original result without another send; a changed payload returns `409 invalid_idempotent_request`, and concurrent requests may return `409 concurrent_idempotent_requests`. Changing signed attachment URLs between retries changes the payload, so use stable attachment bytes or retain the exact original request. [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

Provider idempotency alone is insufficient: automatic webhook retries extend beyond 24 hours, and succeeded events can be manually replayed. Persist received-email IDs, completed outcomes, and sufficient retry state; never blindly resend an uncertain attempt after the provider window expires. Reconcile such attempts manually. A completed durable record must continue suppressing replays after 24 hours. [Retries and Replays](https://resend.com/docs/webhooks/retries-and-replays).

## Prepared implementation and operator checks

`supabase/sql/011_bookish_inbound.sql` is an unapplied addition after the existing chunk 20. `.ted/DEPLOY.md` lists the complete new function manifest and secret setup. Keep durable completion markers indefinitely; unresolved attempts return 503 after 23 hours and require operator reconciliation before any reset or resend. The implementation's attachment cap is 10,485,760 decoded bytes in total. It checks listed sizes and actual downloaded bytes, and lists all attachment names if the cap is exceeded.

The handler combines `received_for`, `to`, `cc`, and `bcc` to find original `@meetbookish.com` destinations, including Bcc-only delivery, and ignores other-domain events. `received_for` comes from the `for` clauses of `Received` headers; it is not independently verified SMTP envelope data. Original bodies are fetched from Resend, and sender/recipient metadata is escaped in the generated HTML preamble. Resend's unsupported attachment types and overall message-size limit can still reject a forward below the local attachment cap; such failures remain retryable, then require operator review if unresolved.

After Ted finishes setup, verify live delivery of plain text, HTML with inline images, attachments, Bcc delivery, loop suppression, and replay of an already forwarded email. These hosted checks have not been performed by this ticket.
