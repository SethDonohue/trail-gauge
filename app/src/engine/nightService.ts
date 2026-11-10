import { Platform } from 'react-native';
import { LightSensor } from 'expo-sensors';
import { decideNight, LuxNightDetector, sunElevationDeg } from '../core/night';
import { statusStore } from './live';
import { settingsStore } from './settings';

type Sub = { remove(): void };

// Decides night mode from the light sensor (Android), else the sun from GPS, else the clock.
class NightService {
  private detector = new LuxNightDetector();
  private luxNight: boolean | null = null;
  private sub: Sub | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (this.timer) return;
    const has = Platform.OS === 'android' && (await LightSensor.isAvailableAsync().catch(() => false));
    statusStore.set({ hasLightSensor: has });
    if (has) {
      LightSensor.setUpdateInterval(1000);
      this.sub = LightSensor.addListener(({ illuminance }) => {
        this.luxNight = this.detector.update(illuminance, Date.now());
      });
    }
    this.evaluate();
    this.timer = setInterval(() => this.evaluate(), 2000);
    settingsStore.subscribe(() => this.evaluate());
  }

  stop(): void {
    this.sub?.remove();
    this.sub = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private evaluate(): void {
    const st = statusStore.get();
    const now = new Date();
    const sun = st.latitude !== null && st.longitude !== null
      ? sunElevationDeg(now, st.latitude, st.longitude)
      : null;
    const night = decideNight({
      mode: settingsStore.get().nightMode,
      luxNight: this.luxNight,
      sunElevationDeg: sun,
      localHour: now.getHours(),
    });
    if (night !== st.night) statusStore.set({ night });
  }
}

export const nightService = new NightService();
