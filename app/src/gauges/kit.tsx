import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { matchFont, Text, type SkFont } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { C } from '../core/palette';

export { C };

const FAMILY = Platform.select({ android: 'sans-serif-condensed', default: 'Helvetica' });
const GLYPHS = '0123456789-.,°:+()/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export interface Face {
  font: SkFont;
  widths: Record<string, number>;
  avg: number;
  size: number;
}

export function makeFace(size: number, bold = true): Face {
  const font = matchFont({ fontFamily: FAMILY, fontSize: size, fontWeight: bold ? 'bold' : 'normal' });
  const widths: Record<string, number> = {};
  for (const ch of GLYPHS) widths[ch] = font.measureText(ch).width;
  return { font, widths, avg: widths['0'], size };
}

const faceCache = new Map<string, Face>();
// Faces are cached by rounded size: gauges re-layout often, fonts are expensive to match.
export function faceFor(size: number, bold = true): Face {
  const key = `${Math.round(size * 2) / 2}-${bold}`;
  let f = faceCache.get(key);
  if (!f) {
    f = makeFace(Math.round(size * 2) / 2, bold);
    faceCache.set(key, f);
  }
  return f;
}

// The largest size (up to `preferred`, at least `min`) at which `template` fits in `maxW`.
// Text width scales linearly with font size, so one measurement at size 100 is enough.
export function fitSize(template: string, maxW: number, preferred: number, bold = true, min = 9): number {
  const ref = faceFor(100, bold);
  const w100 = textWidth(template, ref.widths, ref.avg);
  if (w100 <= 0) return preferred;
  return Math.max(min, Math.min(preferred, (maxW / w100) * 100));
}

// Splits words into at most `maxLines` lines that fit `maxW` at the largest size possible.
export function fitLines(text: string, maxW: number, preferred: number, maxLines = 2, bold = false, min = 9): {
  lines: string[]; face: Face;
} {
  const one = fitSize(text, maxW, preferred, bold, min);
  const words = text.split(' ');
  if (one >= preferred * 0.8 || words.length < 2 || maxLines < 2) return { lines: [text], face: faceFor(one, bold) };
  // Best two-line split: the one whose longer line is shortest.
  const ref = faceFor(100, bold);
  let best = { lines: [text], longest: Infinity };
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const longest = Math.max(textWidth(a, ref.widths, ref.avg), textWidth(b, ref.widths, ref.avg));
    if (longest < best.longest) best = { lines: [a, b], longest };
  }
  const size = Math.max(min, Math.min(preferred, (maxW / best.longest) * 100));
  return size > one ? { lines: best.lines, face: faceFor(size, bold) } : { lines: [text], face: faceFor(one, bold) };
}

// Static text that shrinks, then wraps to two lines, to fit `maxW`. `y` is the centre of the block.
export function FitText(props: {
  text: string; x: number; y: number; maxW: number; preferred: number; color: string; bold?: boolean; maxLines?: number;
}) {
  const { text, x, y, maxW, preferred, color, bold = false, maxLines = 2 } = props;
  const { lines, face } = useMemo(
    () => fitLines(text, maxW, preferred, maxLines, bold),
    [text, Math.round(maxW), Math.round(preferred), maxLines, bold],
  );
  const lh = face.size * 1.15;
  const top = y - ((lines.length - 1) * lh) / 2;
  return (
    <>
      {lines.map((l, i) => (
        <LiveText key={i} text={l} face={face} x={x} y={top + i * lh} color={color} />
      ))}
    </>
  );
}

export function useFaces(minSide: number, ratios: { big: number; mid: number; small: number }) {
  return useMemo(
    () => ({
      big: makeFace(Math.max(14, minSide * ratios.big)),
      mid: makeFace(Math.max(11, minSide * ratios.mid)),
      small: makeFace(Math.max(10, minSide * ratios.small), false),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.round(minSide), ratios.big, ratios.mid, ratios.small],
  );
}

export function textWidth(s: string, widths: Record<string, number>, avg: number): number {
  'worklet';
  let w = 0;
  for (let i = 0; i < s.length; i++) w += widths[s[i]] ?? avg;
  return w;
}

type Align = 'center' | 'left' | 'right';

// Text whose content and colour can change on the UI thread, aligned without re-rendering.
export function LiveText(props: {
  text: SharedValue<string> | string;
  face: Face;
  x: number;
  y: number;
  color: SharedValue<string> | string;
  align?: Align;
  hangDegree?: boolean; // centre the number, letting a trailing ° hang outside (optical centring)
}) {
  const { text, face, x, y, color, align = 'center', hangDegree = false } = props;
  const { widths, avg } = face;
  const str = useDerivedValue(() => (typeof text === 'string' ? text : text.value));
  const tx = useDerivedValue(() => {
    const s = str.value;
    let w = textWidth(s, widths, avg);
    if (hangDegree && align === 'center' && s.endsWith('°')) {
      // Centre on the digits; the degree sign hangs to the right.
      return x - (w - (widths['°'] ?? 0)) / 2;
    }
    return align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  });
  // Baseline sits about a third of the font size below the requested centre line.
  return <Text text={str} font={face.font} x={tx} y={y + face.size * 0.35} color={color} />;
}

// Like LiveText, but its position moves on the UI thread (compass letters).
export function MovingText(props: {
  text: string; face: Face; x: SharedValue<number>; y: SharedValue<number>; color: string;
}) {
  const { text, face, x, y, color } = props;
  const w = textWidth(text, face.widths, face.avg);
  const tx = useDerivedValue(() => x.value - w / 2);
  const ty = useDerivedValue(() => y.value + face.size * 0.35);
  return <Text text={text} font={face.font} x={tx} y={ty} color={color} />;
}

export const clamp01 = (v: number) => {
  'worklet';
  return Math.max(0, Math.min(1, v));
};
