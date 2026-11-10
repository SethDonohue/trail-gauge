import React, { useEffect, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { engine } from './src/engine/engine';
import { statusStore } from './src/engine/live';
import { loadSettings, settingsStore, type Orientation } from './src/engine/settings';
import { C } from './src/gauges/kit';
import { Dashboard } from './src/ui/Dashboard';
import { QuickSettings } from './src/ui/QuickSettings';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { SetupGuide } from './src/ui/SetupGuide';
import { TipsScreen } from './src/ui/TipsScreen';

const LOCKS: Record<Exclude<Orientation, 'auto'>, ScreenOrientation.OrientationLock> = {
  landscape: ScreenOrientation.OrientationLock.LANDSCAPE,
  portrait: ScreenOrientation.OrientationLock.PORTRAIT,
};
const KEEP_AWAKE_TAG = 'trailgauge';

function applyOrientation(o: Orientation) {
  const p = o === 'auto' ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(LOCKS[o]);
  p.catch(() => {});
}

// Night mode: a black veil over everything. It never takes touches.
function NightDim() {
  const night = statusStore.useSelect(s => s.night);
  const pct = settingsStore.useSelect(s => s.nightDimPct);
  if (!night || pct <= 0) return null;
  return (
    <View pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000', opacity: pct / 100 }} />
  );
}

type Screen = 'settings' | 'quick' | 'tips' | 'guide' | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>(null);
  const orientation = settingsStore.useSelect(s => s.orientation);
  const keepOn = settingsStore.useSelect(s => s.keepScreenOn);

  // Android ignores this lock in split-screen and on large screens from Android 16, which is
  // what lets the dashboard sit beside a map app; the layout adapts to any window shape.
  useEffect(() => {
    if (ready) applyOrientation(orientation);
  }, [ready, orientation]);

  useEffect(() => {
    if (keepOn) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  }, [keepOn]);

  useEffect(() => {
    // Android only: hide the navigation bar. iOS has none (the home indicator stays).
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    loadSettings().finally(() => {
      engine.start();
      setReady(true);
      if (!settingsStore.get().setupDone) setScreen('guide');
    });
  }, []);

  const close = () => setScreen(null);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar hidden />
        {ready ? (
          <>
            <Dashboard
              onOpenSettings={() => setScreen('settings')}
              onOpenQuick={() => setScreen('quick')}
              onOpenTips={() => setScreen('tips')}
              onOpenGuide={() => setScreen('guide')}
            />
            <NightDim />
            <QuickSettings visible={screen === 'quick'} onClose={close}
              onOpenSettings={() => setScreen('settings')} onOpenTips={() => setScreen('tips')} />
            <SettingsScreen visible={screen === 'settings'} onClose={close}
              onOpenGuide={() => setScreen('guide')} onOpenTips={() => setScreen('tips')} />
            <TipsScreen visible={screen === 'tips'} onClose={close} />
            <SetupGuide visible={screen === 'guide'} onClose={close} />
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: C.bg }} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
