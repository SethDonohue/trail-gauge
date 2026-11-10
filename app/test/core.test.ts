import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBytes,
  bytesToBase64,
  encodeFrameV2,
  parseFrameV2,
} from '../src/core/frame.ts';
import { EmaFilter, HeadingFilter } from '../src/core/filters.ts';
import {
  attitude, defaultMount, magneticHeading, mountFromUp, upFromDeviceMotion, type Vec3,
} from '../src/core/orientation.ts';
import {
  gpsAltitudeUsable, pressureToAltitudeM, qnhFromElevation, resolveAltitudeSource,
} from '../src/core/altitude.ts';
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
    version: 2 as const, cabinC: null, cabinRhPct: null, ambient2C: null, status2: 0,
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

import { C, contrast } from '../src/core/palette.ts';
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

test('altitude source: auto prefers the barometer and falls back to GPS', () => {
  assert.equal(resolveAltitudeSource('auto', true), 'baro');
  assert.equal(resolveAltitudeSource('auto', false), 'gps');
  assert.equal(resolveAltitudeSource('gps', true), 'gps');
  assert.equal(resolveAltitudeSource('baro', false), 'baro');
});

test('GPS altitude fixes: poor or missing ones are rejected', () => {
  assert.equal(gpsAltitudeUsable(1500, 8), true);
  assert.equal(gpsAltitudeUsable(1500, 40), true);
  assert.equal(gpsAltitudeUsable(1500, 41), false);
  assert.equal(gpsAltitudeUsable(1500, null), true); // accuracy unknown
  assert.equal(gpsAltitudeUsable(1500, 0), true);
  assert.equal(gpsAltitudeUsable(null, 5), false);
  assert.equal(gpsAltitudeUsable(NaN, 5), false);
});

test('device motion sign: expo reports gravity pointing down; we need up', () => {
  // Flat on a table, screen up: expo gives z = -9.8 on both Android and iOS.
  assert.deepEqual(upFromDeviceMotion({ x: 0, y: 0, z: -9.8 }, { x: 0, y: 0, z: 0 }), [-0, -0, 9.8]);
  // Linear acceleration is removed first (braking hard while flat changes nothing).
  const up = upFromDeviceMotion({ x: 0, y: 3, z: -9.8 }, { x: 0, y: 3, z: 0 });
  near(up[1], 0, 1e-12);
  near(up[2], 9.8, 1e-12);
});

test('device motion sign: nose-down phone reads negative pitch (emulator regression)', () => {
  // Upright landscape on the dash (device +x up), leaning back so the screen faces slightly up:
  // the back of the phone, i.e. the vehicle's forward axis, points slightly down.
  // Accelerometer (specific force) ~ (+9.6, 0, +1.8); expo reports the negative.
  const up = upFromDeviceMotion({ x: -9.6, y: 0, z: -1.8 }, null);
  const a = attitude(up, mountFromUp([1, 0, 0]));
  assert.ok(a.pitchDeg < -10 && a.pitchDeg > -11, `pitch ${a.pitchDeg}`);
  near(a.rollDeg, 0, 1e-9);
});

