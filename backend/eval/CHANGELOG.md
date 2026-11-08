# eval/ change log

New evaluation package — **no edits** to `core/dataprocesser.py`, `embedder.py`, or `model_trainer.py`.

| Date | Change |
| --- | --- |
| 2026-11-07 | Added `backend/core/paths.py` + `backend/core/__init__.py` (path helper only) |
| 2026-11-07 | Added `backend/eval/` backtest suite (`baselines`, `metrics`, `backtest`, `run_backtest`) |
| 2026-11-07 | Outputs land in `backend/eval/output/` (gitignored below if desired) |

## What this gives you

Month-by-month **precision@500 / hits** on 2024–2025 exploit signals, comparing:

- `epss`
- `exploit_then_epss` (contest baseline)
- `cvss3` (optional join to `vulnerabilities.csv`)
- `direct_risk` (current GraniteWall formula: `0.6*EPSS + 0.4*signal_score`)

Labels: CVE was `in_kev=0` at snapshot month \(t\), then `in_kev=1` in a **later** month.
