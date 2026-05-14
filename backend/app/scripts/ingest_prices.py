from __future__ import annotations

import argparse
import logging
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest daily OHLCV via Yahoo Finance.")
    parser.add_argument(
        "symbols",
        nargs="*",
        help="Ticker symbols (default: AAPL MSFT AMZN GOOGL META NVDA TSLA)",
    )
    parser.add_argument(
        "--period",
        default="1y",
        help="yfinance history period, e.g. 5d, 1mo, 6mo, 1y, 5y (default: 1y)",
    )
    parser.add_argument(
        "--no-info",
        action="store_true",
        help="Skip Yahoo ``info`` calls (faster; ticker names stay empty).",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="DEBUG logging",
    )
    args = parser.parse_args(argv)

    from app.core.database import SessionLocal, init_db
    from app.services.price_ingest import DEFAULT_SYMBOLS, ingest_symbol

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    symbols = [s.upper() for s in (args.symbols or list(DEFAULT_SYMBOLS))]

    init_db()

    db = SessionLocal()
    try:
        ok = 0
        for sym in symbols:
            n, err = ingest_symbol(
                db,
                sym,
                period=args.period,
                fetch_info=not args.no_info,
            )
            if err:
                logging.error("%s: %s", sym, err)
                db.rollback()
                continue
            db.commit()
            logging.info("%s: upserted %d daily rows", sym, n)
            ok += 1
        if ok == 0:
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
