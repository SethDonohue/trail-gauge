import { qnhFromElevation } from '../core/altitude';
import { CONTROL } from '../core/frame';
import { DemoSource } from './demoSource';
import { HubSource } from './hubSource';
import { live, statusStore } from './live';
import { LocationService } from './locationService';
import { PhoneSource } from './phoneSource';
import { settingsStore, updateSettings, type Settings } from './settings';

// Starts and stops the data sources to match the settings.
class Engine {
  private phone: PhoneSource | null = null;
  private hub: HubSource | null = null;
  private demo: DemoSource | null = null;
  private readonly location = new LocationService();
  private key = '';

  start(): void {
    this.location.start().catch(() => statusStore.set({ locationGranted: false }));
    this.apply(settingsStore.get());
    settingsStore.subscribe(() => this.apply(settingsStore.get()));
  }

  private apply(s: Settings): void {
    const key = `${s.motionSource}/${s.engineSource}`;
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

  // Makes the current reading equal a known elevation (from a map, sign or benchmark).
  async setElevation(elevationM: number): Promise<string> {
    const s = settingsStore.get();
    let pressure: number | null = null;
    if (s.motionSource === 'phone') {
      pressure = this.phone?.lastPressure() ?? null;
      if (pressure === null) return 'This phone has no barometer.';
    } else if (s.motionSource === 'hub') {
      const alt = live.altitude.value;
      if (!Number.isFinite(alt)) return 'No altitude from the hub yet.';
      pressure = s.qnhHpa * Math.pow(1 - alt / 44330, 1 / 0.190295);
    } else {
      return 'Not available in demo mode.';
    }
    const qnh = qnhFromElevation(pressure, elevationM);
    if (!(qnh > 850 && qnh < 1100)) return 'That elevation does not fit the current pressure.';
    updateSettings({ qnhHpa: qnh });
    this.phone?.resetAltitudeFilter();
    if (this.hub) await this.hub.sendControl(CONTROL.SET_QNH_PA, qnh * 100);
    return `Reference set (${qnh.toFixed(1)} hPa).`;
  }

  gpsElevation(): number | null {
    return statusStore.get().gpsAltitudeM;
  }

  resetDeclination(): void {
    updateSettings({ declinationDeg: null });
    this.location.stop();
    this.location.start();
  }
}

export const engine = new Engine();
