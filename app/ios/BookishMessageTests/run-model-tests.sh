#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/bookish-message-tests.XXXXXX")
trap 'rm -rf "$build_dir"' EXIT HUP INT TERM

# Override SWIFTC to use an installed standalone Swift toolchain, if needed.
"${SWIFTC:-swiftc}" -swift-version 5 \
  "$test_dir/../App/BookishMessages/MessageState.swift" \
  "$test_dir/../App/BookishMessages/ClubDataStore.swift" \
  "$test_dir/main.swift" \
  -o "$build_dir/model-tests"
"$build_dir/model-tests"
