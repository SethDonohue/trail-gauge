import { qnhFromElevation } from '../core/altitude';
import { CONTROL } from '../core/frame';
import { alertMonitor } from './alertMonitor';
import { DemoSource } from './demoSource';
import { HubSource } from './hubSource';
import { live, setTiltUpdateMs, statusStore } from './live';
import { LocationService } from './locationService';
import { nightService } from './nightService';
import { outsideProcessor } from './outsideProcessor';
import { PhoneSource } from './phoneSource';
import { settingsStore, updateSettings, type Settings } from './settings';

// Starts and stops the data sources to match the settings.
class Engine {
  private phone: PhoneSource | null = null;
  private hub: HubSource | null = null;
  private demo: DemoSource | null = null;
  private readonly location = new LocationService();
  private key = '';

  async start(): Promise<void> {
    await outsideProcessor.init();
    this.location.onFix = (alt, acc) => this.phone?.onGpsAltitude(alt, acc);
    this.location.start().catch(() => statusStore.set({ locationGranted: false }));
    this.apply(settingsStore.get());
    settingsStore.subscribe(() => this.apply(settingsStore.get()));
    alertMonitor.start();
    nightService.start();
  }

  // Asks for location again (from Setup or Settings); returns whether it is allowed now.
  async requestLocation(): Promise<boolean> {
    this.location.stop();
    await this.location.start().catch(() => statusStore.set({ locationGranted: false }));
    return statusStore.get().locationGranted === true;
  }

  private apply(s: Settings): void {
    setTiltUpdateMs(s.tiltUpdateMs);
    const key = `${s.motionSource}/${s.engineSource}/${s.sensorRateHz}`;
    if (key === this.key) return;
    this.key = key;

    this.phone?.stop();
    this.hub?.stop();
    this.demo?.stop();
    this.phone = this.hub = this.demo = null;

    if (s.motionSource === 'phone') {
      this.phone = new PhoneSource();
      this.phone.start();
    }
    const hubMotion = s.motionSource === 'hub';
    const hubEngine = s.engineSource === 'hub';
    if (hubMotion || hubEngine) {
      this.hub = new HubSource({ motion: hubMotion, engine: hubEngine });
      this.hub.start();
    }
    const demoMotion = s.motionSource === 'demo';
    const demoEngine = s.engineSource === 'demo';
    if (demoMotion || demoEngine) {
      this.demo = new DemoSource({ motion: demoMotion, engine: demoEngine });
      this.demo.start();
    }
  }

  async zeroLevel(): Promise<string> {
    const s = settingsStore.get();
    if (s.motionSource === 'phone' && this.phone) {
      const mount = this.phone.zeroLevel();
      if (!mount) return 'No motion data yet.';
      updateSettings({ mount });
      return 'Level zeroed.';
    }
    if (s.motionSource === 'hub' && this.hub) {
      return (await this.hub.sendControl(CONTROL.ZERO_LEVEL)) ? 'Hub zeroed.' : 'Hub not connected.';
    }
    return 'Nothing to zero in demo mode.';
  }

  clearZero(): void {
    updateSettings({ mount: null });
  }

  // Compass calibration. Phone: figure-8 or a slow circle, collected here. Hub: the hub collects.
  async startCompassCalibration(): Promise<string> {
    const s = settingsStore.get();
    if (s.motionSource === 'phone' && this.phone) {
      this.phone.startMagCal();
      return 'Calibrating: turn the phone slowly in a figure-8, or drive a slow full circle.';
    }
    if (s.motionSource === 'hub' && this.hub) {
      if (!(await this.hub.sendControl(CONTROL.MAG_CAL_START))) return 'Hub not connected.';
      statusStore.set({ magCalActive: true, magCalProgress: null });
      return 'Hub calibrating: drive a slow full circle, then tap Finish.';
    }
    return 'Not available in demo mode.';
  }

  async finishCompassCalibration(): Promise<string> {
    const s = settingsStore.get();
    if (s.motionSource === 'phone' && this.phone) {
      const off = this.phone.finishMagCal();
      if (!off) return 'Not enough turning: try again and cover more directions.';
      updateSettings({ magCal: off });
      return 'Compass calibrated.';
    }
    if (s.motionSource === 'hub' && this.hub) {
      statusStore.set({ magCalActive: false });
      return (await this.hub.sendControl(CONTROL.MAG_CAL_STOP)) ? 'Hub calibration saved.' : 'Hub not connected.';
    }
    return 'Not available in demo mode.';
  }

  cancelCompassCalibration(): void {
    this.phone?.cancelMagCal();
    if (statusStore.get().magCalActive) {
      this.hub?.sendControl(CONTROL.MAG_CAL_STOP);
      statusStore.set({ magCalActive: false, magCalProgress: null });
    }
  }

  clearCompassCalibration(): void {
    updateSettings({ magCal: null });
  }

  // Makes the current reading equal a known elevation (from a map, sign or benchmark).
  async setElevation(elevationM: number): Promise<string> {
    const s = settingsStore.get();
    let pressure: number | null = null;
    if (s.motionSource === 'phone') {
      pressure = this.phone?.lastPressure() ?? null;
      if (pressure === null) return 'No barometer here: altitude comes from GPS, so there is nothing to calibrate.';
    } else if (s.motionSource === 'hub') {
      const alt = live.altitude.value - s.altitudeOffsetM;
      if (!Number.isFinite(alt)) return 'No altitude from the hub yet.';
      pressure = s.qnhHpa * Math.pow(1 - alt / 44330, 1 / 0.190295);
    } else {
      return 'Not available in demo mode.';
    }
    const qnh = qnhFromElevation(pressure, elevationM);
    if (!(qnh > 850 && qnh < 1100)) return 'That elevation does not fit the current pressure.';
    updateSettings({ qnhHpa: qnh, altitudeOffsetM: 0 }); // setting an elevation resets the offset
    this.phone?.resetAltitudeFilter();
    if (this.hub) await this.hub.sendControl(CONTROL.SET_QNH_PA, qnh * 100);
    return `Reference set (${qnh.toFixed(1)} hPa).`;
  }

  gpsElevation(): number | null {
    return statusStore.get().gpsAltitudeM;
  }

  // Sets the reference pressure directly (a local altimeter setting from an airport or weather report).
  async setQnh(hpa: number): Promise<string> {
    if (!(hpa >= 850 && hpa <= 1100)) return 'Enter hPa, e.g. 1013.';
    updateSettings({ qnhHpa: hpa });
    this.phone?.resetAltitudeFilter();
    if (this.hub) await this.hub.sendControl(CONTROL.SET_QNH_PA, hpa * 100);
    return `Reference set (${hpa.toFixed(1)} hPa).`;
  }

  resetDeclination(): void {
    updateSettings({ declinationDeg: null });
    this.location.stop();
    this.location.start();
  }
}

export const engine = new Engine();
