import { ApiError, messageForHttpError } from "./errors";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export { ApiError, getErrorInfo, type ErrorInfo } from "./errors";

export type SummaryTicker = {
  symbol: string;
  last_close: number | null;
  last_ts: string | null;
  change_pct: number | null;
  forecast_close: number | null;
};

export type SummaryResponse = { tickers: SummaryTicker[]; as_of: string };

export type AlertItem = {
  id: number;
  symbol: string;
  kind: string;
  severity: string;
  message: string;
  created_at: string;
};

export type AlertsResponse = { alerts: AlertItem[] };

export type PricePoint = {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

export type PricesResponse = { symbol: string; points: PricePoint[] };

export type IntradayResponse = {
  symbol: string;
  interval: string;
  points: PricePoint[];
  as_of: string;
  cached: boolean;
};

export type ForecastPoint = {
  created_at: string;
  forecast_for: string;
  horizon_label: string;
  predicted_close: number;
  lower_bound: number | null;
  upper_bound: number | null;
  model_version: string;
};

export type ForecastsResponse = { symbol: string; forecasts: ForecastPoint[] };

export type ModelMae = {
  model_name: string;
  mae_7d: number | null;
  mae_30d: number | null;
  samples_7d: number;
  samples_30d: number;
};

export type SymbolMetrics = {
  symbol: string;
  models: ModelMae[];
};

export type MetricsResponse = {
  tickers: SymbolMetrics[];
  as_of: string;
};

export type MetricTrendPoint = {
  date: string;
  absolute_error: number;
  percentage_error: number;
};

export type ModelMetricTrend = {
  model_name: string;
  points: MetricTrendPoint[];
};

export type SymbolMetricsTrend = {
  symbol: string;
  models: ModelMetricTrend[];
};

const inflight = new Map<string, Promise<unknown>>();

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, messageForHttpError(res.status, body));
  }
  return res.json() as Promise<T>;
}

export async function apiJson<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;

  const request = fetchJson<T>(path);
  inflight.set(path, request);
  try {
    return await request;
  } finally {
    inflight.delete(path);
  }
}

const pricesInflight = new Map<string, Promise<PricesResponse>>();

/** Always bypass HTTP cache — EOD series must reflect the latest ingested bar. */
export function fetchSymbolPrices(symbol: string): Promise<PricesResponse> {
  const key = symbol.toUpperCase();
  const existing = pricesInflight.get(key);
  if (existing) return existing;

  const path = `/api/prices/${encodeURIComponent(symbol)}`;
  const request = fetchJson<PricesResponse>(path, { cache: "no-store" }).finally(
    () => {
      pricesInflight.delete(key);
    },
  );
  pricesInflight.set(key, request);
  return request;
}

export function fetchSymbolForecasts(
  symbol: string,
): Promise<ForecastsResponse> {
  const path = `/api/forecasts/${encodeURIComponent(symbol)}`;
  return fetchJson<ForecastsResponse>(path);
}

export function fetchSymbolMetricsTrend(
  symbol: string,
  sessions = 90,
): Promise<SymbolMetricsTrend> {
  const path = `/api/metrics/${encodeURIComponent(symbol)}/trend?sessions=${sessions}`;
  return fetchJson<SymbolMetricsTrend>(path);
}

export const DEFAULT_SYMBOLS = [
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "NVDA",
  "TSLA",
] as const;
