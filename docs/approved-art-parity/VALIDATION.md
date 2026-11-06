# Verification record

Verified on November 5, 2026, on `Teds-Mac-mini.local`, using Xcode 27.1, Google Chrome 156, and iOS Simulator. UTC capture timestamps fall on November 6.

| Check | Result |
| --- | --- |
| `npm run lint` | Pass: JavaScript syntax, Deno lint, and app TypeScript |
| `app/node_modules/.bin/tsc --noEmit --project app/tsconfig.json` | Pass, included in lint and app build |
| `npm test` | Pass: 152 backend, 26 confirmation, 19 server, and 5 operations tests |
| `npm run test:visibility` | Pass: 26 tests |
| `npm run test:web` | Pass: 18 tests, including `/app/` asset prefix resolution |
| `npm test --prefix app` | Pass: 20 unit tests plus focused community UI/payload checks |
| `npm run test:ui --prefix app` | Pass: full existing guest, account, club, safety, vote, host, and mocked-native smoke flows |
| `npm run build` with local empty verified/community fixtures | Pass: 926 generated geographic and resource pages |
| `npm run build:web` | Pass: website and independent `/app/` package |
| `npm run build --prefix app` | Pass: TypeScript and Vite production bundle |
| `npm run check:edge` | Pass |
| `npm run check:release --prefix app` | Pass |
| `sh app/ios/BookishMessageTests/run-model-tests.sh` | Pass: 16 native state and transport tests |
| `LANG=en_US.UTF-8 npm run sync --prefix app` | Pass: local bundle copy and native dependency sync |
| Simulator `App` scheme build | Pass: Debug, iPhone 17 Pro, code signing disabled |
| Simulator `BookishMessages` target build | Pass: native extension, code signing disabled |
| Simulator `BookishStickers` target build | Pass: embedded sticker pack, code signing disabled |
| Browser parity capture | Pass: 55 captures; no horizontal overflow, broken visible images, missing local assets, unexpected external requests, emoji, em dash, or browser errors |
| Native parity capture | See [native evidence](native/README.md) for exact UIKit renderings and limits |
| `git diff --check` | Pass |

The main app was also installed and launched in the simulator. Visual inspection caught and corrected the previous white status-bar text on the new cream background. The final app uses dark status-bar text and the approved paper WebView background.

The simulator App build command was:

```sh
xcodebuild -workspace app/ios/App/App.xcworkspace \
  -scheme App -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=46C336E1-6F0E-4C85-892B-D5BFF8765325' \
  -derivedDataPath /tmp/bookish-approved-app-build \
  CODE_SIGNING_ALLOWED=NO build
```

Existing CocoaPods script-phase warnings remain. Browser fixtures establish layout and client behavior, not backend delivery, system permission sheets, live Messages sending, or screen-reader conformance. Native renderings establish real UIKit and sticker-browser layout; they do not send a message or establish end-to-end delivery. No production schema, backend, deployment, or App Store Connect changes were made.

Independent branch review found one material issue: long account email text could overflow beside the profile art. The added Chrome case reproduced the failure before the fix at both 390px and 320px. The fix wraps greeting text within the art gutter. The capture guard now compares document width with the requested viewport, which also detects mobile layout-viewport expansion. Final captures include both stress cases.

Review decisions: separate absent routes were treated as outside this restyling scope, and combined existing flows remain clearly marked partial. Four-digit UI acceptance does not change server authentication. Native rendering evidence does not establish live Messages delivery or VoiceOver conformance. No material reviewer finding remains unresolved.
