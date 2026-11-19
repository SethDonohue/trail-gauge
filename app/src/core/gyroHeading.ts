// Gyroscope bridge for the compass: below the speed where GPS knows the direction of travel, keep
// the last GPS direction up to date by adding the turns the phone's gyroscope measures. A gyroscope
// is not affected by magnets. It drifts slowly, so each new GPS direction at speed resets it.

import { dot, normalize, wrap360, type Vec3 } from './orientation.ts';

const RAD = 180 / Math.PI;
const BIAS_TAU_S = 20; // the gyroscope's resting offset is learned over this long while stopped
const BIAS_MAX_RATE = 2; // deg/s: faster than this while stopped is someone moving the phone

// Heading rate in degrees per second, clockwise seen from above (a right turn is positive).
// gyroRadS: the phone's rotation rate about its own x, y, z axes (right-handed, rad/s).
// upDevice: the up direction in the same frame. Rotation about up, by the right-hand rule, is
// anticlockwise seen from above, so the heading rate is its negative.
export function yawRateDegPerS(gyroRadS: Vec3, upDevice: Vec3): number {
  return -dot(gyroRadS, normalize(upDevice)) * RAD;
}

export class GyroBridge {
  private heading: number | null = null; // true-north degrees
  private bias = 0; // deg/s, learned while stopped
  private biasWeight = 0; // 0..1, how settled the bias estimate is
  private turnedSinceAnchor = 0;

  // A fresh GPS direction of travel: start from here.
  anchor(courseTrueDeg: number): void {
    this.heading = wrap360(courseTrueDeg);
    this.turnedSinceAnchor = 0;
  }

  // Adds the turn over dt seconds. Call continuously, moving or not.
  step(rateDegS: number, dtS: number): void {
    if (this.heading === null || !Number.isFinite(rateDegS) || !(dtS > 0)) return;
    const d = (rateDegS - this.bias) * dtS;
    this.heading = wrap360(this.heading + d);
    this.turnedSinceAnchor += d;
  }

  // While the vehicle is stopped, any rate the gyroscope reports is its own offset.
  learnBias(rateDegS: number, dtS: number): void {
    if (!Number.isFinite(rateDegS) || Math.abs(rateDegS) > BIAS_MAX_RATE || !(dtS > 0)) return;
    const k = 1 - Math.exp(-dtS / BIAS_TAU_S);
    this.bias += k * (rateDegS - this.bias);
    this.biasWeight = Math.min(1, this.biasWeight + k);
  }

  get value(): number | null {
    return this.heading;
  }

  get biasDegS(): number {
    return this.bias;
  }

  get turned(): number {
    return this.turnedSinceAnchor;
  }

  clear(): void {
    this.heading = null;
    this.turnedSinceAnchor = 0;
  }
}
