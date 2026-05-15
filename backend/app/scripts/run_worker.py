from __future__ import annotations

import argparse
import logging
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Stock predictor background worker.")
    parser.add_argument(
        "--once",
        choices=("daily", "ingest", "train"),
        help="Run a single job and exit (for cron / GitHub Actions).",
    )
    parser.add_argument(
        "--symbols",
        nargs="*",
        help="Override WORKER_SYMBOLS for this run only.",
    )
    parser.add_argument(
        "--run-on-start",
        action="store_true",
        help="When running the daemon, also run the daily pipeline immediately.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="DEBUG logging",
    )
    args = parser.parse_args(argv)

    from app.core.database import SessionLocal, init_db
    from app.worker.jobs import run_daily_pipeline, run_eod_ingest, run_training
    from app.worker.scheduler import start_scheduler

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    symbols = [s.upper() for s in args.symbols] if args.symbols else None

    if args.once is None:
        start_scheduler(run_on_start=args.run_on_start)
        return 0

    init_db()
    db = SessionLocal()
    try:
        if args.once == "ingest":
            report = run_eod_ingest(db, symbols=symbols)
            return 0 if report.failed == 0 else 1
        if args.once == "train":
            report = run_training(db, symbols=symbols)
            return 0 if report.failed == 0 else 1
        report = run_daily_pipeline(db, symbols=symbols)
        if report.ingest.failed > 0 or report.train.failed > 0:
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
