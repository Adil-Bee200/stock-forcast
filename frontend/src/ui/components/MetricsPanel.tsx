import type { SymbolMetrics } from "../../api/client";
import { fmtPrice } from "../../utils/format";
import { findModelMae, modelLabel, NAIVE_MODEL, PROPHET_MODEL } from "../../utils/metrics";

type Props = {
  metrics: SymbolMetrics | null | undefined;
  compact?: boolean;
};

function MaeRow({
  label,
  value,
  samples,
}: {
  label: string;
  value: number | null | undefined;
  samples: number;
}) {
  const display =
    value != null ? fmtPrice(value) : samples > 0 ? "—" : "No data yet";

  return (
    <div className="metrics-row">
      <span className="metrics-row__label">{label}</span>
      <span className="metrics-row__value">{display}</span>
    </div>
  );
}

function ModelBlock({
  modelName,
  metrics,
}: {
  modelName: string;
  metrics: SymbolMetrics | null | undefined;
}) {
  const row = findModelMae(metrics, modelName);

  return (
    <div className="metrics-model">
      <span className="metrics-model__title">{modelLabel(modelName)}</span>
      <MaeRow label="7-day MAE" value={row?.mae_7d} samples={row?.samples_7d ?? 0} />
      <MaeRow label="30-day MAE" value={row?.mae_30d} samples={row?.samples_30d ?? 0} />
    </div>
  );
}

export function MetricsPanel({ metrics, compact }: Props) {
  return (
    <div className={`metrics-box${compact ? " metrics-box--compact" : ""}`}>
      <span className="label">Forecast accuracy (MAE)</span>
      <span className="meta">
        Mean absolute error vs realized EOD close
      </span>
      <ModelBlock modelName={PROPHET_MODEL} metrics={metrics} />
      <ModelBlock modelName={NAIVE_MODEL} metrics={metrics} />
    </div>
  );
}
