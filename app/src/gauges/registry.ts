import type { AlertId } from '../core/alerts';

export const GAUGE_REGISTRY = [
  'INCLINOMETER',
  'COMPASS',
  'ALTIMETER',
  'ENGINE_TEMP',
  'AMBIENT_TEMP',
  'BATTERY',
  'CABIN_TEMP',
  'HUMIDITY',
] as const;

export type GaugeId = (typeof GAUGE_REGISTRY)[number];

export const GAUGE_LABEL: Record<GaugeId, string> = {
  INCLINOMETER: 'Tilt',
  COMPASS: 'Compass',
  ALTIMETER: 'Altitude',
  ENGINE_TEMP: 'Coolant',
  AMBIENT_TEMP: 'Outside',
  BATTERY: 'Battery',
  CABIN_TEMP: 'Cabin',
  HUMIDITY: 'Humidity',
};

// The alerts each gauge's speaker button mutes.
export const GAUGE_ALERTS: Record<GaugeId, AlertId[]> = {
  INCLINOMETER: ['tilt'],
  COMPASS: [],
  ALTIMETER: [],
  ENGINE_TEMP: ['coolant'],
  AMBIENT_TEMP: ['ice'],
  BATTERY: ['battery'],
  CABIN_TEMP: ['cabin'],
  HUMIDITY: ['fog'],
};
