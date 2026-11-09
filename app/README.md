# TrailGauge app

Android dashboard for the TrailGauge off-road telemetry hub (spec Rev B). Landscape, dark,
six gauges: tilt (pitch and roll), compass, altitude, coolant, outside temperature, battery.

## Data sources

Chosen in Settings, independently for two groups:

| Group | Phone | Hub | Demo |
| --- | --- | --- | --- |
| Tilt, compass, altitude | Phone's gravity, magnetometer and barometer | BLE TelemetryFrameV2 | Synthetic |
| Coolant, outside temp, battery | — | BLE TelemetryFrameV2 | Synthetic |

Default: phone sensors for motion, demo for temperatures and battery.

## Using phone sensors

1. Mount the phone rigidly. Avoid magnetic mounts: they ruin the compass.
2. Park on level ground and press and hold **ZERO** (top right, next to Settings) until it says
   ZEROED, or tap **Zero now** in Settings. This also learns which way the phone
   faces; the back of the phone is taken as forward.
3. Enter a known elevation (map, trail sign) under **Set current elevation**.
4. The compass switches from magnetic (M) to true north (T) once GPS has a fix.

If tilting the nose up shows nose-down, set **Tilt reads backwards?** to Flipped (Diagnostics).

## Gestures

- Group view: double-tap a gauge to enlarge it.
- Single view: swipe left or right through all six gauges; double-tap to go back.
- Single taps do nothing, so bumps on the trail cannot switch views.

Settings lock above 8 km/h (needs location permission).

## Tablets and split screen

The layout adapts to any window size, so the same app works on phones, tablets, and in
split-screen beside a mapping app (Gaia GPS, onX Offroad, and so on).

- Group view picks the grid that makes the gauges largest: 3 x 2 on a landscape tablet,
  2 x 3 in portrait or half-width split, a single row in a short top/bottom split.
- On a tablet's first run the app starts in auto-rotate and shows all six gauges together.
  Both are changeable in Settings (*Screen rotation*, *Group view shows*).
- Phones keep the landscape lock and three chosen gauges by default.
- Install and test steps for tablets: [`../docs/INSTALL-ANDROID-TABLET.md`](../docs/INSTALL-ANDROID-TABLET.md).
- Layouts are checked on an emulated tablet in CI (workflow *Tablet screenshots*); the images are
  on the `ci-screenshots` branch.

## Altitude source

Settings > *Altitude source* (phone sensors only):

- **Auto** (default): barometer if the device has one, otherwise GPS height.
- **Barometer**: smooth and instant, but needs *Set current elevation* (or GPS) to stay accurate as
  the weather changes.
- **GPS**: no drift, but slower and noisier. The app smooths it, drops fixes the receiver
  reports as poor (worse than 40 m vertical accuracy), and greys the gauge out if none arrive.

The top bar shows "GPS ALT" when GPS is driving the altitude gauge.

## iOS

The same code runs on iOS. CI builds it for the simulator and screenshots it on an iPhone and an
iPad (`ci-screenshots-ios` branch). To put it on a real iPhone or iPad you build it on a Mac with
a free Apple ID: [`../docs/INSTALL-IOS.md`](../docs/INSTALL-IOS.md). iOS identifier:
`com.sethdonohue.trailgauge`; iPad Split View is enabled.

Note: `expo-screen-orientation` is pinned to 58.0.3. Version 58.0.4 (Nov 2026) references an
`ExpoRootViewController` that no published `expo-modules-core` provides, so iOS fails to compile.
Unpin when a newer Expo 58 release fixes it.

## Sensor sign convention

expo-sensors reports `accelerationIncludingGravity` pointing *down* on both Android and iOS
(flat, screen up: z = -9.8). `upFromDeviceMotion` in `src/core/orientation.ts` negates it; unit
tests pin this down. Builds before this fix read tilt and the compass mirrored, so saved
"Zero level" calibrations from them are cleared once on update.

## First run

The app asks for location (speed, declination, GPS elevation) and Bluetooth (hub) permissions.
With no hub, tilt, compass and altitude come from the phone, and the temperature and battery
gauges show demo data until a hub is connected and selected in Settings.

## Build

Easiest: push to `main`. GitHub Actions builds the APK and publishes it as a release (see the
repository README). To build locally:

```sh
./scripts/setup.sh             # install libraries, typecheck, unit tests
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Requires JDK 17 and the Android SDK. The release build is signed with the debug key, which is
fine for sideloading but not for the Play Store.

## Hub protocol (for the firmware)

- Service `a20e0001-240c-4924-aaba-7c4e08e605de`
- Telemetry (notify, 25 Hz) `a20e0002-…`: 20-byte TelemetryFrameV2, little-endian (spec §7)
- Control (write with response) `a20e0004-…`: opcode byte + optional uint32 LE
  - `0x01` zero level · `0x02` / `0x03` magnetometer calibration start / stop
  - `0x04` set QNH, payload in pascals; sent on every connect and when elevation is set
- The app adds magnetic declination to the hub's magnetic heading.

Golden vector, decoded by `npm test`:
`02 2A D2 04 0C FE 9F 8C 40 E2 01 00 22 24 BB FE E8 35 20 00`

## Layout

- `src/core` — pure logic (frame parsing, orientation maths, filters, altitude, formatting); unit-tested with `node --test`
- `src/engine` — data sources, settings, live values (Reanimated shared values) and staleness
- `src/gauges` — Skia gauges drawn on the UI thread
- `src/ui` — dashboard and settings screens
