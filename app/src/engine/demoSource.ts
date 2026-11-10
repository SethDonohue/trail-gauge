import { wrap360 } from '../core/orientation';
import { live, put } from './live';

// Synthetic data for testing the gauges before the hub exists.
export class DemoSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly t0 = Date.now();

  constructor(private readonly opts: { motion: boolean; engine: boolean }) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), 40); // 25 Hz, like the hub
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const t = (Date.now() - this.t0) / 1000;
    const sin = (period: number, phase = 0) => Math.sin((2 * Math.PI * t) / period + phase);
    if (this.opts.motion) {
      put('pitch', 14 * sin(23) + 3 * sin(4.1));
      put('roll', 20 * sin(31, 1) + 4 * sin(3.3));
      live.headingTrue.value = true;
      put('heading', wrap360(t * 6 + 25 * sin(17)));
      put('altitude', 1450 + 60 * sin(90) + 2 * sin(7));
    }
    if (this.opts.engine) {
      // Coolant drifts up into the warning band once a minute so alerts can be checked.
      put('coolant', 92 + 9 * Math.max(0, sin(60, -1.2)) + 0.4 * sin(5));
      put('ambient', 18 + 3 * sin(240));
      put('battery', 13.9 - 1.6 * Math.max(0, sin(45, 2)) + 0.05 * sin(1.7));
      put('cabin', 22 + 2 * sin(300));
      // Humidity climbs into fog-risk range now and then so the warning can be seen.
      put('humidity', 55 + 30 * Math.max(0, sin(150, 0.5)) + sin(9));
    }
  }
}
