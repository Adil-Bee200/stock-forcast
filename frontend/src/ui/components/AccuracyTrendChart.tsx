import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SymbolMetricsTrend } from "../../api/client";
import { fmtPrice } from "../../utils/format";
import { modelLabel, NAIVE_MODEL, PROPHET_MODEL } from "../../utils/metrics";
import {
  buildAccuracyTrendRows,
  type AccuracyTrendRow,
} from "../../utils/metricsTrend";

const PROPHET_COLOR = "#eab308";
const NAIVE_COLOR = "#60a5fa";

type Props = {
  trend: SymbolMetricsTrend | null;
  loading?: boolean;
};

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AccuracyTrendRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="accuracy-tooltip">
      <div className="accuracy-tooltip__date">{row.label}</div>
      {row.prophet != null && (
        <div style={{ color: PROPHET_COLOR }}>
          {modelLabel(PROPHET_MODEL)} 7d MAE: {fmtPrice(row.prophet)}
        </div>
      )}
      {row.naive != null && (
        <div style={{ color: NAIVE_COLOR }}>
          {modelLabel(NAIVE_MODEL)} 7d MAE: {fmtPrice(row.naive)}
        </div>
      )}
    </div>
  );
}

export function AccuracyTrendChart({ trend, loading }: Props) {
  const data = useMemo(() => buildAccuracyTrendRows(trend), [trend]);
  const hasData = data.some((row) => row.prophet != null || row.naive != null);

  if (loading && !hasData) {
    return (
      <section className="accuracy-section">
        <h2>Prediction accuracy</h2>
        <div className="accuracy-chart accuracy-chart--empty skeleton" />
      </section>
    );
  }

  if (!hasData) {
    return (
      <section className="accuracy-section">
        <h2>Prediction accuracy</h2>
        <p className="accuracy-section__meta">
          7-day rolling mean absolute error vs realized EOD close
        </p>
        <div className="accuracy-chart accuracy-chart--empty">
          No accuracy data available yet.
        </div>
      </section>
    );
  }

  const values = data.flatMap((row) =>
    [row.prophet, row.naive].filter((v): v is number => v != null),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = (Number.isFinite(span) && span > 0 ? span * 0.12 : max * 0.05) || 1;

  return (
    <section className="accuracy-section">
      <h2>Prediction accuracy</h2>
      <p className="accuracy-section__meta">
        7-day rolling mean absolute error · lower is better
      </p>
      <div className="accuracy-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              minTickGap={32}
              tickFormatter={(idx) => data[Number(idx)]?.label ?? ""}
            />
            <YAxis
              domain={[Math.max(0, min - pad), max + pad]}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
            />
            <Tooltip content={<TrendTooltip />} />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="plainline"
              formatter={(value) => (
                <span style={{ color: "#a1a1aa", fontSize: 11 }}>{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="prophet"
              name={modelLabel(PROPHET_MODEL)}
              stroke={PROPHET_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: PROPHET_COLOR, stroke: "#0a0a0b", strokeWidth: 1 }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="naive"
              name={modelLabel(NAIVE_MODEL)}
              stroke={NAIVE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: NAIVE_COLOR, stroke: "#0a0a0b", strokeWidth: 1 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
