#!/usr/bin/env bash
# Installs the app on the running emulator (Pixel Tablet profile) and screenshots every screen at
# tablet, split-screen and phone sizes. Buttons are found by their accessibility labels or text
# (uiautomator dump), so layout changes don't break the taps. Usage: tablet-screens.sh <apk> <out>
set -uo pipefail
APK=$1
OUT=$2
PKG=com.trailgauge.app
mkdir -p "$OUT"

log() { echo "== $*"; }
shot() { sleep "${2:-4}"; adb exec-out screencap -p > "$OUT/$1.png" && log "saved $1.png"; }
launch() {
  adb shell am force-stop "$PKG"
  adb shell settings put secure immersive_mode_confirmations confirmed
  adb shell am start -W -n "$PKG/.MainActivity" > /dev/null
  sleep 10
}

# Taps the first on-screen element whose content-desc or text matches the regex (case-insensitive).
tap() {
  local pattern=$1 xy
  for _ in $(seq 1 "${TAP_TRIES:-3}"); do
    adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
    xy=$(adb exec-out cat /sdcard/ui.xml | python3 -c '
import html, re, sys
pat = re.compile(sys.argv[1], re.I)
xml = sys.stdin.read()
for m in re.finditer(r"<node [^>]*>", xml):
    n = m.group(0)
    a = {k: html.unescape(v) for k, v in re.findall(r"([\w-]+)=\"([^\"]*)\"", n)}
    if pat.search(a.get("content-desc", "")) or pat.search(a.get("text", "")):
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", a["bounds"]))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
' "$pattern")
    if [ -n "$xy" ]; then
      adb shell input tap $xy
      sleep 2
      return 0
    fi
    sleep 2
  done
  log "WARN: nothing matching /$pattern/ on screen"
  return 1
}
back() { adb shell input keyevent KEYCODE_BACK; sleep 2; }
# Scrolls down until the element appears, then taps it.
tap_scroll() {
  local wh w h
  wh=$(size); w=${wh%x*}; h=${wh#*x}
  for _ in 1 2 3 4 5 6 7 8; do
    TAP_TRIES=1 tap "$1" 2>/dev/null && return 0
    adb shell input swipe $((w/2)) $((h*4/5)) $((w/2)) $((h/5)) 400; sleep 1
  done
  log "WARN: /$1/ not found after scrolling"; return 1
}
size() { adb shell wm size | tail -1 | grep -oE '[0-9]+x[0-9]+'; }
swipe_left() { local wh w h; wh=$(size); w=${wh%x*}; h=${wh#*x}; adb shell input swipe $((w*4/5)) $((h*3/5)) $((w/5)) $((h*3/5)) 180; sleep 3; }
double_tap_center() {
  local wh w h; wh=$(size); w=${wh%x*}; h=${wh#*x}
  adb shell "input tap $((w/4)) $((h/3)) & sleep 0.12; input tap $((w/4)) $((h/3))"
  sleep 3
}
open_menu() { tap 'More: settings, guides and tips'; }
GAUGES=(tilt compass altitude speed coolant outside battery cabin humidity)
# From the dashboard: double-tap the first tile (Tilt), shoot each gauge full screen, swipe on.
all_single() { # <prefix>
  double_tap_center
  for g in "${GAUGES[@]}"; do shot "$1-$g" 2; swipe_left; done
  double_tap_center
}
use_demo_motion() { open_menu; tap '^All settings$'; tap '^Demo$'; back; sleep 2; }

# Give the phone-sensor gauges something to show: a slight tilt.
adb emu sensor set acceleration 1.2:9.6:1.8 > /dev/null 2>&1 || true
# CI emulators are slow; don't let a "launcher isn't responding" dialog cover the screenshots.
adb shell settings put global hide_error_dialogs 1
adb shell input keyevent KEYCODE_HOME
sleep 20

log "install"
adb install -r -g "$APK" > /dev/null
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
NATIVE_SIZE=$(size)
log "display $NATIVE_SIZE"

log "first run: setup guide"
launch
shot 01-setup-guide 2
tap '^Next$'; shot 02-setup-step-2 1
tap '^Skip setup$'

log "tablet dashboard"
shot 03-tablet-landscape-all
adb shell settings put system user_rotation 1
shot 04-tablet-portrait-all 6
adb shell settings put system user_rotation 0
sleep 4

log "menu, quick settings, settings, tips"
open_menu; shot 05-menu 1
tap '^Quick settings$'; shot 06-quick-settings 2
back
open_menu; tap '^All settings$'; shot 07-settings 2
tap_scroll 'Show advanced settings'; adb shell input swipe 1280 1400 1280 300 300; shot 08-settings-advanced 2
back
open_menu; tap '^Guides & tips$' && shot 09-tips 2
tap 'More about Placing the outside sensor' && shot 10-tip-outside 2
back; back
# Never leave the app by accident: if the dashboard isn't up, relaunch.
adb shell dumpsys activity activities | grep -q "topResumedActivity.*$PKG" || launch

log "every gauge full screen, tablet landscape and portrait (demo data so every reading shows)"
use_demo_motion
shot 11-tablet-all-demo 3
all_single 20-tablet-full
adb shell settings put system user_rotation 1; sleep 5
shot 12-tablet-portrait-all-demo 2
all_single 30-tablet-portrait-full
adb shell settings put system user_rotation 0; sleep 4

W=${NATIVE_SIZE%x*}; H=${NATIVE_SIZE#*x}
log "split-screen sizes: the app window shrinks while a map app takes the rest"
adb shell wm size "$(( W / 2 ))x$H"; shot 13-split-half 6
adb shell wm size "$(( W / 3 ))x$H"; shot 14-split-third 6
adb shell wm size "${W}x$(( H / 2 ))"; shot 14b-split-top-bottom 6
adb shell wm size reset
sleep 3

log "phone (Galaxy S24-like), first run: landscape, three gauges per page"
adb shell pm clear "$PKG" > /dev/null
adb shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION || true
adb shell wm size 2340x1080
adb shell wm density 420
launch
tap '^Skip setup$'
use_demo_motion
shot 15-phone-page-1
swipe_left; shot 16-phone-page-2 2
swipe_left; shot 17-phone-page-3 2
swipe_left; sleep 1
all_single 40-phone-full
open_menu; tap '^Quick settings$'; tap '^On$'; back
shot 18-phone-night-mode 3
open_menu; tap '^All settings$'; shot 19-phone-settings 2
back

adb shell wm size reset
adb shell wm density reset

log "crash check"
if adb logcat -d -b crash | grep -q "$PKG"; then
  adb logcat -d -b crash > "$OUT/crash.txt"
  log "CRASH found, see crash.txt"
  exit 1
fi
log "done"
