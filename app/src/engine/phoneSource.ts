import { Barometer, DeviceMotion, Magnetometer } from 'expo-sensors';
import { pressureToAltitudeM } from '../core/altitude';
import { EmaFilter, HeadingFilter } from '../core/filters';
import {
  attitude, defaultMount, magneticHeading, mountFromUp, norm, normalize, wrap360,
  type Mount, type Vec3,
} from '../core/orientation';
import { put, live, statusStore } from './live';
import { settingsStore } from './settings';

type Sub = { remove(): void };

// Pitch, roll, heading and altitude from the phone's own sensors.
// Requires a rigid mount: the phone measures itself, not the vehicle.
export class PhoneSource {
  private subs: Sub[] = [];
  private up: Vec3 | null = null;
  private upAvg: Vec3 | null = null; // slow average used when zeroing
  private mag: Vec3 | null = null;
  private autoMount: Mount | null = null;
  private lastMotionMs = 0;
  private lastBaroMs = 0;
  private lastDiagMs = 0;
  private pressureHpa: number | null = null;

  private readonly pitchF = new EmaFilter(0.15);
  private readonly rollF = new EmaFilter(0.15);
  private readonly headingF = new HeadingFilter(0.4);
  private readonly altF = new EmaFilter(0.5);

  async start(): Promise<void> {
    if (await DeviceMotion.isAvailableAsync()) {
      DeviceMotion.setUpdateInterval(20); // 50 Hz
      this.subs.push(DeviceMotion.addListener(d => this.onMotion(d)));
    } else {
      statusStore.set({ message: 'This phone has no motion sensors.' });
    }
    if (await Magnetometer.isAvailableAsync()) {
      Magnetometer.setUpdateInterval(40);
      this.subs.push(Magnetometer.addListener(m => (this.mag = [m.x, m.y, m.z])));
    }
    if (await Barometer.isAvailableAsync()) {
      Barometer.setUpdateInterval(100);
      this.subs.push(Barometer.addListener(b => this.onPressure(b.pressure)));
    }
  }

  stop(): void {
    this.subs.forEach(s => s.remove());
    this.subs = [];
    this.pitchF.reset();
    this.rollF.reset();
    this.headingF.reset();
    this.altF.reset();
  }

  // Stores the current pose as level. Park on flat ground first.
  zeroLevel(): Mount | null {
    const up = this.upAvg ?? this.up;
    if (!up) return null;
    this.pitchF.reset();
    this.rollF.reset();
    return mountFromUp(up);
  }

  lastPressure(): number | null {
    return this.pressureHpa;
  }

  resetAltitudeFilter(): void {
    this.altF.reset();
  }

  private onMotion(d: {
    acceleration: { x: number; y: number; z: number } | null;
    accelerationIncludingGravity: { x: number; y: number; z: number } | null;
  }): void {
    const g = d.accelerationIncludingGravity;
    if (!g) return;
    const a = d.acceleration;
    const s = settingsStore.get();
    // Gravity reaction (points up) = total minus linear acceleration, both fused by Android.
    const raw: Vec3 = a ? [g.x - a.x, g.y - a.y, g.z - a.z] : [g.x, g.y, g.z];
    if (norm(raw) < 3) return; // free fall or a bad sample
    const up = normalize(raw.map(v => v * s.gravitySign) as Vec3);
    this.up = up;

    const now = Date.now();
    const dt = this.lastMotionMs ? (now - this.lastMotionMs) / 1000 : 0;
    this.lastMotionMs = now;

    const k = 1 - Math.exp(-dt / 0.5);
    this.upAvg = this.upAvg
      ? normalize([0, 1, 2].map(i => this.upAvg![i] + k * (up[i] - this.upAvg![i])) as Vec3)
      : up;

    if (!this.autoMount) this.autoMount = defaultMount(up);
    const mount = s.mount ?? this.autoMount;

    const att = attitude(up, mount);
    put('pitch', this.pitchF.update(att.pitchDeg, dt));
    put('roll', this.rollF.update(att.rollDeg, dt));

    const field = this.mag ? norm(this.mag) : null;
    if (this.mag) {
      const h = magneticHeading(up, this.mag, mount);
      if (h !== null) {
        const filtered = this.headingF.update(h, dt);
        const decl = s.declinationDeg;
        live.headingTrue.value = decl !== null;
        put('heading', decl !== null ? wrap360(filtered + decl) : filtered);
      }
    }
    if (now - this.lastDiagMs > 250) {
      this.lastDiagMs = now;
      statusStore.set({
        gravity: raw,
        magFieldUt: field !== null ? Math.round(field) : null,
        magDisturbed: field !== null && (field < 20 || field > 70),
      });
    }
  }

  private onPressure(p: number): void {
    if (!Number.isFinite(p) || p < 300 || p > 1100) return;
    this.pressureHpa = p;
    const now = Date.now();
    const dt = this.lastBaroMs ? (now - this.lastBaroMs) / 1000 : 0;
    this.lastBaroMs = now;
    const alt = pressureToAltitudeM(p, settingsStore.get().qnhHpa);
    put('altitude', this.altF.update(alt, dt));
    if (Math.abs((statusStore.get().pressureHpa ?? 0) - p) > 0.05) {
      statusStore.set({ pressureHpa: Math.round(p * 100) / 100 });
    }
  }
}
