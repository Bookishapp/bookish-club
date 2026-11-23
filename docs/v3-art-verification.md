# Approved v3 verification

Implemented against October 21, Bookish final: full app v3, all 26 approved images. All 24 app surfaces are implemented. The design notes remain source documentation. The website landing and separate tagline sweep are outside this branch.

The app uses approved oxblood texture, cream paper, green actions, serif hierarchy, four club sections, existing approved Lunair poses, distinct approved cover motifs, ribbon bookmarks, illustrated bring items, and dedicated menu, privacy, rating, shelf, recommendations, and widgets surfaces. Existing host, auth, legal, safety, discovery, saved-content, reminder, sharing, and Messages flows remain accessible.

Local verification passed: lint, TypeScript, edge type checking, backend 205, confirmation 26, server 19, ops 5, app unit 38, all four app interaction scripts, full shipped-bundle UI smoke, visibility 26, web 20, grant policy 19, native model 28, production app and web builds, Capacitor sync, full App simulator build, and simulator installation.

## Data and release boundary

This branch adds `supabase/migrations/20261106000100_bookish_library.sql`. Apply it only after the existing numbered 001 through 011 foundation and the three November 5 Tea, hosting, and reminder migrations. SQL is committed for the database owner to review and apply. No hosted SQL, merge, or deployment was performed.

Personal hearts remain private, aggregates need five opted-in raters, recommendations need qualifying independent clubs, and anonymous rating moderation does not reveal authors through roster changes. Missing evidence produces honest empty states.

The first 19 captures use the shipped web bundle with every hosted call intercepted. The last five use production UIKit or SwiftUI views in documented fixture review chrome. They are not real sent Messages screenshots. Crop-safe 600 by 450 Messages image regions are shorter than the concept art. Native poll sharing strips private ballot responses.

Actual OS screenshots additionally show all three populated WidgetKit surfaces on SpringBoard. The production App Group file handoff was exercised with a validated local fixture through an optional DEBUG-only environment hook. No default seed, release fixture hook, hosted write, or message send was used. Physical-device provisioning and live Messages interaction remain release checks.

Historical screen maps, SQL order, test logs, parity images, source and binary hashes, and independent reports remain in private evidence storage outside the repository. Native capture reproduction and scope are documented in `app/ios/NativeParity/README.md`; Chrome reproduction uses `node app/scripts/capture-v3.mjs` after building.
