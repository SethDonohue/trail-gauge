#!/usr/bin/env bash
# Installs the app's libraries at versions matched to the current Expo SDK.
set -euo pipefail
cd "$(dirname "$0")/.."
npm install
npx expo install \
  expo-sensors expo-location expo-keep-awake expo-navigation-bar \
  @react-native-async-storage/async-storage \
  react-native-ble-plx react-native-gesture-handler react-native-reanimated react-native-worklets \
  @shopify/react-native-skia react-native-safe-area-context
npx expo install --fix
npx tsc --noEmit
npm test
