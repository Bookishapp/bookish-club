# Bookish 1.1.1 Tea and hosting screens

The UI uses the RPC contracts in `the-tea-rpc-reference.md` and the approved October 18 compositions, with October 19 v2 overrides. The club opens on The Tea. The club-name menu reaches Book, Meet, Vote, Members, Host desk, and Settings. Book and Meet also remain reachable from the communal status strip. Existing discovery, invitations, onboarding, votes, safety controls, local reminders, Resources, and account deletion remain available.

| Surface | Approved source | Authenticated data and actions |
| --- | --- | --- |
| The Tea, empty state, and thread | 17 v2, 33, and 19 | `bookish_tea_feed`, `bookish_sip`, and existing content actions |
| Anonymous composer | 18 | `bookish_create_take`, with a page or DNF marker and optional parent |
| Reading together and page log | 20 v2 and 21 v2 | `bookish_reading_together`, `bookish_share_reading`, and `bookish_log_reading` |
| Meeting, RSVP, and bring list | 24 | `bookish_meeting_detail`, `bookish_rsvp`, `bookish_add_bring_item`, and `bookish_claim_bring_item` |
| Schedule, edit, and cancel gathering | 25 | Existing `bookish_schedule_meeting` and `bookish_edit_meeting` |
| Notifications and empty inbox | 28 v2 and 36 | `bookish_notifications` and `bookish_mark_notifications_read` |
| Club reminder preferences | 30 v2 | Caller-only member preference read and `bookish_reminder_preferences` |
| Members and host review | 26 v2 | Existing member/approval controls, `bookish_host_reports`, and `bookish_moderate_take` |
| Message previews and interactive iMessage cards | 41, 42, and 44 | `bookish_message_card`, native `BookishMessages.share`, and fresh authorized resource routing |
| Calendar download | 24 | Bearer-authenticated calendar edge GET, backed by `bookish_meeting_calendar` |
| House rules and join sent | 04 v2 and 11 v2 | Existing legal acceptance and request-status flows |

## Privacy and recovery

Sealed takes have no body in the rendered HTML. Decorative bars stand in for the approved blur. They cannot be tapped to reveal. Fresh target feeds determine whether a thread remains visible. All takes are anonymous, and one Sip replaces older reaction categories and signed choices. Notifications contain no take body or author. Shared reading is explicit opt-in and retains the server's collection order.

Reading-log retries retain the same request ID and values through an uncertain response and reauthentication. Reply drafts retain their parent and book IDs, then reload the parent through an authorized feed before resuming. Historical conversation drafts stay attached to their book even when the club chooses its next read. Private loaders reject results from an older club/session generation, and active requests serialize club navigation.

A redacted bring claimant remains occupied. The UI offers release only for the signed-in claimant. Host tools are hidden from members, with server authorization still authoritative. Cancellation requires opening its confirmation disclosure and pressing the explicit cancel action.

The calendar endpoint receives a bearer header, never a token in a URL. Web downloads use the returned ICS bytes. iOS presents a protected temporary ICS file and removes it after the share sheet closes. Device-only calendar reminders remain a separate existing feature.

Native Messages rebuilds a bounded metadata allowlist, renders a sealed Tea card, and prepares an actual MSMessage in Apple's composer. Sessions stay in the app's memory. V2 resource links contain only kind and UUID. The extension opens Bookish for sign-in and a fresh authorized feed. Browser shares point directly to `/app/#message=...`; the site's 404 handler also validates native V2 resource paths and forwards them to the app. Existing V1 Messages cards and stickers remain available.

## Verification and release limits

Run `npm test`, `npm test --prefix app`, `npm run test:visibility`, `npm run test:web`, `npm run lint`, `npm run check:edge`, and `npm run test:ui --prefix app`. The app typecheck is also available through `app/node_modules/.bin/tsc --noEmit --project app/tsconfig.json`. Build the app with `npm run build --prefix app`, and the website with `npm run build:web`. Swift model checks use `sh app/ios/BookishMessageTests/run-model-tests.sh`.

After the app build, run `node app/scripts/capture-tea-hosting.mjs` on the Mac mini. It uses installed Google Chrome and intercepted local fixtures, records build/reference/capture hashes, and writes approved-left comparisons to `external/review-evidence/1106-bookish-newscreens/parity/`. It fails on overflow, broken images, forbidden copy, browser errors, external requests, and failed action assertions.

These changes do not deploy services, apply SQL, install a reminder schedule, send a message, or release an app. Production RPC availability depends on the separately reviewed server release. Physical-device message delivery, recipient extension association, share cancellation, and calendar import remain device checks. Simulator builds and isolated native card renders establish compilation and composition, not delivery.
