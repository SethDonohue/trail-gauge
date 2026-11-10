// Hard-iron compass calibration: corrects magnetic interference that moves with the phone, such
// as a mount with metal parts. Turning the phone (or driving a slow full circle) sweeps the field
// vector around a sphere offset by the interference; the centre of that sweep is the offset.

import type { Vec3 } from './orientation';

export const MAG_CAL_MIN_SAMPLES = 150;
export const MAG_CAL_MIN_RANGE_UT = 40; // an axis counts as covered once it has swept this far
export const MAG_CAL_AXES_NEEDED = 2; // a level circle covers two axes; a figure-8 covers three

export class MagCalibrator {
  private min: Vec3 = [Infinity, Infinity, Infinity];
  private max: Vec3 = [-Infinity, -Infinity, -Infinity];
  private n = 0;

  add(v: Vec3): void {
    if (!v.every(Number.isFinite)) return;
    for (let i = 0; i < 3; i++) {
      this.min[i] = Math.min(this.min[i], v[i]);
      this.max[i] = Math.max(this.max[i], v[i]);
    }
    this.n++;
  }

  axesCovered(): number {
    let k = 0;
    for (let i = 0; i < 3; i++) if (this.max[i] - this.min[i] >= MAG_CAL_MIN_RANGE_UT) k++;
    return k;
  }

  progressText(): string {
    return `${this.axesCovered()} of 3 axes covered (${MAG_CAL_AXES_NEEDED} needed). ` +
      'Turn the phone in a figure-8, or drive a slow circle.';
  }

  // The offset to subtract from raw readings, or null if there was not enough turning.
  finish(): Vec3 | null {
    if (this.n < MAG_CAL_MIN_SAMPLES || this.axesCovered() < MAG_CAL_AXES_NEEDED) return null;
    // An axis that was not swept keeps no correction rather than a guess.
    return [0, 1, 2].map(i =>
      this.max[i] - this.min[i] >= MAG_CAL_MIN_RANGE_UT ? (this.max[i] + this.min[i]) / 2 : 0,
    ) as Vec3;
  }
}

export function applyMagCal(raw: Vec3, offset: Vec3 | null): Vec3 {
  return offset ? [raw[0] - offset[0], raw[1] - offset[1], raw[2] - offset[2]] : raw;
}
