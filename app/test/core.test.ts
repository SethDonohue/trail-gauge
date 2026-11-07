import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBytes,
  bytesToBase64,
  encodeFrameV2,
  parseFrameV2,
} from '../src/core/frame.ts';
import { EmaFilter, HeadingFilter } from '../src/core/filters.ts';
import { attitude, defaultMount, magneticHeading, mountFromUp, type Vec3 } from '../src/core/orientation.ts';
import { pressureToAltitudeM, qnhFromElevation } from '../src/core/altitude.ts';
import { fmtAltitude, fmtHeading, fmtTemp } from '../src/core/format.ts';

const hex = (s: string) => Uint8Array.from(s.split(' ').map(h => parseInt(h, 16)));
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('golden frame vector from the spec decodes exactly', () => {
  const f = parseFrameV2(hex('02 2A D2 04 0C FE 9F 8C 40 E2 01 00 22 24 BB FE E8 35 20 00'));
  assert.ok(f);
  assert.equal(f.seq, 42);
  near(f.pitchDeg!, 12.34);
  near(f.rollDeg!, -5);
  near(f.headingMagDeg!, 359.99); // overflowed int16 in Rev A
  near(f.altitudeM!, 1234.56);
  near(f.coolantC!, 92.5);
  near(f.ambientC!, -3.25);
  near(f.batteryV!, 13.8);
  assert.equal(f.status, 0x20);
});

test('encode and parse round-trip, including invalid sentinels', () => {
  const src = {
    seq: 7, pitchDeg: null, rollDeg: 179.99, headingMagDeg: 0, altitudeM: -40.5,
    coolantC: null, ambientC: 45, batteryV: null, status: 0x3fff,
  };
  assert.deepEqual(parseFrameV2(encodeFrameV2(src)), src);
});

test('unknown version and wrong length are rejected', () => {
  const b = hex('03 2A D2 04 0C FE 9F 8C 40 E2 01 00 22 24 BB FE E8 35 20 00');
  assert.equal(parseFrameV2(b), null);
  assert.equal(parseFrameV2(b.subarray(0, 16)), null);
});

test('base64 round-trip', () => {
  for (let n = 0; n < 24; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
    assert.deepEqual(base64ToBytes(bytesToBase64(b)), b);
  }
  assert.equal(bytesToBase64(Uint8Array.of(1, 2, 3, 4)), Buffer.from([1, 2, 3, 4]).toString('base64'));
});

test('EMA seeds from first sample and reaches 63% at one time constant', () => {
  for (const dt of [0.01, 0.02, 0.05, 0.1]) {
    const f = new EmaFilter(0.5);
    assert.equal(f.update(10, dt), 10);
    let y = 10;
    for (let i = 0; i < Math.round(0.5 / dt); i++) y = f.update(20, dt);
    near(y, 10 + 10 * (1 - Math.exp(-1)), 1e-9);
  }
});

test('heading filter crosses north without swinging through 180', () => {
  const f = new HeadingFilter(0.3);
  f.update(355, 0.02);
  for (let i = 0; i < 50; i++) {
    const h = f.update(5, 0.02);
    assert.ok(h > 350 || h < 10, `swung to ${h}`);
  }
});

// Phone standing upright in landscape on the dash, screen facing the driver,
// top edge pointing to the vehicle's left. Device frame: x right, y top, z out of screen.
// Then: device -z = vehicle forward, device +x = vehicle up, device +y = vehicle left.
const rotZ = (v: Vec3, deg: number): Vec3 => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
};

test('mount from an upright landscape phone', () => {
  const m = mountFromUp([1, 0, 0]);
  assert.deepEqual(m.fwd.map(Math.round), [0, 0, -1]);
  assert.deepEqual(m.left.map(v => Math.round(v) + 0), [0, 1, 0]);
});

