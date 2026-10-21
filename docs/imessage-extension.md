# Bookish in Messages

Bookish adds a native Messages interface with built-in stickers to the existing iOS app. An independently buildable sticker pack target preserves the same art for alternate packaging. The host keeps its Capacitor and CocoaPods integration. The extensions do not load Capacitor or add backend services.

## Project integration

Open `app/ios/App/App.xcworkspace` for the host app. The project contains these shared schemes and targets:

| Target | Bundle identifier | Product |
| --- | --- | --- |
| App | `com.meetbookish.app` | Existing iOS app |
| BookishMessages | `com.meetbookish.app.BookishMessages` | Native iMessage extension |
| BookishStickers | `com.meetbookish.app.BookishStickers` | Reference sticker pack target, not embedded |

`App` depends on `BookishMessages` and copies its `.appex` product into `App.app/PlugIns` through its **Embed App Extensions** phase. Both extension targets use the host's iOS 16.0 deployment target, iPhone device family, `0.1.0` marketing version, `1` build number, and automatic signing style. Keep the embedded extension's versions aligned with the host when preparing a release.

`BookishMessages` links Messages and UIKit, compiles the six Swift files in `BookishMessages`, and includes `Assets.xcassets`. Its extension point is `com.apple.message-payload-provider`, and its principal class is `$(PRODUCT_MODULE_NAME).MessagesViewController`. There is no storyboard entry point. Its native sticker browser loads 14 loose PNG resources referenced directly from the sticker catalog's source files, so replacing the art updates both targets without duplicating files.

`BookishStickers` includes `Stickers.xcassets`, has no source files, and uses Apple's `com.apple.product-type.app-extension.messages-sticker-pack` product type. Its system principal class is `StickerBrowserViewController`. Its 14 final Lunair stickers are transparent 408 x 408 PNGs, and its `iMessage App Icon` asset has the template's icon slots. The sticker pack sets `NSStickerSharingLevel` to `OS`, matching the installed Xcode template.

The iOS 27.1 simulator rejects a containing app with two `com.apple.message-payload-provider` extensions: `Multiple message payload provider extensions found in app but only one is allowed`. Therefore, the bundled app embeds only `BookishMessages`, which provides its own sticker browser. `BookishStickers` remains buildable for art validation and alternate packaging, but its `.appex` is not installed with `App`. Distributing that target requires an alternate containing-app configuration with a single Messages provider.

## Local builds

These commands run from the repository root, use the full Xcode installation without changing the global developer directory, and disable signing only for simulator builds.

Install the existing host dependencies first:

```sh
cd app
npm ci
cd ios/App
pod install
cd ../../..
```

If the host's ignored `App/public` directory or generated Capacitor configuration is absent, build and copy the existing web app before building the host:

```sh
cd app
npm run build
npx cap copy ios
cd ..
```

`cap copy` updates bundled web resources and configuration. Do not use it to recreate the Xcode project. No extension target requires a new CocoaPod or Swift package.

List targets and shared schemes:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -list -project app/ios/App/App.xcodeproj
```

Choose an available iPhone simulator. The UUID below is the booted iPhone Duo used for verification on this Mac. Replace it with a UUID from your own device list when working elsewhere. Using a concrete destination lets Debug build only that simulator's architecture.

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl list devices available
BOOKISH_SIMULATOR_UDID=E7647B94-463C-4920-AFF5-0E88ECB69358
```

Build the containing app and its embedded Messages extension:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -workspace app/ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination "id=$BOOKISH_SIMULATOR_UDID" \
  -derivedDataPath /tmp/bookish-imessage-app \
  CODE_SIGNING_ALLOWED=NO build
```

The Podfile's existing post-install hook now raises generated pod targets below iOS 16.0 to the host's existing minimum. This avoids the locked Capacitor dependencies' legacy iOS 14.0 floor, which Xcode 27.1's simulator SDK rejects because its minimum is iOS 15.0. Dependency versions remain unchanged.

Build each extension independently, without the host's CocoaPods dependency. Reusing the derived-data directory preserves SDK compilation caches:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project app/ios/App/App.xcodeproj \
  -scheme BookishMessages \
  -configuration Debug \
  -destination "id=$BOOKISH_SIMULATOR_UDID" \
  -derivedDataPath /tmp/bookish-imessage-app \
  CODE_SIGNING_ALLOWED=NO build

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project app/ios/App/App.xcodeproj \
  -scheme BookishStickers \
  -configuration Debug \
  -destination "id=$BOOKISH_SIMULATOR_UDID" \
  -derivedDataPath /tmp/bookish-imessage-app \
  CODE_SIGNING_ALLOWED=NO build
```

