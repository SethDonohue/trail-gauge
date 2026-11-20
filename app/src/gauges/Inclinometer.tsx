import React, { useMemo } from 'react';
import { Circle, Group, Line, Path, Rect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { ladderFraction, vehicleRotationDeg, type TiltAxis, type TiltStyle } from '../core/tilt';
import { live } from '../engine/live';
import { C, faceFor, fitSize, LiveText } from './kit';
import { pointerPath, rearPath, sidePath, TickArc, useSpin, useTiltState } from './tiltKit';

// The Tilt gauge, in one of four looks (Settings > Display > Tilt gauge look). Every look shows,
// at every size: roll and pitch as numbers, each axis named with CAUTION or DANGER when amber or
// red, a picture that moves with the angle, and a scale whose ticks turn red past the warning.

interface PaneProps {
  x: number; y: number; w: number; h: number;
  axis: TiltAxis;
  label: string;
  value: SharedValue<number>;
  shown: SharedValue<number>; // the number, refreshed at the tilt update rate
  path: SkPath;
  warnDeg: number;
  fresh: boolean;
  compact: boolean;
  accent: string;
}

// Label at the top, number at the bottom, the picture in between: shared by the two-pane looks.
function paneFrame({ x, y, w, h, label, compact }: PaneProps) {
  const side = Math.min(w, h);
  const labelFace = faceFor(fitSize(`${label} · DANGER`, w * 0.9, side * 0.1, false));
  const big = faceFor(fitSize('-88.8°', w * 0.8, side * (compact ? 0.26 : 0.22)));
  const cx = x + w / 2;
  const top = y + labelFace.size * 1.4;
  const bottom = y + h - big.size * 1.1;
  return { side, labelFace, big, cx, top, bottom, H: Math.max(1, bottom - top), labelY: y + labelFace.size * 0.9, numberY: y + h - big.size * 0.6 };
}

function PaneText({ f, st }: { f: ReturnType<typeof paneFrame>; st: ReturnType<typeof useTiltState> }) {
  return (
    <>
      <LiveText text={st.labelText} face={f.labelFace} x={f.cx} y={f.labelY} color={st.labelColor} />
      <LiveText text={st.text} face={f.big} x={f.cx} y={f.numberY} color={st.textColor} hangDegree />
    </>
  );
}

// 1. Two dials (default): the vehicle tilts over a ground line under a scale; a pointer on the
//    vehicle's roof reads off the scale.
function VehiclePane(p: PaneProps) {
  const f = paneFrame(p);
  const st = useTiltState(p);
  const { axis, value: v } = p; // captured by UI-thread worklets: keep them to plain values
  const s = Math.min(f.side * 0.26, f.H / 2.3, p.w * 0.3);
  const cy = f.top + (f.H - 2.3 * s) / 2 + 1.75 * s; // scale numbers reach 1.75 s above the centre
  const tickFace = faceFor(fitSize('40', s * 0.32, s * 0.3, false));
  const spin = useSpin(f.cx, cy, v, 'vehicle', axis, { scale: s });
  const pointer = useMemo(() => {
    const q = Skia.PathBuilder.Make();
    q.moveTo(0, -1.28); q.lineTo(-0.09, -1.1); q.lineTo(0.09, -1.1); q.close();
    return q.build();
  }, []);
  const groundY = cy + s * 0.5;
  return (
    <Group>
      <PaneText f={f} st={st} />
      <TickArc cx={f.cx} cy={cy} r0={s * 1.3} r1={s * 1.46} centreDeg={-90} warnDeg={p.warnDeg}
        labels={{ r: s * 1.62, face: tickFace }} />
      <Line p1={vec(f.cx - s * 1.5, groundY)} p2={vec(f.cx + s * 1.5, groundY)} color={C.faint} strokeWidth={2} />
      <Group transform={spin}>
        <Path path={p.path} color={st.color} />
        <Path path={pointer} color={st.color} />
      </Group>
    </Group>
  );
}

// 3. Horizon: the vehicle on the hillside. The ground under it tilts with it (right side down:
//    the hill falls away to the right), like the other looks, and the ends of the ground line read
//    off the scales at each side. (Aircraft use the opposite, a level horizon seen from inside;
//    for a vehicle on a slope this way round reads as the slope itself.)
function HorizonPane(p: PaneProps) {
  const f = paneFrame(p);
  const st = useTiltState(p);
  const { axis, value: v } = p; // captured by UI-thread worklets: keep them to plain values
  const rr = Math.min(p.w * 0.42, f.H / 2);
  const cy = f.top + f.H / 2;
  const ri = rr * 0.84; // window radius; ticks sit between the window and rr
  const clip = useMemo(() => Skia.PathBuilder.Make().addCircle(f.cx, cy, ri).build(), [f.cx, cy, ri]);
  const spin = useSpin(f.cx, cy, v, 'vehicle', axis);
  const markers = useMemo(() => {
    const m = Skia.PathBuilder.Make();
    const len = rr * 0.12;
    m.addPath(pointerPath(ri + len * 0.15, len));
    const left = Skia.PathBuilder.Make();
    left.moveTo(-(ri + len * 0.15), 0); left.lineTo(-(ri + len * 0.15) + len, -len * 0.6);
    left.lineTo(-(ri + len * 0.15) + len, len * 0.6); left.close();
    m.addPath(left.build());
    return m.build();
  }, [rr, ri]);
  const sv = rr * 0.3; // vehicle size
  const vehicleSpin = useSpin(f.cx, cy, v, 'vehicle', axis, { dy: -sv * 0.45, scale: sv }); // wheels on the line
  return (
    <Group>
      <PaneText f={f} st={st} />
      <Circle cx={f.cx} cy={cy} r={ri} color={C.bg} />
      <Group clip={clip}>
        <Group transform={spin}>
          <Rect x={-2 * rr} y={0} width={4 * rr} height={2 * rr} color={st.color} opacity={0.32} />
          <Line p1={vec(-2 * rr, 0)} p2={vec(2 * rr, 0)} color={st.color} strokeWidth={Math.max(2, rr * 0.03)} />
        </Group>
      </Group>
      <Circle cx={f.cx} cy={cy} r={ri} color={C.control} style="stroke" strokeWidth={1.5} />
      <TickArc cx={f.cx} cy={cy} r0={rr * 0.88} r1={rr} centreDeg={0} warnDeg={p.warnDeg} />
      <TickArc cx={f.cx} cy={cy} r0={rr * 0.88} r1={rr} centreDeg={180} warnDeg={p.warnDeg} />
      <Group transform={spin}>
        <Path path={markers} color={st.color} />
      </Group>
      <Group transform={vehicleSpin}>
        <Path path={p.path} color={C.ink} />
      </Group>
    </Group>
  );
}

// 4. Bubble: a curved tube that bows upward; the ball stays at the true top, so it moves toward
//    the high side, like a spirit level.
function BubblePane(p: PaneProps) {
  const f = paneFrame(p);
  const st = useTiltState(p);
  const { axis, value: v } = p; // captured by UI-thread worklets: keep them to plain values
  const R = Math.max(10, Math.min(p.w * 0.55, f.H * 1.9));
  const tw = Math.max(8, R * 0.1); // tube width
  const apexY = f.top + (f.H - 0.493 * R) / 2 + 0.15 * R;
  const ccy = apexY + R; // the tube's centre of curvature
  const tube = useMemo(
    () => Skia.PathBuilder.Make().addArc(Skia.XYWHRect(f.cx - R, apexY, 2 * R, 2 * R), -135, 90).build(),
    [f.cx, apexY, R],
  );
  const spin = useSpin(f.cx, ccy, v, 'bubble', axis);
  const sv = Math.min(R * 0.1, 0.293 * R * 0.4);
  return (
    <Group>
      <PaneText f={f} st={st} />
      <Path path={tube} color={C.control} style="stroke" strokeWidth={tw + 3} strokeCap="round" />
      <Path path={tube} color={C.bg} style="stroke" strokeWidth={tw} strokeCap="round" />
      <TickArc cx={f.cx} cy={ccy} r0={R + tw / 2 + 2} r1={R + tw / 2 + tw} centreDeg={-90} warnDeg={p.warnDeg} />
      <Group transform={spin}>
        <Circle cx={R} cy={0} r={tw * 0.42} color={st.color} />
      </Group>
      <Group transform={[{ translateX: f.cx }, { translateY: apexY + tw + sv * 0.9 }, { scale: sv }]}>
        <Path path={p.path} color={C.quiet} />
      </Group>
    </Group>
  );
}

// 2. One dial: roll above the centre, pitch below. The roll line's ends read off the scales at
//    both sides; each vehicle tilts with its own axis.
function OneDial(props: {
  w: number; h: number; compact: boolean; fresh: boolean; pitchWarnDeg: number; rollWarnDeg: number; accent: string;
  rear: SkPath; side: SkPath;
}) {
  const { w, h, compact, fresh, pitchWarnDeg, rollWarnDeg, accent, rear, side } = props;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.46;
  const roll = useTiltState({ value: live.roll, shown: live.rollShown, warnDeg: rollWarnDeg, fresh, accent, label: 'ROLL' });
  const pitch = useTiltState({ value: live.pitch, shown: live.pitchShown, warnDeg: pitchWarnDeg, fresh, accent, label: 'PITCH' });
  const big = faceFor(fitSize('-88.8°', r * 0.6, r * (compact ? 0.17 : 0.14)));
  const labelFace = faceFor(fitSize('PITCH · DANGER', r * 0.8, r * 0.065, false));
  const tickFace = faceFor(fitSize('40', r * 0.11, r * 0.07, false));
  const rollSpin = useSpin(cx, cy, live.roll, 'vehicle', 'roll');
  const rearSpin = useSpin(cx, cy - r * 0.74, live.roll, 'vehicle', 'roll', { scale: r * 0.08 });
  // Pitch ladder down the middle: 40 up (nose up) to 40 down; the side-view vehicle slides along
  // it and tilts with the nose.
  const L = r * 0.34; // ladder half-height, at 40 degrees
  const ladder = useMemo(() => {
    const normal = Skia.PathBuilder.Make();
    const red = Skia.PathBuilder.Make();
    for (let d = -40; d <= 40; d += 5) {
      const y = cy - (d / 40) * L;
      const half = d === 0 ? r * 0.1 : d % 10 === 0 ? r * 0.065 : r * 0.035;
      const q = Math.abs(d) >= pitchWarnDeg ? red : normal;
      q.moveTo(cx - half, y);
      q.lineTo(cx + half, y);
    }
    return { normal: normal.build(), red: red.build() };
  }, [cx, cy, L, r, pitchWarnDeg]);
  const pv = live.pitch;
  const svp = r * 0.07;
  const pitchMarker = useDerivedValue(() => {
    const v = pv.value;
    return [
      { translateX: cx }, { translateY: cy - ladderFraction(v) * L },
      { rotate: (vehicleRotationDeg('pitch', v) * Math.PI) / 180 }, { translateY: svp * 0.15 }, { scale: svp },
    ];
  }, [cx, cy, L, svp]);
  const wings = useMemo(() => {
    const q = Skia.PathBuilder.Make();
    q.moveTo(-r * 0.78, 0); q.lineTo(-r * 0.5, 0);
    q.moveTo(r * 0.5, 0); q.lineTo(r * 0.78, 0);
    return q.build();
  }, [r]);
  const markers = useMemo(() => {
    const len = r * 0.1;
    const m = Skia.PathBuilder.Make();
    m.addPath(pointerPath(r * 0.85, len));
    const left = Skia.PathBuilder.Make();
    left.moveTo(-r * 0.85, 0); left.lineTo(-r * 0.85 + len, -len * 0.6); left.lineTo(-r * 0.85 + len, len * 0.6); left.close();
    m.addPath(left.build());
    return m.build();
  }, [r]);
  const sw = Math.max(1.5, r * 0.012);
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={C.edge} style="stroke" strokeWidth={1.5} />
      <TickArc cx={cx} cy={cy} r0={r * 0.86} r1={r * 0.98} centreDeg={180} warnDeg={rollWarnDeg}
        labels={{ r: r * 0.74, face: tickFace }} />
      <TickArc cx={cx} cy={cy} r0={r * 0.86} r1={r * 0.98} centreDeg={0} warnDeg={rollWarnDeg}
        labels={{ r: r * 0.74, face: tickFace }} />
      <Path path={ladder.normal} color={C.quiet} style="stroke" strokeWidth={sw} strokeCap="round" />
      <Path path={ladder.red} color={C.alarm} style="stroke" strokeWidth={sw * 1.3} strokeCap="round" />
      {[-40, -20, 20, 40].map(d => (
        <LiveText key={d} text={`${Math.abs(d)}`} face={tickFace} x={cx + r * 0.16} y={cy - (d / 40) * L}
          color={Math.abs(d) >= pitchWarnDeg ? C.alarm : C.quiet} />
      ))}
      <Group transform={rollSpin}>
        <Path path={wings} color={roll.color} style="stroke" strokeWidth={Math.max(2, r * 0.02)} strokeCap="round" />
        <Path path={markers} color={roll.color} />
      </Group>
      <Group transform={pitchMarker}>
        <Path path={side} color={pitch.color} />
      </Group>
      <Group transform={rearSpin}>
        <Path path={rear} color={roll.color} />
      </Group>
      <LiveText text={roll.labelText} face={labelFace} x={cx} y={cy - r * 0.61} color={roll.labelColor} />
      <LiveText text={roll.text} face={big} x={cx} y={cy - r * 0.47} color={roll.textColor} hangDegree />
      <LiveText text={pitch.text} face={big} x={cx} y={cy + r * 0.5} color={pitch.textColor} hangDegree />
      <LiveText text={pitch.labelText} face={labelFace} x={cx} y={cy + r * 0.64} color={pitch.labelColor} />
    </Group>
  );
}