test('colour contrast meets WCAG 2.2 AA', () => {
  const text: [string, string, string][] = [
    ['values', C.ink, C.panel], ['labels/units/hints', C.quiet, C.panel], ['top bar, settings', C.quiet, C.bg],
    ['warning', C.warn, C.panel], ['alarm', C.alarm, C.panel], ['accent', C.accent, C.panel],
    ['button text', C.bg, C.accent],
  ];
  for (const [name, fg, bg] of text) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  const nonText: [string, string, string][] = [
    ['no-data digits (large text)', C.stale, C.panel], ['control borders', C.control, C.bg],
    ['inactive page dot', C.control, C.bg], ['gauge fill', C.accent, C.panel],
    ['gauge speaker (muted)', C.warn, C.panel], ['gauge speaker', C.quiet, C.panel],
    ['toggle knob (off)', C.quiet, C.bg], ['toggle knob (on)', C.bg, C.accent],
    ['no-data silhouettes', C.stale, C.panel],
  ];
  for (const [name, fg, bg] of nonText) assert.ok(contrast(fg, bg) >= 3, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  near(contrast('#000000', '#ffffff'), 21, 1e-9);
  // Labels of a gauge with no data are drawn at full strength (no fading), so they pass as text.
  assert.ok(contrast(C.quiet, C.panel) >= 4.5);
});

// ---- 0.4.0: features rebuilt from 0.3.0 ----
import {
  ALARM_REPEAT_MS, AlertTracker, batteryLevel, cabinLevel, CLEAR_MS, coolantLevel, dewPointC, fogLevel,
  iceLevel, tiltLevel,
} from '../src/core/alerts.ts';
import { combineOutside, OutsideTempCorrector, SETTLE_MOVING_MS } from '../src/core/outside.ts';
import { decideNight, isClockNight, LuxNightDetector, NIGHT_HOLD_MS, sunElevationDeg } from '../src/core/night.ts';
import { applyMagCal, MagCalibrator } from '../src/core/magcal.ts';
import { gaugePages, pageAfterSwipe } from '../src/core/pages.ts';
import { resolveHeading, type HeadingSettings } from '../src/core/heading.ts';
import { encodeFrameV3, FRAME_V3_LEN, parseFrame, STATUS2 } from '../src/core/frame.ts';
import { GAUGE_PRESETS, isReservedHue, usableGaugeColor, wheelColorAt } from '../src/core/colors.ts';

test('frame V3: round trip, and parseFrame accepts V2 and V3 only', () => {
  const src = {
    seq: 9, pitchDeg: 1.5, rollDeg: -2, headingMagDeg: 90, altitudeM: 100, coolantC: 88, ambientC: 4,
    batteryV: 12.6, status: 0x0800, version: 3 as const, cabinC: 21.5, cabinRhPct: 55.25, ambient2C: null,
    status2: STATUS2.NO_VEHICLE_BUS,
  };
  const b = encodeFrameV3(src);
  assert.equal(b.length, FRAME_V3_LEN);
  assert.equal(b[0], 3);
  assert.deepEqual(parseFrame(b), src);
  assert.equal(parseFrame(hex('02 2A D2 04 0C FE 9F 8C 40 E2 01 00 22 24 BB FE E8 35 20 00'))?.version, 2);
  assert.equal(parseFrame(b.subarray(0, 24)), null);
});

test('alert levels', () => {
  assert.equal(tiltLevel(29, 0, 30, 25), 0);
  assert.equal(tiltLevel(30, 0, 30, 25), 1);
  assert.equal(tiltLevel(-5, -35, 30, 25), 2); // roll red at 25 + 10
  assert.equal(tiltLevel(null, null, 30, 25), null);
  assert.equal(coolantLevel(104, 105), 0);
  assert.equal(coolantLevel(105, 105), 1);
  assert.equal(coolantLevel(112, 105), 2);
  assert.equal(batteryLevel(12.6, 12), 0);
  assert.equal(batteryLevel(11.8, 12), 1);
  assert.equal(batteryLevel(11.4, 12), 2);
  assert.equal(batteryLevel(15.0, 12), 1);
  assert.equal(iceLevel(3, 3), 1);
  assert.equal(iceLevel(3.1, 3), 0);
  assert.equal(cabinLevel(40, 35), 2);
});

test('dew point and window fog', () => {
  near(dewPointC(20, 50), 9.3, 0.1);
  near(dewPointC(25, 100), 25, 0.05);
  assert.equal(fogLevel(15, 20, 40), 0); // dry cabin, mild outside
  assert.equal(fogLevel(0, 20, 60), 2); // glass ~7 °C, dew point ~12 °C
  assert.equal(fogLevel(5, 18, 55), 1); // glass ~9.6 °C, dew point ~8.9 °C: within 3 °C
  assert.equal(fogLevel(null, 20, 60), null);
});

test('alert tracker: beeps on entry, repeats red, re-arms after clearing, respects mute', () => {
  const t = new AlertTracker();
  const loud = () => false;
  assert.deepEqual(t.update(0, { coolant: 0 }, loud), { beep: null, ids: [] });
  assert.deepEqual(t.update(1000, { coolant: 1 }, loud), { beep: 'warn', ids: ['coolant'] });
  assert.equal(t.update(2000, { coolant: 1 }, loud).beep, null); // no repeat for amber
  assert.equal(t.update(3000, { coolant: 2 }, loud).beep, 'alarm');
  assert.equal(t.update(3000 + ALARM_REPEAT_MS - 1, { coolant: 2 }, loud).beep, null);
  assert.equal(t.update(3000 + ALARM_REPEAT_MS, { coolant: 2 }, loud).beep, 'alarm');
  // Drops to normal; a quick bounce back to amber stays quiet until it has been clear for CLEAR_MS.
  const t0 = 100_000;
  t.update(t0, { coolant: 0 }, loud);
  assert.equal(t.update(t0 + 1000, { coolant: 1 }, loud).beep, null);
  t.update(t0 + 2000, { coolant: 0 }, loud);
  t.update(t0 + 2000 + CLEAR_MS, { coolant: 0 }, loud);
  assert.equal(t.update(t0 + 3000 + CLEAR_MS, { coolant: 1 }, loud).beep, 'warn');
  // Muted: no sound, but state still advances, so unmuting does not beep.
  const m = new AlertTracker();
  assert.equal(m.update(0, { battery: 2 }, () => true).beep, null);
  assert.equal(m.update(1000, { battery: 2 }, () => false).beep, null);
  // Missing data holds state.
  assert.equal(m.update(2000, { battery: null }, () => false).beep, null);
});

test('outside temperature correction', () => {
  const c = new OutsideTempCorrector(null);
  assert.equal(c.update(20, 0, 0, true).c, 20);
  // Stopped in traffic: heat soak pushes raw up 5 °C in a minute; corrected rises 0.5 °C.
  const r = c.update(25, 0, 60_000, true);
  near(r.c, 20.5, 1e-9);
  assert.equal(r.holding, true);
  // Falls freely.
  assert.equal(c.update(18, 0, 61_000, true).c, 18);
  // Driving fast for a minute trusts the sensor again and remembers it.
  c.update(19, 15, 62_000, true);
  const settled = c.update(19, 15, 62_000 + SETTLE_MOVING_MS, true);
  assert.equal(settled.c, 19);
  assert.ok(settled.remember);
  // Start-up after a short stop: a heat-soaked 30 °C is held at the remembered 19 °C.
  const restart = new OutsideTempCorrector(settled.remember);
  assert.equal(restart.update(30, 0, 62_000 + SETTLE_MOVING_MS + 600_000, true).c, 19);
  // Off: raw passes through.
  assert.equal(new OutsideTempCorrector(null).update(30, 0, 0, false).c, 30);
});

test('two outside sensors: lower wins, disagreement flagged', () => {
  assert.deepEqual(combineOutside(10, 12), { c: 10, disagree: false });
  assert.deepEqual(combineOutside(10, 16), { c: 10, disagree: true });
  assert.deepEqual(combineOutside(null, 7), { c: 7, disagree: false });
  assert.deepEqual(combineOutside(null, null), { c: null, disagree: false });
});

test('night mode', () => {
  const d = new LuxNightDetector();
  assert.equal(d.update(2, 0), false);
  assert.equal(d.update(2, NIGHT_HOLD_MS - 1), false);
  assert.equal(d.update(2, NIGHT_HOLD_MS), true);
  assert.equal(d.update(25, NIGHT_HOLD_MS + 10_000), true); // between thresholds: stays
  assert.equal(d.update(80, NIGHT_HOLD_MS + 20_000), true);
  assert.equal(d.update(80, 2 * NIGHT_HOLD_MS + 20_000), false);
  assert.equal(isClockNight(22), true);
  assert.equal(isClockNight(12), false);
  assert.equal(decideNight({ mode: 'on', luxNight: false, sunElevationDeg: 30, localHour: 12 }), true);
  assert.equal(decideNight({ mode: 'auto', luxNight: null, sunElevationDeg: -10, localHour: 12 }), true);
  assert.equal(decideNight({ mode: 'auto', luxNight: null, sunElevationDeg: null, localHour: 23 }), true);
  // Denver, 2026-06-21: about +73° at local solar noon (~19:00 UTC), below the horizon at 06:00 UTC.
  near(sunElevationDeg(new Date(Date.UTC(2026, 5, 21, 19, 0)), 39.74, -104.99), 73, 2);
  assert.ok(sunElevationDeg(new Date(Date.UTC(2026, 5, 21, 6, 0)), 39.74, -104.99) < -10);
});

test('compass calibration finds the hard-iron offset', () => {
  const cal = new MagCalibrator();
  const offset: Vec3 = [12, -30, 5];
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180;
    // A level circle: the horizontal field sweeps x and y; z holds the vertical component.
    cal.add([offset[0] + 25 * Math.cos(a), offset[1] + 25 * Math.sin(a), offset[2] - 40]);
  }
  assert.equal(cal.axesCovered(), 2);
  const got = cal.finish()!;
  near(got[0], 12, 0.01);
  near(got[1], -30, 0.01);
  assert.equal(got[2], 0); // z not swept: left alone
  assert.deepEqual(applyMagCal([20, 0, 0], [12, -30, 0]), [8, 30, 0]);
  const short = new MagCalibrator();
  for (let i = 0; i < 200; i++) short.add([i * 0.01, 0, 0]);
  assert.equal(short.finish(), null);
});

