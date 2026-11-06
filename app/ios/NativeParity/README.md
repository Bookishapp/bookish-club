# Native v3 evidence

Run `app/ios/BookishMessageTests/run-model-tests.sh`, build the `App` scheme with the simulator SDK, and run `app/ios/NativeParity/capture.sh`.

The capture script compiles the production UIKit card renderer, Messages editor, native MSStickerView picker, and SwiftUI widget views into an isolated review app. The local fixtures match the approved books, reading page, RSVP counts, meeting date, and Tea counts. No network request, database write, message send, or deployment occurs.

The conversation header, bubbles, input field, and widget home screen arrangement are review chrome in `ParityHost.swift`. They are not captures of the Messages app or SpringBoard. The Xcode `App` scheme separately builds and embeds the actual Messages and WidgetKit extensions. OS integration, device provisioning, and a physical device widget placement still need verification before release.

## Assets

`prepare-v3-assets.py` extracts the first six stickers from the approved `app-23-20-imessage-stickers.png`, and the decorative cup from `app-24-21-widgets.png`. Both native sticker surfaces use the same extracted images. All 14 stickers remain available. The remaining eight retain their existing approved art.

The Lunair calendar, point, and peek poses come from existing approved `app/public/art/*.webp` assets. Their white outline is derived from the existing alpha channel. The oxblood texture and paper texture come from existing `app/public/img` assets. Classic cover shapes use native typography, colors, and SF Symbols. No character art is generated.

## Behavior and privacy

Transcript cards use a 600 by 450 image region, with all important text inside its bounds. The system caption owns the app name. Legacy v1 cards display only their known weekday or club night label, because they have no calendar date field. Server meeting cards use their validated ISO date, in the device timezone, instead of a fabricated date badge.

WidgetKit uses an App Group display summary through `BookishMessages.updateWidgets({snapshot})` and `clearWidgets()`. The decoder allowlists display fields, bounds counts and pages, and drops other keys. No Tea body, author identifier, location, session, or token is cached. A widget without a valid local summary asks the user to open Bookish. Widget links open `bookish://widget/read`, `/log`, `/meeting`, or `/tea`.

## Visual limits

The template-safe transcript art is shorter than the approved conceptual Messages cards. The shared-page card uses accurate page-sharing copy, because v1 does not carry a chapter milestone or reading prompt. It does not infer that a reader has reached the letter scene. A native vote remains a single book choice, preserving the existing transport contract. The compact editor keeps reader name, status, and new-card controls further down its scroll view. Widget friend counts are shown without invented member initials.
