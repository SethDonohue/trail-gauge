#!/usr/bin/env bash
# Installs the simulator build on an iPhone and an iPad simulator, launches it, screenshots it
# and fails if it is not still running. Usage: ios-screens.sh <TrailGauge.app> <out-dir>
set -euo pipefail
APP=$1
OUT=$2
BUNDLE=com.sethdonohue.trailgauge
mkdir -p "$OUT"
log() { echo "== $*"; }

# First available simulator whose name matches the pattern (newest runtime first).
pick() {
  xcrun simctl list devices available -j | python3 -c '
import json, re, sys
pat = re.compile(sys.argv[1])
d = json.load(sys.stdin)["devices"]
for rt in sorted(d, reverse=True):
    if "iOS" not in rt: continue
    for dev in d[rt]:
        if pat.search(dev["name"]): print(dev["udid"], dev["name"], sep="|"); sys.exit()
sys.exit(1)' "$1"
}

run_on() { # <label> <udid>
  local label=$1 udid=$2
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b > /dev/null
  xcrun simctl install "$udid" "$APP"
  xcrun simctl privacy "$udid" grant location "$BUNDLE" || true
  xcrun simctl privacy "$udid" grant motion "$BUNDLE" 2>/dev/null || true
  xcrun simctl location "$udid" set 39.7392,-104.9903 || true
  xcrun simctl launch "$udid" "$BUNDLE"
  sleep 15
  xcrun simctl io "$udid" screenshot "$OUT/$label.png"
  log "saved $label.png"
  if ! xcrun simctl spawn "$udid" launchctl list | grep -q "$BUNDLE"; then
    log "CRASH: app is not running on $label"
    xcrun simctl spawn "$udid" log show --last 2m --predicate "process == 'TrailGauge'" --style compact \
      > "$OUT/$label-log.txt" 2>&1 || true
    return 1
  fi
  xcrun simctl shutdown "$udid" || true
}

status=0
IFS='|' read -r phone phone_name < <(pick '^iPhone')
log "iPhone: $phone_name"
run_on "01-iphone" "$phone" || status=1

IFS='|' read -r pad pad_name < <(pick '^iPad Pro|^iPad Air|^iPad')
log "iPad: $pad_name"
run_on "02-ipad" "$pad" || status=1

exit $status