export function Inclinometer(props: {
  w: number; h: number; compact: boolean; fresh: boolean; pitchWarnDeg: number; rollWarnDeg: number;
  accent: string; look: TiltStyle;
}) {
  const { w, h, compact, fresh, pitchWarnDeg, rollWarnDeg, accent, look } = props;
  const rear = useMemo(rearPath, []);
  const sideP = useMemo(sidePath, []);
  if (look === 'dial') return <OneDial {...props} rear={rear} side={sideP} />;
  const Pane = look === 'horizon' ? HorizonPane : look === 'bubble' ? BubblePane : VehiclePane;
  const sideBySide = w > h * 1.25;
  const a = sideBySide ? { x: 0, y: 0, w: w / 2, h } : { x: 0, y: 0, w, h: h / 2 };
  const b = sideBySide ? { x: w / 2, y: 0, w: w / 2, h } : { x: 0, y: h / 2, w, h: h / 2 };
  return (
    <Group>
      <Pane {...a} axis="roll" label="ROLL" value={live.roll} shown={live.rollShown} path={rear}
        warnDeg={rollWarnDeg} fresh={fresh} compact={compact} accent={accent} />
      <Pane {...b} axis="pitch" label="PITCH" value={live.pitch} shown={live.pitchShown} path={sideP}
        warnDeg={pitchWarnDeg} fresh={fresh} compact={compact} accent={accent} />
    </Group>
  );
}