test('gauge pages: chosen three first, the rest three at a time, swipes wrap', () => {
  const all = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  assert.deepEqual(gaugePages(['C', 'A', 'H'], all), [['C', 'A', 'H'], ['B', 'D', 'E'], ['F', 'G']]);
  assert.deepEqual(gaugePages(['A', 'A', 'B'], all)[0], ['A', 'B']);
  assert.equal(pageAfterSwipe(0, -1, 3), 2);
  assert.equal(pageAfterSwipe(2, 1, 3), 0);
});

test('heading: true north, manual declination and offset', () => {
  const base: HeadingSettings = {
    northRef: 'true', declinationMode: 'gps', learnedDeclinationDeg: null,
    manualDeclinationDeg: 0, headingOffsetDeg: 0,
  };
  assert.deepEqual(resolveHeading(10, base), { deg: 10, isTrue: false }); // M until learned
  assert.deepEqual(resolveHeading(10, { ...base, learnedDeclinationDeg: 8 }), { deg: 18, isTrue: true });
  assert.deepEqual(resolveHeading(355, { ...base, declinationMode: 'manual', manualDeclinationDeg: 8 }), { deg: 3, isTrue: true });
  assert.deepEqual(resolveHeading(10, { ...base, northRef: 'magnetic', learnedDeclinationDeg: 8, headingOffsetDeg: -12 }), { deg: 358, isTrue: false });
});

