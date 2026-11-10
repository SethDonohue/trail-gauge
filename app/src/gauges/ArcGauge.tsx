import React, { useMemo } from 'react';
import { Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { C, clamp01, LiveText, useFaces } from './kit';

export type Level = 0 | 1 | 2; // normal, warning, alarm

// A 270-degree sweep gauge. `level` and `format` must be worklets (they run on the UI thread).
export function ArcGauge(props: {
  w: number; h: number; compact: boolean; fresh: boolean;
  label: string; unit: string;
  value: SharedValue<number>;
  min: number; max: number;
  minLabel: string; maxLabel: string;
  level: (v: number) => Level;
  format: (v: number) => string;
  accent: string; // the gauge colour (normal state)
  note?: string | null; // a short status line under the label (e.g. HOLDING)
  noteColor?: string;
}) {
  const { w, h, compact, fresh, label, unit, value, min, max, minLabel, maxLabel, level, format, accent } = props;
  const side = Math.min(w, h);
  const faces = useFaces(side, { big: compact ? 0.22 : 0.19, mid: 0.085, small: 0.065 });
  const cx = w / 2;
  const cy = h / 2 + side * 0.04;
  const r = side * 0.4;
  const stroke = Math.max(6, side * 0.06);

  const arc = useMemo(() => {
    return Skia.PathBuilder.Make().addArc(Skia.XYWHRect(cx - r, cy - r, 2 * r, 2 * r), 135, 270).build();
  }, [cx, cy, r]);

  const frac = useDerivedValue(() =>
    fresh && Number.isFinite(value.value) ? clamp01((value.value - min) / (max - min)) : 0,
  [fresh, min, max]);
  const color = useDerivedValue(() => {
    if (!fresh || !Number.isFinite(value.value)) return C.stale;
    const l = level(value.value);
    return l === 2 ? C.alarm : l === 1 ? C.warn : accent;
  }, [fresh, accent]);
  const textColor = useDerivedValue(() => (color.value === accent ? C.ink : color.value), [accent]);
  const text = useDerivedValue(() => (fresh ? format(value.value) : '--'), [fresh]);

  // End labels sit just below the arc's two ends (at 135 and 45 degrees).
  const endDy = r * Math.SQRT1_2 + faces.small.size * 1.1;
  const endDx = r * Math.SQRT1_2;
  return (
    <Group opacity={fresh ? 1 : 0.55}>
      <Path path={arc} color={C.faint} style="stroke" strokeWidth={stroke} strokeCap="round" />
      <Path path={arc} color={color} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={frac} />
      <LiveText text={text} face={faces.big} x={cx} y={cy - faces.big.size * 0.1} color={textColor} />
      <LiveText text={unit} face={faces.mid} x={cx} y={cy + faces.big.size * 0.75} color={C.quiet} />
      <LiveText text={label.toUpperCase()} face={faces.small} x={cx} y={cy + r * 0.86} color={C.quiet} />
      {props.note ? (
        <LiveText text={props.note} face={faces.small} x={cx} y={cy + r * 0.86 + faces.small.size * 1.3}
          color={props.noteColor ?? C.quiet} />
      ) : null}
      {!compact ? (
        <>
          <LiveText text={minLabel} face={faces.small} x={cx - endDx} y={cy + endDy} color={C.quiet} />
          <LiveText text={maxLabel} face={faces.small} x={cx + endDx} y={cy + endDy} color={C.quiet} />
        </>
      ) : null}
    </Group>
  );
}
