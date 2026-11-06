// TelemetryFrameV2: the 20-byte little-endian frame the TrailGauge hub notifies at 25 Hz.
// Layout and sentinels are defined in the Rev B spec, section 7.

export const FRAME_V2_LEN = 20;
export const FRAME_VERSION = 2;

export interface HubFrame {
  seq: number;
  pitchDeg: number | null;
  rollDeg: number | null;
  headingMagDeg: number | null;
  altitudeM: number | null;
  coolantC: number | null;
  ambientC: number | null;
  batteryV: number | null;
  status: number;
}

export const STATUS = {
  IMU_FAULT: 1 << 0,
  NOT_ZEROED: 1 << 1,
  MAG_UNCALIBRATED: 1 << 2,
  MAG_DISTURBED: 1 << 3,
  BARO_FAULT: 1 << 4,
  QNH_NOT_SET: 1 << 5,
  COOLANT_STALE: 1 << 6,
  COOLANT_FAULT: 1 << 7,
  AMBIENT_STALE: 1 << 8,
  AMBIENT_FAULT: 1 << 9,
  BATTERY_LOW: 1 << 10,
  CAN_ERROR: 1 << 11,
  IGNITION_OFF: 1 << 12,
  DYNAMIC: 1 << 13,
} as const;

const I16_INVALID = -0x8000;
const U16_INVALID = 0xffff;
const I32_INVALID = -0x80000000;

export function parseFrameV2(bytes: Uint8Array): HubFrame | null {
  if (bytes.length !== FRAME_V2_LEN || bytes[0] !== FRAME_VERSION) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const i16 = (o: number, k: number): number | null => {
    const v = dv.getInt16(o, true);
    return v === I16_INVALID ? null : v / k;
  };
  const u16 = (o: number, k: number): number | null => {
    const v = dv.getUint16(o, true);
    return v === U16_INVALID ? null : v / k;
  };
  const alt = dv.getInt32(8, true);
  const heading = u16(6, 100);
  return {
    seq: dv.getUint8(1),
    pitchDeg: i16(2, 100),
    rollDeg: i16(4, 100),
    headingMagDeg: heading !== null && heading < 360 ? heading : null,
    altitudeM: alt === I32_INVALID ? null : alt / 100,
    coolantC: i16(12, 100),
    ambientC: i16(14, 100),
    batteryV: u16(16, 1000),
    status: dv.getUint16(18, true),
  };
}

// Used by tests and by the hub firmware's golden-vector check.
export function encodeFrameV2(f: HubFrame): Uint8Array {
  const out = new Uint8Array(FRAME_V2_LEN);
  const dv = new DataView(out.buffer);
  const r = (v: number | null, k: number, invalid: number) => (v === null ? invalid : Math.round(v * k));
  dv.setUint8(0, FRAME_VERSION);
  dv.setUint8(1, f.seq & 0xff);
  dv.setInt16(2, r(f.pitchDeg, 100, I16_INVALID), true);
  dv.setInt16(4, r(f.rollDeg, 100, I16_INVALID), true);
  dv.setUint16(6, r(f.headingMagDeg, 100, U16_INVALID), true);
  dv.setInt32(8, r(f.altitudeM, 100, I32_INVALID), true);
  dv.setInt16(12, r(f.coolantC, 100, I16_INVALID), true);
  dv.setInt16(14, r(f.ambientC, 100, I16_INVALID), true);
  dv.setUint16(16, r(f.batteryV, 1000, U16_INVALID), true);
  dv.setUint16(18, f.status & 0xffff, true);
  return out;
}

// Control characteristic opcodes (app -> hub). The hub firmware must implement the same table.
export const CONTROL = {
  ZERO_LEVEL: 0x01,
  MAG_CAL_START: 0x02,
  MAG_CAL_STOP: 0x03,
  SET_QNH_PA: 0x04, // payload: uint32 LE, pascals
} as const;

export function controlFrame(opcode: number, payload?: number): Uint8Array {
  if (payload === undefined) return Uint8Array.of(opcode);
  const out = new Uint8Array(5);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, opcode);
  dv.setUint32(1, Math.round(payload) >>> 0, true);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < b.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < b.length ? B64[n & 63] : '=';
  }
  return s;
}
