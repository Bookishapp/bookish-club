# Bookish v1.1 backend

SQL upgrade files, two edge functions, auth configuration examples, and executable tests for PR #15. Reviewed in an isolated worktree, with the earlier uncommitted Review 1 fixes preserved in their original worktree and included here. No Supabase migrations, data changes, Auth changes, function deployments, or merges were performed. `app/` was untouched.

The existing project is `wqnrortftkffmbeugjky` (README and existing edge URLs). Its migration history is shared: keep using reviewed raw SQL in `supabase/sql/`, **not `supabase db push`**.

PR #12 is already merged in this checkout (`9049b5b`, feature commit `6f5887f`). It supplied the catalog, clubs/members, club books, pours, taste, suggestion events, community views, and `bookish-community`. Those are extended and reused. The existing three-club floor remains the single constant in `bookish_privacy_floor()`; no duplicate recommendation engine or community endpoint was added.

## Review 1 fixes

1. The deletion edge handler requires trusted `app_metadata.app = "bookish"` before any Apple or Auth deletion call. Fictora sessions return 403.
2. Auth insert and update triggers skip unmarked users, log and swallow their own errors, and no longer backfill existing identities. The Auth delete trigger skips unmarked users. For marked Bookish accounts, cleanup failures abort deletion and preserve the identity for retry. Bookish RPC access checks the Auth marker, even if a stale profile exists.
3. The Auth example was renamed `auth.bookish.SEPARATE-PROJECT-ONLY.example.toml`, with an explicit shared-project prohibition in its header.
4. A block applies to one take and its replies. It cannot identify an anonymous author's other takes.
5. Community counts require three distinct members with memberships at least 14 days old in each club. Clubs sharing any member with another eligible club do not contribute.
6. Club Pour excludes members with `ratings_public = false`, suppresses both counts below five consented contributions, and independently requires five non-DNF ratings before returning a mean.
7. The Tea hold filter matches the full normalized display name, requires at least three characters, and excludes common stopwords. Hyphens, apostrophes, and repeated whitespace use the same normalization as post text.
8. Members cannot SELECT ballot rows. `bookish_vote_tally` exposes grouped counts only.
9. SQL 005 through 008 uses conditional table, column, index, policy, trigger, and constraint creation, plus replaceable functions and views. The test suite reruns all four files against a populated local database. The preflight now flags existing reader rows for manual reconciliation, since no shared Auth identities are backfilled.

A separate Bookish Supabase project is still the real fix and needs Sebastian. Until then, trusted Bookish signup must create a fresh identity with the app marker at creation; the direct Auth signup flow described before this review must not be used on the shared project.

## October 23 resume

Rebased onto current `main`, including the existing native finder. Its directory refresh, verified flags, and legacy join form already use the published feed and `bookish-join`. This PR does not add native account or member-club screens, or connect that UI to the v1.1 RPCs. Native account integration remains blocked by the database and trusted Auth provisioning review. No UI files changed in this PR.

Fresh read-only history and catalog checks on October 23 confirm 005-008 remain unapplied: the private schema and new tables are absent, the 66 catalog books remain, the other nine existing Bookish tables have zero rows, and no Auth identity has the trusted Bookish marker. Shared Auth now has 170 identities. Review artifacts and the fresh catalog snapshot remain in the local `card-bk-backend` job directory.

New public tables now receive explicit service-role CRUD immediately after creation, followed by RLS and client-role revocation. Existing reviewed member policies and narrow authenticated grants remain. Dynamic ACL and RLS loops are replaced by literal statements, and triggers use `CREATE OR REPLACE TRIGGER`. Existing applied SQL 001-004 is unchanged. A local PGlite regression disables inherited table grants before applying each new migration and checks service CRUD, anon denial, and private ballot, Tea, and reaction access.

The `Backend and finder` PR check runs backend tests, edge type checks, edge lint and formatting, an offline finder build, native domain tests, and the app UI smoke test. It uses local empty aggregate and verified fixtures, needs no secrets, and performs no deployments or database operations against Supabase.

## Schema diagram

