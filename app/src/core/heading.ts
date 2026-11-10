// Which north the compass shows, and the trims applied to it.
//
// True north matches maps and GPS bearings; magnetic north matches a hand compass. With true north
// selected, the compass shows magnetic north (M) until a declination is known, then true (T).

import { wrap360 } from './orientation.ts';

export type NorthRef = 'true' | 'magnetic';
export type DeclinationMode = 'gps' | 'manual';

export interface HeadingSettings {
  northRef: NorthRef;
  declinationMode: DeclinationMode;
  learnedDeclinationDeg: number | null; // from GPS, east positive
  manualDeclinationDeg: number; // entered by hand, east positive
  headingOffsetDeg: number; // trims a mount that is not square to the vehicle
}

export function activeDeclination(s: HeadingSettings): number | null {
  if (s.northRef !== 'true') return null;
  return s.declinationMode === 'manual' ? s.manualDeclinationDeg : s.learnedDeclinationDeg;
}

export function resolveHeading(magDeg: number, s: HeadingSettings): { deg: number; isTrue: boolean } {
  const decl = activeDeclination(s);
  const base = decl !== null ? magDeg + decl : magDeg;
  return { deg: wrap360(base + s.headingOffsetDeg), isTrue: decl !== null };
}

export function northRefSummary(s: HeadingSettings): string {
  if (s.northRef === 'magnetic') return 'Magnetic north (M), set in Advanced.';
  if (s.declinationMode === 'manual') {
    return `True north (T), manual declination ${s.manualDeclinationDeg.toFixed(1)}°.`;
  }
  return s.learnedDeclinationDeg !== null
    ? `True north (T), declination ${s.learnedDeclinationDeg.toFixed(1)}° learned from GPS.`
    : 'Shows magnetic north (M) until GPS has a fix, then true north (T).';
}
