# The Tea Threat Model

## Boundary and Assets

The Tea is anonymous to club members, hosts, other clubs, message recipients, and ordinary service RPC callers. It is pseudonymous inside the database: `bookish_private.take_authors` connects a take to an account for blocking, rate enforcement, deletion, and safety moderation. Database owners can inspect that mapping. This is not anonymity against the infrastructure operator.

Protect take authorship, sealed text, private page logs, hidden content, meeting addresses, member emails, and notification recipients. A valid, verified Bookish account with current club membership is required for club reads. Hosts and cohosts have moderation authority without identity access. Banned users and removed members lose access immediately.

## Attack Surfaces and Controls

| Threat | Control | Executable evidence |
| --- | --- | --- |
| Author IDs through tables, views, RPCs, or service escalation | Raw takes, reactions, mappings, and private tables have no reader grants. Explicit feed projections contain no author, name, avatar, or ownership flag. Remove `bookish_escalate_author`, including service access. Historical signed names are cleared. No public view references the mapping. | `tea-hosting.test.mjs`, anonymity, catalog, service queue, and grants cases |
| Private helpers become identity oracles | Revoke the broad historical helper grants. Only policy predicates are executable by authenticated users. The text verdict and authorship helpers cannot be invoked directly. | Private helper denial test |
| A caller forges an author or accesses another club | Author identity comes from `auth.uid()`. Every mutation checks current membership and terms. RLS restricts direct club reads. Parent foreign keys and explicit checks prevent cross-club and cross-book threads. | Outsider, removed member, banned member, and parent tests |
| A host removes a take and learns its author | `bookish_moderate_take(id,'hide')` works by take ID, returns void, and leaves author resolution inside private safety operations. Host report queues do not include account IDs. | Host removal and report queue tests |
| A sealed take leaks through a different endpoint | Both feed generations omit sealed bodies. Replies inherit parent markers. DNF takes require a finished log. A new reading cycle invalidates old progress. Historical chapter markers are conservatively moved to the final book page, or page 100,000 when unknown, because no chapter-to-page translation is available. They are not relabeled as DNF. Reader spoiler-shield preferences cannot bypass the page gate. Reactions and replies require an unsealed, visible take. | Spoiler, DNF, ancestor, and cycle tests |
| Hidden or blocked content returns through notifications | Notification reads recheck current target visibility and membership. A block resolves the private author internally and applies to later posts. Hidden ancestors suppress replies. | Content actions and notification tests |
| Sips expose identities or permit inflated counts | Existing primary key allows one reaction per account and take. All reaction write RPCs map to one sip. Raw reaction rows are unavailable to readers. Counts are aggregates. | Idempotent sip test |
| Abuse, personal information, or large takes | Enforce 1 to 280 PostgreSQL characters, NFKC normalization, control and invisible character removal, existing slur/threat rules, and patterns for email, phone numbers, and common street addresses. Apply filtering in the new and legacy write path and table trigger. Generic rejection text contains no matched identity. | Filter and legacy path tests |
| Delete and repost to evade throttling | Lock the account row and count a private post-event log across clubs and RPC versions. Ten accepted takes per rolling minute, including deleted takes. | Rate limit deletion test |
| A shared shelf becomes competitive or exposes DNF status | Sharing defaults to false, including preexisting memberships. Shelf entries have no rank, score, streak, percentage, or DNF status. No progress-based ordering. Own private progress is returned separately. | Optional sharing and DNF privacy tests |

## iMessage Cards

`bookish_message_card('take', id)` always returns a sealed metadata envelope, even for a reader who has finished the book. It contains only the take ID, page or DNF marker, a generic Anonymous label, and book metadata. It never embeds the body, author, sender account, avatar, stable author pseudonym, ownership flag, or private author token. The card ID confers no read authority. Opening a card requires the recipient's authenticated session and current club membership, then the recipient's own page gate.

