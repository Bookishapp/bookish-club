# Approved v3 verification

Implemented against October 21, Bookish final: full app v3, pin 295, all 26 approved images. All 24 app surfaces are implemented. The Notes and checker cards remain source documentation. The website landing and separate tagline sweep are outside this branch.

The app uses approved oxblood texture, cream paper, green actions, serif hierarchy, four club sections, existing approved Lunair poses, distinct approved cover motifs, ribbon bookmarks, illustrated bring items, and dedicated menu, privacy, rating, shelf, recommendations, and widgets surfaces. Existing host, auth, legal, safety, discovery, saved-content, reminder, sharing, and Messages flows remain accessible.

Local verification passed: lint, TypeScript, edge type checking, backend 205, confirmation 26, server 19, ops 5, app unit 38, all four app interaction scripts, full shipped-bundle UI smoke, visibility 26, web 20, grant policy 19, native model 28, production app and web builds, Capacitor sync, full App simulator build, and simulator installation.

All 24 surfaces have approved-left and built-right comparisons at 390 by 844 per side. Three separate fresh-context reviewers inspected every screen using only the parity evidence, approved art, canon, and brief. All 72 final overall scores are at least 8. These visual scores do not certify every hidden behavior or production service.

| Capture | Screen | Canon | Creative | Audience |
| --- | --- | ---: | ---: | ---: |
| 01 | Welcome | 8 | 8 | 9 |
| 02 | Bring your club | 8 | 8 | 8 |
| 03 | House rules | 8 | 8 | 9 |
| 04 | The Tea | 9 | 8 | 8 |
| 05 | Spill a take | 8 | 8 | 9 |
| 06 | Reading together | 9 | 8 | 8 |
| 07 | Log my page | 9 | 8 | 9 |
| 08 | Meeting RSVP | 8 | 8 | 9 |
| 09 | Book vote | 9 | 8 | 8 |
| 10 | Rate the book | 9 | 8 | 9 |
| 11 | Our shelf | 8 | 8 | 8 |
| 12 | Up next for you | 9 | 8 | 8 |
| 13 | Members | 8 | 9 | 9 |
| 14 | Club privacy | 9 | 9 | 9 |
| 15 | Notifications | 8 | 8 | 8 |
| 16 | Settings | 8 | 8 | 8 |
| 17 | Join sent | 9 | 8 | 9 |
| 18 | Find a club | 9 | 8 | 8 |
| 19 | Menu | 9 | 9 | 9 |
| 20 | Messages RSVP | 8 | 8 | 8 |
| 21 | Messages page | 8 | 8 | 8 |
| 22 | Messages vote | 8 | 8 | 8 |
| 23 | Messages stickers | 8 | 9 | 9 |
| 24 | Widgets | 8 | 8 | 9 |

## Data and release boundary

This branch adds `supabase/migrations/20261106000100_bookish_library.sql`. Apply it only after the existing numbered 001 through 011 foundation and the three November 5 Tea, hosting, and reminder migrations. SQL is committed for Ted to apply. No hosted SQL, merge, or deployment was performed.

Personal hearts remain private, aggregates need five opted-in raters, recommendations need qualifying independent clubs, and anonymous rating moderation does not reveal authors through roster changes. Missing evidence produces honest empty states.

The first 19 captures use the shipped web bundle with every hosted call intercepted. The last five use production UIKit or SwiftUI views in documented fixture review chrome. They are not real sent Messages screenshots. Crop-safe 600 by 450 Messages image regions are shorter than the concept art. Native poll sharing strips private ballot responses.

Actual OS screenshots additionally show all three populated WidgetKit surfaces on SpringBoard. The production App Group file handoff was exercised with a validated local fixture through an optional DEBUG-only environment hook. No default seed, release fixture hook, hosted write, or message send was used. Physical-device provisioning and live Messages interaction remain release checks.

The full screen map, SQL order, original test logs, parity images, source and binary hashes, and independent reports are at `/Users/vahallo/ted-ops/oneshots/1106-bookish-v3art/RESULT.md`. Native capture reproduction and scope are documented in `app/ios/NativeParity/README.md`; Chrome reproduction uses `node app/scripts/capture-v3.mjs` after building.
