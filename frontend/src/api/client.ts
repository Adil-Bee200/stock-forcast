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

const inflight = new Map<string, Promise<unknown>>();

export async function apiJson<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, messageForHttpError(res.status, body));
    }
    return res.json() as Promise<T>;
  })();

  inflight.set(path, request);
  try {
    return (await request) as T;
  } finally {
    inflight.delete(path);
  }
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
