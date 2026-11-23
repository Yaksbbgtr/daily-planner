#!/bin/bash
# Builds the Apple Calendar helper and runs it every 15 minutes.
# Undo with: mac/install.sh --remove
set -euo pipefail
cd "$(dirname "$0")"
label=com.yaksbbgtr.dailyplanner.calendar
plist="$HOME/Library/LaunchAgents/$label.plist"
app="$HOME/Applications/Daily Planner Calendar.app"
log="$HOME/Library/Logs/daily-planner-calendar.log"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then
  rm -rf "$plist" "$app" "$HOME/Library/Application Support/Daily Planner"
  security delete-generic-password -s "Daily Planner Mac key" >/dev/null 2>&1 || true
  echo "Removed. To also turn off its key, make a new Mac key in the app."
  exit 0
fi
url=$(sed -n "s/.*url: '\([^']*\)'.*/\1/p" ../js/config.js | grep -v '<project>' | head -1)
key=$(sed -n "s/.*key: '\([^']*\)'.*/\1/p" ../js/config.js | grep -v '<publishable' | head -1)
if [ -z "$url" ] || [ -z "$key" ]; then echo "Sync is not set up in js/config.js yet."; exit 1; fi
read -rsp "Paste the Mac key from Daily Planner > Settings > Apple Calendar: " mackey; echo
if ! [[ "$mackey" =~ ^[0-9a-f]{64}$ ]]; then echo "That does not look like a Mac key."; exit 1; fi
security add-generic-password -U -s "Daily Planner Mac key" -a "$USER" -w "$mackey"
./build.sh
/usr/libexec/PlistBuddy -c "Add :PlannerURL string $url" -c "Add :PlannerKey string $key" "build/Daily Planner Calendar.app/Contents/Info.plist"
codesign --force --sign - "build/Daily Planner Calendar.app"
mkdir -p "$HOME/Applications" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
rm -rf "$app" && cp -R "build/Daily Planner Calendar.app" "$app"
# Upload again after a reinstall even if nothing changed.
rm -f "$HOME/Library/Application Support/Daily Planner/last.json"
cat > "$plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$label</string>
<key>ProgramArguments</key><array><string>$app/Contents/MacOS/daily-planner-calendar</string></array>
<key>StartInterval</key><integer>900</integer>
<key>StandardOutPath</key><string>$log</string>
<key>StandardErrorPath</key><string>$log</string>
</dict></plist>
P
: > "$log"
launchctl bootstrap "gui/$(id -u)" "$plist"
launchctl kickstart "gui/$(id -u)/$label"
echo "Click Allow when macOS asks about your calendars."
for _ in $(seq 60); do sleep 2; [ -s "$log" ] && break; done
if [ -s "$log" ]; then cat "$log"; else echo "Still waiting on the calendar prompt. Results will be in $log"; fi
