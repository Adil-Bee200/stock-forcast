import type { PricePoint } from "../api/client";

import { MARKET_TIMEZONE } from "./format";



export type TimeRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y";



export const TIME_RANGES: TimeRange[] = ["1D", "1W", "1M", "6M", "1Y", "5Y"];



const RANGE_CALENDAR_DAYS: Record<TimeRange, number> = {

  "1D": 1,

  "1W": 7,

  "1M": 30,

  "6M": 180,

  "1Y": 365,

  "5Y": 1825,

};



export type ChartRow = {

  index: number;

  ts: string;

  close: number;

  volume: number | null;

  label: string;

  /** Prophet next-session projection (yellow overlay). */

  forecastClose?: number;

  isForecast?: boolean;

};



export type SummaryEod = { ts: string; close: number };



/** Trading session date for a daily EOD bar (handles UTC-midnight storage). */

export function eodSessionDateKey(iso: string): string {

  const et = etDateKey(iso);

  const utc = new Date(iso).toISOString().slice(0, 10);

  return et >= utc ? et : utc;

}



export function todayEtDateKey(now = new Date()): string {

  return etDateKey(now.toISOString());

}



/** One bar per session date; later timestamps win (e.g. corrected ingest). */

export function dedupeEodPoints(points: PricePoint[]): PricePoint[] {

  const bySession = new Map<string, PricePoint>();

  for (const p of points) {

    bySession.set(eodSessionDateKey(p.ts), p);

  }

  return [...bySession.entries()]

    .sort(([a], [b]) => a.localeCompare(b))

    .map(([, p]) => p);

}



/**

 * Inject the latest EOD from ``/api/summary`` only when that session is

 * missing from the price history. Never replace an existing bar — that would

 * strip OHLCV/volume data from ``/api/prices``.

 */

function injectMissingSummaryEod(

  points: PricePoint[],

  summaryEod?: SummaryEod | null,

): PricePoint[] {

  if (!summaryEod?.ts) return points;



  const summaryDate = eodSessionDateKey(summaryEod.ts);

  if (points.some((p) => eodSessionDateKey(p.ts) === summaryDate)) {

    return points;

  }



  const lastDate = points.length

    ? eodSessionDateKey(points[points.length - 1].ts)

    : null;

  if (lastDate && summaryDate < lastDate) return points;



  return [

    ...points,

    {

      ts: summaryEod.ts,

      open: summaryEod.close,

      high: summaryEod.close,

      low: summaryEod.close,

      close: summaryEod.close,

      volume: null,

    },

  ];

}



function maxDateKey(a: string, b: string): string {

  return a >= b ? a : b;

}



function addCalendarDays(dateKey: string, delta: number): string {

  const [y, m, d] = dateKey.split("-").map(Number);

  const dt = new Date(Date.UTC(y, m - 1, d));

  dt.setUTCDate(dt.getUTCDate() + delta);

  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");

  const day = String(dt.getUTCDate()).padStart(2, "0");

  return `${dt.getUTCFullYear()}-${month}-${day}`;

}



function sortEodBySession(points: PricePoint[]): PricePoint[] {

  return [...points].sort(

    (a, b) =>

      eodSessionDateKey(a.ts).localeCompare(eodSessionDateKey(b.ts)) ||

      new Date(a.ts).getTime() - new Date(b.ts).getTime(),

  );

}



function lastEodSession(points: PricePoint[]): string | null {

  if (!points.length) return null;

  return eodSessionDateKey(points[points.length - 1].ts);

}



/** ET calendar date (``YYYY-MM-DD``) for an ISO timestamp. */
export function etDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIMEZONE,
  }).format(new Date(iso));
}

export function intradaySessionEtDate(points: PricePoint[]): string | null {
  if (!points.length) return null;
  return etDateKey(points[points.length - 1].ts);
}

// Keep only bars from the latest intraday session (most recent ET calendar day)

export function filterIntradaySession(points: PricePoint[]): PricePoint[] {

  if (!points.length) return [];

  const sessionDate = etDateKey(points[points.length - 1].ts);

  return points.filter((p) => etDateKey(p.ts) === sessionDate);

}



