# Installing TrailGauge on an Android tablet (for testing)

The same APK runs on phones and tablets. No computer is needed.

## Before you start

- The tablet needs to be a **64-bit ARM** Android tablet running Android 8 or newer. That covers
  Samsung Galaxy Tab, Google Pixel Tablet, Lenovo, and nearly every current tablet. Very old
  32-bit tablets will say "App not installed".
- It needs a web browser and about 100 MB of free space.

## Install

1. On the tablet, open this link in Chrome (or Samsung Internet):
   **https://github.com/SethDonohue/trail-gauge/releases/latest/download/trailgauge.apk**
2. If the browser warns that this type of file can harm your device, tap **Download anyway**.
   The file is the app's installer and is not on the Play Store, so Android warns about every
   such file.
3. When it finishes, tap **Open** (or open the **Downloads** app and tap `trailgauge.apk`).
4. Android asks to allow installs from this source. Tap **Settings**, switch on
   **Allow from this source**, press back, then tap **Install**.
5. If Google Play Protect shows "Unsafe app blocked" or "Scan app", tap **More details** >
   **Install anyway**. This appears because the app is signed with a developer key.
6. Tap **Open**.

## First launch

- Allow **Location** when asked ("While using the app" is enough). It is used for speed (to lock
  settings while driving), GPS elevation and the compass correction.
- On a tablet the app starts in **auto-rotate** and shows **all six gauges** on one screen.
  Both can be changed in **Settings** (top right): *Screen rotation* and *Group view shows*.
- Temperature and battery gauges show **demo data** until a hub is connected. The tilt, compass
  and altitude gauges use the tablet's own sensors.

## Things worth testing

| Test | What to look for |
| --- | --- |
| Rotate the tablet | Gauges rearrange to fill the screen: 3 x 2 in landscape, 2 x 3 in portrait |
| Split screen beside a map app (Gaia GPS, onX Offroad, etc.) | The gauges resize to the window they have; nothing is cut off |
| Double-tap a gauge | It opens full screen; double-tap again to go back |
| Hold **ZERO** (top right) with the tablet in its mount on level ground | Roll and pitch read 0 |
| Tilt the tablet | Roll and pitch follow, in the right direction |
| Turn the tablet slowly | Compass follows. If it is wrong, keep it away from magnets and metal |
| Altitude (outdoors, with a GPS fix) | A number appears within a few seconds; compare with a map or known elevation |
| Settings > Altitude source | Switch between Auto, Barometer and GPS and compare |
| Settings > Set current elevation | Only affects the barometer; enter a known elevation and the reading follows |

To use split screen: open TrailGauge, open the recent-apps view, tap the TrailGauge icon,
choose **Split screen**, then pick the map app for the other half. On Samsung tablets, the
edge panel or **Open in pop-up view** also works.

## Known limits

- **Altitude on tablets without a barometer** comes from GPS height (Settings > *Altitude
  source* is **Auto**). It needs a GPS fix, so it shows `--` indoors, and it is smoothed and
  slower than a barometer. The top bar shows "GPS ALT" when it is in use.
- The compass and tilt need a **rigid mount** away from magnets (magnetic phone/tablet mounts
  upset the compass).
- The app has not yet been tested on a physical tablet. Please report anything odd.
- If you installed a build from before 8 Nov 2026, tilt and compass read mirrored. Update, then
  hold **ZERO** again (the app clears the old calibration automatically).

## Updating

Open the same link again and install. It installs over the old version, and settings and
calibration are kept. The newest build is always at
https://github.com/SethDonohue/trail-gauge/releases/latest

## Troubleshooting

- **"App not installed":** the tablet is probably 32-bit, or low on storage. If you installed
  a build from somewhere else, uninstall it first.
- **Can't find the download:** open the **Downloads** or **My Files** app and tap `trailgauge.apk`.
- **No "Allow from this source" prompt:** go to Settings > Apps > Special access >
  Install unknown apps, choose your browser, and switch it on.
- **Gauges are grey with `--`:** that channel has no data (for example no GPS fix indoors).
