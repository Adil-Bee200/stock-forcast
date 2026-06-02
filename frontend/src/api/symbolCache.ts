import type { ForecastsResponse, PricesResponse, SummaryResponse, SummaryTicker } from "./client";

export const SYMBOL_CACHE_TTL_MS = 10 * 60 * 1000;

const STORAGE_KEY = "stock-predictor-api-cache";

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

type PersistedCache = {
  summary: CacheEntry<SummaryResponse> | null;
  prices: Record<string, CacheEntry<PricesResponse>>;
  forecasts: Record<string, CacheEntry<ForecastsResponse>>;
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

function loadFromSessionStorage(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as PersistedCache;
    summaryCache = parsed.summary ?? null;

    pricesCache.clear();
    for (const [symbol, entry] of Object.entries(parsed.prices ?? {})) {
      pricesCache.set(symbol, entry);
    }

    forecastsCache.clear();
    for (const [symbol, entry] of Object.entries(parsed.forecasts ?? {})) {
      forecastsCache.set(symbol, entry);
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function persistToSessionStorage(): void {
  try {
    const payload: PersistedCache = {
      summary: summaryCache,
      prices: Object.fromEntries(pricesCache.entries()),
      forecasts: Object.fromEntries(forecastsCache.entries()),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded or private mode */
  }
}

loadFromSessionStorage();

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
  persistToSessionStorage();
}

export function setCachedForecasts(symbol: string, data: ForecastsResponse): void {
  forecastsCache.set(symbol, { data, fetchedAt: Date.now() });
  persistToSessionStorage();
}

export function setCachedSummary(data: SummaryResponse): void {
  summaryCache = { data, fetchedAt: Date.now() };
  persistToSessionStorage();
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

export function hasPersistedData(): boolean {
  return (
    summaryCache != null || pricesCache.size > 0 || forecastsCache.size > 0
  );
}
