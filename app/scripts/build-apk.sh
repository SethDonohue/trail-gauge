#!/usr/bin/env bash
# Builds android/app/build/outputs/apk/release/app-release.apk inside a Claude workspace.
# Encodes every workaround found so far; see HANDOFF.md.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

# npm registry is on the sandbox's no-proxy list but only reachable through the proxy.
export npm_config_noproxy= NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1
# Expo CLI's version lookups (api.expo.dev) are blocked; use its bundled version table.
export EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production
export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk

echo "== npm install"; npm install --no-audit --no-fund > /tmp/npm.log 2>&1 || { tail -20 /tmp/npm.log; exit 1; }
echo "== typecheck + tests"; npx tsc --noEmit && npm test > /tmp/test.log 2>&1 || { tail -20 /tmp/test.log; exit 1; }

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "== Android command-line tools"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  zip=$(curl -s https://dl.google.com/android/repository/repository2-3.xml | grep -oE 'commandlinetools-linux-[0-9]+_latest\.zip' | sort -u | tail -1)
  curl -sSLo /tmp/clt.zip "https://dl.google.com/android/repository/$zip"
  rm -rf /tmp/clt && unzip -q /tmp/clt.zip -d /tmp/clt && mv /tmp/clt/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
fi
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1

# No JDK 17 can be downloaded here (Adoptium/Azul/foojay blocked), so point the
# Java 17 toolchain pins at the installed JDK 21. Not needed on a normal machine.
echo "== toolchain patch"
grep -rl "jvmToolchain(17)" \
  node_modules/@react-native/gradle-plugin node_modules/expo-modules-core/android \
  --include=*.kts --include=*.gradle --include=*.kt 2>/dev/null | xargs -r sed -i 's/jvmToolchain(17)/jvmToolchain(21)/g'

echo "== prebuild"
npx expo prebuild --platform android --clean --no-install > /tmp/prebuild.log 2>&1 || { tail -20 /tmp/prebuild.log; exit 1; }
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/; s/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g/' gradle.properties
printf '\nkotlin.jvm.target.validation.mode=warning\n' >> gradle.properties

echo "== gradle (retries on Maven Central rate limiting)"
rc=1
for i in $(seq 1 15); do
  ./gradlew assembleRelease --no-daemon --console=plain -Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false > /tmp/gradle.log 2>&1
  rc=$?
  [ $rc -eq 0 ] && break
  if grep -qE "status code 429|Too Many Requests" /tmp/gradle.log; then echo "rate-limited, retry $i"; sleep 150; else break; fi
done
if [ $rc -ne 0 ]; then grep -A12 "What went wrong" /tmp/gradle.log | head -25; exit $rc; fi
ls -la "$ROOT/android/app/build/outputs/apk/release/"
