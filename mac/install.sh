#!/bin/bash
# Builds the Apple Calendar helper and runs it every 15 minutes.
# Undo with: mac/install.sh --remove
set -euo pipefail
cd "$(dirname "$0")"
label=com.yaksbbgtr.luach.calendar
plist="$HOME/Library/LaunchAgents/$label.plist"
app="$HOME/Applications/Luach Calendar.app"
log="$HOME/Library/Logs/luach-calendar.log"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then
  rm -rf "$plist" "$app" "$HOME/Library/Application Support/Luach"
  echo "Removed. Events already uploaded stay in your gist until you delete luach-apple.json there."
  exit 0
fi
./build.sh
mkdir -p "$HOME/Applications" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
rm -rf "$app" && cp -R "build/Luach Calendar.app" "$app"
# Upload again after a reinstall even if nothing changed.
rm -f "$HOME/Library/Application Support/Luach/last.json"
cat > "$plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$label</string>
<key>ProgramArguments</key><array><string>$app/Contents/MacOS/luach-calendar</string></array>
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