test('gauge colours stay readable and never look like alerts', () => {
  for (const p of GAUGE_PRESETS) assert.ok(contrast(p.hex, C.panel) >= 3, p.name);
  for (let h = 0; h < 360; h += 15) assert.ok(contrast(wheelColorAt(h), C.panel) >= 4.5, `hue ${h}`);
  assert.equal(isReservedHue(30), true);
  assert.equal(isReservedHue(140), false);
  assert.equal(usableGaugeColor('#101010'), C.accent);
  assert.equal(usableGaugeColor('nonsense'), C.accent);
});

import { hasVehicleBus, hubFaults, vehicleBusLabel } from '../src/core/faults.ts';
import { STATUS } from '../src/core/frame.ts';

test('hub faults: a CAN error is not a fault on vehicles without a bus', () => {
  assert.deepEqual(hubFaults(STATUS.CAN_ERROR, 0, 2, 'auto'), ['Vehicle bus (CAN) error']);
  assert.deepEqual(hubFaults(STATUS.CAN_ERROR, 0, 2, 'none'), []);
  assert.deepEqual(hubFaults(STATUS.CAN_ERROR, STATUS2.NO_VEHICLE_BUS, 3, 'auto'), []);
  assert.equal(hasVehicleBus(STATUS2.NO_VEHICLE_BUS, 'auto'), false);
  assert.deepEqual(hubFaults(STATUS.COOLANT_FAULT, STATUS2.CABIN_FAULT, 3, 'auto'), ['Coolant sensor fault', 'Cabin sensor fault']);
  assert.deepEqual(hubFaults(0, STATUS2.CABIN_FAULT, 2, 'auto'), []); // V2 frames carry no status2
  assert.equal(vehicleBusLabel(0, null, 'auto'), 'Unknown until the hub connects');
  assert.equal(vehicleBusLabel(0, 2, 'auto'), 'Not reported by this hub firmware');
  assert.equal(vehicleBusLabel(STATUS2.NO_VEHICLE_BUS, 3, 'auto'), 'None (hub has no CAN/OBD-II)');
});
