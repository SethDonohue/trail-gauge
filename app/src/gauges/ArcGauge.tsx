import React, { useMemo } from 'react';
import { Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { C, clamp01, faceFor, fitSize, LiveText } from './kit';

export type Level = 0 | 1 | 2; // normal, warning, alarm

// A 270-degree sweep gauge. `level` and `format` must be worklets (they run on the UI thread).
// Every element shows at every size (tile or full screen); text scales to fit instead of hiding.
//
// Layout, top to bottom inside the arc: value, unit, secondary line (optional, e.g. dew point),
// then in the arc's bottom opening the label and the status line. The status line names an amber
// or red state in words (so colour is never the only signal) and carries any note.
export function ArcGauge(props: {
  w: number; h: number; compact: boolean; fresh: boolean;
  label: string; unit: string;
  value: SharedValue<number>;
  min: number; max: number;
  minLabel: string; maxLabel: string;
  level: (v: number) => Level;
  format: (v: number) => string;
  valueTemplate: string; // widest value this gauge can show, e.g. "888°", sizes the number
  levelWords: [string, string]; // status text for amber and red, e.g. ['HIGH', 'OVERHEAT']
  accent: string;
  note?: string | null; // a short status (e.g. HOLDING (SLOW)); shown after any level words
  noteColor?: string;
  secondary?: string | null; // a second reading (e.g. DEW POINT 48°)
}) {
  const {
    w, h, fresh, label, unit, value, min, max, minLabel, maxLabel, level, format, accent,
    valueTemplate, levelWords,
  } = props;
  const side = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2 - side * 0.02;
  const r = side * 0.41;
  const stroke = Math.max(6, side * 0.055);
  const inner = 2 * (r - stroke); // usable width inside the ring

  const big = faceFor(fitSize(valueTemplate, inner * 0.92, side * 0.24));
  const mid = faceFor(fitSize(unit || '%', inner * 0.5, side * 0.085));
  const smallSize = Math.max(11, side * 0.064);
  // Bottom row: min label, gauge label, max label (between the arc's two ends). Status below.
  const labelFace = faceFor(fitSize(label.toUpperCase(), r * 0.75, smallSize, false));
  const statusTemplate = [levelWords[0], levelWords[1], props.note ?? ''].reduce((a, b) => (b.length > a.length ? b : a), '');
  const statusWithNote = props.note ? `${levelWords[1]} · ${props.note}` : statusTemplate;
  const statusFace = faceFor(fitSize(statusWithNote, r * 1.9, smallSize, true));
  const secondaryFace = props.secondary ? faceFor(fitSize(props.secondary, inner * 0.9, smallSize, false)) : null;
  const endFace = faceFor(fitSize(minLabel.length > maxLabel.length ? minLabel : maxLabel, r * 0.42, smallSize, false));

  const arc = useMemo(
    () => Skia.PathBuilder.Make().addArc(Skia.XYWHRect(cx - r, cy - r, 2 * r, 2 * r), 135, 270).build(),
    [cx, cy, r],
  );

  const frac = useDerivedValue(() =>
    fresh && Number.isFinite(value.value) ? clamp01((value.value - min) / (max - min)) : 0,
  [fresh, min, max]);
  const lvl = useDerivedValue(() => (fresh && Number.isFinite(value.value) ? level(value.value) : 0), [fresh]);
  const color = useDerivedValue(() => {
    if (!fresh || !Number.isFinite(value.value)) return C.stale;
    return lvl.value === 2 ? C.alarm : lvl.value === 1 ? C.warn : accent;
  }, [fresh, accent]);
  const textColor = useDerivedValue(() => (color.value === accent ? C.ink : color.value), [accent]);
  const text = useDerivedValue(() => (fresh ? format(value.value) : '--'), [fresh]);
  const note = props.note ?? '';
  const status = useDerivedValue(() => {
    const words = lvl.value === 2 ? levelWords[1] : lvl.value === 1 ? levelWords[0] : '';
    return words && note ? `${words} · ${note}` : words || note;
  }, [note, levelWords[0], levelWords[1]]);
  const statusColor = useDerivedValue(
    () => (lvl.value === 2 ? C.alarm : lvl.value === 1 ? C.warn : props.noteColor ?? C.quiet),
    [props.noteColor],
  );

  const valueY = cy - big.size * 0.12;
  const unitY = valueY + big.size * 0.55 + mid.size * 0.6;
  const secondaryY = unitY + mid.size * 0.6 + (secondaryFace?.size ?? 0) * 0.85;
  // End labels sit just below the arc's two ends (at 135 and 45 degrees); the label between them.
  const rowY = cy + r * Math.SQRT1_2 + stroke * 0.5 + Math.max(endFace.size, labelFace.size) * 0.75;
  const labelY = rowY;
  const statusY = rowY + labelFace.size * 0.6 + statusFace.size * 0.75;
  const endDy = rowY - cy;
  const endDx = r * Math.SQRT1_2;
  return (
    <Group>
      <Path path={arc} color={C.faint} style="stroke" strokeWidth={stroke} strokeCap="round" />
      <Path path={arc} color={color} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={frac} />
      <LiveText text={text} face={big} x={cx} y={valueY} color={textColor} hangDegree />
      <LiveText text={unit} face={mid} x={cx} y={unitY} color={C.quiet} />
      {props.secondary && secondaryFace ? (
        <LiveText text={props.secondary} face={secondaryFace} x={cx} y={secondaryY} color={C.quiet} />
      ) : null}
      <LiveText text={label.toUpperCase()} face={labelFace} x={cx} y={labelY} color={C.quiet} />
      <LiveText text={status} face={statusFace} x={cx} y={statusY} color={statusColor} />
      <LiveText text={minLabel} face={endFace} x={cx - endDx} y={cy + endDy} color={C.quiet} />
      <LiveText text={maxLabel} face={endFace} x={cx + endDx} y={cy + endDy} color={C.quiet} />
    </Group>
  );
}
