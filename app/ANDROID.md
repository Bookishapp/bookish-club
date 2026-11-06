# Bookish for Android

Bookish uses the same Capacitor 7 local web bundle, app ID `com.meetbookish.app`, version `1.1`, and source artwork as iOS. Android targets API 36, with minimum API 23, AGP 8.9.1, Gradle 8.11.1, and Java 21. There is no remote `server.url`.

## Build

Install Node 24, Java 21, Android command-line tools, platform 36, and build tools 35 or later. Set `JAVA_HOME` and `ANDROID_HOME` for the installed tools.

```sh
cd app
npm ci
npm test
npm run test:ui
npm run check:release
npm run sync:android
cd android
./gradlew assembleDebug lintDebug
```

`npm run snapshot` is the same offline book and theme snapshot step used by iOS. Directory discovery still requires a live refresh so hidden club facts cannot return from a bundled or cached directory.

Regenerate Android artwork with `python3 scripts/android-artwork.py` from the repository root, using Pillow. It reads the selected iOS icon and iOS splash. Android 12 and later use the same icon in the platform launch animation. Older releases use the iOS splash image.

## Signing

The upload keystore, certificate, and password files live only in `/Users/vahallo/ted-ops/keys/bookish-android/` on the Mac mini. The directory is mode 700, and files are mode 600. Never copy them into the repo, log their contents, or pass passwords as command-line arguments.

Gradle release tasks require all four environment variables:

- `BOOKISH_KEYSTORE_PATH`: absolute upload-keystore path.
- `BOOKISH_KEYSTORE_PASSWORD`: store password, loaded without printing it.
- `BOOKISH_KEY_ALIAS`: `upload`.
- `BOOKISH_KEY_PASSWORD`: key password, loaded without printing it.

`BOOKISH_VERSION_CODE` defaults to `1` for the first local upload. CI derives it from the Codemagic build number plus one, leaving code 1 for that first manual upload. After other manual uploads, ensure the next Codemagic value exceeds the largest Play version code.

Build with `./gradlew bundleRelease`. Release tasks fail if signing variables are missing. The AAB is `app/android/app/build/outputs/bundle/release/app-release.aab`. Enroll in Play App Signing when the Play app is created. The upload certificate and the Google-held app-signing certificate serve different purposes.

## Android behavior

The native activity applies system-bar, cutout, and IME insets once, in native pixels. The WebView resizes above the keyboard, and the status and navigation bars use light icons against Bookish's dark background. Android does not use iOS MapKit; the shared city map remains available, and external city links use Google Maps.

Android Back lets the system dismiss the keyboard first, then closes dialogs or returns through club pages, Resources, Read Next, and the main tabs. At the root it backgrounds the app. Incoming HTTPS links to `meetbookish.com/app/#invite=...` and `/book-clubs/.../#club-id` become local app state. Incoming intent supersedes an earlier sign-in destination, and club links survive a concurrent resume refresh. Untrusted hosts, credentials in URLs, malformed fragments, and unrelated routes are ignored.

Approximate-only Android location grants are sufficient for on-device city sorting. The manifest requests location only for optional on-device city sorting, and notifications for local reminders. Android backup and transfer rules exclude app data. The code field stays a text field with numeric input and one-time-code autocomplete. This branch does not change its current length validation or auth protocol, keeping the four-digit-code work independent.

## Verified HTTPS app links

The intent filter is ready, but Android's automatic domain verification also requires `https://meetbookish.com/.well-known/assetlinks.json`, containing the Play app-signing certificate SHA-256 fingerprint for `com.meetbookish.app`. Do not use the upload certificate as a substitute for Google's signing certificate.

This ticket prohibits site deployment, so it cannot activate that association on the live host. Until an approved site deployment publishes the association, verify routing using an explicit app-targeted Android VIEW intent, and let testers select Bookish under Android Settings, Open supported links if necessary. Do not claim automatic verified links are enabled before domain verification succeeds.

## Codemagic

The app is [bookish-club](https://codemagic.io/app/6aed16a4f325d5609be98dd6/settings), connected through the public Git URL. A push webhook is registered with GitHub. No GitHub integration permissions or paid team plan are needed.

Workflow `bookish-android-internal` triggers on `android-v*`, uses Node 24 and Java 21, runs the same snapshot and app checks as iOS, and builds an AAB. It references the app-specific `bookish_android` group:

- `BOOKISH_KEYSTORE_BASE64`, secret.
- `BOOKISH_KEYSTORE_PASSWORD`, secret.
- `BOOKISH_KEY_ALIAS`, secret.
- `BOOKISH_KEY_PASSWORD`, secret.
- `BOOKISH_PLAY_SERVICE_ACCOUNT_CREDENTIALS`, secret JSON, required before CI publishing can run.

The binary is decoded only into a temporary mode-600 file on the CI worker, and is removed when the build step exits. The prepared publishing block is commented out until the first manual upload and publisher credential are ready, so a missing publisher credential cannot stop signed builds. Its destination is `internal`, with `submit_as_draft: true` and `changes_not_sent_for_review: true`. No production, closed-track, promotion, or site-deployment action is configured. A tag is an explicit build trigger; none is needed to open the draft PR.

The requested existing publisher is `kres-68@gen-lang-client-0329895377.iam.gserviceaccount.com`. Grant only Bookish app viewing and testing-release permissions, then put that account's existing JSON key in the app-specific group. Global secret sharing requires a paid Codemagic team subscription, so do not upgrade to share Fictora's secrets. The first AAB must be uploaded manually to the internal track, per [Codemagic's first-release requirements](https://docs.codemagic.io/yaml-publishing/google-play/).

## Store preparation and QA

The Android-adapted iOS listing is in `release/android/listing-en-US.json`. Apple privacy evidence, data-safety mapping, content-rating draft, and audience notes are in `release/android/app-content-draft.md`. The live privacy policy is `https://meetbookish.com/privacy/`.

The result file and screenshots for this task are outside the repository in `/Users/vahallo/ted-ops/oneshots/1105-bookish-android-RESULT.md` and its sibling evidence directory. Keep prod demo credentials and signed binaries out of Git. Do not create production or closed releases, submit for review, merge, or deploy the site or functions as part of this ticket.

References: [Capacitor 7 Android](https://capacitorjs.com/docs/v7/android), [Play API 36 requirement](https://support.google.com/googleplay/android-developer/answer/11926878), and [Codemagic publishing](https://docs.codemagic.io/yaml-publishing/google-play/).
