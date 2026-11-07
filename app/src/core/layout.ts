// Picks the grid that makes the gauges as large as possible in the space available.
// Gauges are round, so a tile's useful size is its shorter side. This handles phones,
// tablets in either orientation, and split-screen windows of any shape with one rule.

export interface Grid {
  cols: number;
  rows: number;
}

export function bestGrid(n: number, width: number, height: number, gap = 12): Grid {
  if (n <= 0 || width <= 0 || height <= 0) return { cols: 1, rows: Math.max(1, n) };
  let best: Grid = { cols: n, rows: 1 };
  let bestSide = -1;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tileW = (width - gap * (cols - 1)) / cols;
    const tileH = (height - gap * (rows - 1)) / rows;
    const side = Math.min(tileW, tileH);
    // Prefer no empty cells when the gain is small (< 8%): a full grid looks tidier.
    const empty = cols * rows - n;
    const score = side * (empty > 0 ? 0.92 : 1);
    if (score > bestSide) {
      bestSide = score;
      best = { cols, rows };
    }
  }
  return best;
}

// Splits items into rows of `cols`. A short last row is stretched by the caller to fill.
export function chunk<T>(items: readonly T[], cols: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
  return out;
}
