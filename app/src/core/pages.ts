// The dashboard shows gauges three at a time. The first page holds the three the user chose;
// the rest follow in registry order. Swiping sideways moves a page and wraps around.

export const GAUGES_PER_PAGE = 3;

export function gaugePages<T>(firstPage: readonly T[], all: readonly T[]): T[][] {
  const first = firstPage.filter((g, i) => all.includes(g) && firstPage.indexOf(g) === i);
  const rest = all.filter(g => !first.includes(g));
  const pages: T[][] = [first];
  for (let i = 0; i < rest.length; i += GAUGES_PER_PAGE) pages.push(rest.slice(i, i + GAUGES_PER_PAGE));
  return pages.filter(p => p.length > 0);
}

export function pageAfterSwipe(page: number, delta: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return (((page + delta) % pageCount) + pageCount) % pageCount;
}
