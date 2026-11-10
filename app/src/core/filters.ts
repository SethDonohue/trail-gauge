// Filters specified by time constant (seconds), so behaviour does not depend on sample rate.

export class EmaFilter {
  private y = 0;
  private seeded = false;
  private tau: number;

  constructor(tauSeconds: number) {
    this.tau = tauSeconds;
  }

  setTau(tauSeconds: number): void {
    this.tau = tauSeconds;
  }

  update(x: number, dtSeconds: number): number {
    if (!Number.isFinite(x)) return this.seeded ? this.y : NaN;
    if (!this.seeded || dtSeconds <= 0 || dtSeconds > 2) {
      // Seed from the first sample (no ramp from zero) and re-seed after a long gap.
      this.y = x;
      this.seeded = true;
      return x;
    }
    const alpha = 1 - Math.exp(-dtSeconds / this.tau);
    this.y += alpha * (x - this.y);
    return this.y;
  }

  reset() {
    this.seeded = false;
  }
}

// Heading filtered on the unit circle, so 359 -> 1 degrees never swings through 180.
export class HeadingFilter {
  private readonly s: EmaFilter;
  private readonly c: EmaFilter;

  constructor(tauSeconds: number) {
    this.s = new EmaFilter(tauSeconds);
    this.c = new EmaFilter(tauSeconds);
  }

  update(deg: number, dtSeconds: number): number {
    const r = (deg * Math.PI) / 180;
    const s = this.s.update(Math.sin(r), dtSeconds);
    const c = this.c.update(Math.cos(r), dtSeconds);
    const out = (Math.atan2(s, c) * 180) / Math.PI;
    return out < 0 ? out + 360 : out;
  }

  reset() {
    this.s.reset();
    this.c.reset();
  }
}
