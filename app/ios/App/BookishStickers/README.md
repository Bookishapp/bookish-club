# Bookish Stickers

The pack contains 14 final Lunair stickers, in the supplied manifest order. Each sticker is a transparent 408 x 408 PNG, with its manifest caption as the accessibility label.

The App Store release embeds `BookishStickers`, which contains the final 14-sticker pack. The interactive `BookishMessages` source and scheme remain available for the first update, but the containing app does not depend on or embed that sample feature. Only one message payload provider extension is embedded, because the tested iOS runtime rejects two in one containing app.

## Xcode integration

- Product type: `com.apple.product-type.app-extension.messages-sticker-pack`.
- Info file: `BookishStickers/Info.plist`.
- Resource catalog: `BookishStickers/Stickers.xcassets`.
- `ASSETCATALOG_COMPILER_APPICON_NAME`: `iMessage App Icon`.
- Pack: `Sticker Pack.stickerpack`, with `grid-size` set to `regular`.
- Principal class: Apple's built-in `StickerBrowserViewController`. A custom Swift class is not needed for this static pack.

The catalog and `PrivacyInfo.xcprivacy` belong in the target's Resources phase. The static pack does not collect data or use required-reason APIs. The Info file is the target's Info.plist, and this README is documentation.

## Lunair sticker assets

The folders under `Stickers.xcassets/Sticker Pack.stickerpack/` contain the final artwork. The same PNGs are registered as loose resources in `BookishMessages`, without duplicate source images. `BookishTheme.stickerAssets` holds the matching ordered names and captions for the embedded browser. Keep the pack index, project resources, accessibility labels, and theme entries aligned when changing the collection.

All 14 stickers use 408 x 408 pixels, at the regular size's @3x resolution. Keep static, transparent, 8-bit RGBA PNGs below 500 KB each. Do not add @1x or @2x copies. Messages derives those sizes. Preserve the supplied artwork and captions.

## Extension icon replacement

`iMessage App Icon.stickersiconset` contains opaque, square-cornered RGB PNGs using the approved containing app artwork and the installed Xcode template's icon slots. Each image is proportionally resized from `app/assets/icon-only.png`, centered, and padded with the existing burgundy `#33101A` background. No draft art remains in the shipped static pack. Keep every slot's exact size and filename, and let the system apply its corner mask. These are separate from the containing iOS app's AppIcon assets.

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

Open the catalog in Xcode to confirm all 14 stickers and all icon slots appear. Build the containing app, then inspect the pack in Messages on a simulator and a device. Verify the phrases remain legible at displayed size, transparency looks clean on light and dark message backgrounds, VoiceOver describes each sticker, and the pack supports sending and peeling onto a message. The release icon conversion is mechanical, and uses the same approved artwork as the containing app.

## Sources

Apple's [Adding your sticker packs to Messages](https://developer.apple.com/documentation/messages/adding-your-sticker-packs-to-messages) defines the sizes and file limit. Apple's [Sticker type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/Sticker.html) and [Sticker pack type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/StickerPack.html) define the metadata. Apple's [Messages extension icon type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/MessagesIconType.html) defines the icon set format. The exact icon slots and built-in principal class were also checked against the installed Xcode sticker pack templates on October 21, 2026.
