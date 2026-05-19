import { getStockMeta } from "../../data/stockMeta";
import { fmtChange, fmtPrice } from "../../utils/format";

type Props = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  favorited: boolean;
  onToggleFavorite: () => void;
  showBack?: boolean;
  onBack?: () => void;
};

export function StockHeader({
  symbol,
  price,
  changePct,
  favorited,
  onToggleFavorite,
  showBack,
  onBack,
}: Props) {
  const meta = getStockMeta(symbol);
  const positive = (changePct ?? 0) >= 0;

  return (
    <header className="stock-header">
      <div style={{ width: "100%" }}>
        <div className="nav-row">
          {showBack ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Back"
              onClick={onBack}
            >
              ←
            </button>
          ) : (
            <span style={{ width: 36 }} />
          )}
          <button
            type="button"
            className={`icon-btn${favorited ? " favorited" : ""}`}
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            onClick={onToggleFavorite}
          >
            {favorited ? "★" : "☆"}
          </button>
        </div>

        <div className="stock-identity">
          <div
            className="stock-logo"
            style={{ background: meta.logoColor }}
            aria-hidden
          >
            {meta.logoLetter}
          </div>
          <div className="stock-titles">
            <h1>{meta.name}</h1>
            <p className="sub">
              {symbol} · {meta.sector}
            </p>
          </div>
          <div className="price-block">
            <div className="price">{fmtPrice(price)}</div>
            <div className={`change ${positive ? "positive" : "negative"}`}>
              {fmtChange(changePct)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}



