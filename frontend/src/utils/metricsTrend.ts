import type { ModelMetricTrend, SymbolMetricsTrend } from "../api/client";
import { NAIVE_MODEL, PROPHET_MODEL } from "./metrics";

const ROLLING_WINDOW = 7;

export type AccuracyTrendRow = {
  index: number;
  date: string;
  label: string;
  prophet: number | null;
  naive: number | null;
};

function sessionKey(iso: string): string {
  return iso.slice(0, 10);
}

function rollingMae(points: ModelMetricTrend["points"], window: number): Map<string, number> {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const result = new Map<string, number>();

  for (let i = 0; i < sorted.length; i++) {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    const mae =
      slice.reduce((sum, point) => sum + point.absolute_error, 0) / slice.length;
    result.set(sessionKey(sorted[i].date), mae);
  }

  return result;
}

export function buildAccuracyTrendRows(
  trend: SymbolMetricsTrend | null | undefined,
): AccuracyTrendRow[] {
  if (!trend?.models.length) return [];

  const prophet = trend.models.find((m) => m.model_name === PROPHET_MODEL);
  const naive = trend.models.find((m) => m.model_name === NAIVE_MODEL);
  const prophetMae = prophet ? rollingMae(prophet.points, ROLLING_WINDOW) : new Map();
  const naiveMae = naive ? rollingMae(naive.points, ROLLING_WINDOW) : new Map();

  const dates = new Set<string>([
    ...prophetMae.keys(),
    ...naiveMae.keys(),
  ]);
  const sorted = [...dates].sort();

  return sorted.map((date, index) => {
    const noonUtc = new Date(`${date}T12:00:00Z`);
    const label = noonUtc.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

    return {
      index,
      date,
      label,
      prophet: prophetMae.get(date) ?? null,
      naive: naiveMae.get(date) ?? null,
    };
  });
}
