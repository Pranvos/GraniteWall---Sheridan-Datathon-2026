# Ranking backtest

Local proxy for “is our `top500` any good?” using 2024/2025 signals where KEV labels exist.

## Run

From `backend/` (needs `pandas`; uses `IBM/data` via `core.paths`):

```bash
cd backend
python -m eval.run_backtest
```

Quick smoke (one month, skip CVSS join):

```bash
python -m eval.run_backtest --months 2025-06 --no-cvss
```

## Read the numbers

- **hits** = how many of the top 500 later show up on KEV (same spirit as the contest)
- Compare methods in the summary table — `direct_risk` should beat `epss` / match or beat `exploit_then_epss` on average if the formula helps
- Contest hidden-2026 baselines: CVSS ≈ 7, EPSS ≈ 6, exploit+EPSS ≈ 8 hits in top 500

Results CSV: `eval/output/backtest_results.csv`
