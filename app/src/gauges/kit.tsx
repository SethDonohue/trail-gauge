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
}) {
  const { text, face, x, y, color, align = 'center' } = props;
  const { widths, avg } = face;
  const str = useDerivedValue(() => (typeof text === 'string' ? text : text.value));
  const tx = useDerivedValue(() => {
    const w = textWidth(str.value, widths, avg);
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
