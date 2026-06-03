import type { PricePoint } from "../api/client";

export type TimeRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y";

export const TIME_RANGES: TimeRange[] = ["1D", "1W", "1M", "6M", "1Y", "5Y"];

const RANGE_DAYS: Record<TimeRange, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "6M": 180,
  "1Y": 365,
  "5Y": 1825,
};

export type ChartRow = {
  ts: string;
  close: number;
  volume: number | null;
  label: string;
};

export function filterByRange(
  points: PricePoint[],
  range: TimeRange,
): PricePoint[] {
  if (!points.length) return [];
  const last = new Date(points[points.length - 1].ts).getTime();
  const cutoff = last - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return points.filter((p) => new Date(p.ts).getTime() >= cutoff);
}

/** % change from the start of ``range`` to ``livePrice`` (or the last bar in range). */
export function computeRangeChangePct(
  range: TimeRange,
  eodPoints: PricePoint[],
  options?: {
    intradayPoints?: PricePoint[];
    livePrice?: number | null;
  },
): number | null {
  const intradayPoints = options?.intradayPoints;
  const livePrice = options?.livePrice ?? null;

  if (range === "1D" && intradayPoints?.length) {
    const startPrice = intradayPoints[0].close;
    const endPrice =
      livePrice ?? intradayPoints[intradayPoints.length - 1].close;
    if (!startPrice) return null;
    return ((endPrice - startPrice) / startPrice) * 100;
  }

  const filtered = filterByRange(eodPoints, range);
  if (!filtered.length) return null;

  const startPrice = filtered[0].close;
  const endPrice = livePrice ?? filtered[filtered.length - 1].close;
  if (!startPrice) return null;
  return ((endPrice - startPrice) / startPrice) * 100;
}
