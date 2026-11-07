import { makeMutable } from 'react-native-reanimated';
import { useSyncExternalStore } from 'react';
import type { Vec3 } from '../core/orientation';
import type { GaugeId } from '../gauges/registry';
import { createStore } from './observable';

// High-rate values live in Reanimated shared values: writing one does not re-render React,
// and the Skia gauges read them on the UI thread. NaN means "no valid value".
export const live = {
  pitch: makeMutable(NaN),
  roll: makeMutable(NaN),
  heading: makeMutable(NaN),
  headingTrue: makeMutable(false),
  altitude: makeMutable(NaN),
  coolant: makeMutable(NaN),
  ambient: makeMutable(NaN),
  battery: makeMutable(NaN),
};

export type Channel = 'pitch' | 'roll' | 'heading' | 'altitude' | 'coolant' | 'ambient' | 'battery';

const lastUpdate: Record<Channel, number> = {
  pitch: 0, roll: 0, heading: 0, altitude: 0, coolant: 0, ambient: 0, battery: 0,
};

export function put(ch: Channel, v: number | null): void {
  if (v === null || !Number.isFinite(v)) return; // invalid values age out and show as stale
  live[ch].value = v;
  lastUpdate[ch] = Date.now();
}

// ---- Staleness: recomputed 5x per second; React re-renders only when a flag flips. ----

const STALE_MS = 600;
// GPS height arrives about once a second, so altitude gets a longer window.
const STALE_MS_BY_CHANNEL: Partial<Record<Channel, number>> = { altitude: 3000 };
const GAUGE_CHANNELS: Record<GaugeId, Channel[]> = {
  INCLINOMETER: ['pitch', 'roll'],
  COMPASS: ['heading'],
  ALTIMETER: ['altitude'],
  ENGINE_TEMP: ['coolant'],
  AMBIENT_TEMP: ['ambient'],
  BATTERY: ['battery'],
};

type Freshness = Record<GaugeId, boolean>;
let fresh: Freshness = {
  INCLINOMETER: false, COMPASS: false, ALTIMETER: false,
  ENGINE_TEMP: false, AMBIENT_TEMP: false, BATTERY: false,
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  const now = Date.now();
  let changed = false;
  const next = { ...fresh };
  for (const id of Object.keys(GAUGE_CHANNELS) as GaugeId[]) {
    const ok = GAUGE_CHANNELS[id].every(ch => now - lastUpdate[ch] < (STALE_MS_BY_CHANNEL[ch] ?? STALE_MS));
    if (ok !== next[id]) {
      next[id] = ok;
      changed = true;
    }
  }
  if (changed) {
    fresh = next;
    listeners.forEach(l => l());
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) timer = setInterval(tick, 200);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useFresh(id: GaugeId): boolean {
  return useSyncExternalStore(subscribe, () => fresh[id]);
}

// ---- Low-rate status for the status badge and the diagnostics panel. ----

export type HubState =
  | 'off' | 'bluetooth off' | 'no permission' | 'scanning' | 'connecting' | 'connected';

export interface Status {
  hub: HubState;
  hubName: string | null;
  hubStatusBits: number;
  locationGranted: boolean | null;
  speedMps: number | null;
  gpsAltitudeM: number | null;
  gpsVerticalAccM: number | null;
  pressureHpa: number | null;
  baroAvailable: boolean | null;
  altitudeSource: 'baro' | 'gps' | null; // what is driving the altitude gauge now
  gravity: Vec3 | null;
  magFieldUt: number | null;
  magDisturbed: boolean;
  message: string | null;
}

export const statusStore = createStore<Status>({
  hub: 'off',
  hubName: null,
  hubStatusBits: 0,
  locationGranted: null,
  speedMps: null,
  gpsAltitudeM: null,
  gpsVerticalAccM: null,
  pressureHpa: null,
  baroAvailable: null,
  altitudeSource: null,
  gravity: null,
  magFieldUt: null,
  magDisturbed: false,
  message: null,
});