```text
auth.users
  └─ bookish_profiles (id = auth user; name, city, terms timestamp/version, 18+, ban)
       ├─ bookish_preferences (selected club)
       ├─ bookish_members ─────────────── bookish_clubs
       │    role: host/member; cohost compatibility retained from PR #12
       │    ratings_public, race_visible, spoiler_shield
       │                                   ├─ club_ref -> directory data/clubs.json ID
       │                                   │  optional, unique, verified host-email link
       │                                   ├─ bookish_join_requests (existing; +club/user IDs)
       │                                   ├─ bookish_invites (existing; +club/creator IDs)
       │                                   ├─ bookish_club_books ── bookish_books (text slug ID)
       │                                   │    one current book; reading/finished/dropped
       │                                   │    ├─ bookish_page_log (reader, page/chapter, finished,
       │                                   │    │                    idempotency UUID, server time)
       │                                   │    └─ bookish_takes (root or reply; no author ID)
       │                                   │         ├─ parent_id -> same club/book take
       │                                   │         └─ bookish_take_reactions
       │                                   ├─ bookish_meetings (exact location: members only)
       │                                   │    ├─ bookish_rsvps
       │                                   │    └─ bookish_bring_items (one claimant per item)
       │                                   ├─ bookish_votes
       │                                   │    ├─ bookish_vote_options ── bookish_books
       │                                   │    └─ bookish_vote_ballots (one reader/vote)
       │                                   └─ bookish_nominations ── bookish_books
       ├─ bookish_pours ── bookish_books (optional club)
       ├─ bookish_taste ── bookish_books
       ├─ bookish_suggest_events (existing; service-only)
       └─ bookish_submissions (existing; +user ID for deletion after email changes)

bookish_private (never expose in PostgREST)
  take_authors: take -> reader, unavailable to clients and direct service queries
  blocks: blocker -> one take, with replies hidden through the ancestor check
  hidden_takes: per-reader hide/report suppression
  reports: take, reporter, reason, 24h due time, independent host/team review states
  content_holds: member-name references held outside the feed; private author FK
  content_rules: server-side insertion filter patterns
  club_removals: prevents invite re-entry after host removal
  safety_audit: actor, reason, action, take, timestamp

Existing community views -> bookish-community -> public aggregate-only results
  active clubs = 3 distinct members joined for 14+ days, a finished book, and no members shared with another eligible club
  every displayed community count/average needs 3 contributing clubs
```

All application tables in both schemas have RLS. API privileges are explicitly revoked before narrow grants, including environments with Supabase's default public-schema grants. Membership and host checks use private functions to avoid recursive membership policies. Bans/deletions immediately make membership predicates false even while an old access token has time remaining.

Tea bodies and reactions have no client table privileges. Feed/reply reads use one RPC. Anonymous authors live only in the private mapping; a signed post exposes the chosen display-name snapshot, never its private author mapping. Hosts receive no author ID in feeds or report queues. Only the service-only legal/safety escalation RPC returns an author ID, after inserting an audit entry.

Page and chapter markers are independent. Without sufficient logged progress, `body` is `null` and `sealed` is true; reply thresholds inherit their ancestors' thresholds. Finished readers or readers who explicitly turn off their spoiler shield can unseal. The app must never place bodies in shared links, Messages fallbacks, notification previews, or widget payloads.

Reports immediately hide content for the reporter, permanently across host dismissal. Blocking hides only the selected take and its replies, without linking other anonymous takes by the same author. Hiding an ancestor suppresses its replies. Allowed reactions are 🔥 😭 🍵 🤯.

## Upgrade files

Apply **once, in order**, on a disposable staging clone first:

1. `supabase/sql/005_bookish_accounts_clubs.sql`: profiles/auth trigger, ownership FKs, memberships/preferences, directory linking, invites and join/host APIs.
2. `supabase/sql/006_bookish_reading_meetings_votes.sql`: reading logs/Race, meeting/RSVP/bring APIs, nominations and atomic votes.
3. `supabase/sql/007_bookish_tea_moderation_deletion.sql`: private authors, takes/replies, filtering/holds, reporting/blocking, moderation and deletion triggers.
4. `supabase/sql/008_bookish_community_privacy.sql`: hardens existing views so a rating mean independently needs three rating-contributing clubs; adds member-only Club Pour RPC.

