# Bookish 1.1.1 Server RPC Reference

All screen RPCs execute with the signed-in reader's bearer session. Never use the service role in app or iMessage code. UUIDs below are resource IDs, not access tokens. SQL parameter names are the PostgREST JSON keys. New migrations extend the staged `supabase/sql/001` through `011` baseline and must be reviewed and applied separately by the release operator. This PR does not apply them.

## The Tea

| RPC | Parameters | Result |
| --- | --- | --- |
| `bookish_create_take` | `p_club uuid`, `p_book text`, `p_body text`, `p_page int = null`, `p_dnf bool = false`, `p_parent uuid = null` | `{id,status:'posted'}`. Supply exactly a nonnegative page, including 0 for no spoilers, or null page with DNF true. Up to 280 characters, filtered, anonymous, and ten accepted takes per member per rolling minute. Parent replies inherit stronger markers. |
| `bookish_tea_feed` | `p_club`, `p_book`, `p_parent = null`, `p_limit = 30`, `p_offset = 0` | Array of `{id,parent_id,body,page,did_not_finish,sealed,sips,sipped,reply_count,created_at}`. Root takes by default, direct replies for a parent. Newest first, with deterministic ID ties. Limit 1 to 100, offset 0 to 10,000. Empty Tea returns `[]`. |
| `bookish_sip` | `p_take uuid`, `p_sip bool = true` | Void. Idempotent one sip per member. False removes it. |
| `bookish_content_action` | `p_kind = 'take'`, `p_id`, `p_action = 'report'`, `'hide'`, or `'block'`, `p_reason = null` | Existing safety flow. Reports need a reason of 1 to 500 characters. A block applies privately to future takes by that account. |
| `bookish_moderate_take` | `p_take`, `p_action = 'hide'` or `'dismiss'` | Existing host or cohost moderation. Returns void and never identifies an author. |
| `bookish_host_reports` | `p_club` | Existing host queue, with page-gated bodies and no authors. |
| `bookish_message_card` | `p_kind = 'take'`, `'vote'`, or `'meeting'`, `p_id uuid` | Allowlisted iMessage metadata. Tea is always sealed and has no body, identity, or ownership flag. Vote has aggregate option tallies. Meeting has counts and open bring items, without an address. |

A sealed body's value is null. DNF takes require a finished log. Historical chapter-marked takes are conservatively retagged to the final book page, or page 100,000 if unknown, without relabeling them as DNF. Page gates use the reader's latest log in this reading cycle, regardless of shield settings or sharing preference. Do not reveal on tap without a fresh authorized feed request. Never serialize a feed object into a message card. See [the threat model](the-tea-threat-model.md).

Compatibility: `bookish_post_take` remains callable, but rejects `p_signed=true` and chapter-only markers. `bookish_tea` keeps its old signature, returns `anonymous=true`, `signed_name=null`, and `mine=false`, and maps aggregate reactions to `sip`. `bookish_react` maps any non-null reaction to one sip, and null removes it. Raw takes and reaction rows remain inaccessible. The service author-escalation RPC has been removed.

## Reading Together and Covers

| RPC | Parameters | Result |
| --- | --- | --- |
| `bookish_log_reading` | `p_club`, `p_book`, `p_page int`, `p_finished bool = false`, `p_dnf bool = false`, `p_request uuid = generated` | Page-log UUID. Retain `p_request` for retries with the same values. Finished and DNF are mutually exclusive. A retry with conflicting values is rejected. |
| `bookish_log_page` | Existing `p_club`, `p_book`, `p_page`, optional `p_chapter`, `p_finished`, and `p_request` | Existing page-only integration remains available. Use `bookish_log_reading` for DNF. |
| `bookish_share_reading` | `p_club`, `p_share bool` | Void. Sharing defaults to false. |
| `bookish_reading_together` | `p_club` | `{book,my_page,my_finished,my_did_not_finish,sharing,meeting_mark,members}`. Members are an unordered collection of opted-in readers, each with `{user_id,display_name,page,finished}`. DNF status is private. No current book returns `{book:null,members:[]}`. |

Never sort the shelf by progress or attach ranks, streaks, scores, or competitive notifications. `bookish_race` is a compatibility alias for the unordered shared member collection. Book objects from `bookish_books`, `bookish_club_home`, and the reading RPC include `cover_id`, generated `cover_url`, and `cover_style` for a fallback. A null cover ID gives a null URL. Image availability remains an external concern.

