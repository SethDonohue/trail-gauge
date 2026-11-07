import React, { useEffect, useState } from 'react';
import { StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { engine } from './src/engine/engine';
import { loadSettings, settingsStore, type Orientation } from './src/engine/settings';
import { C } from './src/gauges/kit';
import { Dashboard } from './src/ui/Dashboard';
import { SettingsScreen } from './src/ui/SettingsScreen';

const LOCKS: Record<Exclude<Orientation, 'auto'>, ScreenOrientation.OrientationLock> = {
  landscape: ScreenOrientation.OrientationLock.LANDSCAPE,
  portrait: ScreenOrientation.OrientationLock.PORTRAIT,
};

function applyOrientation(o: Orientation) {
  const p = o === 'auto' ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(LOCKS[o]);
  p.catch(() => {});
}

export default function App() {
  useKeepAwake(); // the dashboard stays on while the app is in front
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const orientation = settingsStore.useSelect(s => s.orientation);

  // Android ignores this lock in split-screen and on large screens from Android 16, which is
  // what lets the dashboard sit beside a map app; the layout adapts to any window shape.
  useEffect(() => {
    if (ready) applyOrientation(orientation);
  }, [ready, orientation]);

  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    loadSettings().finally(() => {
      engine.start();
      setReady(true);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar hidden />
        {ready ? (
          <>
            <Dashboard onOpenSettings={() => setSettingsOpen(true)} />
            <SettingsScreen visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: C.bg }} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