/** True when ``liveTs`` is on a trading session after the last EOD bar. */

export function isLiveSessionAfterEod(

  eodPoints: PricePoint[],

  liveTs?: string | null,

): boolean {

  if (!eodPoints.length || !liveTs) return false;

  const lastEod = lastEodSession(eodPoints);

  const liveSession = eodSessionDateKey(liveTs);

  return lastEod != null && liveSession > lastEod;

}



/** Live only after the series includes the latest ingested EOD (from summary). */

function canAppendLiveQuote(

  eodPoints: PricePoint[],

  liveTs: string | null | undefined,

  summaryEod?: SummaryEod | null,

): boolean {

  if (!liveTs || !isLiveSessionAfterEod(eodPoints, liveTs)) return false;

  if (!summaryEod?.ts) return false;



  const summarySession = eodSessionDateKey(summaryEod.ts);

  const lastSession = lastEodSession(eodPoints);

  return lastSession != null && lastSession >= summarySession;

}



/** Append today's live quote after the last EOD bar — never overwrite EOD. */

export function appendLiveQuote(

  points: PricePoint[],

  livePrice: number | null | undefined,

  liveTs?: string | null,

): PricePoint[] {

  if (livePrice == null || !points.length || !liveTs) return points;

  if (!isLiveSessionAfterEod(points, liveTs)) return points;



  const liveSession = eodSessionDateKey(liveTs);

  const barTs = `${liveSession}T20:00:00.000Z`;



  return [

    ...points,

    {

      ts: barTs,

      open: livePrice,

      high: livePrice,

      low: livePrice,

      close: livePrice,

      volume: null,

    },

  ];

}



export function filterByRange(

  points: PricePoint[],

  range: TimeRange,

  options?: { endDate?: string },

): PricePoint[] {

  if (!points.length) return [];



  const lastDataDate = eodSessionDateKey(points[points.length - 1].ts);

  const endDate = options?.endDate ?? maxDateKey(lastDataDate, todayEtDateKey());



  if (range === "1D") {

    return points.filter((p) => eodSessionDateKey(p.ts) === endDate);

  }



  const span = RANGE_CALENDAR_DAYS[range];

  const startDate = addCalendarDays(endDate, -(span - 1));



  return points.filter((p) => {

    const date = eodSessionDateKey(p.ts);

    return date >= startDate && date <= endDate;

  });

}



export function prepareEodChartSeries(

  points: PricePoint[],

  range: TimeRange,

  live?: { price: number | null | undefined; ts?: string | null },

  summaryEod?: SummaryEod | null,

): PricePoint[] {

  const normalized = sortEodBySession(

    injectMissingSummaryEod(dedupeEodPoints(points), summaryEod),

  );



  const extended =

    live?.price != null &&

    canAppendLiveQuote(normalized, live.ts, summaryEod)

      ? sortEodBySession(

          appendLiveQuote(normalized, live.price, live.ts),

        )

      : normalized;



  return filterByRange(extended, range);

}



/** % change from the start of ``range`` to ``livePrice`` (or the last bar in range). */

export function computeRangeChangePct(

  range: TimeRange,

  eodPoints: PricePoint[],

  options?: {

    intradayPoints?: PricePoint[];

    livePrice?: number | null;

    liveTs?: string | null;

    summaryEod?: SummaryEod | null;

  },

): number | null {

  const livePrice = options?.livePrice ?? null;



  if (range === "1D" && options?.intradayPoints?.length) {

    const session = filterIntradaySession(options.intradayPoints);

    if (!session.length) return null;



    const startPrice = session[0].close;

    const endPrice = livePrice ?? session[session.length - 1].close;

    if (!startPrice) return null;

    return ((endPrice - startPrice) / startPrice) * 100;

  }



  const filtered = prepareEodChartSeries(

    eodPoints,

    range,

    { price: livePrice, ts: options?.liveTs },

    options?.summaryEod,

  );

  if (!filtered.length) return null;



  const startPrice = filtered[0].close;

  const endPrice = livePrice ?? filtered[filtered.length - 1].close;

  if (!startPrice) return null;

  return ((endPrice - startPrice) / startPrice) * 100;

}


