import React, { useEffect, useState } from 'react';
import { StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { engine } from './src/engine/engine';
import { loadSettings } from './src/engine/settings';
import { C } from './src/gauges/kit';
import { Dashboard } from './src/ui/Dashboard';
import { SettingsScreen } from './src/ui/SettingsScreen';

export default function App() {
  useKeepAwake(); // the dashboard stays on while the app is in front
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