If Xcode requires a license or first-launch action on another machine, stop and have the Mac owner complete it in Xcode. Do not accept agreements, switch the system developer directory, or change signing accounts through a build script.

## Host compatibility with Xcode 27

Building the legacy host with Xcode 27.1 exposed an iOS 27.1 startup assertion because it did not adopt the scene lifecycle. [Apple requires scene adoption for apps built with the current iOS 27 SDK](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).

The host now declares one window scene using its existing `Main` storyboard and a small `SceneDelegate`. Scene URL contexts and user activities, including cold launches, reuse the existing AppDelegate callbacks into Capacitor's `ApplicationDelegateProxy`. Scene state transitions forward to the existing host callbacks, and the legacy `window` reference is maintained. The host controller and Capacitor dependency versions stay the same. This follows [Apple's scene migration guidance](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle).

## Manual signing and Apple configuration

No development team is recorded in the existing host project, so no team ID was invented for the extensions. There are no App Group entitlements or shared-container identifiers in this checkout. The current extensions require no App Groups, Push Notifications, Associated Domains, or new backend capability.

1. Open the workspace in Xcode, then add the owner's Apple Account through **Xcode > Settings > Accounts** if it is not already present.
2. Select the `App` project, select the `App` target, and open **Signing & Capabilities**. Leave **Automatically manage signing** enabled. Select the real development team authorized to use `com.meetbookish.app`.
3. Repeat for `BookishMessages`, selecting the same team. Check its bundle ID against the table above for both Debug and Release. Resolve any bundle-ID ownership conflict with the account owner, and keep the extension identifier beneath the host identifier if a change is required. Configure `BookishStickers` with that team only if pursuing alternate device packaging later.
4. Let Xcode create or update development provisioning profiles for the host and `BookishMessages` when building to a registered device. Do not reuse the host's provisioning profile for the extension. If the team uses manual signing, an Account Holder or Admin must register an explicit App ID matching each embedded bundle ID and create the appropriate development or distribution profile for each target.
5. In **App > Build Phases > Embed App Extensions**, confirm that only `BookishMessages.appex` is listed. In its **General** pane, confirm deployment target and version match the host.
6. Select a physical iPhone, choose the `App` scheme, and run. Resolve Xcode's signing diagnostics with the owner before proceeding. The simulator commands above intentionally do not exercise signing.
7. For release, archive the `App` scheme for **Any iOS Device**. In Organizer, use **Validate App** before upload and verify `BookishMessages.appex` is present in the archive. Distribution requires valid signing for the host and this embedded extension. Do not add `BookishStickers.appex` to the same containing app.
8. In the existing containing app's App Store Connect record, prepare the iMessage screenshots, icon, review notes, and remaining metadata. The embedded experience uses the containing app's record. Do not create a separate standalone app record for this implementation.