The screen ticket must render the generic envelope as supplied. Do not serialize a feed object, client profile, unsealed text, or signed-in account into an `MSMessage`, URL, image, accessibility label, analytics event, or notification preview. Do not use a per-author card session identifier. The `MSMessage` sender is visibly the person sharing the card, so the UI must label that action as sharing an anonymous take and never assert that the sender wrote it. Prefer posting a card through a host or explicit sharing action to reduce correlations.

Live vote cards contain aggregate tallies and option IDs, with no ballot identities, opener identity, or `imsg_token`. RSVP cards contain counts, date, title, and open bring items, with no street address, claimant identity, or attendee list. Those objects are member-only at fetch time. Forwarded static cards can disclose their small metadata payload outside the club, so the client must not add private content to them.

## Notifications and Reminders

Notification rows have a fixed kind and target ID rather than arbitrary content or author fields. They never contain take text, including for unlocked takes. Generate new-take notifications only for pages the recipient has reached, or finished readers for DNF takes. Votes notify current members, join requests notify hosts and cohosts, and claimed meeting reminders notify their recipient. All reads revalidate membership and target visibility. Notification targets are not bearer capabilities.

The reminder worker has a separate environment-only `BOOKISH_REMINDER_WORKER_KEY`, with at least 32 characters. It accepts only a fixed run command, never a supplied email address, meeting, date, or user ID. Service-only SQL computes eligible recipients from verified accounts, current membership, Yes or Maybe RSVP, opt-in reminders, and future, scheduled meetings tomorrow by UTC date. The worker rechecks eligibility and a frozen payload before delivery. The ten-minute claim lease prevents concurrent claims. A stable Resend idempotency key covers a lost acknowledgment. Ambiguous retries stop after 23 hours, within the provider's existing dedupe convention used by this repository. A changed meeting time creates a new delivery identity. Snapshots that have never received a lease refresh safely after edits. After a possible delivery attempt, changes to the title or recipient email invalidate the old payload rather than risk an idempotency conflict.

Resend receives a recipient email, meeting title, timestamp, and authenticated calendar URL. It receives no take content or author mapping. Worker responses expose counts only, and errors do not log PII or provider response bodies. Missing `BOOKISH_EMAIL_FROM`, `RESEND_API_KEY`, or the worker key fails closed before claiming.

The calendar endpoint requires a verified Bookish bearer session, executes its RPC as that reader, and rechecks current membership and meeting state. Its `.ics` response is private and uncached, escapes calendar text, and contains no attendee identities. Meeting IDs in email links are not access tokens. A forwarded calendar link does not expose an address to an outsider. The screen ticket must complete sign-in and fetch the URL with the reader bearer token before presenting the downloaded file. A browser without a bearer session receives 401.

## Residual Risk and Limits

- Writing style, page timing, small clubs, voluntarily disclosed text, and a message sender's visible identity can allow social inference. These controls prevent explicit server disclosure, not inference or a compromised recipient device.
- Filters are conservative heuristics. International address formats, obfuscation, and contextual slurs require continued safety review. Book passages with phone-like numbers or addresses can be rejected. Do not market the filter as complete detection.
- A reader can deliberately log a later page. Page sealing protects against accidental spoilers, rather than proving reading progress.
- A state change between the final database check and the external HTTP request cannot be atomically prevented. No send begins from an already ineligible prepared payload; cancellation after preparation is a narrow distributed-system race.
- Title or email edits invalidate a reminder snapshot after its first lease. They can suppress that reminder for the existing start time. Rescheduling to a new time creates a new reminder.
- UTC is the explicit calendar-day convention because the existing meeting model has no timezone. Add a reviewed timezone contract before promising local-calendar-day reminders.
- PGlite exercises actual PostgreSQL functions, grants, RLS, constraints, and triggers, but does not emulate PostgREST embedding, production concurrency, or Resend. Provider calls are fake in tests. No migration, deployment, production schedule, or email has been performed for this work.
