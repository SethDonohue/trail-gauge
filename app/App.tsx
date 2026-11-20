import React, { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MOVE_LOCK_START, stepMoveLock } from './src/core/moveLock';
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

// Night mode dims the screen's brightness (the backlight), not the colours: a dark veil would
// lower the contrast of every label, while a dimmer backlight keeps the same contrast ratios.
// Android changes only this app's window; leaving night mode hands control back to the system.
function useNightBrightness() {
  const night = statusStore.useSelect(s => s.night);
  const pct = settingsStore.useSelect(s => s.nightDimPct);
  const saved = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (night && pct > 0) {
          const base = Platform.OS === 'android'
            ? await Brightness.getSystemBrightnessAsync()
            : (saved.current ??= await Brightness.getBrightnessAsync());
          if (!cancelled) await Brightness.setBrightnessAsync(Math.max(0.02, base * (1 - pct / 100)));
        } else if (Platform.OS === 'android') {
          await Brightness.restoreSystemBrightnessAsync();
        } else if (saved.current !== null) {
          await Brightness.setBrightnessAsync(saved.current);
          saved.current = null;
        }
      } catch {
        // Brightness unavailable: night mode just has no effect.
      }
    })();
    return () => { cancelled = true; };
  }, [night, pct]);
}

// The orientation the screen is in now, as a lock that keeps it there.
const HOLD: Partial<Record<ScreenOrientation.Orientation, ScreenOrientation.OrientationLock>> = {
  [ScreenOrientation.Orientation.PORTRAIT_UP]: ScreenOrientation.OrientationLock.PORTRAIT_UP,
  [ScreenOrientation.Orientation.PORTRAIT_DOWN]: ScreenOrientation.OrientationLock.PORTRAIT_DOWN,
  [ScreenOrientation.Orientation.LANDSCAPE_LEFT]: ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
  [ScreenOrientation.Orientation.LANDSCAPE_RIGHT]: ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
};

// Lock rotation while moving: true while the screen orientation should be held (see moveLock.ts).
// Checks GPS speed once a second; gestures are never affected.
function useRotationHold(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setHeld(false);
      statusStore.set({ rotationHeld: false });
      return;
    }
    let state = MOVE_LOCK_START;
    const id = setInterval(() => {
      state = stepMoveLock(state, statusStore.get().speedMps, Date.now());
      setHeld(state.locked);
      if (statusStore.get().rotationHeld !== state.locked) statusStore.set({ rotationHeld: state.locked });
    }, 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return held;
}

type Screen = 'settings' | 'quick' | 'tips' | 'guide' | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>(null);
  const orientation = settingsStore.useSelect(s => s.orientation);
  const keepOn = settingsStore.useSelect(s => s.keepScreenOn);
  const holdWhileMoving = settingsStore.useSelect(s => s.lockRotationWhileMoving);
  // Only Auto rotates, so only Auto needs holding.
  const held = useRotationHold(ready && holdWhileMoving && orientation === 'auto');
  useNightBrightness();

  // Android ignores this lock in split-screen and on large screens from Android 16, which is
  // what lets the dashboard sit beside a map app; the layout adapts to any window shape.
  useEffect(() => {
    if (!ready) return;
    if (!held) {
      applyOrientation(orientation);
      return;
    }
    ScreenOrientation.getOrientationAsync()
      .then(o => {
        const lock = HOLD[o];
        return lock !== undefined ? ScreenOrientation.lockAsync(lock) : undefined;
      })
      .catch(() => {});
  }, [ready, orientation, held]);

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
