# Bookish design system

The app follows the approved October 21 batch, Bookish final: full app v3 (pin 295). The 24 screen references, Notes card, and review card live in `/Users/vahallo/biz/bookish/design/approved-v3-1021/`. Sebastian corrected the previous art reference on November 6. The October 16 and October 19 compositions are superseded.

Working behavior and CANON.md govern fields, legal acceptance, access, privacy, and supported operations. The approved images govern composition, color, typography, artwork, and voice. The landing and the separate tagline sweep are outside this branch.

## Presentation

The canvas is painted oxblood paper. Cream paper cards carry dark text, green buttons carry primary actions, and white pills carry secondary actions. Never add a gradient. The palette is oxblood #571c2b, cream #f3dfab, ink #2d231b, green #1d5a46, pink #f4a6bf, and mustard #ecb74e.

Georgia supplies the bold serif headings and editorial text visible in v3. Manrope supplies controls and supporting text. The app keeps its self-hosted fonts for native compatibility and existing secondary surfaces. Compact room navigation has four sections: The Tea, Book, Meet, and Vote. Secondary tools belong in the menu.

Use 16px mobile gutters, compact paper cards, and natural scrolling. Keep accessible labels, visible keyboard focus, and text that can expand. Do not paint simulated device bars into the app. Capture tooling uses a 390 by 844 viewport.

`src/tokens.css` supplies compatible shared tokens. `src/v3.css` supplies v3 composition and surface rules. `src/v3-views.ts` contains the new menu, privacy, library, and widget presentation. `tea-views.ts` contains the Tea, reading, composer, log, and notification views. `community.ts` remains the existing account and club transport/controller.

## Art

Only existing approved Lunair cutouts shown in the v3 images are used. The full poses in `public/art/` match the v3 art; cropped Bible variants remain bundled for compatibility. `art()` resolves cropped variant names to those approved full poses. A CSS silhouette supplies the approved white cutout edge. No character artwork was generated.

The classics use the approved v3 typographic cover treatment. Other books keep their actual bundled or trusted catalog cover and title fallback. The fallback is hidden while an image is present, and restored when an image fails. Unknown books never borrow another book's cover.

Custom vector spot art and interface illustrations remain code-native. Use SVG or the existing art helpers, never emoji.

## Behavior and privacy

Reading ribbons remain in the server's member order. They are bookmarks, with no ranks, speed comparisons, streaks, or finish line. Page sharing remains opt-in.

Tea stays anonymous. Sealed cards never include hidden take text in their DOM. Voting preserves one anonymous choice, even though the conceptual art shows two selections and voter initials. Only the caller's choice and aggregate totals are shown.

Ratings use hearts for books. A reader deliberately chooses whether their optional take is named or anonymous. Club averages require five opted-in ratings. Recommendations require real shared-book evidence from independent established clubs. No evidence produces an honest empty state.

Discovery shows city centers only. Open clubs can accept joins, Private clubs require host approval, and Hidden clubs stay off the map. Unclaimed public-calendar listings are distinct and do not accept Bookish join requests.

Settings show actual supported controls. Spoiler sealing is always on, and cannot be disabled. The real meeting reminder timing remains the day before for Going or Maybe responses. Device reminders retain their existing Saved flow.

Native Messages and WidgetKit mirror the same v3 palette and artwork. Widgets receive only an allowlisted local display summary, with no credentials, take bodies, private addresses, or member identities. Clear that summary on sign-out or lost authorization. Device provisioning must include the existing App Group entitlement before a physical-device release.
