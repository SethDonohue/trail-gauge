// Telemetry frames the TrailGauge hub notifies at 25 Hz, little-endian.
// V2 (20 bytes) is defined in the Rev B spec, section 7. V3 (28 bytes) appends the cabin
// sensor (temperature, humidity), a second outside sensor and a second status word:
//   20 int16  cabin temperature, 0.01 °C      (0x8000 = invalid)
//   22 uint16 cabin relative humidity, 0.01 %  (0xFFFF = invalid)
//   24 int16  second outside temperature, 0.01 °C
//   26 uint16 status2 (STATUS2 bits)
// V3 needs an ATT MTU of at least 31 (28 + 3); the app requests 64 after connecting.

export const FRAME_V2_LEN = 20;
export const FRAME_V3_LEN = 28;
export const FRAME_VERSION = 2;
export const FRAME_V3_VERSION = 3;

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
  // V3 only (null / 0 in a V2 frame).
  version: 2 | 3;
  cabinC: number | null;
  cabinRhPct: number | null;
  ambient2C: number | null;
  status2: number;
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

export const STATUS2 = {
  CABIN_STALE: 1 << 0,
  CABIN_FAULT: 1 << 1,
  HUMIDITY_FAULT: 1 << 2,
  AMBIENT2_STALE: 1 << 3,
  AMBIENT2_FAULT: 1 << 4,
  NO_VEHICLE_BUS: 1 << 5, // the hub knows it has no CAN/OBD-II connection: CAN_ERROR is not a fault
} as const;

const I16_INVALID = -0x8000;
const U16_INVALID = 0xffff;
const I32_INVALID = -0x80000000;

// Parses a V2 or V3 frame; anything else returns null rather than being misread.
export function parseFrame(bytes: Uint8Array): HubFrame | null {
  if (bytes.length === FRAME_V2_LEN && bytes[0] === FRAME_VERSION) return parseFrameV2(bytes);
  if (bytes.length === FRAME_V3_LEN && bytes[0] === FRAME_V3_VERSION) return parseFrameV3(bytes);
  return null;
}

export function parseFrameV3(bytes: Uint8Array): HubFrame | null {
  if (bytes.length !== FRAME_V3_LEN || bytes[0] !== FRAME_V3_VERSION) return null;
  const head = new Uint8Array(bytes.subarray(0, FRAME_V2_LEN));
  head[0] = FRAME_VERSION;
  const f = parseFrameV2(head)!;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const t = (o: number) => {
    const v = dv.getInt16(o, true);
    return v === I16_INVALID ? null : v / 100;
  };
  const rh = dv.getUint16(22, true);
  return {
    ...f,
    version: 3,
    cabinC: t(20),
    cabinRhPct: rh === U16_INVALID ? null : rh / 100,
    ambient2C: t(24),
    status2: dv.getUint16(26, true),
  };
}

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
    version: 2,
    cabinC: null,
    cabinRhPct: null,
    ambient2C: null,
    status2: 0,
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

export function encodeFrameV3(f: HubFrame): Uint8Array {
  const out = new Uint8Array(FRAME_V3_LEN);
  out.set(encodeFrameV2(f), 0);
  out[0] = FRAME_V3_VERSION;
  const dv = new DataView(out.buffer);
  const r = (v: number | null, k: number, invalid: number) => (v === null ? invalid : Math.round(v * k));
  dv.setInt16(20, r(f.cabinC, 100, I16_INVALID), true);
  dv.setUint16(22, r(f.cabinRhPct, 100, U16_INVALID), true);
  dv.setInt16(24, r(f.ambient2C, 100, I16_INVALID), true);
  dv.setUint16(26, f.status2 & 0xffff, true);
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
