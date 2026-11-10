import React, { useMemo } from 'react';
import { Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { cardinal, fmtHeading } from '../core/format';
import { live } from '../engine/live';
import { C, faceFor, FitText, fitSize, LiveText, MovingText, useFaces, type Face } from './kit';

// The card turns with the heading; the N/E/S/W letters move round with it but stay upright.
function CardinalLetter({ letter, bearing, r, cx, cy, face, color }: {
  letter: string; bearing: number; r: number; cx: number; cy: number; face: Face; color: string;
}) {
  const x = useDerivedValue(() => {
    const hd = Number.isFinite(live.heading.value) ? live.heading.value : 0;
    return cx + r * Math.sin(((bearing - hd) * Math.PI) / 180);
  });
  const y = useDerivedValue(() => {
    const hd = Number.isFinite(live.heading.value) ? live.heading.value : 0;
    return cy - r * Math.cos(((bearing - hd) * Math.PI) / 180);
  });
  return <MovingText text={letter} face={face} x={x} y={y} color={color} />;
}

export function Compass(props: {
  w: number; h: number; compact: boolean; fresh: boolean; disturbed: boolean; accent: string;
}) {
  const { w, h, compact, fresh, disturbed, accent } = props;
  const side = Math.min(w, h);
  const faces = useFaces(side, { big: compact ? 0.17 : 0.13, mid: 0.08, small: 0.06 });
  const cx = w / 2;
  const cy = h / 2;
  const r = side * 0.44;
  const heading = faceFor(fitSize('888°', r * 0.95, side * (compact ? 0.17 : 0.15)));

  const ticks = useMemo(() => {
    const minor = Skia.PathBuilder.Make();
    const major = Skia.PathBuilder.Make();
    for (let d = 0; d < 360; d += 10) {
      const a = (d * Math.PI) / 180;
      const long = d % 30 === 0;
      const p = long ? major : minor;
      const r0 = r * (long ? 0.84 : 0.9);
      p.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
      p.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    return { minor: minor.build(), major: major.build() };
  }, [r]);

  const lubber = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const t = r * 0.09;
    p.moveTo(cx, cy - r - t * 0.2);
    p.lineTo(cx - t, cy - r - t * 1.6);
    p.lineTo(cx + t, cy - r - t * 1.6);
    p.close();
    return p.build();
  }, [cx, cy, r]);

  const transform = useDerivedValue(() => {
    const hd = Number.isFinite(live.heading.value) ? live.heading.value : 0;
    return [{ translateX: cx }, { translateY: cy }, { rotate: (-hd * Math.PI) / 180 }];
  });
  const color = useDerivedValue(() => (fresh ? C.ink : C.stale), [fresh]);
  const headingText = useDerivedValue(() => (fresh ? fmtHeading(live.heading.value) : '---°'), [fresh]);
  // Cardinal direction and which north: T (true) or M (magnetic).
  const subText = useDerivedValue(() => {
    if (!fresh) return '--';
    const ref = live.headingTrue.value ? 'TRUE' : 'MAG';
    return `${cardinal(live.heading.value)} · ${ref}`;
  }, [fresh]);
  const sub = faceFor(fitSize('NW · TRUE', r * 0.8, side * 0.065, false));

  const lr = r * 0.66; // letter radius
  const m = faces.mid;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={C.edge} style="stroke" strokeWidth={1.5} />
      <Group transform={transform}>
        <Path path={ticks.minor} color={C.quiet} style="stroke" strokeWidth={1.25} />
        <Path path={ticks.major} color={C.ink} style="stroke" strokeWidth={2.25} />
      </Group>
      <CardinalLetter letter="N" bearing={0} r={lr} cx={cx} cy={cy} face={m} color={accent} />
      <CardinalLetter letter="E" bearing={90} r={lr} cx={cx} cy={cy} face={m} color={C.ink} />
      <CardinalLetter letter="S" bearing={180} r={lr} cx={cx} cy={cy} face={m} color={C.ink} />
      <CardinalLetter letter="W" bearing={270} r={lr} cx={cx} cy={cy} face={m} color={C.ink} />
      <Path path={lubber} color={disturbed ? C.warn : accent} />
      <LiveText text={headingText} face={heading} x={cx} y={cy - heading.size * 0.12} color={color} hangDegree />
      <LiveText text={subText} face={sub} x={cx} y={cy + heading.size * 0.55 + sub.size * 0.7} color={C.quiet} />
      {disturbed ? (
        <FitText text="MAGNETIC INTERFERENCE" x={cx} y={cy + r * 0.52} maxW={r * 1.15} preferred={side * 0.06}
          color={C.warn} bold />
      ) : null}
    </Group>
  );
}
