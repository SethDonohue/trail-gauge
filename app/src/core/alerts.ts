// Alert levels and the rules for when to beep. Pure: no React, no timers, time is passed in.
//
// Gauges always change colour. Sound and vibration fire when a reading first enters amber or
// red; red repeats every 30 seconds while it stays red. Demo data never beeps, and muted alerts
// (per gauge, or everything via MUTE) stay silent but keep tracking so unmuting is quiet.

export type Level = 0 | 1 | 2; // normal, amber, red

export type AlertId = 'tilt' | 'coolant' | 'battery' | 'ice' | 'cabin' | 'fog';
export const ALERT_IDS: readonly AlertId[] = ['tilt', 'coolant', 'battery', 'ice', 'cabin', 'fog'];

export const ALERT_LABEL: Record<AlertId, string> = {
  tilt: 'Tilt',
  coolant: 'Coolant temperature',
  battery: 'Battery voltage',
  ice: 'Ice risk',
  cabin: 'Cabin temperature',
  fog: 'Window fog risk',
};

export const TILT_ALARM_MARGIN_DEG = 10; // red this far beyond the amber angle
export const COOLANT_ALARM_MARGIN_C = 7;
export const CABIN_ALARM_MARGIN_C = 5;
export const BATTERY_HIGH_WARN_V = 14.9;
export const BATTERY_HIGH_ALARM_V = 15.5;
export const BATTERY_ALARM_MARGIN_V = 0.5; // red this far below the low-voltage setting
export const FOG_WARN_MARGIN_C = 3; // amber when the glass is within 3 °C of the dew point
export const GLASS_CABIN_WEIGHT = 0.35; // inner glass sits about a third of the way to cabin temp
export const ALARM_REPEAT_MS = 30_000;
export const CLEAR_MS = 15_000; // a reading must stay below a level this long to re-arm it

const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function tiltLevel(pitch: number | null, roll: number | null, pitchWarn: number, rollWarn: number): Level | null {
  if (!ok(pitch) && !ok(roll)) return null;
  const one = (v: number | null, warn: number): Level => {
    if (!ok(v)) return 0;
    const a = Math.abs(v);
    return a >= warn + TILT_ALARM_MARGIN_DEG ? 2 : a >= warn ? 1 : 0;
  };
  return Math.max(one(pitch, pitchWarn), one(roll, rollWarn)) as Level;
}

export function coolantLevel(c: number | null, warnC: number): Level | null {
  if (!ok(c)) return null;
  return c >= warnC + COOLANT_ALARM_MARGIN_C ? 2 : c >= warnC ? 1 : 0;
}

export function batteryLevel(v: number | null, lowV: number): Level | null {
  if (!ok(v)) return null;
  if (v < lowV - BATTERY_ALARM_MARGIN_V || v > BATTERY_HIGH_ALARM_V) return 2;
  if (v < lowV || v > BATTERY_HIGH_WARN_V) return 1;
  return 0;
}

// Ice risk is advisory: amber only.
export function iceLevel(outsideC: number | null, iceC: number): Level | null {
  if (!ok(outsideC)) return null;
  return outsideC <= iceC ? 1 : 0;
}

export function cabinLevel(cabinC: number | null, warnC: number): Level | null {
  if (!ok(cabinC)) return null;
  return cabinC >= warnC + CABIN_ALARM_MARGIN_C ? 2 : cabinC >= warnC ? 1 : 0;
}

// Magnus formula (Alduchov and Eskridge coefficients), good to about 0.1 °C for -40..50 °C.
export function dewPointC(tempC: number, rhPct: number): number {
  const rh = Math.min(100, Math.max(1, rhPct));
  const a = 17.625;
  const b = 243.04;
  const g = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  return (b * g) / (a - g);
}

// Inner windscreen surface temperature, estimated from outside and cabin air.
export function glassTempC(outsideC: number, cabinC: number): number {
  return outsideC + GLASS_CABIN_WEIGHT * (cabinC - outsideC);
}

// Windows fog on the inside when the glass is colder than the cabin air's dew point.
export function fogLevel(outsideC: number | null, cabinC: number | null, rhPct: number | null): Level | null {
  if (!ok(outsideC) || !ok(cabinC) || !ok(rhPct)) return null;
  const margin = glassTempC(outsideC, cabinC) - dewPointC(cabinC, rhPct);
  return margin <= 0 ? 2 : margin <= FOG_WARN_MARGIN_C ? 1 : 0;
}

export type Beep = 'warn' | 'alarm';

interface Track {
  armed: Level; // highest level already announced
  belowSince: number | null; // when the reading dropped below `armed`
  lastAlarmMs: number;
}

// Decides when to beep. Call update() a few times a second with the current levels.
export class AlertTracker {
  private t: Record<AlertId, Track>;

  constructor() {
    this.t = Object.fromEntries(
      ALERT_IDS.map(id => [id, { armed: 0, belowSince: null, lastAlarmMs: 0 }]),
    ) as Record<AlertId, Track>;
  }

  // Returns the sound to play now (the louder one wins) and which alerts caused it.
  update(
    now: number,
    levels: Partial<Record<AlertId, Level | null>>,
    silenced: (id: AlertId) => boolean,
  ): { beep: Beep | null; ids: AlertId[] } {
    let beep: Beep | null = null;
    const ids: AlertId[] = [];
    for (const id of ALERT_IDS) {
      const tr = this.t[id];
      const lvl = levels[id] ?? null;
      if (lvl === null) continue; // no data: hold state, no sound
      if (lvl < tr.armed) {
        tr.belowSince ??= now;
        if (now - tr.belowSince >= CLEAR_MS) {
          tr.armed = lvl;
          tr.belowSince = null;
        }
      } else {
        tr.belowSince = null;
      }
      let fire: Beep | null = null;
      if (lvl > tr.armed) {
        tr.armed = lvl;
        fire = lvl === 2 ? 'alarm' : 'warn';
        if (lvl === 2) tr.lastAlarmMs = now;
      } else if (lvl === 2 && tr.armed === 2 && now - tr.lastAlarmMs >= ALARM_REPEAT_MS) {
        tr.lastAlarmMs = now;
        fire = 'alarm';
      }
      if (fire && !silenced(id)) {
        ids.push(id);
        if (fire === 'alarm' || beep === null) beep = fire;
      }
    }
    return { beep, ids };
  }
}