## Hosting and Notifications

| RPC | Parameters | Result |
| --- | --- | --- |
| `bookish_rsvp` | `p_meeting uuid`, `p_response = 'yes'`, `'maybe'`, or `'cant'` | Void. Replaces the caller's response. Future, scheduled meetings only. |
| `bookish_meeting_detail` | `p_meeting` | Meeting fields, `counts:{yes,maybe,cant}`, `my_rsvp`, and `bring_items:[{id,label,claimed_by,display_name}]`. Location is member-only. |
| `bookish_add_bring_item` | Existing `p_meeting`, `p_label text` | Item UUID, host or cohost only. |
| `bookish_claim_bring_item` | Existing `p_item uuid`, `p_claim bool` | Void. Atomic one-person claim. Only the claimant may release it. Future, scheduled meetings only. |
| `bookish_reminder_preferences` | `p_club`, `p_enabled bool` | Void. Caller-only per-club opt-out, default true. Preference is also readable on the caller's member row. |
| `bookish_notifications` | `p_limit int = 50`, `p_offset int = 0` | Newest-first `{id,club_id,kind,target_id,created_at,read_at}` rows. Kinds: `new_take`, `vote_opened`, `meeting_reminder`, and `join_request`. No body or author fields. Limit 1 to 100, offset 0 to 10,000. |
| `bookish_mark_notifications_read` | `p_id uuid = null` | Void. Null marks all visible own rows read. |
| `bookish_meeting_calendar` | `p_meeting` | Member-only `{id,title,starts_at,location}` for a future, scheduled meeting. |

RSVP storage retains `going`, `maybe`, and `next_time`; screen RPCs map these to Yes, Maybe, and Can't. Direct authenticated RSVP writes are retired in favor of the checked RPC. Existing meeting schedule, edit, cancel, and vote RPCs remain available. Opening a vote and submitting a pending join request automatically creates the relevant notifications. New-take notices are created only for eligible pages at post time, not backfilled when a reader advances.

`GET /functions/v1/bookish-meeting-calendar?meeting=<uuid>` with `Authorization: Bearer <reader session>` downloads a private `.ics`. The email links to this endpoint. The screen must sign in and fetch with that header, then present or save the calendar file. An unauthenticated browser receives 401. No bearer tokens are put in URLs.

## Reminder Worker Contract, Not a Production Schedule

`POST /functions/v1/bookish-meeting-reminders`, header `x-bookish-worker-key`, body `{"action":"run"}`. Environment-only `BOOKISH_REMINDER_WORKER_KEY` must have at least 32 characters. Delivery also requires `BOOKISH_EMAIL_FROM`, `RESEND_API_KEY`, and the standard Supabase runtime configuration. Missing configuration prevents claims. Responses contain only `{ok,sent,skipped,failed}`. Partial failure returns 503; claims retry after ten minutes, using a stable Resend idempotency key.

A separately authorized operator can later invoke it periodically on the Mac mini. No job is installed here. It considers tomorrow by UTC date, excludes past or cancelled meetings, and sends only to current, verified members with Yes or Maybe RSVP and reminders enabled. A batch claims at most 50 rows. Reinvoke to drain more batches. Claim leases and frozen payloads are private. Never-leased queued snapshots refresh after edits; snapshots with a possible delivery attempt stay immutable for idempotency.

Only the service role can call `bookish_claim_reminders()`, `bookish_prepare_reminder(p_id,p_lease)`, and `bookish_complete_reminder(p_id,p_lease)`. None returns a take author. Never expose these to the screen client.

## Approved Screen Sources

Reviewed `/Users/vahallo/biz/bookish/design/APPROVED-ART.md`, the HTML sources for 18, 19, 24, 33, 41, 42, and 44 under `full-app-1016/html`, and the approved v2 renderings from Ted Board:

- 17 The Tea: `de28115a-a436-4b5b-b396-ed89ca0e3ed2`.
- 20 Reading Together: `5349d0d2-c210-47ad-8146-f98b6a6c69b2`.
- 21 Log My Page: `e4ba9d05-d3ef-4f3d-a1a4-6635954bc1cd`.
- 28 Notifications: `1d3ed44e-11f9-4844-9af5-6e6f1f33cd34`.

The ticket overrides older Signed choices, reaction categories, reveal-on-tap hints, and competitive language in the art. This server exposes anonymous takes, one sip, strict page gates, and communal shared reading.
