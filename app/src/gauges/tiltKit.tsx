import React, { useMemo } from 'react';
import { Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { fmtAngle } from '../core/format';
import {
  axisLevel, bubbleAngleDeg, horizonRotationDeg, tiltTicks, vehicleRotationDeg, type TiltAxis,
} from '../core/tilt';
import { C, LiveText, type Face } from './kit';

const RAD = Math.PI / 180;

// Unit-sized silhouettes centred on the origin, wheels at y ~ +0.45, roof at y ~ -0.8.
export function rearPath() {
  const p = Skia.PathBuilder.Make();
  p.addRRect(Skia.RRectXY(Skia.XYWHRect(-0.85, -0.35, 1.7, 0.55), 0.08, 0.08));
  p.moveTo(-0.55, -0.35);
  p.lineTo(-0.42, -0.8);
  p.lineTo(0.42, -0.8);
  p.lineTo(0.55, -0.35);
  p.close();
  p.addRRect(Skia.RRectXY(Skia.XYWHRect(-0.95, 0.05, 0.36, 0.45), 0.08, 0.08));
  p.addRRect(Skia.RRectXY(Skia.XYWHRect(0.59, 0.05, 0.36, 0.45), 0.08, 0.08));
  return p.build();
}

export function sidePath() {
  const p = Skia.PathBuilder.Make();
  p.addRRect(Skia.RRectXY(Skia.XYWHRect(-1.05, -0.3, 2.1, 0.45), 0.08, 0.08));
  p.moveTo(-0.65, -0.3);
  p.lineTo(-0.45, -0.75);
  p.lineTo(0.3, -0.75);
  p.lineTo(0.55, -0.3);
  p.close();
  p.addCircle(-0.62, 0.2, 0.27);
  p.addCircle(0.66, 0.2, 0.27);
  return p.build();
}

// Colour, number and label for one axis. Amber and red are also named in words, so colour is
// never the only signal.
export function useTiltState(p: {
  value: SharedValue<number>; shown: SharedValue<number>; warnDeg: number; fresh: boolean;
  accent: string; label: string;
}) {
  const { value, shown, warnDeg, fresh, accent, label } = p;
  const color = useDerivedValue(() => {
    if (!fresh || !Number.isFinite(value.value)) return C.stale;
    const l = axisLevel(value.value, warnDeg);
    return l === 2 ? C.alarm : l === 1 ? C.warn : accent;
  }, [fresh, warnDeg, accent]);
  const textColor = useDerivedValue(() => (color.value === accent ? C.ink : color.value), [accent]);
  const text = useDerivedValue(() => (fresh ? fmtAngle(shown.value) : '--'), [fresh]);
  const labelText = useDerivedValue(() => {
    if (!fresh || !Number.isFinite(value.value)) return label;
    const l = axisLevel(value.value, warnDeg);
    return l === 2 ? `${label} · DANGER` : l === 1 ? `${label} · CAUTION` : label;
  }, [fresh, warnDeg, label]);
  const labelColor = useDerivedValue(() => (color.value === C.alarm || color.value === C.warn ? color.value : C.quiet));
  return { color, textColor, text, labelText, labelColor };
}

// A rotation about (cx, cy) that follows a live tilt value on the UI thread.
// The shared value must be read directly inside useDerivedValue: Reanimated only re-runs it for
// shared values it can see in its own closure, not ones read inside a helper function passed in.
// (That was the 0.5.0/0.5.1 bug: arrows, horizons and bubbles drew once and never moved.)
export type SpinKind = 'vehicle' | 'horizon' | 'bubble';
export function useSpin(cx: number, cy: number, source: SharedValue<number>, kind: SpinKind, axis: TiltAxis,
  extra: { scale?: number } = {}) {
  const scale = extra.scale ?? 0;
  return useDerivedValue(() => {
    const v = source.value;
    const deg = kind === 'horizon' ? horizonRotationDeg(axis, v)
      : kind === 'bubble' ? bubbleAngleDeg(axis, v) : vehicleRotationDeg(axis, v);
    const t: ({ translateX: number } | { translateY: number } | { rotate: number } | { scale: number })[] = [
      { translateX: cx }, { translateY: cy }, { rotate: deg * RAD },
    ];
    if (scale) t.push({ scale });
    return t;
  }, [cx, cy, kind, axis, scale]);
}

// Scale ticks every 5 degrees to 40 each way, centred on screen angle `centreDeg`, with tick d at
// centreDeg + d. Ticks at or past the warning angle are red. Optional numbers at 20 and 40.
export function TickArc(props: {
  cx: number; cy: number; r0: number; r1: number; centreDeg: number; warnDeg: number;
  labels?: { r: number; face: Face };
}) {
  const { cx, cy, r0, r1, centreDeg, warnDeg, labels } = props;
  const paths = useMemo(() => {
    const normal = Skia.PathBuilder.Make();
    const red = Skia.PathBuilder.Make();
    for (const t of tiltTicks(warnDeg)) {
      const a = (centreDeg + t.deg) * RAD;
      const inner = t.major ? r0 : r0 + (r1 - r0) * 0.45;
      const p = t.red ? red : normal;
      p.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      p.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    return { normal: normal.build(), red: red.build() };
  }, [cx, cy, r0, r1, centreDeg, warnDeg]);
  const sw = Math.max(1.5, (r1 - r0) * 0.16);
  return (
    <Group>
      <Path path={paths.normal} color={C.quiet} style="stroke" strokeWidth={sw} strokeCap="round" />
      <Path path={paths.red} color={C.alarm} style="stroke" strokeWidth={sw * 1.3} strokeCap="round" />
      {labels
        ? [-40, -20, 20, 40].map(d => {
            const a = (centreDeg + d) * RAD;
            return (
              <LiveText key={d} text={`${Math.abs(d)}`} face={labels.face}
                x={cx + Math.cos(a) * labels.r} y={cy + Math.sin(a) * labels.r}
                color={Math.abs(d) >= warnDeg ? C.alarm : C.quiet} />
            );
          })
        : null}
    </Group>
  );
}

// A small triangle pointing outward along +x at radius r (rotate it into place with useSpin).
export function pointerPath(r: number, len: number) {
  const p = Skia.PathBuilder.Make();
  p.moveTo(r, 0);
  p.lineTo(r - len, -len * 0.6);
  p.lineTo(r - len, len * 0.6);
  p.close();
  return p.build();
}
