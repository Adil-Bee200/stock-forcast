export function fmtPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtChange(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export const MARKET_TIMEZONE = "America/New_York";

export function fmtForecastFor(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    // ``forecast_for`` is a trading session date, not a local clock time.
    const datePart = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (datePart) {
      const y = Number(datePart[1]);
      const m = Number(datePart[2]) - 1;
      const d = Number(datePart[3]);
      const noonUtc = new Date(Date.UTC(y, m, d, 12));
      return noonUtc.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: MARKET_TIMEZONE,
    });
  } catch {
    return iso;
  }
}

export function fmtChartTime(iso: string, range: string): string {
  try {
    const d = new Date(iso);
    if (range === "1D" || range === "1W") {
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Intraday axis labels — always US market (Eastern) time. */
export function fmtIntradayChartTime(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: MARKET_TIMEZONE,
      }) + " ET"
    );
  } catch {
    return iso;
  }
}

export function fmtVolume(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}