These depend on existing files 001–004. New upgrade files are transactional, rerunnable on the local PGlite fixture, and deliberately fail on inconsistent existing data. `supabase/checks/bookish-v11-preflight.sql` is a read-only audit for duplicate directory links/current reads, invalid club names, and orphan user/club IDs. Resolve audit results before applying; no automatic cleanup is included.

The 008 change fixes an existing edge case: three reading clubs plus one rating club previously exposed that one club's mean. The reading count can still appear; the mean is now null until three clubs contribute eligible ratings. Ratings opt-out still excludes those pours from community calculations. The public endpoint's response shape is unchanged.

## iOS API surface

Use the Supabase public key plus the signed-in reader's bearer token. Never embed the service key. For RPCs, call `POST /rest/v1/rpc/<name>` with JSON whose keys are exactly the parameter names below. UUIDs are strings; book IDs are existing text slugs such as `fourth-wing`, not UUIDs. No endpoint accepts a caller-supplied acting user ID.

### Auth and account

- Auth onboarding is gated pending a trusted Bookish signup path that creates a new Auth identity with `raw_app_meta_data.app = "bookish"` at creation. Direct shared-project Apple and email OTP signup cannot create a usable Bookish account because they do not set trusted app metadata. A Fictora identity must never be upgraded or reused for Bookish. Sebastian must move Bookish to a separate Supabase project before the native signup flow ships.
- `GET /functions/v1/bookish-house-rules`: published contact, terms/privacy URLs, terms version, 18+ minimum, and acceptance/report copy. Returns 503 until policy URLs and contact are configured.
- `bookish_accept_terms(p_version text, p_adult boolean) -> void`: current version `2026-10-15`; must accept before creating/joining a club or posting/reacting.
- `bookish_my_account() -> JSON`: own profile plus acceptance status.
- Profile REST: read explicit columns `id,display_name,home_city,created_at`; PATCH own row with `display_name,home_city`. Do not use `select=*` on profiles: acceptance and ban fields have no client column grant.
- `POST /functions/v1/bookish-delete-account`: authenticated; `{}` for email-only accounts, or `{ "apple_authorization_code": "<fresh native Apple code>" }` for Apple-linked accounts. Returns `{ok,message}`. It verifies the session at Supabase Auth, binds the Apple grant to that verified identity, revokes the Apple grant, then calls Auth hard deletion. A different user ID in the body has no effect. An identity without the Bookish app marker receives 403 before Apple revocation or Auth deletion. Missing session: 401; Apple reauthentication needed: 400 with `apple_reauthentication_required`; vendor/delete failure: 503 for retry. No codes/tokens are stored or logged.

After successful deletion, clear the app's session, shared Keychain/App Group state, and widget caches. Deletion removes personal takes/replies, held drafts, reactions, logs, ballots, nominations, pours/taste/events, reports/blocks/hides, preferences, invites created by the reader, linked submissions, and matching legacy email records. Shared meetings/votes survive with creator/claim references cleared. A departing host's club passes to its longest-standing eligible member (cohosts first); an empty club is deleted.

### Clubs and the switcher

Read `bookish_clubs` and `bookish_members` through REST: RLS returns joined clubs only. Read `bookish_preferences` for the selected club. Read `bookish_profiles` for fellow members' display names.

| RPC | Result / behavior |
| --- | --- |
| `bookish_create_club(p_name text,p_city text,p_state text)` | Club UUID; caller becomes host and selects it |
| `bookish_switch_club(p_club uuid)` | Select a joined club; app updates its shared cache/widgets |
| `bookish_member_preferences(p_club uuid,p_race boolean,p_shield boolean,p_ratings boolean)` | Own shared-progress visibility, spoiler shield, and community-rating consent |
| `bookish_discover_clubs(p_city text,p_state text)` | At most 100 listed club summaries: ID, directory ref, name, city/state; no precise location |
| `bookish_link_directory(p_club uuid,p_ref text)` | Host only; requires a confirmed existing claim/start belonging to the caller's verified Auth email |
| `bookish_set_listing(p_club uuid,p_listed boolean)` | Host listing toggle; defaults off |
| `bookish_create_invite(p_club uuid,p_max_uses int=20,p_days int=7)` | Host receives a 12-character code; bounded uses/expiry |
| `bookish_redeem_invite(p_code text)` | Club UUID; atomic redemption, retry-safe for a current member |
| `bookish_request_join(p_club uuid,p_note text='')` | Pending request UUID for a listed club |
| `bookish_join_queue(p_club uuid)` | Host sees pending account-backed requests, first name/note; no decision tokens |
| `bookish_decide_join(p_request uuid,p_approve boolean)` | Host approval adds membership atomically |
| `bookish_remove_member(p_club uuid,p_user uuid)` | Host ejects a member and prevents invite re-entry |
| `bookish_transfer_host(p_club uuid,p_user uuid)` | Current host passes the ribbon to another member |

