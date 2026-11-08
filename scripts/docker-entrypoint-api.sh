#!/usr/bin/env bash
set -euo pipefail

# Inside the API container, datasets live under /app/data (compose mount).
export DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR" /app/backend/eval/output

if [[ -n "${SCOREBOARD_SCORED_URL:-}" || -n "${SCOREBOARD_URL:-}" ]]; then
  # shellcheck disable=SC1091
  ROOT=/app
  # Inline fetch so the image does not depend on the host scripts/ tree.
  download() {
    local url="$1"
    local dest="$2"
    [[ -z "$url" ]] && return 0
    echo "[data] fetching $(basename "$dest") …"
    curl -fL --retry 3 --retry-delay 2 -o "$dest" "$url"
  }
  download "${SCOREBOARD_SCORED_URL:-}" "$DATA_DIR/scoreboard_2026_scored.csv"
  download "${SCOREBOARD_URL:-}" "$DATA_DIR/scoreboard_2026.csv"
  download "${BACKTEST_RESULTS_URL:-}" /app/backend/eval/output/backtest_results.csv
  download "${BACKTEST_SUMMARY_URL:-}" /app/backend/eval/output/backtest_results_summary.csv
fi

if [[ ! -f "$DATA_DIR/scoreboard_2026_scored.csv" && ! -f "$DATA_DIR/scoreboard_2026.csv" ]]; then
  echo "[api] No scoreboard CSV in $DATA_DIR. Mount data/ or set SCOREBOARD_SCORED_URL." >&2
  exit 1
fi

cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port 8000
