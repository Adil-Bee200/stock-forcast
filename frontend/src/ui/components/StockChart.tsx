import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow, TimeRange } from "../../utils/chart";
import { fmtChartTime, fmtPrice, fmtVolume } from "../../utils/format";

type Props = {
  data: ChartRow[];
  range: TimeRange;
  loading?: boolean;
  forecastPrice?: number | null;
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
  return (
    <div
      style={{
        background: "rgba(10,10,11,0.96)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#22c55e", fontWeight: 600, fontSize: 15 }}>
        {fmtPrice(row.close)}
      </div>
      <div style={{ color: "#a1a1aa", marginTop: 4 }}>
        Vol {fmtVolume(row.volume)}
      </div>
      <div style={{ color: "#71717a", marginTop: 2 }}>
        {row.label ?? fmtChartTime(row.ts, range)}
      </div>
    </div>
  );
}

export function StockChart({
  data,
  range,
  loading,
  forecastPrice,
  emptyMessage = "No price data yet. Run the ingestion worker, then refresh.",
}: Props) {
  if (loading && !data.length) {
    return <div className="chart-wrap skeleton" />;
  }

  if (!data.length) {
    return (
      <div className="chart-wrap chart-empty">{emptyMessage}</div>
    );
  }

  const min = Math.min(...data.map((d) => d.close));
  const max = Math.max(...data.map((d) => d.close));
  const span = max - min;
  const pad = (Number.isFinite(span) && span > 0 ? span * 0.08 : max * 0.02) || 1;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
            strokeDasharray="4 4"
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
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
            activeDot={{ r: 4, fill: "#22c55e", stroke: "#0a0a0b", strokeWidth: 2 }}
          />
          {forecastPrice != null && (
            <ReferenceLine
              y={forecastPrice}
              stroke="rgba(34,197,94,0.5)"
              strokeDasharray="4 4"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