The app can construct `https://meetbookish.com/invite/<code>` and pass the parsed code to redemption. Universal-link association and the web landing page must be supplied by the website/native integration; a code alone is sufficient to redeem. Legacy directory invitation codes/approval emails remain directory-only and cannot silently grant authenticated app membership. Existing hosts must prove the matching confirmed email before linking a directory entry.

### The Tea, including replies

| RPC | Result / behavior |
| --- | --- |
| `bookish_post_take(p_club uuid,p_book text,p_body text,p_signed boolean=false,p_page int=0,p_chapter int=null,p_parent uuid=null)` | JSON `{id,status:"posted"}`; `p_parent` makes a reply. Member-name references instead return `{id,status:"held",message:"Spill about the book, never the club."}` and remain outside the feed |
| `bookish_tea(p_club uuid,p_book text,p_parent uuid=null,p_limit int=30,p_offset int=0)` | Roots when parent is null, or that take's visible replies; Sipped order, max 100 rows |
| `bookish_react(p_take uuid,p_reaction text)` | Set/change one reaction; null removes it |
| `bookish_take_action(p_take uuid,p_action text,p_reason text=null)` | `report` (reason required), `hide`, `block`, or `delete` own post; same for replies |
| `bookish_host_reports(p_club uuid)` | Host's pending moderation queue; spoiler-sealed bodies stay null |
| `bookish_moderate_take(p_take uuid,p_action text)` | Host `hide` globally or `dismiss` report; cannot edit or identify anonymous authors |

Feed rows: `id,parent_id,body,anonymous,signed_name,spoiler_page,spoiler_chapter,sealed,mine,reactions,my_reaction,reply_count,created_at`. `reactions` maps emoji to counts. `mine` only describes the caller's own post. No author ID, block target ID, or reaction-reader list is returned.

The insertion trigger checks the server-side content rules for takes and replies. Ordinary book swearing is allowed. Matching slurs/threats/personal sexual patterns are rejected; member-name references enter a private hold queue. Rate bound: ten posts/held submissions per reader per minute, serialized on their profile. There is no post-edit endpoint.

### Reading, meetings, and bring list

Read `bookish_books` (catalog), `bookish_club_books` (joined club history/current read), `bookish_meetings`, `bookish_rsvps`, and `bookish_bring_items` through REST. Exact meeting details remain behind membership RLS.

| RPC | Result / behavior |
| --- | --- |
| `bookish_set_current_book(p_club uuid,p_book text)` | Host chooses current book; finish the previous read first |
| `bookish_finish_book(p_club uuid,p_book text,p_status text='finished')` | Host shelves it as `finished` or `dropped` |
| `bookish_log_page(p_club uuid,p_book text,p_page int,p_chapter int=null,p_finished boolean=false,p_request uuid=<generated>)` | Log UUID; pass one stable request UUID per logical widget/app action so retries do not duplicate it |
| `bookish_race(p_club uuid)` | `user_id,display_name,page,finished`; legacy RPC name for the shared reading shelf. Excludes opted-out readers and returns a stable user-ID order, with no rank, streak, or title |
| `bookish_club_pour(p_club uuid,p_book text)` | Consented pour count; mean and DNF count are null until five consented pours |
| `bookish_schedule_meeting(p_club uuid,p_starts timestamptz,p_title text,p_location text,p_stop int=null)` | Meeting UUID; host only |
| `bookish_edit_meeting(p_meeting uuid,p_starts timestamptz,p_title text,p_location text,p_stop int,p_cancel boolean=false)` | Host reschedules/moves/cancels |
| `bookish_add_bring_item(p_meeting uuid,p_label text)` | Item UUID; host only |
| `bookish_claim_bring_item(p_item uuid,p_claim boolean)` | Claim/unclaim own item, row-locked to prevent double claims |

