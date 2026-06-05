import type {
  AlertsResponse,
  ErrorInfo,
  ForecastsResponse,
  IntradayResponse,
  PricesResponse,
  SummaryTicker,
  SymbolMetrics,
} from "../../api/client";
import { buildNewsItems } from "../../data/news";
import type { TimeRange } from "../../utils/chart";
import {
  computeRangeChangePct,
  filterIntradaySession,
  prepareEodChartSeries,
} from "../../utils/chart";
import { fmtChartTime, fmtIntradayChartTime } from "../../utils/format";
import { ErrorBanner } from "./ErrorBanner";
import { ForecastPanel, pickProphetForecast } from "./ForecastPanel";
import { MetricsPanel } from "./MetricsPanel";
import { NewsSection } from "./NewsSection";
import { StockChart } from "./StockChart";
import { StockHeader } from "./StockHeader";
import { TimeRangePicker } from "./TimeRangePicker";
import { TradeActions } from "./TradeActions";

type Props = {
  symbol: string;
  summaryRow: SummaryTicker | undefined;
  eodSummaryRow?: SummaryTicker | undefined;
  prices: PricesResponse | null;
  forecasts: ForecastsResponse | null;
  metrics?: SymbolMetrics | null;
  alerts: AlertsResponse | null;
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  loading: boolean;
  intraday?: IntradayResponse | null;
  intradayLoading?: boolean;
  intradayErr?: ErrorInfo | null;
  showBack?: boolean;
  onBack?: () => void;
  showMobileFabs?: boolean;
};

export function StockDetail({
  symbol,
  summaryRow,
  eodSummaryRow,
  prices,
  forecasts,
  metrics = null,
  alerts,
  range,
  onRangeChange,
  loading,
  intraday = null,
  intradayLoading = false,
  intradayErr = null,
  showBack,
  onBack,
  showMobileFabs = true,
}: Props) {
  const isIntraday = range === "1D";

  const headerPrice = summaryRow?.last_close ?? null;
  const intradaySession = filterIntradaySession(intraday?.points ?? []);
  const liveTs = intradaySession.at(-1)?.ts ?? null;
  const eodPoints = prices?.points ?? [];
  const summaryEod =
    eodSummaryRow?.last_ts && eodSummaryRow.last_close != null
      ? { ts: eodSummaryRow.last_ts, close: eodSummaryRow.last_close }
      : null;

  const liveQuote =
    headerPrice != null && liveTs
      ? { price: headerPrice, ts: liveTs }
      : undefined;

  const chartPoints = isIntraday
    ? intradaySession
    : prepareEodChartSeries(eodPoints, range, liveQuote, summaryEod);

  const chartData = chartPoints.map((p, index) => ({
    index,
    ts: p.ts,
    close: p.close,
    volume: p.volume,
    label: isIntraday ? fmtIntradayChartTime(p.ts) : fmtChartTime(p.ts, range),
  }));

  const headerChange =
    computeRangeChangePct(range, eodPoints, {
      intradayPoints: intraday?.points,
      livePrice: headerPrice,
      liveTs: liveQuote?.ts,
      summaryEod,
    }) ?? summaryRow?.change_pct ?? null;

  const prophetForecast = pickProphetForecast(forecasts?.forecasts);
  const latestForecast = isIntraday ? null : prophetForecast?.predicted_close ?? null;
  const news = buildNewsItems(symbol, alerts?.alerts ?? []);

  const chartLoading = isIntraday ? intradayLoading : loading;
  const chartEmptyMessage = isIntraday
    ? intradayErr?.message ??
      "No intraday data yet. Set MARKET_DATA_API_KEY on the API server."
    : "No price data yet. Run the ingestion worker, then refresh.";

  return (
    <>
      {isIntraday && intradayErr && (
        <ErrorBanner error={intradayErr} style={{ marginBottom: 12 }} />
      )}
      <StockHeader
        symbol={symbol}
        price={headerPrice}
        changePct={headerChange}
        showBack={showBack}
        onBack={onBack}
      />

      {isIntraday && (
        <p className="chart-interval-note">
          5-minute candles · regular session (9:30am–4:00pm ET) · live updates during market hours
          {intraday?.cached ? " · cached" : ""}
        </p>
      )}

      <StockChart
        data={chartData}
        range={range}
        loading={chartLoading}
        forecastPrice={latestForecast}
        emptyMessage={chartEmptyMessage}
      />

      <TimeRangePicker value={range} onChange={onRangeChange} />

      <div className="mobile-only" style={{ marginBottom: 16 }}>
        <ForecastPanel
          forecast={prophetForecast}
          fallbackPrice={summaryRow?.forecast_close}
          compact
        />
        <MetricsPanel metrics={metrics} compact />
      </div>

      <NewsSection items={news} />

      {showMobileFabs && (
        <TradeActions onClose={onBack} />
      )}
    </>
  );
}
