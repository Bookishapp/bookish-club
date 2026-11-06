# Bookish approved art comparisons

55 actual app captures through the working UI in Google Chrome. The normal viewport is 390 by 844, with additional 320 by 844 stress cases. Capture run: complete. Visual implementation: partial where marked below.

References from the 47-screen batch and actual existing app surfaces are shown side by side. Individual approval receipts are recorded for 33 original screens and eight v2 overrides. Other source screens are labeled as references. This packet documents visual adaptation and partial coverage, not exact parity with every approved composition.

Captured 2026-11-06T01:47:46.942Z, using Chrome 156.0.8078.80 on Teds-Mac-mini.local.

[Capture manifest and checks](manifest.json), [individual approval receipts](approved/approval-receipts.json), [v2 provenance](approved/v2-sources.json), [additional loading and resource states](pages/additional-states.md), [native evidence and limitations](native/README.md), [native image dimensions and hashes](native/capture-manifest.json), and [HTML comparison index](index.html).

| Source screen | Status | Actual existing app coverage |
| --- | --- | --- |
| [01. welcome](pages/01-welcome.md) | Partial: existing combined flow | Signed-out account entry |
| [02. Sign in](pages/02-sign-in.md) | Existing surface: visual adaptation | Email sign-in; Existing password sign-in; Sign-in form error |
| [03. Email code](pages/03-email-code.md) | Existing surface: visual adaptation | Four-digit email code layout (UI support only); Six-digit email code layout; Email-code validation error |
| [04. House rules](pages/04-house-rules.md) | Existing surface: visual adaptation | House rules, legal fields, and age confirmation |
| [05. Taste picker](pages/05-taste.md) | Partial: existing combined flow | Taste, mood selection; Taste, reading length; Taste, favorite book search |
| [06. Reminders permission](pages/06-notifications-prime.md) | Partial: existing combined flow | Existing reminder permission explanation |
| [07. Near me: list](pages/07-near-me-list.md) | Existing surface: visual adaptation | Near me, list |
| [08. Near me: map](pages/08-near-me-map.md) | Existing surface: visual adaptation | Near me, map with private city centers |
| [09. Club detail](pages/09-club-detail.md) | Existing surface: visual adaptation | Verified club detail; Long club name on iPhone width; Long club name at 320 pixels |
| [10. Join: request sheet](pages/10-join-request.md) | Existing surface: visual adaptation | Private-club join request |
| [11. Join: request sent](pages/11-join-sent.md) | Existing surface: visual adaptation | Join request sent |
| [12. Join: approved](pages/12-join-approved.md) | Partial: existing combined flow | Joined club after redeeming invitation |
| [13. Unclaimed club](pages/13-unclaimed-club.md) | Existing surface: visual adaptation | Unclaimed public-calendar club |
| [14. Read next](pages/14-read-next.md) | Existing surface: visual adaptation | Read next recommendations |
| [15. Book detail](pages/15-book-detail.md) | Partial: existing combined flow | Existing book card and Open Library link |
| [16. Saved](pages/16-saved.md) | Existing surface: visual adaptation | Saved clubs and books |
| [17. The Tea: club home](pages/17-the-tea.md) | Partial: existing combined flow | Existing club home; Member club view without host controls |
| [18. Take composer](pages/18-take-composer.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |
| [19. Take thread, reactions, and report](pages/19-take-thread.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |
| [20. Current book and reading together (v2)](pages/20-book-and-race.md) | Partial: existing combined flow | Current book in existing club home |
| [21. Log my page](pages/21-log-page.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |
| [22. Vote: pick the next book](pages/22-vote.md) | Existing surface: visual adaptation | Anonymous book vote; Anonymous vote, selected choice; Host anonymous vote form; No active book votes |
| [23. Vote: winner](pages/23-vote-winner.md) | Partial: existing combined flow | Closed vote and winning book |
| [24. meeting rsvp](pages/24-meeting-rsvp.md) | Partial: existing combined flow | Member-only meeting details |
| [25. Schedule a meeting (host)](pages/25-schedule-meeting.md) | Partial: existing combined flow | Host meeting scheduling form; Meeting form save error |
| [26. Member list](pages/26-members.md) | Existing surface: visual adaptation | Club members; Report or block a reader; Host desk and pending join request |
| [27. Invite: native share sheet](pages/27-invite-share-sheet.md) | Partial: existing combined flow | Redeem an invitation; Share invitation from Host desk |
| [28. Notifications](pages/28-notifications.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |
| [29. Profile](pages/29-profile.md) | Partial: existing combined flow | Account profile and clubs; Account profile with a long email; Account profile with a long email at 320 pixels |
| [30. Settings and privacy](pages/30-settings.md) | Existing surface: visual adaptation | Settings and privacy; Account deletion confirmation |
| [31. Start a club](pages/31-start-a-club.md) | Existing surface: visual adaptation | Create club, including visibility and location fields |
| [32. Club started](pages/32-club-started.md) | Partial: existing combined flow | Created club opens its working club home |
| [33. Empty: The Tea](pages/33-empty-the-tea.md) | Partial: existing combined flow | Club home without a book or meeting |
| [34. Empty: no clubs nearby](pages/34-empty-near-me.md) | Existing surface: visual adaptation | Empty club directory; Empty directory action; Directory network error and retry |
| [35. Empty: Saved](pages/35-empty-saved.md) | Existing surface: visual adaptation | Empty Saved |
| [36. Empty: notifications](pages/36-empty-notifications.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |
| [37. Empty: not in a club yet](pages/37-empty-no-club.md) | Partial: existing combined flow | Signed-in account without a club |
| [38. iMessage: app drawer (+ menu)](pages/38-imessage-app-drawer.md) | Partial: native UIKit review host | Bundled icon preview in an isolated native review host. Apple’s Messages drawer is not captured. |
| [39. imessage sticker pack](pages/39-imessage-sticker-pack.md) | Partial: native UIKit review host | Actual native sticker browser in an isolated UIKit review host. The existing fourteen sticker identifiers are retained. |
| [40. imessage extension send vote](pages/40-imessage-extension-send-vote.md) | Partial: native UIKit review host | Actual production vote editor in a standalone simulator host, including error and large-text states. Apple’s conversation, keyboard, and transport are not captured. |
| [41. iMessage: live vote bubble](pages/41-imessage-live-vote.md) | Partial: native UIKit review host | Actual CardRenderer output hosted in UIKit. Apple’s Messages transcript chrome and transport are not captured. |
| [42. iMessage: meeting RSVP bubble](pages/42-imessage-rsvp.md) | Partial: native UIKit review host | Actual RSVP card and editor in the native review host. Apple’s host, incoming delivery, and send transport require device validation. |
| [43. Reading together (v2)](pages/43-imessage-reading-race.md) | Partial: native UIKit review host | Actual communal bookmarks card and editor follow the v2 reading-together reference. Member order is preserved, with no ranked reading view. |
| [44. iMessage: take bubble with spoiler blur](pages/44-imessage-tea-spoiler.md) | Absent native behavior | No existing native surface implements this approved concept. See the native evidence limitations. |
| [45. iMessage: invite link preview](pages/45-imessage-invite-link.md) | Absent native behavior | No existing native surface implements this approved concept. See the native evidence limitations. |
| [46. widgets home screen](pages/46-widgets-home-screen.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |
| [47. Widgets: lock screen](pages/47-widgets-lock-screen.md) | Absent | No existing app surface is implemented for this approved concept. No app screenshot was fabricated. |

## Limits

- Four-digit code evidence establishes frontend input and layout support only. Authentication uses intercepted fixtures. The current server accepts six to ten digits; four-digit backend delivery and acceptance are pending separate PR 36.
- 390 by 844 is a CSS viewport in Google Chrome on the Mac mini, not a native iPhone simulator or a system keyboard capture.
- The bundle is served unchanged from app/dist. Fixture identities, intercepted RPC responses, and local cover mirrors exist only in this Node capture process.
- Book covers found in the approved source are served as local mirrors. Unmapped covers receive a one-pixel response and exercise the existing typographic-cover fallback.
- Welcome, notification prime, book detail, join approved, club started, meeting RSVP, and invite share sheet are combined flows or lack a separate existing app screen. Captures disclose the actual equivalent; they do not establish exact screen parity.
- Tea composer, Tea thread, page logging, notification inbox, and widgets do not exist in this app and were not added. Reading scores and races are prohibited.
- Native Messages evidence is separate from these Chrome captures. Browser evidence cannot establish Messages transport or accessibility behavior.

## Reproduce

```sh
npm run build --prefix app
node app/scripts/capture-parity.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright module if needed, and `BOOKISH_APPROVED_SOURCE` if the approved source directory differs. The script launches installed Google Chrome, serves the production bundle on loopback, and intercepts all external requests. No request reaches an external write service. Regenerate companion pages without recapture with `node app/scripts/capture-parity.mjs --pages-only`.

Source of truth: `/Users/vahallo/biz/bookish/design/APPROVED-ART.md`. October 19 v2 images take precedence where present. Working behavior, legal text, and privacy rules take precedence over approved mock data.
