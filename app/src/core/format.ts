// Formatting helpers. They carry the 'worklet' directive because Skia text is computed on the
// UI thread; they are plain functions everywhere else.

export type Units = 'imperial' | 'metric';

export function fmtAngle(deg: number): string {
  'worklet';
  if (!Number.isFinite(deg)) return '--';
  const a = Math.abs(deg) < 0.05 ? 0 : deg;
  return `${a.toFixed(1)}°`;
}

export function fmtHeading(deg: number): string {
  'worklet';
  if (!Number.isFinite(deg)) return '---°';
  const d = Math.round(deg) % 360;
  return `${d < 10 ? '00' : d < 100 ? '0' : ''}${d}°`;
}

export function cardinal(deg: number): string {
  'worklet';
  if (!Number.isFinite(deg)) return '';
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

export function fmtAltitude(m: number, units: Units): string {
  'worklet';
  if (!Number.isFinite(m)) return '--';
  const v = Math.round(units === 'imperial' ? m * 3.28084 : m);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `-${s}` : s;
}

export function fmtTemp(c: number, units: Units): string {
  'worklet';
  if (!Number.isFinite(c)) return '--';
  return `${Math.round(units === 'imperial' ? c * 1.8 + 32 : c)}°`;
}

export function fmtVolts(v: number): string {
  'worklet';
  if (!Number.isFinite(v)) return '--';
  return v.toFixed(1);
}

export type SpeedUnit = 'mph' | 'kmh';

export const MPS_TO_MPH = 2.2369363;
export const MPS_TO_KMH = 3.6;

// GPS speed arrives in metres per second.
export function fmtSpeed(mps: number, unit: SpeedUnit): string {
  'worklet';
  if (!Number.isFinite(mps)) return '--';
  return `${Math.round(Math.max(0, mps) * (unit === 'mph' ? 2.2369363 : 3.6))}`;
}

export const speedUnitLabel = (u: SpeedUnit) => (u === 'mph' ? 'mph' : 'km/h');
export const speedUnitFor = (u: Units): SpeedUnit => (u === 'imperial' ? 'mph' : 'kmh');

export const altUnit = (u: Units) => (u === 'imperial' ? 'ft' : 'm');
export const tempUnit = (u: Units) => (u === 'imperial' ? '°F' : '°C');
