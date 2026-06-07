import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow, TimeRange } from "../../utils/chart";
import { fmtChartTime, fmtPrice, fmtVolume } from "../../utils/format";

const FORECAST_COLOR = "#eab308";
const FORECAST_FILL = "rgba(234, 179, 8, 0.18)";

export type ForecastChartPoint = {
  price: number;
  ts: string;
  label: string;
};

type Props = {
  data: ChartRow[];
  range: TimeRange;
  loading?: boolean;
  forecast?: ForecastChartPoint | null;
  emptyMessage?: string;
};

function ChartTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  range: TimeRange;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const isForecast = row.isForecast === true;
  const price = isForecast ? row.forecastClose : row.close;
  if (price == null || Number.isNaN(price)) return null;

  return (
    <div
      style={{
        background: "rgba(10,10,11,0.96)",
        border: `1px solid ${isForecast ? "rgba(234,179,8,0.35)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      <div
        style={{
          color: isForecast ? FORECAST_COLOR : "#22c55e",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        {isForecast ? `Forecast ${fmtPrice(price)}` : fmtPrice(price)}
      </div>
      {!isForecast && (
        <div style={{ color: "#a1a1aa", marginTop: 4 }}>
          Vol {fmtVolume(row.volume)}
        </div>
      )}
      <div style={{ color: "#71717a", marginTop: 2 }}>
        {row.label ?? fmtChartTime(row.ts, range)}
      </div>
    </div>
  );
}

function ForecastDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}) {
  const { cx, cy, payload } = props;
  if (payload?.isForecast !== true || cx == null || cy == null) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={FORECAST_COLOR}
      stroke="#0a0a0b"
      strokeWidth={2}
    />
  );
}

function buildChartSeries(
  data: ChartRow[],
  forecast: ForecastChartPoint | null | undefined,
): ChartRow[] {
  if (!forecast || data.length === 0) return data;

  const last = data[data.length - 1];
  return [
    ...data.slice(0, -1).map((row) => ({ ...row, forecastClose: undefined })),
    { ...last, forecastClose: last.close },
    {
      index: last.index + 1,
      ts: forecast.ts,
      close: Number.NaN,
      forecastClose: forecast.price,
      volume: null,
      label: forecast.label,
      isForecast: true,
    },
  ];
}

export function StockChart({
  data,
  range,
  loading,
  forecast,
  emptyMessage = "No price data available yet.",
}: Props) {
  const chartData = useMemo(
    () => buildChartSeries(data, forecast),
    [data, forecast],
  );

  if (loading && !data.length) {
    return <div className="chart-wrap skeleton" />;
  }

  if (!data.length) {
    return (
      <div className="chart-wrap chart-empty">{emptyMessage}</div>
    );
  }

  const closes = data.map((d) => d.close).filter((v) => Number.isFinite(v));
  const forecastPrice = forecast?.price;
  const priceValues = [
    ...closes,
    ...(forecastPrice != null && Number.isFinite(forecastPrice)
      ? [forecastPrice]
      : []),
  ];
  const min = priceValues.length ? Math.min(...priceValues) : 0;
  const max = priceValues.length ? Math.max(...priceValues) : 1;
  const span = max - min;
  const pad = (Number.isFinite(span) && span > 0 ? span * 0.08 : max * 0.02) || 1;
  const showForecast = forecast != null && chartData.length > data.length;

  return (
    <div className="chart-wrap">
      {showForecast && (
        <p className="chart-forecast-legend">
          <span className="chart-forecast-legend__swatch" />
          {range === "1D"
            ? `Prophet forecast · ends ${forecast.label} · ${fmtPrice(forecast.price)}`
            : `Prophet forecast · ${forecast.label} · ${fmtPrice(forecast.price)}`}
        </p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={FORECAST_COLOR} stopOpacity={0.28} />
              <stop offset="100%" stopColor={FORECAST_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
            strokeDasharray="4 4"
          />
          <XAxis
            dataKey="index"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(idx) => chartData[Number(idx)]?.label ?? ""}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            content={<ChartTooltip range={range} />}
            cursor={{ stroke: "rgba(34,197,94,0.35)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#priceFill)"
            dot={false}
            connectNulls={false}
            activeDot={{
              r: 4,
              fill: "#22c55e",
              stroke: "#0a0a0b",
              strokeWidth: 2,
            }}
          />
          {showForecast && (
            <Area
              type="monotone"
              dataKey="forecastClose"
              stroke={FORECAST_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              fill="url(#forecastFill)"
              dot={<ForecastDot />}
              connectNulls
              activeDot={{
                r: 5,
                fill: FORECAST_COLOR,
                stroke: "#0a0a0b",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
