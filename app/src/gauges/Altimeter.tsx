import React from 'react';
import { Group, Line, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { altUnit, fmtAltitude, type Units } from '../core/format';
import { STD_QNH_HPA } from '../core/altitude';
import { live } from '../engine/live';
import { C, LiveText, useFaces } from './kit';

export function Altimeter(props: {
  w: number; h: number; compact: boolean; fresh: boolean; units: Units; qnhHpa: number;
}) {
  const { w, h, compact, fresh, units, qnhHpa } = props;
  const side = Math.min(w, h);
  const faces = useFaces(side, { big: compact ? 0.24 : 0.22, mid: 0.1, small: 0.075 });
  const cx = w / 2;
  const cy = h / 2;
  const text = useDerivedValue(() => (fresh ? fmtAltitude(live.altitude.value, units) : '--'), [fresh, units]);
  const color = fresh ? C.ink : C.stale;
  const uncalibrated = Math.abs(qnhHpa - STD_QNH_HPA) < 0.01;
  const ref = uncalibrated ? 'Set elevation in Settings' : `Ref ${qnhHpa.toFixed(1)} hPa`;

  return (
    <Group opacity={fresh ? 1 : 0.55}>
      <LiveText text="ALTITUDE" face={faces.small} x={cx} y={faces.small.size * 1.2} color={C.quiet} />
      <LiveText text={text} face={faces.big} x={cx} y={cy - faces.big.size * 0.1} color={color} />
      <Line
        p1={vec(cx - side * 0.25, cy + faces.big.size * 0.55)}
        p2={vec(cx + side * 0.25, cy + faces.big.size * 0.55)}
        color={C.faint}
        strokeWidth={1.5}
      />
      <LiveText text={altUnit(units)} face={faces.mid} x={cx} y={cy + faces.big.size * 0.95} color={C.quiet} />
      {!compact ? (
        <LiveText text={ref} face={faces.small} x={cx} y={h - faces.small.size * 1.2}
          color={uncalibrated ? C.warn : C.quiet} />
      ) : null}
    </Group>
  );
}
