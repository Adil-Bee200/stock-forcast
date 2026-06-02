import type { ForecastsResponse, PricesResponse, SummaryResponse, SummaryTicker } from "./client";

/** Prefer fresh data; stale entries kept indefinitely for rate-limit fallbacks. */
export const SYMBOL_CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const pricesCache = new Map<string, CacheEntry<PricesResponse>>();
const forecastsCache = new Map<string, CacheEntry<ForecastsResponse>>();
let summaryCache: CacheEntry<SummaryResponse> | null = null;

function isFresh(entry: CacheEntry<unknown>, ttlMs = SYMBOL_CACHE_TTL_MS): boolean {
  return Date.now() - entry.fetchedAt < ttlMs;
}

function readEntry<T>(entry: CacheEntry<T> | undefined, allowStale: boolean): T | null {
  if (!entry) return null;
  if (isFresh(entry) || allowStale) return entry.data;
  return null;
}

export function getCachedPrices(symbol: string): PricesResponse | null {
  return readEntry(pricesCache.get(symbol), false);
}

export function getStalePrices(symbol: string): PricesResponse | null {
  return readEntry(pricesCache.get(symbol), true);
}

export function getCachedForecasts(symbol: string): ForecastsResponse | null {
  return readEntry(forecastsCache.get(symbol), false);
}

export function getStaleForecasts(symbol: string): ForecastsResponse | null {
  return readEntry(forecastsCache.get(symbol), true);
}

export function getCachedSummary(): SummaryResponse | null {
  return readEntry(summaryCache ?? undefined, false);
}

export function getStaleSummary(): SummaryResponse | null {
  return readEntry(summaryCache ?? undefined, true);
}

export function setCachedPrices(symbol: string, data: PricesResponse): void {
  pricesCache.set(symbol, { data, fetchedAt: Date.now() });
}

export function setCachedForecasts(symbol: string, data: ForecastsResponse): void {
  forecastsCache.set(symbol, { data, fetchedAt: Date.now() });
}

export function setCachedSummary(data: SummaryResponse): void {
  summaryCache = { data, fetchedAt: Date.now() };
}

/** Fill missing watchlist prices from per-symbol price cache after a rate limit. */
export function enrichTickerFromPriceCache(ticker: SummaryTicker): SummaryTicker {
  if (ticker.last_close != null) return ticker;

  const cached = getStalePrices(ticker.symbol);
  const points = cached?.points;
  if (!points?.length) return ticker;

  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;

  let change_pct = ticker.change_pct;
  if (change_pct == null && prev?.close) {
    change_pct = ((last.close - prev.close) / prev.close) * 100;
  }

  return {
    ...ticker,
    last_close: last.close,
    last_ts: last.ts,
    change_pct,
  };
}

export function buildWatchlistTickers(
  summary: SummaryResponse | null,
  symbols: readonly string[],
): SummaryTicker[] {
  const rows =
    summary?.tickers?.length
      ? summary.tickers
      : getStaleSummary()?.tickers;

  const base: SummaryTicker[] = rows?.length
    ? rows
    : symbols.map((symbol) => ({
        symbol,
        last_close: null,
        last_ts: null,
        change_pct: null,
        forecast_close: null,
      }));

  return base.map(enrichTickerFromPriceCache);
}
