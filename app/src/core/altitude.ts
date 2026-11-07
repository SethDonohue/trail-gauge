// Barometric altitude (international standard atmosphere, troposphere).

export const STD_QNH_HPA = 1013.25;
const EXP = 0.190295;

export function pressureToAltitudeM(pressureHpa: number, qnhHpa: number): number {
  return 44330 * (1 - Math.pow(pressureHpa / qnhHpa, EXP));
}

// The sea-level reference pressure that makes the current pressure read as a known elevation.
export function qnhFromElevation(pressureHpa: number, elevationM: number): number {
  return pressureHpa / Math.pow(1 - elevationM / 44330, 1 / EXP);
}

// Which sensor drives the altitude gauge. "auto" prefers the barometer (smooth, instant) and
// falls back to GPS height on devices without one, such as many tablets.
export type AltitudeSourcePref = 'auto' | 'baro' | 'gps';
export type AltitudeSource = 'baro' | 'gps';

export function resolveAltitudeSource(pref: AltitudeSourcePref, hasBaro: boolean): AltitudeSource {
  if (pref === 'gps') return 'gps';
  if (pref === 'baro') return 'baro';
  return hasBaro ? 'baro' : 'gps';
}

// GPS height is the weakest GPS axis. Reject fixes the receiver itself calls poor.
export const GPS_ALT_MAX_ACC_M = 40;

export function gpsAltitudeUsable(altM: number | null, accM: number | null): altM is number {
  if (altM === null || !Number.isFinite(altM)) return false;
  if (accM === null || !Number.isFinite(accM) || accM <= 0) return true; // accuracy unknown
  return accM <= GPS_ALT_MAX_ACC_M;
}
