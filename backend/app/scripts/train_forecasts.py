from __future__ import annotations

import argparse
import logging
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Train next-day close forecasts from EOD history in Postgres.",
    )
    parser.add_argument("symbols", nargs="*", help="Symbols (default: WORKER_SYMBOLS)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    from app.core.database import SessionLocal, init_db
    from app.worker.jobs import run_training

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    init_db()
    symbols = [s.upper() for s in args.symbols] if args.symbols else None

    db = SessionLocal()
    try:
        report = run_training(db, symbols=symbols)
        return 0 if report.failed == 0 else 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
