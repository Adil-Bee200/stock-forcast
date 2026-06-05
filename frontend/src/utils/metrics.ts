import type { ModelMae, SymbolMetrics } from "../api/client";

export const PROPHET_MODEL = "prophet_v1";
export const NAIVE_MODEL = "naive_baseline_v1";

const MODEL_LABELS: Record<string, string> = {
  [PROPHET_MODEL]: "Prophet",
  [NAIVE_MODEL]: "Naive baseline",
};

export function modelLabel(modelName: string): string {
  return MODEL_LABELS[modelName] ?? modelName;
}

export function findModelMae(
  metrics: SymbolMetrics | null | undefined,
  modelName: string,
): ModelMae | undefined {
  return metrics?.models.find((m) => m.model_name === modelName);
}

export function metricsForSymbol(
  tickers: SymbolMetrics[] | null | undefined,
  symbol: string,
): SymbolMetrics | undefined {
  return tickers?.find((t) => t.symbol === symbol);
}
