import { useEffect, useState } from "react";
import {
  fetchSymbolMetricsTrend,
  getErrorInfo,
  type ErrorInfo,
  type SymbolMetricsTrend,
} from "../api/client";

export function useMetricsTrend(
  symbol: string,
  refreshKey?: string | null,
) {
  const [trend, setTrend] = useState<SymbolMetricsTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchSymbolMetricsTrend(symbol)
      .then((data) => {
        if (cancelled) return;
        setTrend(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(getErrorInfo(e));
        setTrend(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, refreshKey]);

  return { trend, loading, error };
}
