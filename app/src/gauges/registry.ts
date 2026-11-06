export const GAUGE_REGISTRY = [
  'INCLINOMETER',
  'COMPASS',
  'ALTIMETER',
  'ENGINE_TEMP',
  'AMBIENT_TEMP',
  'BATTERY',
] as const;

export type GaugeId = (typeof GAUGE_REGISTRY)[number];

export const GAUGE_LABEL: Record<GaugeId, string> = {
  INCLINOMETER: 'Tilt',
  COMPASS: 'Compass',
  ALTIMETER: 'Altitude',
  ENGINE_TEMP: 'Coolant',
  AMBIENT_TEMP: 'Outside',
  BATTERY: 'Battery',
};
