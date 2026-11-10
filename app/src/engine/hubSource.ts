import { PermissionsAndroid, Platform } from 'react-native';
import {
  BleManager, ConnectionPriority, State, type Device, type Subscription,
} from 'react-native-ble-plx';
import {
  base64ToBytes, bytesToBase64, controlFrame, CONTROL, parseFrame, STATUS, STATUS2,
} from '../core/frame';
import { resolveHeading } from '../core/heading';
import { live, put, statusStore } from './live';
import { outsideProcessor } from './outsideProcessor';
import { settingsStore, updateSettings } from './settings';

const WANT_MTU = 64; // frame V3 is 28 bytes; the default MTU of 23 only carries 20

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
  const ok = Object.values(res).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
  statusStore.set({ bluetoothGranted: ok });
  return ok;
}

export async function requestBluetoothPermission(): Promise<boolean> {
  return ensurePermissions();
}

// Connects to the hub, streams telemetry frames (V2 or V3), and reconnects whenever the link drops.
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
    statusStore.set({ hub: 'off', hubName: null, hubFrameVersion: null });
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
      if (Platform.OS === 'android') {
        const m = await d.requestMTU(WANT_MTU).catch(() => d);
        if ((m.mtu ?? 23) < 31) statusStore.set({ message: 'REQUEST_MTU too small for TelemetryFrameV3' });
      }
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
    const f = parseFrame(base64ToBytes(b64));
    if (!f) return; // unknown frame version: ignore rather than misread
    const s = settingsStore.get();
    if (this.opts.motion) {
      put('pitch', f.pitchDeg);
      put('roll', f.rollDeg);
      if (f.headingMagDeg !== null) {
        const h = resolveHeading(f.headingMagDeg, {
          northRef: s.northRef, declinationMode: s.declinationMode, learnedDeclinationDeg: s.declinationDeg,
          manualDeclinationDeg: s.manualDeclinationDeg, headingOffsetDeg: s.headingOffsetDeg,
        });
        live.headingTrue.value = h.isTrue;
        put('heading', h.deg);
      }
      put('altitude', f.altitudeM !== null ? f.altitudeM + s.altitudeOffsetM : null);
    }
    if (this.opts.engine) {
      put('coolant', f.status & STATUS.COOLANT_FAULT ? null : f.coolantC);
      put('battery', f.batteryV);
      const a1 = f.status & (STATUS.AMBIENT_FAULT | STATUS.AMBIENT_STALE) ? null : f.ambientC;
      const a2 = f.status2 & (STATUS2.AMBIENT2_FAULT | STATUS2.AMBIENT2_STALE) ? null : f.ambient2C;
      outsideProcessor.process(a1, a2);
      put('cabin', f.status2 & (STATUS2.CABIN_FAULT | STATUS2.CABIN_STALE) ? null : f.cabinC);
      put('humidity', f.status2 & STATUS2.HUMIDITY_FAULT ? null : f.cabinRhPct);
    }
    const st = statusStore.get();
    if (f.status !== st.hubStatusBits || f.status2 !== st.hubStatus2Bits || f.version !== st.hubFrameVersion) {
      statusStore.set({
        hubStatusBits: f.status,
        hubStatus2Bits: f.status2,
        hubFrameVersion: f.version,
        magDisturbed: (f.status & STATUS.MAG_DISTURBED) !== 0,
      });
    }
  }
}
