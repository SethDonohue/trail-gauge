import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions } from 'react-native';
import type { Units } from '../core/format';
import type { Mount, Vec3 } from '../core/orientation';
import { STD_QNH_HPA, type AltitudeSourcePref } from '../core/altitude';
import type { AlertId } from '../core/alerts';
import { ALERT_IDS } from '../core/alerts';
import type { DeclinationMode, NorthRef } from '../core/heading';
import type { NightMode } from '../core/night';
import type { OutsideMemory } from '../core/outside';
import { DEFAULT_GAUGE_COLOR, isHexColor } from '../core/colors';
import { GAUGE_REGISTRY, type GaugeId } from '../gauges/registry';
import { createStore } from './observable';

export type MotionSource = 'phone' | 'hub' | 'demo';
export type EngineSource = 'hub' | 'demo' | 'off';
export type Orientation = 'landscape' | 'portrait' | 'auto';
export type TiltSmoothing = 'low' | 'medium' | 'high';
export type VehicleBus = 'auto' | 'none';

export const TILT_SMOOTHING_TAU_S: Record<TiltSmoothing, number> = { low: 0.06, medium: 0.15, high: 0.4 };
export const TILT_UPDATE_OPTIONS_MS = [100, 250, 500, 1000] as const;
export const DEFAULT_TILT_UPDATE_MS = 250;
export const SENSOR_RATES_HZ = [25, 50, 100] as const;
export const LOCKOUT_KMH = 8;
export const LOCKOUT_MPS = LOCKOUT_KMH / 3.6;

export interface Settings {
  // Data
  motionSource: MotionSource;
  engineSource: EngineSource;
  vehicleBus: VehicleBus; // 'none': the vehicle has no CAN/OBD-II, so a CAN error is not a fault
  hubDeviceId: string | null;
  // Dashboard
  units: Units;
  groupGauges: [GaugeId, GaugeId, GaugeId]; // the first page
  groupShowsAll: boolean; // every gauge on one screen (tablets)
  orientation: Orientation;
  keepScreenOn: boolean;
  lockViewWhileMoving: boolean; // above 8 km/h, double-tap and swipes do nothing
  viewLocked: boolean; // locked by hand from quick settings
  gaugeColor: string;
  nightMode: NightMode;
  nightDimPct: number;
  // Alerts
  muted: boolean; // MUTE on the dashboard: silences everything
  mutedAlerts: AlertId[]; // speaker buttons on the gauges
  alertSound: boolean;
  alertVibrate: boolean;
  pitchWarnDeg: number;
  rollWarnDeg: number;
  coolantWarnC: number;
  batteryLowV: number;
  iceRiskC: number;
  cabinWarnC: number;
  fogWarnings: boolean;
  // Calibration
  mount: Mount | null; // phone mounting rotation from "Zero level"
  gravitySign: 1 | -1; // diagnostic: flips the phone's gravity convention if tilt reads backwards
  magCal: Vec3 | null; // phone hard-iron offset, µT
  northRef: NorthRef;
  declinationMode: DeclinationMode;
  declinationDeg: number | null; // learned from GPS
  manualDeclinationDeg: number;
  headingOffsetDeg: number;
  altitudeSource: AltitudeSourcePref;
  qnhHpa: number;
  altitudeOffsetM: number;
  outsideTempCorrection: boolean;
  // Advanced
  showAdvanced: boolean;
  tiltSmoothing: TiltSmoothing;
  tiltUpdateMs: number;
  sensorRateHz: number;
  // Housekeeping
  setupDone: boolean;
  sensorFrame: number; // bumps when the sensor convention changes; older zero calibrations are dropped
}

const SENSOR_FRAME = 2;

export const DEFAULT_SETTINGS: Settings = {
  motionSource: 'phone',
  engineSource: 'demo',
  vehicleBus: 'auto',
  hubDeviceId: null,
  units: 'imperial',
  groupGauges: ['INCLINOMETER', 'COMPASS', 'ALTIMETER'],
  groupShowsAll: false,
  orientation: 'auto',
  keepScreenOn: true,
  lockViewWhileMoving: true,
  viewLocked: false,
  gaugeColor: DEFAULT_GAUGE_COLOR,
  nightMode: 'auto',
  nightDimPct: 40,
  muted: false,
  mutedAlerts: [],
  alertSound: true,
  alertVibrate: true,
  pitchWarnDeg: 30,
  rollWarnDeg: 25,
  coolantWarnC: 105,
  batteryLowV: 12.0,
  iceRiskC: 3,
  cabinWarnC: 35,
  fogWarnings: true,
  mount: null,
  gravitySign: 1,
  magCal: null,
  northRef: 'true',
  declinationMode: 'gps',
  declinationDeg: null,
  manualDeclinationDeg: 0,
  headingOffsetDeg: 0,
  altitudeSource: 'auto',
  qnhHpa: STD_QNH_HPA,
  altitudeOffsetM: 0,
  outsideTempCorrection: true,
  showAdvanced: false,
  tiltSmoothing: 'medium',
  tiltUpdateMs: DEFAULT_TILT_UPDATE_MS,
  sensorRateHz: 50,
  setupDone: false,
  sensorFrame: SENSOR_FRAME,
};

