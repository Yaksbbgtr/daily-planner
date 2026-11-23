#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
app="build/Daily Planner Calendar.app/Contents"
rm -rf build && mkdir -p "$app/MacOS"
swiftc -O -swift-version 5 main.swift -o "$app/MacOS/daily-planner-calendar"
cp Info.plist "$app/"
codesign --force --sign - "build/Daily Planner Calendar.app"
