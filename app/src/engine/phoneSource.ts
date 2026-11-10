import { Barometer, DeviceMotion, Magnetometer } from 'expo-sensors';
import { gpsAltitudeUsable, pressureToAltitudeM, resolveAltitudeSource, type AltitudeSource } from '../core/altitude';
import { EmaFilter, HeadingFilter } from '../core/filters';
import {
  attitude, defaultMount, upFromDeviceMotion, magneticHeading, mountFromUp, norm, normalize,
  type Mount, type Vec3,
} from '../core/orientation';
import { resolveHeading } from '../core/heading';
import { applyMagCal, MagCalibrator } from '../core/magcal';
import { put, live, statusStore } from './live';
import { settingsStore, TILT_SMOOTHING_TAU_S } from './settings';

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
  private hasBaro = false;
  private lastGpsMs = 0;
  private altSrc: AltitudeSource | null = null;
  private magCal: MagCalibrator | null = null;

  private readonly pitchF = new EmaFilter(0.15);
  private readonly rollF = new EmaFilter(0.15);
  private readonly headingF = new HeadingFilter(0.4);
  private readonly altF = new EmaFilter(0.5);
  private readonly gpsAltF = new EmaFilter(4); // GPS height is noisy: smooth harder

  async start(): Promise<void> {
    const rateHz = settingsStore.get().sensorRateHz;
    if (await DeviceMotion.isAvailableAsync()) {
      DeviceMotion.setUpdateInterval(Math.round(1000 / rateHz));
      this.subs.push(DeviceMotion.addListener(d => this.onMotion(d)));
    } else {
      statusStore.set({ message: 'This phone has no motion sensors.' });
    }
    if (await Magnetometer.isAvailableAsync()) {
      Magnetometer.setUpdateInterval(40);
      this.subs.push(Magnetometer.addListener(m => {
        const raw: Vec3 = [m.x, m.y, m.z];
        if (this.magCal) {
          this.magCal.add(raw);
          const progress = this.magCal.progressText();
          if (progress !== statusStore.get().magCalProgress) statusStore.set({ magCalProgress: progress });
        }
        this.mag = applyMagCal(raw, settingsStore.get().magCal);
      }));
    }
    this.hasBaro = await Barometer.isAvailableAsync();
    statusStore.set({ baroAvailable: this.hasBaro });
    if (this.hasBaro) {
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
    this.gpsAltF.reset();
    this.altSrc = null;
  }

  // Stores the current pose as level. Park on flat ground first.
  zeroLevel(): Mount | null {
    const up = this.upAvg ?? this.up;
    if (!up) return null;
    this.pitchF.reset();
    this.rollF.reset();
    return mountFromUp(up);
  }

  // Compass calibration: collect while the user turns the phone or drives a circle.
  startMagCal(): void {
    this.magCal = new MagCalibrator();
    statusStore.set({ magCalActive: true, magCalProgress: this.magCal.progressText() });
  }

  finishMagCal(): Vec3 | null {
    const off = this.magCal?.finish() ?? null;
    this.magCal = null;
    statusStore.set({ magCalActive: false, magCalProgress: null });
    if (off) this.headingF.reset();
    return off;
  }

  cancelMagCal(): void {
    this.magCal = null;
    statusStore.set({ magCalActive: false, magCalProgress: null });
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
    // Up direction in the device frame (see upFromDeviceMotion for the sign convention).
    const raw = upFromDeviceMotion(g, a);
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

    const tau = TILT_SMOOTHING_TAU_S[s.tiltSmoothing];
    this.pitchF.setTau(tau);
    this.rollF.setTau(tau);
    const att = attitude(up, mount);
    put('pitch', this.pitchF.update(att.pitchDeg, dt));
    put('roll', this.rollF.update(att.rollDeg, dt));

    const field = this.mag ? norm(this.mag) : null;
    if (this.mag) {
      const h = magneticHeading(up, this.mag, mount);
      if (h !== null) {
        const filtered = this.headingF.update(h, dt);
        const r = resolveHeading(filtered, {
          northRef: s.northRef, declinationMode: s.declinationMode, learnedDeclinationDeg: s.declinationDeg,
          manualDeclinationDeg: s.manualDeclinationDeg, headingOffsetDeg: s.headingOffsetDeg,
        });
        live.headingTrue.value = r.isTrue;
        put('heading', r.deg);
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

  // Picks the altitude sensor from the setting and what the device has; resets filters on a change.
  private activeAltSource(): AltitudeSource {
    const src = resolveAltitudeSource(settingsStore.get().altitudeSource, this.hasBaro);
    if (src !== this.altSrc) {
      this.altSrc = src;
      this.altF.reset();
      this.gpsAltF.reset();
      statusStore.set({ altitudeSource: src });
    }
    return src;
  }

  // GPS height, used when the setting is GPS or the device has no barometer. Poor fixes are
  // dropped, so the gauge greys out instead of showing a bad number.
  onGpsAltitude(altM: number | null, accM: number | null): void {
    if (this.activeAltSource() !== 'gps') return;
    if (!gpsAltitudeUsable(altM, accM)) return;
    const now = Date.now();
    const dt = this.lastGpsMs ? (now - this.lastGpsMs) / 1000 : 0;
    this.lastGpsMs = now;
    put('altitude', this.gpsAltF.update(altM, dt) + settingsStore.get().altitudeOffsetM);
  }

  private onPressure(p: number): void {
    if (!Number.isFinite(p) || p < 300 || p > 1100) return;
    this.pressureHpa = p;
    const now = Date.now();
    const dt = this.lastBaroMs ? (now - this.lastBaroMs) / 1000 : 0;
    this.lastBaroMs = now;
    if (this.activeAltSource() === 'baro') {
      const s = settingsStore.get();
      const alt = pressureToAltitudeM(p, s.qnhHpa);
      put('altitude', this.altF.update(alt, dt) + s.altitudeOffsetM);
    }
    if (Math.abs((statusStore.get().pressureHpa ?? 0) - p) > 0.05) {
      statusStore.set({ pressureHpa: Math.round(p * 100) / 100 });
    }
  }
}