const KEY = 'trailgauge.settings.v1';
const OUTSIDE_KEY = 'trailgauge.outside.v1';

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

// Keeps only saved values that have the right type and range, so settings written by any earlier
// build (0.1.x from GitHub, or 0.3.0) load safely.
export function migrateSettings(saved: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  const d = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  const oneOf = <T>(v: unknown, opts: readonly T[]) => opts.includes(v as T);
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const isGauge = (g: unknown) => GAUGE_REGISTRY.includes(g as GaugeId);
  const vec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));

  const checks: Partial<Record<keyof Settings, (v: unknown) => boolean>> = {
    motionSource: v => oneOf(v, ['phone', 'hub', 'demo']),
    engineSource: v => oneOf(v, ['hub', 'demo', 'off']),
    vehicleBus: v => oneOf(v, ['auto', 'none']),
    hubDeviceId: v => v === null || typeof v === 'string',
    units: v => oneOf(v, ['imperial', 'metric']),
    groupGauges: v => Array.isArray(v) && v.length === 3 && v.every(isGauge),
    orientation: v => oneOf(v, ['landscape', 'portrait', 'auto']),
    gaugeColor: v => typeof v === 'string' && isHexColor(v),
    nightMode: v => oneOf(v, ['auto', 'on', 'off']),
    nightDimPct: v => num(v, 0, 80),
    mutedAlerts: v => Array.isArray(v) && v.every(a => ALERT_IDS.includes(a as AlertId)),
    pitchWarnDeg: v => num(v, 5, 45),
    rollWarnDeg: v => num(v, 5, 45),
    coolantWarnC: v => num(v, 80, 130),
    batteryLowV: v => num(v, 10, 13.5),
    iceRiskC: v => num(v, -5, 6),
    cabinWarnC: v => num(v, 20, 50),
    mount: v => v === null || (typeof v === 'object' && v !== null && vec3((v as Mount).up) && vec3((v as Mount).fwd) && vec3((v as Mount).left)),
    gravitySign: v => v === 1 || v === -1,
    magCal: v => v === null || vec3(v),
    northRef: v => oneOf(v, ['true', 'magnetic']),
    declinationMode: v => oneOf(v, ['gps', 'manual']),
    declinationDeg: v => v === null || num(v, -60, 60),
    manualDeclinationDeg: v => num(v, -60, 60),
    headingOffsetDeg: v => num(v, -45, 45),
    altitudeSource: v => oneOf(v, ['auto', 'baro', 'gps']),
    qnhHpa: v => num(v, 850, 1100),
    altitudeOffsetM: v => num(v, -500, 500),
    tiltSmoothing: v => oneOf(v, ['low', 'medium', 'high']),
    tiltUpdateMs: v => oneOf(v, TILT_UPDATE_OPTIONS_MS),
    sensorRateHz: v => oneOf(v, SENSOR_RATES_HZ),
    sensorFrame: v => typeof v === 'number',
  };
  for (const k of Object.keys(d) as (keyof Settings)[]) {
    if (!(k in saved)) continue;
    const v = saved[k];
    const check = checks[k] ?? ((x: unknown) => typeof x === typeof d[k]);
    if (check(v)) out[k] = v;
  }
  if (out.sensorFrame !== SENSOR_FRAME) {
    // Saved by a build that read gravity with the wrong sign: re-zero needed.
    out.mount = null;
    out.gravitySign = 1;
    out.sensorFrame = SENSOR_FRAME;
  }
  // Anyone upgrading has already been through setup (or chose to skip it).
  if (!('setupDone' in out)) out.setupDone = true;
  return out as Partial<Settings>;
}

export async function loadSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      settingsStore.set({ ...DEFAULT_SETTINGS, ...migrateSettings(JSON.parse(raw)) });
      AsyncStorage.setItem(KEY, JSON.stringify(settingsStore.get())).catch(() => {});
    } else {
      // First run on a phone: landscape and three gauges. On a tablet: auto-rotate, all gauges.
      const { width, height } = Dimensions.get('screen');
      const tablet = Math.min(width, height) >= 600;
      settingsStore.set({ orientation: tablet ? 'auto' : 'landscape', groupShowsAll: tablet });
    }
  } catch {
    // Corrupt or missing storage: keep defaults.
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set(patch);
  AsyncStorage.setItem(KEY, JSON.stringify(settingsStore.get())).catch(() => {});
}

// The last outside reading taken at speed, kept across restarts (see core/outside.ts).
export async function loadOutsideMemory(): Promise<OutsideMemory | null> {
  try {
    const raw = await AsyncStorage.getItem(OUTSIDE_KEY);
    const m = raw ? JSON.parse(raw) : null;
    return m && Number.isFinite(m.c) && Number.isFinite(m.atMs) ? { c: m.c, atMs: m.atMs } : null;
  } catch {
    return null;
  }
}

export function rememberOutside(m: OutsideMemory): void {
  AsyncStorage.setItem(OUTSIDE_KEY, JSON.stringify(m)).catch(() => {});
}
