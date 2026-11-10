import React from 'react';
import { Group, Line, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { altUnit, fmtAltitude, type Units } from '../core/format';
import { STD_QNH_HPA } from '../core/altitude';
import { live } from '../engine/live';
import { statusStore } from '../engine/live';
import { C, faceFor, FitText, fitSize, LiveText, useFaces } from './kit';

export function Altimeter(props: {
  w: number; h: number; compact: boolean; fresh: boolean; units: Units; qnhHpa: number; accent: string;
}) {
  const { w, h, compact, fresh, units, qnhHpa } = props;
  const side = Math.min(w, h);
  const faces = useFaces(side, { big: compact ? 0.24 : 0.22, mid: 0.1, small: 0.075 });
  const cx = w / 2;
  const cy = h / 2;
  const text = useDerivedValue(() => (fresh ? fmtAltitude(live.altitude.value, units) : '--'), [fresh, units]);
  const color = fresh ? C.ink : C.stale;
  const src = statusStore.useSelect(s => s.altitudeSource);
  const uncalibrated = Math.abs(qnhHpa - STD_QNH_HPA) < 0.01;
  const ref = src === 'gps'
    ? 'GPS height'
    : uncalibrated ? 'Not calibrated: set elevation in settings' : `Ref ${qnhHpa.toFixed(1)} hPa`;
  const big = faceFor(fitSize('88,888', w * 0.84, Math.min(side * (compact ? 0.26 : 0.24), h * 0.3)));

  return (
    <Group>
      <LiveText text="ALTITUDE" face={faces.small} x={cx} y={faces.small.size * 1.2} color={C.quiet} />
      <LiveText text={text} face={big} x={cx} y={cy - big.size * 0.15} color={color} />
      <Line
        p1={vec(cx - Math.min(side * 0.3, w * 0.4), cy + big.size * 0.5)}
        p2={vec(cx + Math.min(side * 0.3, w * 0.4), cy + big.size * 0.5)}
        color={C.faint}
        strokeWidth={1.5}
      />
      <LiveText text={altUnit(units)} face={faces.mid} x={cx} y={cy + big.size * 0.9} color={C.quiet} />
      <FitText text={ref} x={cx} y={h - faces.small.size * 1.9} maxW={w * 0.9} preferred={faces.small.size}
        color={uncalibrated && src !== 'gps' ? C.warn : C.quiet} />
    </Group>
  );
}
