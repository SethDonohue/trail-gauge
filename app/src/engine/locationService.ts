import * as Location from 'expo-location';
import { wrap180 } from '../core/orientation';
import { statusStore } from './live';
import { settingsStore, updateSettings } from './settings';

type Sub = { remove(): void };

// GNSS for speed (settings lockout), GPS elevation and magnetic declination.
export class LocationService {
  private subs: Sub[] = [];
  private headingSub: Sub | null = null;

  async start(): Promise<void> {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    statusStore.set({ locationGranted: granted });
    if (!granted) return;

    this.subs.push(
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        loc => {
          const c = loc.coords;
          statusStore.set({
            speedMps: c.speed !== null && c.speed >= 0 ? c.speed : null,
            gpsAltitudeM: c.altitude,
            gpsVerticalAccM: c.altitudeAccuracy,
          });
          if (!this.headingSub) this.learnDeclination();
        },
      ),
    );
  }

  stop(): void {
    this.subs.forEach(s => s.remove());
    this.subs = [];
    this.headingSub?.remove();
    this.headingSub = null;
  }

  // Android's heading service reports true and magnetic heading from the same reading once it
  // has a location; their difference is the local declination. Learned once, then saved.
  private async learnDeclination(): Promise<void> {
    if (settingsStore.get().declinationDeg !== null) {
      this.headingSub = { remove() {} };
      return;
    }
    this.headingSub = await Location.watchHeadingAsync(h => {
      if (h.trueHeading >= 0 && h.magHeading >= 0) {
        updateSettings({ declinationDeg: Math.round(wrap180(h.trueHeading - h.magHeading) * 10) / 10 });
        this.headingSub?.remove();
        this.headingSub = { remove() {} };
      }
    });
  }
}
