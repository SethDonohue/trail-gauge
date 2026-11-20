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

## Next

- [ ] **Check the Tilt gauge looks on a phone** (Settings > Display > Tilt gauge look): Two dials
  (default), One dial, Horizon, Bubble. Check that each moves the right way: right side down tilts
  the rear view clockwise; nose up lifts the side view's nose; the bubble moves to the high side.
- [ ] Review the CI screenshots after each layout change (`ci-screenshots` branch).

- [ ] **More tilt smoothing for vibration** (roll and pitch jump with vehicle vibration). Today
  Settings > Tilt smoothing is Low/Medium/High = 0.06/0.15/0.4 s (an exponential average of the
  phone's own gyro-fused gravity). Plan:
  - Replace it with a time slider, about 0.1 s up to 5 s (the user asked for up to 5 s), shown in
    plain words ("averages the last 2 s").
  - Use a moving average over that window, plus a median step that throws out single bump
    spikes, so a 2 s setting really means "the last 2 seconds" and settles fully in that time.
  - Lag trade-off to state in the hint: with 5 s the number shows where you were up to 5 s ago
    (half a change after 2.5 s), which matters on a sidehill.
  - So the CAUTION/DANGER colours and alarms keep using a fast reading (about 0.5 s) whatever the
    display smoothing is: heavy smoothing must never delay a warning.
  - Optional: follow fast when the angle changes a lot and stays changed (a real slope), smooth
    heavily when it only jitters around one value (vibration).
  - Check on the phone in a running vehicle: idle, gravel road, and a slow sidehill.

## Later

- [ ] TestFlight builds from CI (needs the $99/yr Apple Developer Program and signing secrets).
- [ ] Hub hardware and firmware (spec Rev B).

## Done

- [x] Tilt gauge looks (0.5.0): Two dials (default), One dial with both axes, Horizon, Bubble.
  Same information in each; scale ticks red past the warning angle. Research behind them: Jalopnik's
  inclinometer roundup and SKYbrary on aircraft attitude displays (moving-vehicle vs moving-horizon).
- [x] Speed gauge (GPS) with one-tap mph/km/h (0.4.1); compass fix for a phone stood upright (0.4.2).

- [x] Rebuilt 0.3.0's features as 0.4.0 (setup guide, tips, pages, alerts and mute, quick settings,
      night mode, cabin/humidity/fog, outside correction, compass calibration, frame V3, and more).
- [x] App icon (gauge arc around a mountain on a tilted horizon): `app/assets/`.
- [x] iOS build: config, permissions, iPad Split View, simulator CI, Mac install guide.
- [x] Fixed the tilt/compass sign bug (gravity vector was read upside down).
- [x] Altitude source setting with GPS fallback; tablet and split-screen layouts.
