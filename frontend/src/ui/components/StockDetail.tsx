import type { AlertsResponse, ForecastsResponse, PricesResponse, SummaryTicker } from "../../api/client";
import { useIntradayData } from "../../hooks/useIntradayData";
import { buildNewsItems } from "../../data/news";
import type { TimeRange } from "../../utils/chart";
import { filterByRange } from "../../utils/chart";
import { fmtChartTime, fmtIntradayChartTime } from "../../utils/format";
import { ErrorBanner } from "./ErrorBanner";
import { ForecastPanel, pickProphetForecast } from "./ForecastPanel";
import { NewsSection } from "./NewsSection";
import { StockChart } from "./StockChart";
import { StockHeader } from "./StockHeader";
import { TimeRangePicker } from "./TimeRangePicker";
import { TradeActions } from "./TradeActions";

type Props = {
  symbol: string;
  summaryRow: SummaryTicker | undefined;
  prices: PricesResponse | null;
  forecasts: ForecastsResponse | null;
  alerts: AlertsResponse | null;
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  loading: boolean;
  showBack?: boolean;
  onBack?: () => void;
  showMobileFabs?: boolean;
};

function sessionChangePct(
  points: { close: number }[],
): number | null {
  if (points.length < 2) return null;
  const first = points[0].close;
  const last = points[points.length - 1].close;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

export function StockDetail({
  symbol,
  summaryRow,
  prices,
  forecasts,
  alerts,
  range,
  onRangeChange,
  loading,
  showBack,
  onBack,
  showMobileFabs = true,
}: Props) {
  const isIntraday = range === "1D";
  const {
    intraday,
    loading: intradayLoading,
    error: intradayErr,
  } = useIntradayData(symbol, isIntraday);

  const eodFiltered = filterByRange(prices?.points ?? [], range);
  const chartPoints = isIntraday
    ? (intraday?.points ?? [])
    : eodFiltered;

  const chartData = chartPoints.map((p) => ({
    ts: p.ts,
    close: p.close,
    volume: p.volume,
    label: isIntraday ? fmtIntradayChartTime(p.ts) : fmtChartTime(p.ts, range),
  }));

  const lastIntradayClose =
    intraday?.points?.length != null && intraday.points.length > 0
      ? intraday.points[intraday.points.length - 1].close
      : null;

  const headerPrice = isIntraday
    ? (lastIntradayClose ?? summaryRow?.last_close ?? null)
    : (summaryRow?.last_close ?? null);

  const headerChange = isIntraday
    ? (sessionChangePct(intraday?.points ?? []) ?? summaryRow?.change_pct ?? null)
    : (summaryRow?.change_pct ?? null);

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
          5-minute candles · regular session (9:30am–4:00pm ET) · refreshes every 60s
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
      </div>

      <NewsSection items={news} />

      {showMobileFabs && (
        <TradeActions onClose={onBack} />
      )}
    </>
  );
}
