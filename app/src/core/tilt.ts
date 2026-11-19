// The Tilt gauge's looks and the geometry they share. Pure, so the sign conventions are tested.
//
// Screen angles are degrees clockwise from the +x axis (screen y points down), so -90 is straight
// up. Roll is drawn from behind the vehicle, pitch from its right side with the nose to the right.

export type TiltStyle = 'vehicles' | 'dial' | 'horizon' | 'bubble';
export type TiltAxis = 'roll' | 'pitch';

export const DEFAULT_TILT_STYLE: TiltStyle = 'vehicles';
export const TILT_STYLES: { value: TiltStyle; label: string }[] = [
  { value: 'vehicles', label: 'Two dials' },
  { value: 'dial', label: 'One dial' },
  { value: 'horizon', label: 'Horizon' },
  { value: 'bubble', label: 'Bubble' },
];
export const TILT_STYLE_HINT =
  'Two dials: roll and pitch side by side, each vehicle tilting against a scale. ' +
  'One dial: both on a single round gauge. Horizon: the vehicle stays still and the ground tilts. ' +
  'Bubble: a ball in a curved tube moves to the high side, like a spirit level.';

export const TILT_SCALE_DEG = 40; // scales run to 40 degrees each way
export const TILT_ALARM_MARGIN_DEG = 10; // red this far past the warning angle
const BUBBLE_TRAVEL_DEG = 45; // the tube's half-length

// 0 normal, 1 caution (amber), 2 danger (red).
export function axisLevel(v: number, warnDeg: number): 0 | 1 | 2 {
  'worklet';
  const a = Math.abs(v);
  if (!Number.isFinite(a)) return 0;
  return a >= warnDeg + TILT_ALARM_MARGIN_DEG ? 2 : a >= warnDeg ? 1 : 0;
}

// How far to turn the vehicle drawing, clockwise. Right side down turns the rear view clockwise;
// nose up turns the side view (nose right) anticlockwise.
export function vehicleRotationDeg(axis: TiltAxis, v: number): number {
  'worklet';
  const d = Number.isFinite(v) ? v : 0;
  return axis === 'roll' ? d : -d;
}

// The level line as seen from inside the vehicle turns the other way.
export function horizonRotationDeg(axis: TiltAxis, v: number): number {
  'worklet';
  return -vehicleRotationDeg(axis, v);
}

// Where the bubble sits on a tube that bows upward: it stays at the true top, so it moves toward
// the high side (left when the right side is down, toward the nose when the nose is up).
export function bubbleAngleDeg(axis: TiltAxis, v: number): number {
  'worklet';
  const r = vehicleRotationDeg(axis, v);
  return -90 - Math.max(-BUBBLE_TRAVEL_DEG, Math.min(BUBBLE_TRAVEL_DEG, r));
}

export interface Tick {
  deg: number;
  major: boolean; // every 10 degrees
  red: boolean; // at or past the warning angle
}

// Ticks every 5 degrees to TILT_SCALE_DEG each way.
export function tiltTicks(warnDeg: number): Tick[] {
  const out: Tick[] = [];
  for (let d = -TILT_SCALE_DEG; d <= TILT_SCALE_DEG; d += 5) {
    out.push({ deg: d, major: d % 10 === 0, red: Math.abs(d) >= warnDeg });
  }
  return out;
}
