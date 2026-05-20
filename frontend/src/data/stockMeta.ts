export type StockMeta = {
  name: string;
  sector: string;
  logoLetter: string;
  logoColor: string;
};

export const STOCK_META: Record<string, StockMeta> = {
  AAPL: {
    name: "Apple Inc.",
    sector: "Technology",
    logoLetter: "A",
    logoColor: "#555555",
  },
  MSFT: {
    name: "Microsoft Corp.",
    sector: "Technology",
    logoLetter: "M",
    logoColor: "#2563eb",
  },
  AMZN: {
    name: "Amazon.com Inc.",
    sector: "Consumer Cyclical",
    logoLetter: "Z",
    logoColor: "#f59e0b",
  },
  GOOGL: {
    name: "Alphabet Inc.",
    sector: "Communication",
    logoLetter: "G",
    logoColor: "#4285f4",
  },
  META: {
    name: "Meta Platforms",
    sector: "Technology",
    logoLetter: "f",
    logoColor: "#0668E1",
  },
  NVDA: {
    name: "NVIDIA Corp.",
    sector: "Technology",
    logoLetter: "N",
    logoColor: "#76b900",
  },
  TSLA: {
    name: "Tesla Inc.",
    sector: "Automotive",
    logoLetter: "T",
    logoColor: "#cc0000",
  },
};

export function getStockMeta(symbol: string): StockMeta {
  return (
    STOCK_META[symbol] ?? {
      name: symbol,
      sector: "Equity",
      logoLetter: symbol[0] ?? "?",
      logoColor: "#3f3f46",
    }
  );
}
