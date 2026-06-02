import { useEffect, useState } from "react";
import {
  apiJson,
  getErrorInfo,
  type ErrorInfo,
  type ForecastsResponse,
  type PricesResponse,
} from "../api/client";
import {
  getCachedForecasts,
  getCachedPrices,
  getStaleForecasts,
  getStalePrices,
  setCachedForecasts,
  setCachedPrices,
} from "../api/symbolCache";

function resolveSymbolData(symbol: string) {
  const prices = getCachedPrices(symbol) ?? getStalePrices(symbol);
  const forecasts = getCachedForecasts(symbol) ?? getStaleForecasts(symbol);
  const needPrices = !getCachedPrices(symbol);
  const needForecasts = !getCachedForecasts(symbol);
  return { prices, forecasts, needPrices, needForecasts };
}

export function useSymbolData(symbol: string) {
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [forecasts, setForecasts] = useState<ForecastsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initial = resolveSymbolData(symbol);
    setPrices(initial.prices);
    setForecasts(initial.forecasts);
    setError(null);

    if (!initial.needPrices && !initial.needForecasts) {
      setLoading(false);
      return;
    }

    setLoading(!initial.prices && !initial.forecasts);

    (async () => {
      let fetchError: ErrorInfo | null = null;

      const priceTask = initial.needPrices
        ? apiJson<PricesResponse>(`/api/prices/${encodeURIComponent(symbol)}`)
            .then((data) => {
              if (cancelled) return;
              setCachedPrices(symbol, data);
              setPrices(data);
            })
            .catch((e) => {
              fetchError = getErrorInfo(e);
            })
        : null;

      const forecastTask = initial.needForecasts
        ? apiJson<ForecastsResponse>(
            `/api/forecasts/${encodeURIComponent(symbol)}`,
          )
            .then((data) => {
              if (cancelled) return;
              setCachedForecasts(symbol, data);
              setForecasts(data);
            })
            .catch((e) => {
              const info = getErrorInfo(e);
              fetchError = fetchError?.rateLimited ? fetchError : info;
            })
        : null;

      await Promise.all(
        [priceTask, forecastTask].filter((task): task is Promise<void> => task != null),
      );

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError);
        setPrices((current) => current ?? getStalePrices(symbol));
        setForecasts((current) => current ?? getStaleForecasts(symbol));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { prices, forecasts, loading, error };
}
