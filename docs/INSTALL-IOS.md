# Installing TrailGauge on an iPhone or iPad (with a Mac)

There is no App Store or TestFlight build yet. You build the app on your Mac and install it over
a cable. A free Apple ID is enough.

| | Free Apple ID | Apple Developer Program ($99/yr) |
| --- | --- | --- |
| Install on your own iPhone/iPad from a Mac | Yes | Yes |
| How long an install keeps working | 7 days, then re-run the install | 1 year |
| TestFlight (install without a cable), App Store | No | Yes |

Every change is also built for the iOS simulator on GitHub (workflow **iOS simulator**), and
screenshots of it on an iPhone and an iPad are on the `ci-screenshots-ios` branch. That proves
the app builds and starts on iOS before you spend time on the steps below.

## One-time setup (about an hour, mostly downloads)

1. **Xcode**: install it from the Mac App Store, open it once, accept the licence and let it
   install the iOS platform.
2. **Homebrew** (if you don't have it): follow https://brew.sh.
3. **Node and CocoaPods**: in Terminal run
   ```sh
   brew install node@22 cocoapods git
   ```
4. **Your Apple ID in Xcode**: Xcode > Settings > Accounts > **+** > Apple ID. This creates a
   free "Personal Team" used to sign the app.
5. **The iPhone/iPad**: connect it with a cable, unlock it and tap **Trust**. Then turn on
   Settings > Privacy & Security > **Developer Mode** and restart when asked.

## Build and install

```sh
git clone https://github.com/SethDonohue/trail-gauge.git
cd trail-gauge/app
npm ci
npx expo prebuild --platform ios --clean
npx expo run:ios --device --configuration Release
```

Pick your iPhone/iPad from the list. `Release` bundles everything into the app, so it runs on
its own, away from the Mac.

If it stops with a signing error, open `ios/TrailGauge.xcworkspace` in Xcode, select the
**TrailGauge** target > **Signing & Capabilities**, set **Team** to your Personal Team, pick
your device at the top of the window and press **Run** (the triangle).

The first time, iOS will not open the app until you trust yourself as a developer:
Settings > General > **VPN & Device Management** > your Apple ID > **Trust**.

## Every 7 days (free Apple ID) or after an update

```sh
cd trail-gauge
git pull
cd app && npm ci && npx expo run:ios --device --configuration Release
```

Settings and calibration are kept.

## First launch

Allow **Motion & Fitness**, **Location** ("While using the app") and **Bluetooth** when asked.
Then follow the same test checklist as for Android tablets:
[`INSTALL-ANDROID-TABLET.md`](INSTALL-ANDROID-TABLET.md#things-worth-testing). On an iPad,
drag a map app (Gaia GPS, onX Offroad) up from the Dock to use Split View.

## iOS differences

- The phone's screen stays on while the app is open, as on Android.
- The iPhone home indicator cannot be hidden.
- On iPad, Split View lets iOS decide the rotation, so the *Screen rotation* setting only applies
  in full screen.
- Every iPhone has a barometer; most iPads do too, and Auto altitude falls back to GPS when not.

## Troubleshooting

- **"Failed to register bundle identifier"**: the identifier is taken. In `app/app.json` change
  `ios.bundleIdentifier` (for example add your initials), then re-run the build commands.
- **"Untrusted Developer"**: see the trust step above.
- **"Developer Mode disabled"**: see setup step 5.
- **App stops opening after a week**: that is the free-account limit; re-run the install.
