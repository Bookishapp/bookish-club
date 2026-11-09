#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
evidence="${BOOKISH_NATIVE_EVIDENCE:-$root/.cache/review-evidence/v3}"
source_dir="$root/app/ios/App/BookishMessages"
build_dir="$(mktemp -d /tmp/bookish-v3-native.XXXXXX)"
app_dir="$build_dir/BookishV3Parity.app"
mkdir -p "$app_dir" "$evidence/parity/built" "$evidence/evidence/native"
simulator="$(xcrun simctl create 'Bookish v3 Native Review' com.apple.CoreSimulator.SimDeviceType.iPhone-13-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5)"
cleanup() { xcrun simctl shutdown "$simulator" >/dev/null 2>&1 || true; xcrun simctl delete "$simulator" >/dev/null 2>&1 || true; rm -rf "$build_dir"; }
trap cleanup EXIT
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun swiftc -swift-version 5 -D BOOKISH_PARITY -sdk "$sdk" -target arm64-apple-ios16.0-simulator \
  -framework UIKit -framework Messages -framework SwiftUI -framework WidgetKit \
  "$source_dir/MessageState.swift" "$source_dir/ServerMessageCard.swift" "$source_dir/ClubDataStore.swift" \
  "$source_dir/BookishTheme.swift" "$source_dir/CardRenderer.swift" "$source_dir/ServerCardRenderer.swift" \
  "$source_dir/StickerPickerViewController.swift" "$source_dir/MessagesViewController.swift" \
  "$root/app/ios/App/BookishWidgets/WidgetSnapshot.swift" "$root/app/ios/App/BookishWidgets/BookishWidgets.swift" \
  "$root/app/ios/NativeParity/ParityHost.swift" -o "$app_dir/BookishV3Parity"
xcrun actool "$source_dir/Assets.xcassets" --compile "$app_dir" --platform iphonesimulator --minimum-deployment-target 16.0 --target-device iphone --output-format human-readable-text --output-partial-info-plist "$build_dir/assets.plist" > "$evidence/evidence/native/assets.log"
cp -R "$source_dir/Fonts" "$app_dir/Fonts"
cp "$source_dir"/Stickers/*.png "$app_dir/"
cat > "$app_dir/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.meetbookish.v3parity</string><key>CFBundleExecutable</key><string>BookishV3Parity</string><key>CFBundleName</key><string>Bookish Native Review</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0</string><key>LSRequiresIPhoneOS</key><true/><key>MinimumOSVersion</key><string>16.0</string><key>UILaunchScreen</key><dict/><key>UIDeviceFamily</key><array><integer>1</integer></array></dict></plist>
PLIST
codesign --force --sign - "$app_dir" >/dev/null
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b
xcrun simctl status_bar "$simulator" override --time 9:41 --batteryState charged --batteryLevel 100
xcrun simctl install "$simulator" "$app_dir"
for mode in ${BOOKISH_NATIVE_CAPTURE_MODES:-20 21 22 23 24}; do
  xcrun simctl launch --terminate-running-process "$simulator" com.meetbookish.v3parity "$mode"
  sleep 2
  xcrun simctl io "$simulator" screenshot "$build_dir/$mode.png" >/dev/null
  sips -z 844 390 "$build_dir/$mode.png" --out "$evidence/parity/built/$mode.png" >/dev/null
done