test('pitch: nose up gives positive pitch', () => {
  const m = mountFromUp([1, 0, 0]);
  // Nose up 10 deg: world up, seen in the device frame, tilts toward the vehicle's forward axis (-z).
  const r = (10 * Math.PI) / 180;
  const up: Vec3 = [Math.cos(r), 0, -Math.sin(r)];
  const a = attitude(up, m);
  near(a.pitchDeg, 10, 1e-9);
  near(a.rollDeg, 0, 1e-9);
});

test('roll: right side down gives positive roll', () => {
  const m = mountFromUp([1, 0, 0]);
  // Right side down: the vehicle's left side rises, so world up tilts toward device +y.
  const r = (15 * Math.PI) / 180;
  const up: Vec3 = [Math.cos(r), Math.sin(r), 0];
  const a = attitude(up, m);
  near(a.rollDeg, 15, 1e-9);
  near(a.pitchDeg, 0, 1e-9);
});

test('zero level removes a crooked mount', () => {
  // Mount tilted 7 deg; after zeroing, the same pose reads level.
  const up = rotZ([1, 0, 0], 7);
  const a = attitude(up, mountFromUp(up));
  near(a.pitchDeg, 0, 1e-9);
  near(a.rollDeg, 0, 1e-9);
  // Default (snapped) mount shows the crooked angle instead.
  const d = attitude(up, defaultMount(up));
  near(Math.hypot(d.pitchDeg, d.rollDeg), 7, 1e-6);
});

test('magnetic heading: vehicle pointing north, east, south-west', () => {
  const m = mountFromUp([1, 0, 0]);
  const up: Vec3 = [1, 0, 0];
  // Field points north and 60 deg downward. Vehicle forward is device -z.
  const field = (north: Vec3): Vec3 => {
    const k = Math.tan((60 * Math.PI) / 180);
    return [north[0] - k * up[0], north[1] - k * up[1], north[2] - k * up[2]].map(v => v * 20) as Vec3;
  };
  near(magneticHeading(up, field([0, 0, -1]), m)!, 0, 1e-6);   // north = forward
  near(magneticHeading(up, field([0, 1, 0]), m)!, 90, 1e-6);   // north = vehicle left -> facing east
  const sw = Math.SQRT1_2;
  near(magneticHeading(up, field([0, -sw, sw]), m)!, 225, 1e-6); // north behind-right -> facing south-west
});

test('altitude and QNH are inverse', () => {
  near(pressureToAltitudeM(1013.25, 1013.25), 0, 1e-9);
  const q = qnhFromElevation(850, 1500);
  near(pressureToAltitudeM(850, q), 1500, 1e-6);
});

test('formatting', () => {
  assert.equal(fmtHeading(359.6), '000°');
  assert.equal(fmtHeading(42.2), '042°');
  assert.equal(fmtAltitude(1234.56, 'imperial'), '4,050');
  assert.equal(fmtTemp(100, 'imperial'), '212°');
  assert.equal(fmtTemp(NaN, 'metric'), '--');
});

import { bestGrid, chunk } from '../src/core/layout.ts';

test('grid: three gauges on common screens', () => {
  assert.deepEqual(bestGrid(3, 900, 360), { cols: 3, rows: 1 });     // phone landscape
  assert.deepEqual(bestGrid(3, 380, 820), { cols: 1, rows: 3 });     // phone portrait
  assert.deepEqual(bestGrid(3, 1280, 760), { cols: 3, rows: 1 });    // tablet landscape
  assert.deepEqual(bestGrid(3, 800, 1240), { cols: 1, rows: 3 });    // tablet portrait
  assert.deepEqual(bestGrid(3, 620, 760), { cols: 2, rows: 2 });     // tablet half split-screen
  assert.deepEqual(bestGrid(3, 400, 760), { cols: 1, rows: 3 });     // tablet one-third split
});

test('grid: six gauges', () => {
  assert.deepEqual(bestGrid(6, 1280, 760), { cols: 3, rows: 2 });
  assert.deepEqual(bestGrid(6, 800, 1240), { cols: 2, rows: 3 });
  assert.deepEqual(bestGrid(6, 1900, 400), { cols: 6, rows: 1 });
});

test('chunk keeps order and leaves a short last row', () => {
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});
