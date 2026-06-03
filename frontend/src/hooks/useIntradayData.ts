import { useCallback, useEffect, useState } from "react";
import {
  apiJson,
  getErrorInfo,
  type ErrorInfo,
  type IntradayResponse,
} from "../api/client";

export const INTRADAY_POLL_MS = 60_000;

export function useIntradayData(symbol: string, enabled: boolean) {
  const [intraday, setIntraday] = useState<IntradayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const fetchIntraday = useCallback(
    async (initialLoad: boolean) => {
      if (!enabled) return;

      if (initialLoad) setLoading(true);
      try {
        const data = await apiJson<IntradayResponse>(
          `/api/intraday/${encodeURIComponent(symbol)}`,
        );
        setIntraday(data);
        setError(null);
      } catch (e) {
        setError(getErrorInfo(e));
      } finally {
        if (initialLoad) setLoading(false);
      }
    },
    [enabled, symbol],
  );

  useEffect(() => {
    if (!enabled) {
      setIntraday(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      await fetchIntraday(true);
    })();

    const id = window.setInterval(() => {
      if (!cancelled) fetchIntraday(false);
    }, INTRADAY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, enabled, fetchIntraday]);

  return { intraday, loading, error };
}