RSVP REST upsert: `{meeting_id,club_id,user_id:<self>,response:"going"|"maybe"|"next_time"}`, conflict key `meeting_id,user_id`; DELETE own RSVP to clear it. Composite foreign keys prevent substituting another club ID. A meeting's optional `stop_page` supports the meeting marker in the app.

`bookish_page_log` REST reads return only your own logs. Shared progress is computed for the current reading start, so a new book starts fresh. Rank, streak, and competitive title outputs are removed; reading speed never determines response order. Pours and taste REST writes/reads are self-only. Pours accept half-glass increments, 0–5; other members receive Club Pour aggregates rather than the identities of DNF readers.

### Next-book votes

Read `bookish_votes`, `bookish_vote_options`, and `bookish_nominations` through membership RLS. Ballot rows have no member SELECT grant. Use `bookish_vote_tally(p_vote uuid)` for option counts. Nomination REST insert/delete uses `{club_id,book_id,user_id:<self>}`.

| RPC | Result / behavior |
| --- | --- |
| `bookish_open_vote(p_club uuid,p_closes timestamptz,p_books text[],p_chat boolean=false)` | Host opens one vote with 2–4 distinct catalog books; returns UUID |
| `bookish_cast_ballot(p_vote uuid,p_option uuid,p_via text='app')` | One mutable ballot per member until closure/deadline; via `app`, `imessage`, or `web` |
| `bookish_close_vote(p_vote uuid,p_winner uuid=null)` | Host closes atomically, returns winning option UUID, shelves previous current read and starts winner; host chooses among tied leaders |
| `bookish_vote_tally(p_vote uuid)` | Member-only option IDs, book IDs, and ballot counts, with no voter identities |

Options cannot be mixed between votes; closing and casting lock the vote row. Deadlines stop new ballots immediately, even if the host closes later. No unauthenticated web ballot is provided: a Messages/web token is a link identifier, never membership or authorization. `post_to_chat` is a client instruction; the backend cannot send Messages on someone's behalf.

Community discovery keeps using existing `GET /functions/v1/bookish-community`. Clients never query raw cross-club reading/ratings data or aggregate views directly.

## Moderation operations (server credentials only)

- `bookish_review_queue()`: pending reports ordered by their 24-hour due time; body and reason, no authors/reporters.
- `bookish_held_queue()`: held drafts, no author identity.
- `bookish_safety_review(p_take,p_action,p_actor,p_reason)`: `hide`, `dismiss`, or `ban`; logged reviewer/reason. Ban immediately stops authenticated app access and hides authored takes.
- `bookish_dismiss_hold(p_hold,p_actor,p_reason)`: closes a held-content review with an audit entry; the writer can submit a fresh book-focused take.
- `bookish_escalate_author(p_take,p_actor,p_reason)`: legal/safety use only; logs access and returns the private author UUID. Direct SELECT on the mapping is revoked even from `service_role`.

A host decision never closes the separate team review. Due dates and queues are implemented; staffing, a monitored contact inbox, and actual review within 24 hours are operational requirements. No scheduled routine was created. Any future scheduled monitoring must run on the Mac mini per the standing project rule.

## Configuration and decisions before release

