# To do

## Needs you (a real device)

- [ ] **Test on a physical phone and tablet.** Install the latest APK (see the README), then work
      through the checklist in [`docs/INSTALL-ANDROID-TABLET.md`](docs/INSTALL-ANDROID-TABLET.md#things-worth-testing).
      Most important, because emulators cannot prove them:
      - [ ] Nose up shows positive pitch; right side down shows positive roll.
      - [ ] Compass reads correctly in all four directions (not mirrored east/west).
      - [ ] Altitude: barometer vs GPS against a known elevation.
      - [ ] Split screen beside Gaia GPS / onX Offroad.
- [ ] **Install on an iPhone/iPad from your Mac** ([`docs/INSTALL-IOS.md`](docs/INSTALL-IOS.md))
      and run the same checks.

## Check 0.4.0 against your 0.3.0

- [ ] Install 0.4.0 (when published) and compare with 0.3.0. Anything missing or different, list it
      here or tell Claude: [`docs/v0.3.0-rebuild.md`](docs/v0.3.0-rebuild.md) lists the values that
      had to be chosen.

## Later

- [ ] TestFlight builds from CI (needs the $99/yr Apple Developer Program and signing secrets).
- [ ] Hub hardware and firmware (spec Rev B).

## Done

- [x] Rebuilt 0.3.0's features as 0.4.0 (setup guide, tips, pages, alerts and mute, quick settings,
      night mode, cabin/humidity/fog, outside correction, compass calibration, frame V3, and more).
- [x] App icon (gauge arc around a mountain on a tilted horizon): `app/assets/`.
- [x] iOS build: config, permissions, iPad Split View, simulator CI, Mac install guide.
- [x] Fixed the tilt/compass sign bug (gravity vector was read upside down).
- [x] Altitude source setting with GPS fallback; tablet and split-screen layouts.
