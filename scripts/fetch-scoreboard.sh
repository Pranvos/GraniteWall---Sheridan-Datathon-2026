#!/usr/bin/env bash
# Pull ignored scoreboard CSVs from a URL (Drive/Dropbox/Vultr Object Storage/etc).
# Used on Vultr so GitHub never needs the big files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
mkdir -p "$DATA_DIR"

download() {
  local url="$1"
  local dest="$2"
  if [[ -z "$url" ]]; then
    return 0
  fi
  echo "[data] fetching $(basename "$dest") …"
  curl -fL --retry 3 --retry-delay 2 -o "$dest" "$url"
  echo "[data] wrote $dest ($(wc -c <"$dest") bytes)"
}

# Required for Granite-scored sonar (preferred).
download "${SCOREBOARD_SCORED_URL:-}" "$DATA_DIR/scoreboard_2026_scored.csv"

# Optional raw scoreboard / fallback if scored file is absent.
download "${SCOREBOARD_URL:-}" "$DATA_DIR/scoreboard_2026.csv"

# Optional eval tables for Risk rankings.
mkdir -p "$ROOT/backend/eval/output"
download "${BACKTEST_RESULTS_URL:-}" "$ROOT/backend/eval/output/backtest_results.csv"
download "${BACKTEST_SUMMARY_URL:-}" "$ROOT/backend/eval/output/backtest_results_summary.csv"

if [[ ! -f "$DATA_DIR/scoreboard_2026_scored.csv" && ! -f "$DATA_DIR/scoreboard_2026.csv" ]]; then
  echo "[data] missing scoreboard. Set SCOREBOARD_SCORED_URL or SCOREBOARD_URL, or copy CSVs into data/" >&2
  exit 1
fi

echo "[data] ready in $DATA_DIR"
