"""
CLI: historical precision@500 backtest.

Examples
--------
  cd backend
  python -m eval.run_backtest
  python -m eval.run_backtest --months 2025-06,2025-09 --k 500
  python -m eval.run_backtest --months 2024-12 --no-cvss
"""

from __future__ import annotations

import argparse
from pathlib import Path

from eval.backtest import run_backtest, summarize


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GraniteWall ranking backtest (2024/2025)")
    parser.add_argument(
        "--months",
        type=str,
        default="",
        help="Comma-separated YYYY-MM list. Default: all months except the last.",
    )
    parser.add_argument("--k", type=int, default=500, help="Top-k cutoff (contest uses 500)")
    parser.add_argument(
        "--out",
        type=str,
        default="",
        help="Optional CSV path for per-month results (default: eval/output/backtest_results.csv)",
    )
    parser.add_argument(
        "--no-cvss",
        action="store_true",
        help="Skip CVSS baseline (faster; no vulnerabilities.csv join)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    months = [m.strip() for m in args.months.split(",") if m.strip()] or None

    print("Loading exploit signals and running backtest…")
    results = run_backtest(months=months, k=args.k, include_cvss=not args.no_cvss)
    if results.empty:
        print("No results — check dataset path / month filters.")
        return

    summary = summarize(results)
    print("\n=== Summary (mean across months) ===")
    print(summary.to_string(index=False))
    print("\nContest baselines to beat in top-500 hits on the *hidden* 2026 set: CVSS≈7, EPSS≈6, exploit+EPSS≈8")
    print("Local proxy: avg_hits on 2024/2025 should beat those methods' avg_hits here.\n")

    out = Path(args.out) if args.out else Path(__file__).resolve().parent / "output" / "backtest_results.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    results.to_csv(out, index=False)
    summary_path = out.with_name(out.stem + "_summary.csv")
    summary.to_csv(summary_path, index=False)
    print(f"Wrote {out}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