- `supabase/auth.bookish.SEPARATE-PROJECT-ONLY.example.toml` is a configuration fragment only for a separate Bookish project, not an active project config. It includes Apple, email OTP confirmation/templates, disabled anonymous login, and function verification settings. Never apply it to the shared Fictora project.
- Fill the names in `supabase/.env.bookish.example` through the secret store. The final Apple bundle/client ID, team ID, key ID and `.p8` are required for deletion revocation. Native Apple identity tokens must have an audience registered in the Supabase provider. Hosted Auth's Apple secret has its own renewal requirements. Configure a real Auth SMTP sender and Apple private-email-relay delivery.
- Publish the final Terms/EULA and privacy policy, with zero tolerance for objectionable content; choose the monitored support/moderation address. Until configured, the house-rules endpoint fails closed. The app must show acceptance before its first create/join/post and expose the contact in Me → Help.
- **Shared Auth boundary:** this repo uses a shared Supabase project. Deleting `auth.users` can affect another product if the same identity is reused there; creating the profile trigger also provisions profiles for existing/project-wide Auth users. Choose a dedicated Bookish Auth project or audit all shared Auth dependencies before deploying this hard-delete endpoint. No unrelated schemas are intentionally queried or edited by these files.
- A claim under an email different from Apple's relay address requires sign-in with the matching verified email; decide the account-linking UX. Directory entries are never claimed merely by submitting their IDs.
- Final universal-link path, native callback scheme, and invitation landing page need website/iOS coordination. The backend consumes invite codes today.
- Cohost remains accepted for compatibility but creation/invites produce host/member roles. Decide whether to add cohost management UI. Host removal has a re-entry tombstone; reinstatement and invite-revocation UI can be added later.
- The legacy `bookish_race` RPC name and `race_visible` preference remain internal compatibility names. The response has no rank, streak, or title, and uses stable user-ID order. This changes the return contract of an unapplied migration; verify migrations 005-008 are still unapplied before integrating this review patch. If deployed, prepare a separately reviewed forward migration instead.
- Bring list uses one claimant per item; create multiple items for quantities. Votes accept 2–4 books; native design can restrict its builder to 3–4. Closing a vote marks the current book finished, so the native host action should make that consequence clear.
- The content rules are an English launch baseline, not comprehensive context recognition. Test real launch-language samples, evasion, false positives and real-person sexual references with the moderation team. Held drafts do not auto-publish. The 24-hour deadline is not an automated promise of staffed review.
- Age is declared 18+, not externally verified. Complete the current App Store age-rating questionnaire and policy wording.
- APNs delivery, Messages rendering/fallback pages, widgets, data export UI, and a staff moderation dashboard are outside these backend files. Polling/refetch works now; do not publish raw Tea/private tables through Realtime or cache spoiler bodies in broadcast payloads.

## App Store review risks

1. **Guideline 1.2:** the filter, report/hide, anonymous-safe blocking, ejection/ban and contact contract are implemented, but actual staff coverage/contact publication and native report/block menus must ship. Apple's guideline also identifies services used primarily for anonymous chat as inappropriate. Present The Tea as moderated, book-specific discussion inside established clubs; backend controls cannot guarantee review approval. [Apple guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)
2. **Account deletion:** show deletion in Me → Account and test the complete Apple reauthentication/revocation path on a device. A support-email-only path is insufficient; failures must remain retryable. Review the shared-project boundary before launch. [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/), [Apple token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
3. **Privacy:** declaration/labels must match account identifiers, reading activity, UGC, exact member-only meeting locations, and moderation access. Small-club anonymity can still be inferred socially. Shared notification/Message previews must never reveal sealed text or an anonymous poster's identity.
4. **Review access and completeness:** provide review accounts and a populated demonstration club, working OTP/Apple credentials, a visible 18+ declaration and terms/contact pages. Keep the finder usable without an account; the club features require one. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

Auth configuration references: [Supabase Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [config reference](https://supabase.com/docs/guides/local-development/cli/config), [user deletion](https://supabase.com/docs/guides/auth/managing-user-data).

## Verification

- `npm test`: 41 passing tests. PGlite executes the actual SQL 001–008 with distinct Auth identities, anon/authenticated/service roles, and Supabase-style default grants. Coverage includes populated cross-club table isolation, role/terms tampering, private author denial, spoilers/replies/signed posts, filter/hold behavior, report/block/host moderation, invitations/approvals/directory matching, Race, meetings/claims/RSVPs, ballot constraints/deadlines/ties, the community floor, bans/stale tokens, and deletion/host succession. HTTP tests cover verified-session binding, Apple exchange/signing/subject/revocation and failure paths, hard-delete requests, and house-rules configuration.
- `npm run check:edge`: both new edge entrypoints type-check with Deno; no remote packages are required by them.
- `deno lint --no-config` on the five new TypeScript files: passed.
- Existing static build with local empty verified/community fixtures: passed; 922 indexable pages. No production fetch was needed.
- `git diff --check`: passed.

Requires Node 24+ for the test runner's TypeScript import support. PGlite validates PostgreSQL behavior but does not replace a Supabase staging run, Auth/provider setup, concurrent production-load testing, or on-device Apple/OTP/App Review verification. No production behavior was exercised.
