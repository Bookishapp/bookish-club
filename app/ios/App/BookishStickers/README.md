# Bookish Stickers

This is the resource-only scaffold for the `BookishStickers` Messages sticker pack extension. All supplied art is deliberately labeled **ART PLACEHOLDER** or **DRAFT**. The neutral drawn book mark is not Lunair, approved mascot art, or final release art.

The containing app uses these same six source PNGs through the native sticker browser inside `BookishMessages`. `BookishStickers` remains a separately buildable target and scheme. It is not embedded alongside `BookishMessages`, because the tested iOS runtime rejects two message payload provider extensions in one containing app.

## Xcode integration

- Product type: `com.apple.product-type.app-extension.messages-sticker-pack`.
- Info file: `BookishStickers/Info.plist`.
- Resource catalog: `BookishStickers/Stickers.xcassets`.
- `ASSETCATALOG_COMPILER_APPICON_NAME`: `iMessage App Icon`.
- Pack: `Sticker Pack.stickerpack`, with `grid-size` set to `regular`.
- Principal class: Apple's built-in `StickerBrowserViewController`. A custom Swift class is not needed for this static pack.

Only the catalog belongs in the target's Resources phase. The Info file is the target's Info.plist, and this README is documentation.

## Final Lunair art drop-in

Replace each PNG in place, preserving its filename and folder. All six assets use **408 x 408 pixels**, at the regular size's @3x resolution. Export static, transparent, 8-bit RGBA PNGs, each **less than 500 KB**. Do not add @1x or @2x copies. Messages derives those sizes. Keep the artwork comfortably inside the canvas so its edges are not clipped when peeled onto a message.

| Sticker folder | PNG to replace | Intended phrase |
| --- | --- | --- |
| `lunair_yes.sticker` | `lunair_yes.png` | yes |
| `lunair_maybe.sticker` | `lunair_maybe.png` | maybe |
| `lunair_cant_make_it.sticker` | `lunair_cant_make_it.png` | can't make it |
| `lunair_book_club.sticker` | `lunair_book_club.png` | book club |
| `lunair_one_more_chapter.sticker` | `lunair_one_more_chapter.png` | one more chapter |
| `lunair_bookmark.sticker` | `lunair_bookmark.png` | bookmark |

The folders are under `Stickers.xcassets/Sticker Pack.stickerpack/`. The same PNGs are also registered as loose resources in `BookishMessages`, with no duplicate source images. No catalog or project changes are needed for a swap with the same names. After replacing art, update each sticker's `properties.accessibility-label` in its `Contents.json` and its label in `BookishTheme.stickerAssets` to describe the final art and phrase, removing the placeholder wording. Keep labels concise and readable with VoiceOver.

Use approved Lunair artwork. Do not generate or redraw the mascot from these neutral placeholders. Keep the tone communal, warm, and noncompetitive. Use drawn art rather than emoji. Do not introduce races, rankings, first-to-finish copy, or superlatives.

The shared scaffold palette is cream `#FFF8EC`, pink `#F8CADB`, butter `#F8E7A4`, mint `#D2E9D9`, sky `#CCE5F1`, and lilac `#DFD2EC`. Wine `#6F2940` is reserved for ink and buttons. The placeholders use wine only for text and linework.

Apple supports small at 300 x 300 pixels, regular at 408 x 408 pixels, and large at 618 x 618 pixels. Choose one size for the whole pack. If the final artwork requires another size, change every sticker's pixel dimensions and the pack's `grid-size` together, then rebuild.

## Extension icon replacement

`iMessage App Icon.stickersiconset` contains opaque, square-cornered RGB PNG placeholders using the installed Xcode template's icon slots. Replace the PNGs in place with approved extension icon art. Keep every slot's exact size and filename, and let the system apply its corner mask. These are separate from the containing iOS app's AppIcon assets.

| Slot | Scale | PNG dimensions |
| --- | --- | --- |
| iPhone Settings, 29 x 29 pt | @2x, @3x | 58 x 58, 87 x 87 |
| iPhone Messages, 60 x 45 pt | @2x, @3x | 120 x 90, 180 x 135 |
| iPad Settings, 29 x 29 pt | @2x | 58 x 58 |
| iPad Messages, 67 x 50 pt | @2x | 134 x 100 |
| iPad Pro Messages, 74 x 55 pt | @2x | 148 x 110 |
| Universal breadcrumb, 27 x 20 pt | @2x, @3x | 54 x 40, 81 x 60 |
| Universal Messages, 32 x 24 pt | @2x, @3x | 64 x 48, 96 x 72 |
| Messages App Store, 1024 x 768 pt | @1x | 1024 x 768 |

## Review before release

Open the catalog in Xcode to confirm all six stickers and all icon slots appear. Build the containing app, then inspect the pack in Messages on a simulator and a device. Verify the phrases remain legible at displayed size, transparency looks clean on light and dark message backgrounds, VoiceOver describes each sticker, and the pack supports sending and peeling onto a message. Replace every placeholder before App Store submission.

## Sources

Apple's [Adding your sticker packs to Messages](https://developer.apple.com/documentation/messages/adding-your-sticker-packs-to-messages) defines the sizes and file limit. Apple's [Sticker type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/Sticker.html) and [Sticker pack type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/StickerPack.html) define the metadata. Apple's [Messages extension icon type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/MessagesIconType.html) defines the icon set format. The exact icon slots and built-in principal class were also checked against the installed Xcode sticker pack templates on October 21, 2026.
