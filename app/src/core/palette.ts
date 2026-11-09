// App colours. Pure data, so unit tests can check contrast (test/core.test.ts).
// Every text colour meets WCAG 2.2 AA (4.5:1) on the tile and the background; control edges,
// inactive indicators and the no-data state meet 3:1. Only `edge` and `faint` fall below,
// and they are decorative (tile outlines, gauge tracks, the inclinometer ground line).
export const C = {
  bg: '#0b0d0e',
  panel: '#14181a',
  edge: '#2a3033',
  ink: '#eef2ef',
  quiet: '#8b9591',
  faint: '#3b4245', // decorative only (gauge track, ground line): never text or a control edge
  accent: '#7fd6a6',
  warn: '#f4b740',
  alarm: '#ff5a4e',
  stale: '#60686b', // no-data '--': dimmed, but 3.1:1 on a tile (WCAG large text)
  control: '#60686b', // input/segment borders and inactive page dots: 3.4:1 on the background (WCAG 1.4.11)
};

// WCAG 2.x relative luminance and contrast ratio.
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
