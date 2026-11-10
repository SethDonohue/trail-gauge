// Night mode: dims the dashboard. Auto uses the light sensor where the phone has one, otherwise
// the sun's elevation from GPS position and time, otherwise the clock.

export type NightMode = 'auto' | 'on' | 'off';

export const NIGHT_LUX_ENTER = 10; // darker than this for NIGHT_HOLD_MS turns night on
export const NIGHT_LUX_EXIT = 40; // brighter than this for NIGHT_HOLD_MS turns it off
export const NIGHT_HOLD_MS = 8_000; // ignores tunnels, shadows and passing headlights
export const SUN_NIGHT_ELEVATION_DEG = -4; // civil dusk is -6; dashboards need dimming a bit earlier
export const CLOCK_NIGHT_START_H = 20;
export const CLOCK_NIGHT_END_H = 6;

// Light sensor with hysteresis and a hold time.
export class LuxNightDetector {
  private night = false;
  private since: number | null = null;

  update(lux: number, nowMs: number): boolean {
    const wantsChange = this.night ? lux > NIGHT_LUX_EXIT : lux < NIGHT_LUX_ENTER;
    if (!wantsChange) {
      this.since = null;
      return this.night;
    }
    this.since ??= nowMs;
    if (nowMs - this.since >= NIGHT_HOLD_MS) {
      this.night = !this.night;
      this.since = null;
    }
    return this.night;
  }

  reset(night = false): void {
    this.night = night;
    this.since = null;
  }
}

export function isClockNight(localHour: number): boolean {
  return localHour >= CLOCK_NIGHT_START_H || localHour < CLOCK_NIGHT_END_H;
}

// Sun elevation in degrees (NOAA approximation, about 0.5° accuracy: plenty for dimming).
export function sunElevationDeg(date: Date, latDeg: number, lonDeg: number): number {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lonDeg) * rad;
  const ha = lst - ra;
  const lat = latDeg * rad;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  return el / rad;
}

// One decision from whatever is available, best source first.
export function decideNight(opts: {
  mode: NightMode;
  luxNight: boolean | null; // from LuxNightDetector, or null if no light sensor
  sunElevationDeg: number | null;
  localHour: number;
}): boolean {
  if (opts.mode !== 'auto') return opts.mode === 'on';
  if (opts.luxNight !== null) return opts.luxNight;
  if (opts.sunElevationDeg !== null) return opts.sunElevationDeg < SUN_NIGHT_ELEVATION_DEG;
  return isClockNight(opts.localHour);
}
