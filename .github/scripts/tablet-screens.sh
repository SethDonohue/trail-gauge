#!/usr/bin/env bash
# Installs the app on the running emulator (Pixel Tablet profile) and screenshots it at
# tablet, split-screen and phone window sizes. Usage: tablet-screens.sh <apk> <out-dir>
set -uo pipefail
APK=$1
OUT=$2
PKG=com.trailgauge.app
mkdir -p "$OUT"

log() { echo "== $*"; }
shot() { sleep "${2:-5}"; adb exec-out screencap -p > "$OUT/$1.png" && log "saved $1.png"; }
launch() {
  adb shell am force-stop "$PKG"
  adb shell am start -W -n "$PKG/.MainActivity" > /dev/null
  sleep 8
}
size() { # physical px of the current display
  adb shell wm size | tail -1 | grep -oE '[0-9]+x[0-9]+'
}
dens() { adb shell wm density | tail -1 | grep -oE '[0-9]+$'; }
dp() { echo $(( $1 * $(dens) / 160 )); }

# Taps the SETTINGS label, which sits 12 dp from the right edge and 8 dp from the top.
open_settings() {
  local wh w
  wh=$(size); w=${wh%x*}
  adb shell input tap $(( w - $(dp 40) )) "$(dp 16)"
  sleep 3
}
close_settings() { adb shell input keyevent KEYCODE_BACK; sleep 2; }

# Two taps ~150 ms apart, on the first gauge tile.
double_tap_first_tile() {
  local wh w h x y
  wh=$(size); w=${wh%x*}; h=${wh#*x}
  x=$(( $(dp 12) + (w - $(dp 24)) / 6 )); y=$(( $(dp 36) + (h - $(dp 48)) / 4 ))
  adb shell "input tap $x $y & sleep 0.15; input tap $x $y"
  sleep 3
}

# Give the phone-sensor gauges something to show: a slight tilt.
adb emu sensor set acceleration 1.2:9.6:1.8 > /dev/null 2>&1 || true

log "install"
adb install -r -g "$APK" > /dev/null
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
NATIVE_SIZE=$(size)
NATIVE_DENS=$(dens)
log "display $NATIVE_SIZE @ $NATIVE_DENS dpi"

log "tablet, landscape, first run (tablet defaults: auto-rotate, all six gauges)"
launch
shot 01-tablet-landscape-all6

log "tablet, portrait"
adb shell settings put system user_rotation 1
shot 02-tablet-portrait-all6 6
adb shell settings put system user_rotation 0
sleep 4

log "settings on tablet"
open_settings
shot 03-tablet-settings 2
close_settings

log "single gauge view (double tap)"
double_tap_first_tile
shot 04-tablet-single-view 2
double_tap_first_tile

W=${NATIVE_SIZE%x*}; H=${NATIVE_SIZE#*x}

log "split-screen sizes: the app window shrinks while a map app takes the rest"
adb shell wm size "$(( W / 2 ))x$H"
shot 05-split-half-landscape 6
open_settings
shot 06-split-half-settings 2
close_settings
adb shell wm size "$(( W / 3 ))x$H"
shot 07-split-third-landscape 6
adb shell wm size "${W}x$(( H / 2 ))"
shot 08-split-half-top-bottom 6
adb shell wm size reset
sleep 3

log "phone (Galaxy S24-like), first run: landscape lock, three gauges"
adb shell pm clear "$PKG" > /dev/null
adb shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION || true
adb shell wm size 2340x1080
adb shell wm density 420
launch
shot 09-phone-landscape-3
open_settings
shot 10-phone-settings 2
close_settings

adb shell wm size reset
adb shell wm density reset

log "crash check"
if adb logcat -d -b crash | grep -q "$PKG"; then
  adb logcat -d -b crash > "$OUT/crash.txt"
  log "CRASH found, see crash.txt"
  exit 1
fi
log "done"
