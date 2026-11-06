#!/bin/bash
# Review-only simulator app, using production UIKit classes and resources directly.
# No review routes, identities, or hooks are added to the production app or extension.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
source_dir="$root/app/ios/App/BookishMessages"
evidence="$root/docs/approved-art-parity/native"
build_dir="$(mktemp -d /tmp/bookish-native-parity.XXXXXX)"
app_dir="$build_dir/BookishParity.app"
mkdir -p "$app_dir" "$evidence/actual" "$evidence/cards"
simulator="$(xcrun simctl create 'Bookish Native Parity' com.apple.CoreSimulator.SimDeviceType.iPhone-13-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5)"
cleanup() {
  xcrun simctl shutdown "$simulator" >/dev/null 2>&1 || true
  xcrun simctl delete "$simulator" >/dev/null 2>&1 || true
  rm -rf "$build_dir"
}
trap cleanup EXIT
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun swiftc -swift-version 5 -sdk "$sdk" -target arm64-apple-ios16.0-simulator \
  -framework UIKit -framework Messages \
  "$source_dir/MessageState.swift" "$source_dir/ClubDataStore.swift" \
  "$source_dir/BookishTheme.swift" "$source_dir/CardRenderer.swift" \
  "$source_dir/StickerPickerViewController.swift" "$source_dir/MessagesViewController.swift" \
  "$evidence/ParityHost.swift" -o "$app_dir/BookishParity"
xcrun actool "$source_dir/Assets.xcassets" --compile "$app_dir" --platform iphonesimulator \
  --minimum-deployment-target 16.0 --target-device iphone --output-format human-readable-text \
  --output-partial-info-plist "$build_dir/assets.plist" > "$build_dir/assets.log"
cp -R "$source_dir/Fonts" "$app_dir/Fonts"
cp "$source_dir"/Stickers/*.png "$app_dir/"
cat > "$app_dir/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.meetbookish.parity.review</string>
<key>CFBundleExecutable</key><string>BookishParity</string>
<key>CFBundleName</key><string>Bookish Parity</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>MinimumOSVersion</key><string>16.0</string>
<key>UILaunchScreen</key><dict/>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
</dict></plist>
PLIST
codesign --force --sign - "$app_dir" >/dev/null
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b
xcrun simctl status_bar "$simulator" override --time 9:41 --batteryState charged --batteryLevel 100
xcrun simctl install "$simulator" "$app_dir"
for mode in editor-rsvp editor-vote editor-vote-scrolled editor-vote-error-scrolled editor-vote-large-type editor-vote-large-type-scrolled editor-bookmarks stickers transcript-rsvp transcript-vote transcript-bookmarks transcript-bookmarks-empty transcript-rsvp-long drawer-icon; do
  xcrun simctl launch --terminate-running-process "$simulator" com.meetbookish.parity.review "$mode"
  sleep 2
  xcrun simctl io "$simulator" screenshot "$build_dir/$mode.png" >/dev/null
  sips -z 844 390 "$build_dir/$mode.png" --out "$evidence/actual/$mode.png" >/dev/null
  if [[ "$mode" == transcript-* ]]; then
    container="$(xcrun simctl get_app_container "$simulator" com.meetbookish.parity.review data)"
    cp "$container/tmp/card.png" "$evidence/cards/$mode.png"
  fi
done
python3 "$evidence/write-manifest.py"
printf 'Captured production UIKit renderings to %s/actual and %s/cards\n' "$evidence" "$evidence"
