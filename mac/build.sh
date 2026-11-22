#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
app="build/Luach Calendar.app/Contents"
rm -rf build && mkdir -p "$app/MacOS"
swiftc -O -swift-version 5 main.swift -o "$app/MacOS/luach-calendar"
cp Info.plist "$app/"
codesign --force --sign - "build/Luach Calendar.app"