Apple documents [capability and automatic-signing configuration](https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app), [explicit App ID registration](https://developer.apple.com/help/account/identifiers/register-an-app-id), [development profiles](https://developer.apple.com/help/account/provisioning-profiles/create-a-development-provisioning-profile/), and [iMessage app information in App Store Connect](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-imessage-app-information).

If shared host data is added later, the owner must choose and register a real App Group, enable the same group in both `App` and `BookishMessages`, and regenerate their provisioning profiles. The host must then write the agreed data to that shared container. Merely adding an entitlement does not connect the Capacitor app's storage. The static sticker pack does not need shared storage. See Apple's [App Group registration steps](https://developer.apple.com/help/account/identifiers/register-an-app-group) and [App Group configuration](https://developer.apple.com/documentation/xcode/configuring-app-groups). No App Group has been registered or enabled by this change.

## Use and manual acceptance

Install the containing app, open an iMessage conversation in Messages, and choose Bookish from the conversation's apps menu. The extension provides compact and expanded presentations. Choose its **Stickers** mode to send one of the 14 static stickers through the native sticker browser. The exact location of the Messages apps menu varies by iOS version.

Use two physical devices and a test conversation for final acceptance:

- Confirm the containing app still launches, Bookish is discoverable in Messages, and its Stickers mode shows all 14 images after installation.
- Open Bookish in compact mode, expand it, and return to compact mode. Check small screens, Dynamic Type, VoiceOver labels, and light and dark appearance.
- Compose each card type, confirm a draft appears in the Messages input field, and send it manually. Confirm the receiving device displays the artwork and can open the interactive card.
- On the second device, respond to the card, send the updated message manually, and reopen it on the first device. Confirm the expected state and session are retained.
- Send each sticker. Check its text at normal size, transparency, edge quality, and placement on a message bubble.
- Repeat after terminating and reopening Messages, and after reinstalling the containing app. Check supported deployment versions as well as the newest iOS release.

A successful simulator build does not verify real iMessage delivery, cross-device updates, account setup, App Store review, or distribution signing. Messages owns delivery and the final send action. This implementation is not a background service, does not read the conversation transcript, and does not automatically send messages.

See Apple's [Messages framework overview](https://developer.apple.com/documentation/messages), [principal view-controller documentation](https://developer.apple.com/documentation/messages/msmessagesappviewcontroller), and [sticker pack requirements](https://developer.apple.com/documentation/messages/adding-your-sticker-packs-to-messages).

## State, privacy, and session limits

Cards carry a bounded, versioned JSON snapshot in the fragment of an HTTPS URL under `https://meetbookish.com/imessage/v1`. The fragment is not sent to the website by an ordinary browser request. No new website route, database table, or backend write is required. The full message, including names and responses, is visible to conversation participants. The URL is checked against Apple's 5,000-character limit before insertion; a large card can become full before the 40-member model cap.

Every new card begins a new `MSSession`. Responding to a selected card reuses that session, so Messages collapses prior revisions. Tapping the template opens the extension, where the member chooses a response and adds it to the composer. The member taps Send in Messages. There are no pretend in-bubble buttons. Unsent drafts stay separate from committed state, and cancellation does not publish a response.

Known revisions are merged per participant within the current extension process and conversation. `didReceive` refreshes the active card because `selectedMessage` can be stale. There is no backend coordinator: simultaneous edits on separate devices can require reopening the latest card and responding again, and revisions unseen before process termination cannot be recovered from a local cache. The URL is not a hosted Mac interaction flow; macOS opens the website, and interactive responses require the iOS extension. Two-device session collapse and concurrent responses remain manual acceptance checks.

Sample data is deliberately labeled `Sample Bookish club`, with no seeded member responses. The host has no App Group entitlement or shared native club snapshot, so there is no data bridge to enable yet. `ClubDataStore.swift` is the narrow future integration point. No App Group identifier or entitlement has been invented.

## Theme and art handoff

`BookishMessages/BookishTheme.swift` owns every font choice, palette reference, and illustration asset name. The `Paper`, `Ink`, `Pink`, `Butter`, `Mint`, `Sky`, and `Lilac` color sets in `BookishMessages/Assets.xcassets` own the replaceable colors. Add approved art to the empty `LunairRSVP`, `LunairVote`, and `LunairBookmarks` image sets using those exact names. The neutral drawn-book fallback disappears automatically when a named image is present. These are placeholders, not final Lunair mascot art.

Replace the DRAFT `iMessage App Icon.stickersiconset` PNGs in both extension catalogs before release. The sticker pack's [README](../app/ios/App/BookishStickers/README.md) describes the 14 final stickers, exact pixel sizes, and caption-based accessibility metadata. Asset and theme changes require a rebuild, with no flow or controller code changes.


## Initial scaffold verification

On 2026-10-21, Xcode 27.1 (27A9275) successfully built `App`, `BookishMessages`, and `BookishStickers` for the booted iPhone Duo running iOS 27.1, using the commands above with `CODE_SIGNING_ALLOWED=NO`. No deployment-target override was needed after the Podfile compatibility fix.

The final source fingerprint, including the host delegate, scene delegate, information property list, storyboard, extension files, project, schemes, and Podfile, was:

```text
f0600eb96d7413ce976c4bca56ef686124f1968b39a26247169d95b43d21229d
```

All three builds exited successfully, and the source stayed unchanged throughout verification. Installation succeeded. The installed app contains only `BookishMessages.appex`, with the correct bundle ID and principal class, plus all six loose sticker PNGs. Its host scene resolves to `App.SceneDelegate` and the existing `Main` storyboard. The host remained alive for more than two minutes after launch, and its existing UI was visually confirmed in the simulator. Project and property-list validation, shared-scheme XML parsing, and whitespace checks also passed.

Local evidence is in `/tmp/bookish-imessage-final-verification.json`, with build logs at `/tmp/bookish-imessage-scene-app.log`, `/tmp/bookish-imessage-scene-messages.log`, and `/tmp/bookish-imessage-scene-stickers.log`. The inspected host screenshot is `/tmp/bookish-imessage-scene-host.png`.

Distribution signing, physical-device behavior, Messages menu discovery, and a real two-device iMessage exchange remain manual checks. These simulator checks did not send any messages.
