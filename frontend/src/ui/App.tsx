import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiJson,
  DEFAULT_SYMBOLS,
  type SummaryResponse,
  type SymbolMetrics,
} from "../api/client";
import { useAppBootstrap } from "../hooks/useAppBootstrap";
import { useEodSummaryPolling } from "../hooks/useEodSummaryPolling";
import { useSymbolData } from "../hooks/useSymbolData";
import {
  mergeWatchlistWithIntraday,
  useIntradayWatchlist,
} from "../hooks/useIntradayWatchlist";
import { buildWatchlistTickers } from "../api/symbolCache";
import { eodSessionDateKey, type TimeRange } from "../utils/chart";
import { ErrorBanner } from "./components/ErrorBanner";
import { ForecastPanel, pickProphetForecast } from "./components/ForecastPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { ServerWakeBanner } from "./components/ServerWakeBanner";
import { StockDetail } from "./components/StockDetail";
import { Watchlist } from "./components/Watchlist";
import { metricsForSymbol } from "../utils/metrics";

export function App() {
  const [symbol, setSymbol] = useState<string>("AAPL");
  const [range, setRange] = useState<TimeRange>("1M");
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const metricsSessionRef = useRef<string | null>(null);

  const {
    summary,
    lastGoodSummary,
    metrics,
    hasAppData,
    markHasAppData,
    waitingForServer,
    loadErr,
    applySummary,
    refreshMetrics,
  } = useAppBootstrap();

  const summaryLastSession = useMemo(() => {
    const source = summary ?? lastGoodSummary.current;
    const lastTs = source?.tickers?.find((t) => t.symbol === symbol)?.last_ts;
    return lastTs ? eodSessionDateKey(lastTs) : null;
  }, [summary, symbol]);

  const {
    prices,
    forecasts,
    loading,
    error: symbolErr,
  } = useSymbolData(symbol, summaryLastSession, hasAppData);

  useEffect(() => {
    if (prices?.points?.length) {
      markHasAppData();
    }
  }, [prices, markHasAppData]);

  const refreshSummary = useCallback(async () => {
    const data = await apiJson<SummaryResponse>("/api/summary");
    applySummary(data);
  }, [applySummary]);

  useEodSummaryPolling(refreshSummary, hasAppData);

  useEffect(() => {
    if (!summaryLastSession) return;
    const previous = metricsSessionRef.current;
    metricsSessionRef.current = summaryLastSession;
    if (previous != null && summaryLastSession > previous) {
      refreshMetrics().catch(() => {});
    }
  }, [summaryLastSession, refreshMetrics]);

  const watchlistSymbols = useMemo(
    () =>
      summary?.tickers?.length
        ? summary.tickers.map((t) => t.symbol)
        : [...DEFAULT_SYMBOLS],
    [summary],
  );

  const {
    bySymbol: intradayBySymbol,
    loading: intradayLoading,
    errors: intradayErrors,
  } = useIntradayWatchlist(watchlistSymbols, hasAppData);

  const tickers = useMemo(() => {
    const base = buildWatchlistTickers(
      summary ?? lastGoodSummary.current,
      DEFAULT_SYMBOLS,
    );
    return mergeWatchlistWithIntraday(base, intradayBySymbol);
  }, [summary, symbol, prices, intradayBySymbol]);

  const chartSummary = summary ?? lastGoodSummary.current;
  const summaryRow = tickers.find((t) => t.symbol === symbol);
  const eodSummaryRow = chartSummary?.tickers?.find((t) => t.symbol === symbol);
  const activeIntraday = intradayBySymbol[symbol] ?? null;
  const activeIntradayErr = intradayErrors[symbol] ?? null;
  const latestForecast = pickProphetForecast(forecasts?.forecasts);
  const activeMetrics = metricsForSymbol(metrics?.tickers, symbol);
  const metricsBySymbol = useMemo(() => {
    const map: Record<string, SymbolMetrics | undefined> = {};
    for (const row of metrics?.tickers ?? []) {
      map[row.symbol] = row;
    }
    return map;
  }, [metrics]);

  const showWakeBanner = !hasAppData && waitingForServer;
  const displayError = showWakeBanner ? null : hasAppData ? (loadErr ?? symbolErr) : loadErr;

  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setMobileListOpen(false);
  };

  return (
    <div className="app">
      <div className="dashboard">
        <aside className="watchlist-panel">
          <Watchlist
            tickers={tickers}
            metricsBySymbol={metricsBySymbol}
            active={symbol}
            onSelect={selectSymbol}
          />
        </aside>

        <main className="main-panel">
          {showWakeBanner && (
            <ServerWakeBanner style={{ marginBottom: 16 }} />
          )}
          <ErrorBanner error={displayError} style={{ marginBottom: 16 }} />
          <StockDetail
            symbol={symbol}
            summaryRow={summaryRow}
            eodSummaryRow={eodSummaryRow}
            prices={prices}
            forecasts={forecasts}
            metrics={activeMetrics}
            metricsRefreshKey={summaryLastSession}
            range={range}
            onRangeChange={setRange}
            loading={loading}
            intraday={activeIntraday}
            intradayLoading={intradayLoading}
            intradayErr={activeIntradayErr}
            showMobileFabs={false}
          />
        </main>

        <aside className="trade-panel">
          <h3>Forecast</h3>
          <ForecastPanel
            forecast={latestForecast}
            fallbackPrice={summaryRow?.forecast_close}
          />
          <MetricsPanel metrics={activeMetrics} />
        </aside>
      </div>

      <div className="mobile-shell mobile-only">
        {showWakeBanner && (
          <ServerWakeBanner style={{ margin: "0 16px 12px" }} />
        )}
        <ErrorBanner error={displayError} style={{ margin: "0 16px 12px" }} />

        {mobileListOpen ? (
          <div className="phone-frame">
            <div className="phone-notch">
              <span />
            </div>
            <div className="phone-content" style={{ paddingTop: 8 }}>
              <div className="nav-row" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Back"
                  onClick={() => setMobileListOpen(false)}
                >
                  ←
                </button>
                <h2 style={{ margin: 0, fontSize: 16, flex: 1, textAlign: "center" }}>
                  Watchlist
                </h2>
                <span style={{ width: 36 }} />
              </div>
              <Watchlist
                tickers={tickers}
                metricsBySymbol={metricsBySymbol}
                active={symbol}
                onSelect={selectSymbol}
              />
            </div>
          </div>
        ) : (
          <div className="phone-frame">
            <div className="phone-notch">
              <span />
            </div>
            <div className="phone-content">
              <div className="mobile-picker">
                {tickers.map((t) => (
                  <button
                    key={t.symbol}
                    type="button"
                    className={t.symbol === symbol ? "active" : undefined}
                    onClick={() => selectSymbol(t.symbol)}
                  >
                    {t.symbol}
                  </button>
                ))}
              </div>
              <StockDetail
                symbol={symbol}
                summaryRow={summaryRow}
                eodSummaryRow={eodSummaryRow}
                prices={prices}
                forecasts={forecasts}
                metrics={activeMetrics}
                metricsRefreshKey={summaryLastSession}
                range={range}
                onRangeChange={setRange}
                loading={loading}
                intraday={activeIntraday}
                intradayLoading={intradayLoading}
                intradayErr={activeIntradayErr}
                showBack
                onBack={() => setMobileListOpen(true)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
