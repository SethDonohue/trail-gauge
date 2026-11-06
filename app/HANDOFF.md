# TrailGauge app: handoff

**Goal:** build an installable Android APK of the TrailGauge dashboard app for a Galaxy S24.

## Status (2026-10-23)

- App code complete (Expo SDK 58, React Native 0.88, Skia, Reanimated, BLE). See README.md.
- `tsc` clean; 13/13 unit tests pass; JS bundle builds.
- APK not built yet. Last blocker was `repo.reactnative.dev` not being allowed; the user has now added it.

## To finish

Preferred: the GitHub Actions workflow (`.github/workflows/android-apk.yml`) builds the APK on
every push to `app/` and attaches it to the run as the `trailgauge-apk` artifact.

Inside a Claude workspace instead: `bash scripts/build-apk.sh` from `app/` (20–40 min on 2 CPUs;
run it in the background), then send `android/app/build/outputs/apk/release/app-release.apk`.

## Workarounds in scripts/build-apk.sh (Claude workspace only; not needed in CI)

- npm: `registry.npmjs.org` only works through the proxy (`npm_config_noproxy=` etc.).
- Expo CLI: `EXPO_OFFLINE=1`, because `api.expo.dev` is blocked.
- No JDK 17 downloadable: `jvmToolchain(17)` is patched to 21 in node_modules, plus
  `kotlin.jvm.target.validation.mode=warning`.
- Maven Central returns 429 under load: retry loop with 150 s backoff (downloads are cached).
- arm64-v8a only, to cut build time.

## Domains the user has allowed

registry.npmjs.org, dl.google.com, maven.google.com, services.gradle.org, downloads.gradle.org,
plugins.gradle.org, plugins-artifacts.gradle.org, repo1.maven.org, repo.maven.apache.org,
www.jitpack.io, repo.reactnative.dev. (archive.ubuntu.com and github.com are not usable.)

## After install, check on the phone

- Tilt the phone nose-up: pitch should read positive. If not, Settings > Diagnostics > Flipped.
- Zero level on flat ground; set a known elevation.
