// Gauge colour: the normal-state colour of arcs, needles and silhouettes. Amber and red always
// keep their meaning, so they are not offered as gauge colours.

import { C, contrast } from './palette.ts';

export const DEFAULT_GAUGE_COLOR = C.accent;
export const CONTROL_MIN_CONTRAST = 3; // WCAG 1.4.11 for graphics against the tile

export const GAUGE_PRESETS: readonly { name: string; hex: string }[] = [
  { name: 'Mint', hex: '#7fd6a6' },
  { name: '90s green', hex: '#5cf28a' },
  { name: 'White', hex: '#eef2ef' },
  { name: 'Sky', hex: '#6cb6ff' },
  { name: 'Violet', hex: '#b9a3ff' },
];

export function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

// A colour from the custom wheel at `hue` degrees, lightened until it reads clearly on a tile.
export function wheelColorAt(hue: number): string {
  for (let l = 0.6; l <= 0.9; l += 0.02) {
    const hex = hslToHex(((hue % 360) + 360) % 360, 0.8, l);
    if (contrast(hex, C.panel) >= 4.5) return hex;
  }
  return hslToHex(hue, 0.8, 0.9);
}

// Amber and red stay reserved for alerts: hues near them are refused for the custom colour.
export function isReservedHue(hue: number): boolean {
  const h = ((hue % 360) + 360) % 360;
  return h < 55 || h >= 335;
}

export function usableGaugeColor(hex: string): string {
  return isHexColor(hex) && contrast(hex, C.panel) >= CONTROL_MIN_CONTRAST ? hex : DEFAULT_GAUGE_COLOR;
}
