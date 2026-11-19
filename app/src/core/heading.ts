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

// ---- Compass source: GPS direction of travel or the magnetometer ----
//
// A magnetometer is easily thrown off by magnets in a phone mount. GPS knows the direction of
// travel (course over ground) from the satellites, unaffected by magnets, but only while moving:
// at walking pace and below the course is noise. Navigation apps use course while moving.

export type HeadingSourcePref = 'auto' | 'gps' | 'magnetic';
export type HeadingSource = 'gps' | 'held' | 'compass' | null;

export const COURSE_START_MPS = 1.8; // about 4 mph: course becomes trustworthy
export const COURSE_STOP_MPS = 1.2; // about 2.7 mph: back below this, stop using it
export const COURSE_MAX_AGE_MS = 3000; // a course older than this is not "now"

// Moving fast enough for a GPS course, with hysteresis so it doesn't flicker at the threshold.
export function movingForCourse(speedMps: number | null, wasMoving: boolean): boolean {
  if (speedMps === null || !Number.isFinite(speedMps)) return false;
  return speedMps >= (wasMoving ? COURSE_STOP_MPS : COURSE_START_MPS);
}

// Which source the compass shows now.
// - gps: GPS course while moving; when stopped, the last course is held (or nothing yet).
// - magnetic: the magnetometer only.
// - auto: GPS course while moving; when stopped, the magnetometer unless its field looks wrong,
//   then the last GPS course.
export function chooseHeadingSource(p: {
  pref: HeadingSourcePref; moving: boolean; courseFresh: boolean; haveLastCourse: boolean;
  magAvailable: boolean; magDisturbed: boolean;
}): HeadingSource {
  if (p.pref !== 'magnetic' && p.moving && p.courseFresh) return 'gps';
  if (p.pref === 'gps') return p.haveLastCourse ? 'held' : null;
  if (p.pref === 'magnetic') return p.magAvailable ? 'compass' : null;
  if (p.magAvailable && !p.magDisturbed) return 'compass';
  if (p.haveLastCourse) return 'held';
  return p.magAvailable ? 'compass' : null;
}

// A GPS course is relative to true north. Shown as true unless magnetic north is chosen and the
// declination is known. The mount trim (headingOffsetDeg) does not apply: the direction of travel
// is the vehicle's own, wherever the phone points.
export function courseToShown(courseTrueDeg: number, s: HeadingSettings): { deg: number; isTrue: boolean } {
  if (s.northRef === 'magnetic') {
    const decl = s.declinationMode === 'manual' ? s.manualDeclinationDeg : s.learnedDeclinationDeg;
    if (decl !== null) return { deg: wrap360(courseTrueDeg - decl), isTrue: false };
  }
  return { deg: wrap360(courseTrueDeg), isTrue: true };
}
