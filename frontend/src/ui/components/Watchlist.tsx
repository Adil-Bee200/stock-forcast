import type { SummaryTicker, SymbolMetrics } from "../../api/client";
import { getStockMeta } from "../../data/stockMeta";
import { fmtChange, fmtPrice } from "../../utils/format";
import { findModelMae, PROPHET_MODEL } from "../../utils/metrics";

type Props = {
  tickers: SummaryTicker[];
  metricsBySymbol?: Record<string, SymbolMetrics | undefined>;
  active: string;
  onSelect: (symbol: string) => void;
};

export function Watchlist({ tickers, metricsBySymbol, active, onSelect }: Props) {
  return (
    <>
      <h2>Watchlist</h2>
      <p>7 symbols · EOD data</p>
      {tickers.map((t) => {
        const meta = getStockMeta(t.symbol);
        const positive = (t.change_pct ?? 0) >= 0;
        const prophetMae = findModelMae(metricsBySymbol?.[t.symbol], PROPHET_MODEL);
        const maeLabel =
          prophetMae?.mae_7d != null
            ? `7d MAE ${fmtPrice(prophetMae.mae_7d)}`
            : prophetMae?.samples_7d
              ? "7d MAE —"
              : null;
        return (
          <button
            key={t.symbol}
            type="button"
            className={`watchlist-item${t.symbol === active ? " active" : ""}`}
            onClick={() => onSelect(t.symbol)}
          >
            <span
              className="stock-logo"
              style={{
                width: 32,
                height: 32,
                fontSize: 12,
                background: meta.logoColor,
              }}
            >
              {meta.logoLetter}
            </span>
            <span>
              <span className="sym">{t.symbol}</span>
              <br />
              <span style={{ fontSize: 11, color: "#71717a" }}>
                {meta.name.split(" ")[0]}
              </span>
            </span>
            <span className="price-col">
              <span className="price">{fmtPrice(t.last_close)}</span>
              <br />
              <span className={`chg ${positive ? "positive" : "negative"}`}>
                {fmtChange(t.change_pct)}
              </span>
              {maeLabel && (
                <>
                  <br />
                  <span className="mae">{maeLabel}</span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}


