import React, { useMemo } from 'react';
import { Group, Line, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { fmtAngle } from '../core/format';
import { live } from '../engine/live';
import { C, LiveText, useFaces } from './kit';

// Unit-sized silhouettes centred on the origin, wheels at y ~ +0.45.
function rearPath() {
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

function sidePath() {
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

interface PaneProps {
  x: number; y: number; w: number; h: number;
  label: string;
  value: SharedValue<number>;
  sign: 1 | -1; // screen rotation direction
  path: SkPath;
  shown: SharedValue<number>; // the number, refreshed at the tilt update rate
  warnDeg: number;
  fresh: boolean;
  compact: boolean;
  accent: string;
}

function Pane({ x, y, w, h, label, value, shown, sign, path, warnDeg, fresh, compact, accent }: PaneProps) {
  const side = Math.min(w, h);
  const faces = useFaces(side, { big: compact ? 0.26 : 0.2, mid: 0.12, small: 0.1 });
  const cx = x + w / 2;
  const cy = y + h * (compact ? 0.44 : 0.46);
  const s = side * (compact ? 0.24 : 0.26);

  const transform = useDerivedValue(() => {
    const v = Number.isFinite(value.value) ? value.value : 0;
    return [{ translateX: cx }, { translateY: cy }, { rotate: (sign * v * Math.PI) / 180 }, { scale: s }];
  });
  const color = useDerivedValue(() => {
    const v = Math.abs(value.value);
    if (!fresh || !Number.isFinite(v)) return C.stale;
    return v >= warnDeg + 10 ? C.alarm : v >= warnDeg ? C.warn : accent;
  }, [fresh, warnDeg, accent]);
  const textColor = useDerivedValue(() => (color.value === accent ? C.ink : color.value), [accent]);
  const text = useDerivedValue(() => (fresh ? fmtAngle(shown.value) : '--'), [fresh]);

  const groundY = cy + s * 0.5;
  return (
    <Group>
      <LiveText text={label} face={faces.small} x={cx} y={y + faces.small.size * 0.9} color={C.quiet} />
      <Line p1={vec(cx - s * 1.5, groundY)} p2={vec(cx + s * 1.5, groundY)} color={C.faint} strokeWidth={2} />
      <Group transform={transform}>
        <Path path={path} color={color} />
      </Group>
      <LiveText text={text} face={faces.big} x={cx} y={y + h - faces.big.size * 0.75} color={textColor} />
    </Group>
  );
}

export function Inclinometer(props: {
  w: number; h: number; compact: boolean; fresh: boolean; pitchWarnDeg: number; rollWarnDeg: number;
  accent: string;
}) {
  const { w, h, compact, fresh, pitchWarnDeg, rollWarnDeg, accent } = props;
  const rear = useMemo(rearPath, []);
  const sideP = useMemo(sidePath, []);
  const sideBySide = w > h * 1.25;
  const a = sideBySide ? { x: 0, y: 0, w: w / 2, h } : { x: 0, y: 0, w, h: h / 2 };
  const b = sideBySide ? { x: w / 2, y: 0, w: w / 2, h } : { x: 0, y: h / 2, w, h: h / 2 };
  return (
    <Group opacity={fresh ? 1 : 0.55}>
      {/* Rear view: right side down (positive roll) turns the silhouette clockwise. */}
      <Pane {...a} label="ROLL" value={live.roll} shown={live.rollShown} sign={1} path={rear}
        warnDeg={rollWarnDeg} fresh={fresh} compact={compact} accent={accent} />
      {/* Side view, nose to the right: nose up (positive pitch) turns it anticlockwise. */}
      <Pane {...b} label="PITCH" value={live.pitch} shown={live.pitchShown} sign={-1} path={sideP}
        warnDeg={pitchWarnDeg} fresh={fresh} compact={compact} accent={accent} />
    </Group>
  );
}
