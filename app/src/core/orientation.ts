// Vehicle attitude and heading from the phone's gravity and magnetometer vectors.
// Works purely with vectors in the phone's own (device) frame, so it does not depend on any
// Euler-angle convention. A "mount" says which device-frame directions are the vehicle's
// forward, left and up axes; it comes from the "Zero level" calibration.

export type Vec3 = [number, number, number];

export interface Mount {
  fwd: Vec3;
  left: Vec3;
  up: Vec3;
}

const RAD = 180 / Math.PI;

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  return n > 1e-9 ? scale(a, 1 / n) : [0, 0, 0];
}
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

// Nearest signed device axis: used for the default mount before the user zeroes.
export function snapAxis(v: Vec3): Vec3 {
  const ax = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const i = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
  const out: Vec3 = [0, 0, 0];
  out[i] = Math.sign(v[i]) || 1;
  return out;
}

// Builds the vehicle frame from an up direction (device frame).
// Forward = out of the back of the phone (a dash-mounted phone faces the driver), projected
// level; if the phone lies flat, forward = the top edge of the phone.
export function mountFromUp(upDevice: Vec3): Mount {
  const up = normalize(upDevice);
  const hints: Vec3[] = [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ];
  for (const h of hints) {
    const fh = sub(h, scale(up, dot(h, up)));
    if (norm(fh) > 0.5) {
      const fwd = normalize(fh);
      return { fwd, left: cross(up, fwd), up };
    }
  }
  return { fwd: [0, 0, -1], left: [1, 0, 0], up };
}

export const defaultMount = (upNow: Vec3) => mountFromUp(snapAxis(upNow));

// Pitch: nose up positive. Roll: right side down positive.
export function attitude(upNow: Vec3, m: Mount): { pitchDeg: number; rollDeg: number } {
  const u = normalize(upNow);
  return {
    pitchDeg: Math.asin(clamp1(dot(m.fwd, u))) * RAD,
    rollDeg: Math.atan2(dot(m.left, u), dot(m.up, u)) * RAD,
  };
}

// Tilt-compensated magnetic heading of the vehicle's forward axis, 0..360, or null when the
// geometry is degenerate (vehicle pointing straight up, or no usable field).
export function magneticHeading(upNow: Vec3, magDevice: Vec3, m: Mount): number | null {
  const u = normalize(upNow);
  const east = cross(magDevice, u);
  if (norm(east) < 1e-6) return null;
  const e = normalize(east);
  const n = cross(u, e);
  const fe = dot(m.fwd, e);
  const fn = dot(m.fwd, n);
  if (Math.hypot(fe, fn) < 0.2) return null;
  const h = Math.atan2(fe, fn) * RAD;
  return h < 0 ? h + 360 : h;
}

export const wrap360 = (d: number) => ((d % 360) + 360) % 360;
export const wrap180 = (d: number) => wrap360(d + 180) - 180;
