import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions } from 'react-native';
import type { Units } from '../core/format';
import type { Mount } from '../core/orientation';
import { STD_QNH_HPA } from '../core/altitude';
import type { GaugeId } from '../gauges/registry';
import { createStore } from './observable';

export type MotionSource = 'phone' | 'hub' | 'demo';
export type EngineSource = 'hub' | 'demo' | 'off';
export type Orientation = 'landscape' | 'portrait' | 'auto';

export interface Settings {
  motionSource: MotionSource;
  engineSource: EngineSource;
  units: Units;
  groupGauges: [GaugeId, GaugeId, GaugeId];
  groupShowsAll: boolean; // all six gauges in group view (for tablets)
  orientation: Orientation;
  mount: Mount | null; // phone mounting rotation from "Zero level"
  qnhHpa: number;
  declinationDeg: number | null;
  pitchWarnDeg: number;
  rollWarnDeg: number;
  coolantWarnC: number;
  gravitySign: 1 | -1; // diagnostic: flips the phone's gravity convention if tilt reads backwards
  hubDeviceId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  motionSource: 'phone',
  engineSource: 'demo',
  units: 'imperial',
  groupGauges: ['INCLINOMETER', 'COMPASS', 'ALTIMETER'],
  groupShowsAll: false,
  orientation: 'landscape',
  mount: null,
  qnhHpa: STD_QNH_HPA,
  declinationDeg: null,
  pitchWarnDeg: 30,
  rollWarnDeg: 25,
  coolantWarnC: 105,
  gravitySign: 1,
  hubDeviceId: null,
};

const KEY = 'trailgauge.settings.v1';

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

export async function loadSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      settingsStore.set({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } else {
      // First run on a tablet: follow the device's rotation and show all six gauges.
      const { width, height } = Dimensions.get('screen');
      if (Math.min(width, height) >= 600) settingsStore.set({ orientation: 'auto', groupShowsAll: true });
    }
  } catch {
    // Corrupt or missing storage: keep defaults.
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set(patch);
  AsyncStorage.setItem(KEY, JSON.stringify(settingsStore.get())).catch(() => {});
}
