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
| `.github/workflows/android-apk.yml` | Builds the installable APK on every change to `app/` |

## Status

| Part | Status |
| --- | --- |
| Specification | Rev B complete |
| Dashboard app | Code complete; typechecks; unit tests pass; works today with phone sensors and demo data |
| Hub hardware and firmware | Not started; the app already speaks the Rev B BLE protocol |

## Getting the app on a phone

1. Open the **Actions** tab, pick the latest **Android APK** run, and download **trailgauge-apk**
   from its Artifacts section. (To build on demand, choose **Run workflow**.)
2. Unzip it on the phone and open the `.apk`. Android asks to allow installs from that app once.

The APK is signed with a debug key: fine for your own phone, not for the Play Store.
