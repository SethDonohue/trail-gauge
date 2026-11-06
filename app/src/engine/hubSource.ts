import { PermissionsAndroid, Platform } from 'react-native';
import {
  BleManager, ConnectionPriority, State, type Device, type Subscription,
} from 'react-native-ble-plx';
import {
  base64ToBytes, bytesToBase64, controlFrame, CONTROL, parseFrameV2, STATUS,
} from '../core/frame';
import { wrap360 } from '../core/orientation';
import { live, put, statusStore } from './live';
import { settingsStore, updateSettings } from './settings';

// GATT UUIDs for the TrailGauge hub (spec §7). Frozen: the firmware uses the same values.
export const HUB_UUID = {
  service: 'a20e0001-240c-4924-aaba-7c4e08e605de',
  telemetry: 'a20e0002-240c-4924-aaba-7c4e08e605de',
  aux: 'a20e0003-240c-4924-aaba-7c4e08e605de',
  control: 'a20e0004-240c-4924-aaba-7c4e08e605de',
  info: 'a20e0005-240c-4924-aaba-7c4e08e605de',
  events: 'a20e0006-240c-4924-aaba-7c4e08e605de',
};

let manager: BleManager | null = null;
const getManager = () => (manager ??= new BleManager());

async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(res).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
}

// Connects to the hub, streams TelemetryFrameV2, and reconnects whenever the link drops.
export class HubSource {
  private running = false;
  private device: Device | null = null;
  private subs: Subscription[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: { motion: boolean; engine: boolean }) {}

  async start(): Promise<void> {
    this.running = true;
    if (!(await ensurePermissions())) {
      statusStore.set({ hub: 'no permission' });
      return;
    }
    const m = getManager();
    this.subs.push(
      m.onStateChange(state => {
        if (state === State.PoweredOn) this.scan();
        else if (state === State.PoweredOff) statusStore.set({ hub: 'bluetooth off' });
      }, true),
    );
  }

  stop(): void {
    this.running = false;
    if (this.retry) clearTimeout(this.retry);
    this.subs.forEach(s => s.remove());
    this.subs = [];
    getManager().stopDeviceScan();
    this.device?.cancelConnection().catch(() => {});
    this.device = null;
    statusStore.set({ hub: 'off', hubName: null });
  }

  async sendControl(opcode: number, payload?: number): Promise<boolean> {
    if (!this.device) return false;
    try {
      await this.device.writeCharacteristicWithResponseForService(
        HUB_UUID.service, HUB_UUID.control, bytesToBase64(controlFrame(opcode, payload)),
      );
      return true;
    } catch {
      return false;
    }
  }

  private scan(): void {
    if (!this.running || this.device) return;
    statusStore.set({ hub: 'scanning' });
    const m = getManager();
    m.startDeviceScan([HUB_UUID.service], { allowDuplicates: false }, (err, dev) => {
      if (err) {
        statusStore.set({ message: `Bluetooth scan failed: ${err.message}` });
        this.scheduleRetry();
        return;
      }
      if (!dev) return;
      const saved = settingsStore.get().hubDeviceId;
      if (saved && dev.id !== saved) return; // stay with the paired hub
      m.stopDeviceScan();
      this.connect(dev);
    });
  }

  private async connect(dev: Device): Promise<void> {
    statusStore.set({ hub: 'connecting', hubName: dev.name ?? 'TrailGauge hub' });
    try {
      const d = await dev.connect({ timeout: 10000 });
      await d.discoverAllServicesAndCharacteristics();
      await d.requestConnectionPriority(ConnectionPriority.High).catch(() => d);
      this.device = d;
      if (!settingsStore.get().hubDeviceId) updateSettings({ hubDeviceId: d.id });

      this.subs.push(
        d.onDisconnected(() => {
          this.device = null;
          statusStore.set({ hub: 'scanning' });
          this.scheduleRetry();
        }),
      );
      this.subs.push(
        d.monitorCharacteristicForService(HUB_UUID.service, HUB_UUID.telemetry, (e, ch) => {
          if (e || !ch?.value) return;
          this.onFrame(ch.value);
        }),
      );
      statusStore.set({ hub: 'connected' });
      // Give the hub the current altitude reference.
      await this.sendControl(CONTROL.SET_QNH_PA, settingsStore.get().qnhHpa * 100);
    } catch (e) {
      this.device = null;
      statusStore.set({ message: `Hub connection failed: ${(e as Error).message}` });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => this.scan(), 2000);
  }

  private onFrame(b64: string): void {
    const f = parseFrameV2(base64ToBytes(b64));
    if (!f) return; // unknown frame version: ignore rather than misread
    if (this.opts.motion) {
      put('pitch', f.pitchDeg);
      put('roll', f.rollDeg);
      if (f.headingMagDeg !== null) {
        const decl = settingsStore.get().declinationDeg;
        live.headingTrue.value = decl !== null;
        put('heading', decl !== null ? wrap360(f.headingMagDeg + decl) : f.headingMagDeg);
      }
      put('altitude', f.altitudeM);
    }
    if (this.opts.engine) {
      put('coolant', f.status & STATUS.COOLANT_FAULT ? null : f.coolantC);
      put('ambient', f.status & STATUS.AMBIENT_FAULT ? null : f.ambientC);
      put('battery', f.batteryV);
    }
    if (f.status !== statusStore.get().hubStatusBits) {
      statusStore.set({
        hubStatusBits: f.status,
        magDisturbed: (f.status & STATUS.MAG_DISTURBED) !== 0,
      });
    }
  }
}
