# Bookish Android Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation.

**Goal:** Build Bookish 1.1 for Android and prepare internal testing only.

**Architecture:** Keep the existing Capacitor 7 local web bundle and shared configuration. Add Android native resources, lifecycle handling, signing from environment variables, and a tag-triggered internal publishing workflow.

**Tech Stack:** TypeScript, Vite, Capacitor 7, Android SDK, Gradle, Java 21, and Codemagic.

**Spec:** The user ticket dated November 5, 2026, with implementation details in `app/ANDROID.md`.

## Global Constraints

- App ID `com.meetbookish.app`, version `1.1`, and the existing iOS icon and splash.
- Upload key and passwords only in `/Users/vahallo/ted-ops/keys/bookish-android/`, mode 600.
- Internal testing only. No review submission, production or closed release, merge, site deployment, function deployment, purchase, or paid service.
- Keep email-code changes independent of code-length validation for `feat/four-digit-codes`.
- Do not access the prohibited home folders. Use Chrome on the Mac mini.

## Review Focus

- Reject external, malformed, and unrelated app links, and handle warm and cold launches.
- Back dismisses keyboard or dialog, returns through app navigation, and backgrounds at the root.
- Insets and keyboard resizing keep fields and actions reachable on current Android.
- Android map browsing works without the iOS-only native plugin.
- Signing failures stop release builds, and CI can publish only to internal.

### Task 1: Native Android app and lifecycle

- [x] Install free Android tooling, add the matching Capacitor platform, and generate resources from iOS artwork.
- [x] Add failing link-parser and shipped-UI tests for Android map and back behavior.
- [x] Implement trusted app links, Android back handling, window insets, keyboard resizing, and minimal email-code input hints.
- [x] Run app tests, UI smoke, release checks, and Android lint/build.

### Task 2: Signing and CI

- [x] Generate upload key and passwords directly in the approved directory with restrictive permissions.
- [x] Build a signed AAB and APK without secret output or repo copies.
- [x] Add Codemagic workflow for `android-v*`, versionCode from build number, and internal-only publishing.
- [x] Configure Codemagic secrets and Play access if available, otherwise document the exact blocker.

### Task 3: Emulator and Play preparation

- [x] Install and run Android emulator, sign in with the existing review account, open the demo club, and capture main-screen evidence.
- [x] Pull iOS listing and Apple privacy data, and prepare Play listing, data safety, and rating answers from evidence.
- [ ] Create Play app, enroll signing, upload only internally, and add the specified tester, subject to any required legal confirmation.

### Task 4: Review and delivery

- [ ] Run final validation and independent review, fix material findings, and inspect the diff for secrets.
- [ ] Commit with the requested trailers, push, and open a draft PR against main.
- [ ] Write the full result and any uncompleted external prerequisites to the requested oneshot result file.

## Execution record

- Task 1: complete. App unit tests, shipped UI smoke, signed API-36 bundle, and release lint pass. API-35 emulator walkthrough covers the existing review account, demo club, main tabs, map, and system Back.
- Task 2: signing and build workflow complete. The Codemagic application, four masked signing variables, and GitHub push webhook are configured. Publisher credentials and Bookish testing-release permission remain pending app creation. The publishing stanza stays commented until the first manual internal upload is possible.
- Task 3: listing, data safety, and rating drafts are prepared. Play app creation is waiting at the browser-required legal confirmation. No app or release was created, and no review was submitted.
- Independent review: found warm-link refresh races, community-dialog precedence, stale invitation intent, and irrelevant generated example tests. The behavior issues have regression coverage, and generated example tests were removed. Subsequent emulator QA also caught the Android external-map destination, now covered by the shipped UI smoke.
- Ruling: verified HTTPS association needs the Play app-signing certificate and a future approved site deployment. This ticket prohibits deploying the site, so app-targeted VIEW intents were tested, and automatic domain verification is explicitly left pending.
- Ruling: iOS listing copy is adapted to omit Messages-only stickers and the stale offline-directory claim. This prevents unsupported Android claims.
- Ruling: CI publishes no release while Play enrollment and credentials remain unavailable. The prepared publisher is internal-only and draft-only, with review submission disabled.
- Deferred minor: native lint reports launcher-shape, monochrome-icon, and generated unused-resource warnings. There are no lint errors. Physical Android hardware, TalkBack, and an API-36 emulator were not exercised. The API-36 system-image download failed, while the API-35 emulator completed the requested walkthrough.
