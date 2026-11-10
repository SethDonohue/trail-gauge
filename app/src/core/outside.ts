// Outside temperature correction and the two-sensor combination.
//
// At low speed, engine-bay heat drifts forward over a front-mounted sensor and hot pavement
// radiates up at it, so it reads high (factory car thermometers do the same in traffic). With
// correction on, the reading can fall freely but rises only slowly below 30 km/h, and after
// start-up it keeps the last good reading until the vehicle has driven at speed for a while.

export const SOAK_SPEED_MPS = 30 / 3.6; // below this, heat soak is possible
export const SETTLE_MOVING_MS = 60_000; // this long above SOAK_SPEED trusts the sensor again
export const SLOW_RISE_C_PER_MIN = 0.5;
export const REMEMBER_MAX_AGE_MS = 3 * 3600_000; // a remembered reading older than this is ignored
export const SENSOR_DISAGREE_C = 5;

export interface OutsideMemory {
  c: number;
  atMs: number;
}

export class OutsideTempCorrector {
  private out: number | null = null;
  private lastMs = 0;
  private fastSince: number | null = null;
  private settled = false;
  private memory: OutsideMemory | null;

  constructor(memory: OutsideMemory | null = null) {
    this.memory = memory;
  }

  // Returns the corrected reading, whether it is currently held below the raw value, and a
  // reading worth remembering (when settled at speed) or null.
  update(rawC: number, speedMps: number | null, nowMs: number, enabled: boolean): {
    c: number; holding: boolean; remember: OutsideMemory | null;
  } {
    const fast = speedMps !== null && speedMps >= SOAK_SPEED_MPS;
    if (fast) {
      this.fastSince ??= nowMs;
      if (nowMs - this.fastSince >= SETTLE_MOVING_MS) this.settled = true;
    } else {
      this.fastSince = null;
      this.settled = false;
    }

    if (!enabled) {
      this.out = rawC;
      this.lastMs = nowMs;
      return { c: rawC, holding: false, remember: null };
    }

    if (this.out === null) {
      // Start-up: a recent remembered reading beats a heat-soaked one.
      const mem = this.memory;
      const fresh = mem && nowMs - mem.atMs >= 0 && nowMs - mem.atMs <= REMEMBER_MAX_AGE_MS;
      this.out = fresh ? Math.min(rawC, mem!.c) : rawC;
    } else if (this.settled) {
      this.out = rawC;
    } else {
      const dtMin = Math.max(0, (nowMs - this.lastMs) / 60_000);
      this.out = Math.min(rawC, this.out + SLOW_RISE_C_PER_MIN * dtMin);
    }
    this.lastMs = nowMs;

    const remember = this.settled ? { c: rawC, atMs: nowMs } : null;
    if (remember) this.memory = remember;
    return { c: this.out, holding: rawC - this.out > 0.2, remember };
  }
}

// With a second outside sensor (for example under a mirror), the lower reading wins: heat only
// ever makes a sensor read high.
export function combineOutside(a: number | null, b: number | null): { c: number | null; disagree: boolean } {
  const okA = a !== null && Number.isFinite(a);
  const okB = b !== null && Number.isFinite(b);
  if (okA && okB) return { c: Math.min(a!, b!), disagree: Math.abs(a! - b!) > SENSOR_DISAGREE_C };
  return { c: okA ? a : okB ? b : null, disagree: false };
}
