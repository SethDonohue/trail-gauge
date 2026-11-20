// "Lock rotation while moving": once the vehicle is really moving, the screen stays in whichever
// orientation it is in, so a bump can't flip it between portrait and landscape. Gestures are not
// affected. It needs a few seconds above the speed to lock and longer below a lower speed to
// unlock, so a GPS speed blip while parked, or a brief slow-down, does not flip it.

export const ROTATION_LOCK_KMH = 8; // about 5 mph
export const ROTATION_UNLOCK_KMH = 5; // about 3 mph
export const LOCK_AFTER_MS = 3000;
export const UNLOCK_AFTER_MS = 10000;

export interface MoveLock {
  locked: boolean;
  since: number | null; // when the speed first crossed toward the other state
}

export const MOVE_LOCK_START: MoveLock = { locked: false, since: null };

export function stepMoveLock(s: MoveLock, speedMps: number | null, nowMs: number): MoveLock {
  if (speedMps === null || !Number.isFinite(speedMps)) return { locked: s.locked, since: null }; // no GPS: hold
  const kmh = speedMps * 3.6;
  const crossing = s.locked ? kmh < ROTATION_UNLOCK_KMH : kmh > ROTATION_LOCK_KMH;
  if (!crossing) return { locked: s.locked, since: null };
  const since = s.since ?? nowMs;
  if (nowMs - since >= (s.locked ? UNLOCK_AFTER_MS : LOCK_AFTER_MS)) return { locked: !s.locked, since: null };
  return { locked: s.locked, since };
}
