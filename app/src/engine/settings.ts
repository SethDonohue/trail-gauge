import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions } from 'react-native';
import type { Units } from '../core/format';
import type { Mount } from '../core/orientation';
import { STD_QNH_HPA, type AltitudeSourcePref } from '../core/altitude';
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
  altitudeSource: AltitudeSourcePref;
  qnhHpa: number;
  declinationDeg: number | null;
  pitchWarnDeg: number;
  rollWarnDeg: number;
  coolantWarnC: number;
  gravitySign: 1 | -1; // diagnostic: flips the phone's gravity convention if tilt reads backwards
  hubDeviceId: string | null;
  sensorFrame: number; // bumps when the sensor convention changes; older zero calibrations are dropped
}

const SENSOR_FRAME = 2;

export const DEFAULT_SETTINGS: Settings = {
  motionSource: 'phone',
  engineSource: 'demo',
  units: 'imperial',
  groupGauges: ['INCLINOMETER', 'COMPASS', 'ALTIMETER'],
  groupShowsAll: false,
  orientation: 'landscape',
  mount: null,
  altitudeSource: 'auto',
  qnhHpa: STD_QNH_HPA,
  declinationDeg: null,
  pitchWarnDeg: 30,
  rollWarnDeg: 25,
  coolantWarnC: 105,
  gravitySign: 1,
  hubDeviceId: null,
  sensorFrame: SENSOR_FRAME,
};

const KEY = 'trailgauge.settings.v1';

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

export async function loadSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      if (saved.sensorFrame !== SENSOR_FRAME) {
        // Saved by a build that read gravity with the wrong sign: re-zero needed.
        saved.mount = null;
        saved.gravitySign = 1;
        saved.sensorFrame = SENSOR_FRAME;
      }
      settingsStore.set({ ...DEFAULT_SETTINGS, ...saved });
      if (saved.mount === null) AsyncStorage.setItem(KEY, JSON.stringify(settingsStore.get())).catch(() => {});
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
