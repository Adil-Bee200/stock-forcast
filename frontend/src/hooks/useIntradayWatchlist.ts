import { useCallback, useEffect, useState } from "react";
import {
  apiJson,
  getErrorInfo,
  type ErrorInfo,
  type IntradayResponse,
  type SummaryTicker,
} from "../api/client";
import { useMarketSessionPolling } from "./useMarketSessionPolling";

export { INTRADAY_POLL_MS } from "../utils/marketSession";

export function intradaySessionQuote(
  response: IntradayResponse | null | undefined,
): { lastClose: number | null; changePct: number | null } {
  const points = response?.points ?? [];
  if (!points.length) return { lastClose: null, changePct: null };

  const last = points[points.length - 1].close;
  let changePct: number | null = null;
  if (points.length >= 2 && points[0].close) {
    changePct = ((last - points[0].close) / points[0].close) * 100;
  }
  return { lastClose: last, changePct };
}

export function mergeWatchlistWithIntraday(
  tickers: SummaryTicker[],
  bySymbol: Record<string, IntradayResponse>,
): SummaryTicker[] {
  return tickers.map((t) => {
    const intraday = bySymbol[t.symbol];
    const { lastClose, changePct } = intradaySessionQuote(intraday);
    if (lastClose == null) return t;

    return {
      ...t,
      last_close: lastClose,
      change_pct: changePct ?? t.change_pct,
      last_ts: intraday.points.at(-1)?.ts ?? t.last_ts,
    };
  });
}

export function useIntradayWatchlist(symbols: readonly string[], enabled: boolean) {
  const [bySymbol, setBySymbol] = useState<Record<string, IntradayResponse>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, ErrorInfo>>({});

  const symbolsKey = symbols.join(",");

  const fetchAll = useCallback(
    async (initialLoad: boolean) => {
      if (!enabled || symbols.length === 0) return;

      if (initialLoad) setLoading(true);

      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const data = await apiJson<IntradayResponse>(
              `/api/intraday/${encodeURIComponent(sym)}`,
            );
            return { sym, data, error: null as ErrorInfo | null };
          } catch (e) {
            return { sym, data: null, error: getErrorInfo(e) };
          }
        }),
      );

      setBySymbol((prev) => {
        const next = { ...prev };
        for (const { sym, data } of results) {
          if (data) next[sym] = data;
        }
        return next;
      });

      setErrors((prev) => {
        const next = { ...prev };
        for (const { sym, error } of results) {
          if (error) next[sym] = error;
          else delete next[sym];
        }
        return next;
      });

      if (initialLoad) setLoading(false);
    },
    [enabled, symbolsKey, symbols],
  );

  useEffect(() => {
    if (!enabled) {
      setBySymbol({});
      setErrors({});
      setLoading(false);
    }
  }, [enabled]);

  useMarketSessionPolling(fetchAll, enabled);

  return { bySymbol, loading, errors };
}
