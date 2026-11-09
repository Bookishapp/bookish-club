# Native Messages parity evidence

These are actual UIKit renderings on an iPhone 13 Pro simulator running iOS 26.5, normalized from 1170 by 2532 pixels to 390 by 844 pixels. The review host compiles the production `BookishTheme`, `CardRenderer`, `MessagesViewController`, `StickerPickerViewController`, and message model sources directly. It has no production target membership, URL route, entitlement, or runtime flag.

The screenshots show the native content in an isolated review host. They do not show an authenticated Messages conversation, Apple's drawer, recipient selection, sticker peeling, or message delivery. The drawer capture previews the bundled approved icon, and does not claim to capture Apple's drawer. Test reader identities exist only in `ParityHost.swift`.

| Approved reference | Actual native rendering | Scope |
| --- | --- | --- |
| [38: drawer](../approved/38.jpg) | [Bundled icon preview](actual/drawer-icon.png) | Approved icon asset, outside Apple's drawer |
| [39: stickers](../approved/39.jpg) | [Native sticker browser](actual/stickers.png) | All 14 existing sticker identifiers preserved |
| [40: editor](../approved/40.jpg) | [Vote editor](actual/editor-vote.png), [selected](actual/editor-vote-selected.png), [scrolled](actual/editor-vote-scrolled.png) | Grouped rows, actual sample-book covers, square selection checks, name input, and send action |
| [41: vote](../approved/41.jpg) | [Transcript](actual/transcript-vote.png), [exact card image](cards/transcript-vote.png) | Compact cover rows and ribbons, with counts from the review fixture |
| [42: RSVP](../approved/42.jpg) | [Transcript](actual/transcript-rsvp.png), [exact card image](cards/transcript-rsvp.png), [editor](actual/editor-rsvp.png) | Weekday calendar block, larger RSVP pills, actual meeting fields, and existing send behavior |
| [20 v2: reading together](../approved/20-v2.webp) | [Transcript](actual/transcript-bookmarks.png), [exact card image](cards/transcript-bookmarks.png), [editor](actual/editor-bookmarks.png) | Communal green shelf with up to six visible bookmarks, and member order preserved |
| [45: invite](../approved/45.jpg) | No native invite card | Existing extension has no invite-card behavior; the app's existing invite flow remains in the web evidence |

Additional native states: [empty bookmarks](actual/transcript-bookmarks-empty.png), [long title](actual/transcript-rsvp-long.png), [unavailable conversation error](actual/editor-vote-error-scrolled.png), [largest accessibility text](actual/editor-vote-large-type.png), and [largest text, scrolled to actions](actual/editor-vote-large-type-scrolled.png).

## Source provenance

Approved palette and layout: `external/approved-art/full-app-1016/src/base.py`, native references 38 through 42, and the October 19 reading-together override. The extension now uses paper `#f5ead8`, card `#fffaf1`, ink `#2a0f15`, wine `#7a1a2a`, mustard `#ecb74e`, pink `#f4a6bf`, and bottle green `#133b31`.

Character images come only from the approved batch's `assets/lunair/b-*.png` cutouts. The native icon, wordmark, and paper are exact approved assets resized for native use. No generated replacement character or drawn placeholder is used. Sticker captions use larger Manrope type on white pills baked into each transparent PNG, and retain the exact existing labels. The interactive browser uses regular-sized native stickers in two scrolling columns, keeping both the figures and captions legible at actual phone size. Both the interactive extension and the embedded standalone BookishStickers pack use the same approved 14 sticker images and drawer icons. Existing catalog identifiers and native behavior are preserved. They retain the current 14 stickers, rather than advertising the 24 mock stickers.

Young Serif and Manrope come from the batch's bundled WOFF2 files, decoded to TTF for UIKit. Manrope is instantiated at weights 600 and 800. Both SIL Open Font License texts are included in `BookishMessages/Fonts`, sourced from the [Google Fonts Manrope license](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt) and [Young Serif license](https://github.com/google/fonts/blob/main/ofl/youngserif/OFL.txt).

