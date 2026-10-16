# Bookish TestFlight draft

The repository-root `codemagic.yaml` mirrors the `ios-release` workflow in
`/Users/vahallo/Claude Code - Fictora/codemagic.yaml`, which was read for this task:
Mac mini M2, Node 24, latest Xcode, CocoaPods, the `codemagic` App Store Connect
integration, `code-signing` environment group, CLI keychain/signing setup,
`xcode-project build-ipa`, IPA/log artifacts, then TestFlight publication.
It is iOS only and has no automatic trigger. Nothing was uploaded or activated.

Bookish’s steps run in `app/` where appropriate, with workspace
`app/ios/App/App.xcworkspace`, shared scheme `App`, and bundle ID
`com.meetbookish.app`. `LANG` and `LC_ALL` are `en_US.UTF-8`; `cap sync ios`
performs CocoaPods installation after the web bundle exists. There is no redundant
pre-sync `pod install` step. There are no Fictora analytics, purchases, Android,
backend service credentials, or Fictora app identifiers in this app.

## Prepare once

1. Register `com.meetbookish.app` and create Bookish’s App Store Connect app under
   the intended developer team. Connect that team’s API key as `codemagic`, or
   change the integration name in the draft. Configure the existing CLI-style
   `code-signing` group (including its certificate private key) for that team.
   Use the same signing mechanism as Fictora, without adding a second managed
   `ios_signing` configuration.
2. On a network-enabled machine run `cd app && npm install`, verify all Capacitor
   dependencies resolve to major 7, and retain the resulting `package-lock.json`.
   This run could not create a genuine Capacitor 7 lockfile: the registry was
   unreachable and those tarballs were absent from the local cache. The draft
   uses `npm ci` when a lockfile exists, otherwise `npm install` for the initial
   resolution. It exports the npm and Pods lockfiles as build artifacts. Once
   reviewed lockfiles exist, use `npm ci` unconditionally for repeatable releases.
3. Replace the empty app-icon slot with the designer’s opaque 1024×1024 PNG and
   set its `filename` in `Contents.json`. `npm run check:release` rejects the
   empty slot or a non-7 native dependency. Complete the device checks in
   `../RESULT.md`, privacy disclosures and App Store metadata/screenshots.
4. Deploy the site change that publishes `/data/clubs.json` before shipping the
   app. The workflow rebuilds the website locally solely to produce its data
   snapshot; it does not deploy the site. The public verified/community functions
   must be reachable during this build. No Supabase service key belongs in CI
   for the app.

Start `bookish-ios-testflight` manually. It will generate the data snapshot, test
and build the app, sync native dependencies, sign, archive, and upload to
TestFlight. It does not submit to App Review. Build numbers use Codemagic’s build
number plus one; if Bookish has previous uploads, choose an offset above its
largest uploaded build before the first run. Fictora’s `+5` offset is specific to
Fictora and was not copied.

The draft has not been validated by Codemagic or a signed archive. Its prerequisites
are deliberately explicit rather than populated with guessed credentials or an
invented App Store numeric ID. No scheduled routine was created on this Mac.

References: [Codemagic YAML](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/)
and [iOS signing](https://docs.codemagic.io/yaml-code-signing/signing-ios/).
