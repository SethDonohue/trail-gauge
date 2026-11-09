# TrailGauge

Off-road telemetry for a 12 V vehicle: a dash-mounted hub with remote sensor nodes, and an
Android dashboard app that shows tilt, compass heading, altitude, coolant and outside
temperature, and battery voltage.

![System architecture](docs/spec/architecture.svg)

## Repository

| Path | What it is |
| --- | --- |
| [`docs/spec/trailgauge-spec-rev-b.md`](docs/spec/trailgauge-spec-rev-b.md) | Current technical specification (Rev B): requirements, power, sensors, CAN/LoRa network, firmware, BLE protocol, app, test plan |
| [`docs/spec/trailgauge-spec-rev-a.txt`](docs/spec/trailgauge-spec-rev-a.txt) | Original concept spec (Rev A), kept for reference |
| [`app/`](app/) | Android dashboard app (Expo / React Native, TypeScript). See [`app/README.md`](app/README.md) |
| `.github/workflows/android-apk.yml` | Builds the APK on every change to `app/` and publishes it as a release |
| `.github/workflows/tablet-screens.yml` | Runs the app on an Android tablet emulator at tablet, split-screen and phone sizes; screenshots on the `ci-screenshots` branch |
| `.github/workflows/ios-simulator.yml` | Builds the app for iOS and runs it on iPhone and iPad simulators; screenshots on the `ci-screenshots-ios` branch |
| [`docs/INSTALL-ANDROID-TABLET.md`](docs/INSTALL-ANDROID-TABLET.md) | Installing on an Android tablet, plus a test checklist |
| [`docs/INSTALL-IOS.md`](docs/INSTALL-IOS.md) | Installing on an iPhone or iPad from a Mac (free Apple ID) |
| [`TODO.md`](TODO.md) | Open work |

## Status

| Part | Status |
| --- | --- |
| Specification | Rev B complete |
| Dashboard app (Android) | Code complete; typechecks; unit tests pass; APK builds in CI; layouts verified on an emulated tablet, split-screen and phone. Not yet tested on a physical phone or tablet |
| iOS app | Builds and starts on iPhone and iPad simulators in CI. Install on a device from a Mac: [`docs/INSTALL-IOS.md`](docs/INSTALL-IOS.md). No TestFlight/App Store build (needs the paid Apple program) |
| Hub hardware and firmware | Not started; the app already speaks the Rev B BLE protocol |

## Getting the app on a phone

On the phone, open
**[the latest APK](https://github.com/SethDonohue/trail-gauge/releases/latest/download/trailgauge.apk)**
and install it. Android asks once to allow installs from your browser or file manager.
Every build is listed on the [Releases](https://github.com/SethDonohue/trail-gauge/releases) page.
Tablet? Same APK, with tablet-specific steps and a test checklist in
[`docs/INSTALL-ANDROID-TABLET.md`](docs/INSTALL-ANDROID-TABLET.md).

- A new release appears automatically about 15 minutes after any change to `app/` is pushed to
  `main`. To build without a code change: **Actions** > **Android APK** > **Run workflow**.
- Each build installs over the previous one; settings and calibration are kept.
- The APK targets 64-bit ARM phones (every current Android phone, including the Galaxy S24).
- It is signed with a debug key: fine for your own phone, not for the Play Store.