## Reproduce

Run from the repository root on a Mac with Xcode and the iOS 26.5 simulator runtime installed:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
./docs/approved-art-parity/native/capture.sh
sh app/ios/BookishMessageTests/run-model-tests.sh
xcodebuild -workspace app/ios/App/App.xcworkspace -scheme App \
  -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath /tmp/bookish40-native-build build
```

The capture script creates and removes its own iPhone 13 Pro simulator, and its temporary app lives under `/tmp`. It never installs or adds review code to the production app. The separate asset preparation script needs Pillow and `fonttools[woff]`:

```sh
python3 docs/approved-art-parity/native/prepare-assets.py \
  external/approved-art/full-app-1016
```

## Verification and limits

The full App simulator scheme, including BookishMessages and BookishStickers, builds successfully with signing disabled using `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. All 16 existing native model tests pass, including pending versus committed state, response replacement, merge behavior, page-independent member order, malformed payloads, future versions, member limits, and URL capacity. `MessageState.swift` and `ClubDataStore.swift` are unchanged.

The native editor scrolls, its actions remain reachable at the largest accessibility text size, and missing-conversation errors remain visible. The transcript image is a bounded snapshot; long text wraps and scales within its allotted area, and very long titles can truncate. The editor retains full working text.

Working sample club data remains visibly labeled as sample data. The extension still has no App Group snapshot and does not gain access to host app club data. No new Tea, invite, reminder, bring-list, or competitive reading feature is introduced. Native on-device Messages send, cancel, incoming message delivery, VoiceOver operation, sticker peeling, keyboard coverage, and screenshot behavior inside Apple's host still require device validation.

## November 5 blocker fixes and data adaptations

Screens 39 to 43 were compared again with the approved sources. Screen 43 follows decision 175, the approved screen 20 v2 reading-together shelf. The original screen 43 competitive copy is superseded. The generated native card shows member names in their existing shared order, uses the same pink bookmark ribbons for every reader, and shows `Done` for a completed bookmark without ranking readers.

The vote editor retains the existing three sample candidates and single-choice behavior. It now groups their cover rows in one card and uses the approved square selection check. The transcript uses the same real covers, compact ribbons, and a quieter heading. Bundled covers use existing catalog cover IDs for [Pride and Prejudice](https://covers.openlibrary.org/b/id/14348537-M.jpg) and [Jane Eyre](https://covers.openlibrary.org/b/id/8235363-M.jpg), plus the [Frankenstein ISBN cover](https://covers.openlibrary.org/b/isbn/9780141439471-M.jpg). Unknown or changed candidates remain text-only, so a bundled cover can never represent a different book.

The v1 message payload has no date field. The RSVP calendar block therefore uses `CLUB / THU / NIGHT`, deriving `THU` from the existing meeting title. It does not invent the mockup's October 23 date. The known meeting time, reading title, meeting details, and RSVP counts remain visible, and the three RSVP pills are taller. Missing weekdays use `MEET`.

Side-by-side evidence, with approved art on the left and the actual simulator review host on the right, is in `external/review-evidence/1105-bookish40-fix/parity/39-native.png` through `43-native.png`. These compare content adaptations, and do not claim Apple's conversation chrome or exact fixture content. The selected vote state is also captured separately. Recreate the comparisons with `python3 docs/approved-art-parity/native/make-comparisons.py external/review-evidence/1105-bookish40-fix/parity` in an environment with Pillow installed.

## Required device release checklist

Before release, validate these in the real Messages extension on a device:

- Send each card, cancel an unsent draft, receive an update, and reopen the card.
- Tap stickers to insert them, and peel and place a sticker on an existing bubble.
- Use VoiceOver to select each mode, read each book and its selected state, edit the name and bookmark, and reach the send and new-card actions.
- Check keyboard coverage, the largest accessibility text size, and error announcements inside Apple's host.

The isolated review host does not establish any of these device-only results.
