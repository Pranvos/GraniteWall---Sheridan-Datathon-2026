#!/usr/bin/env bash
# Run ON a Vultr Cloud Compute VPS after SSH'ing in.
# Portal: https://www.vultr.com/
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Pranvos/SonarScan-Sheridan-Datathon-2026.git}"
APP_DIR="${APP_DIR:-/opt/sonarscan}"
PUBLIC_IP="$(curl -fsS https://ipv4.icanhazip.com || true)"

echo "==> Vultr SonarScan bootstrap"
echo "    Portal: https://www.vultr.com/"
echo "    Repo:   $REPO_URL"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "==> Docker Compose plugin missing" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only || true
fi
cd "$APP_DIR"

mkdir -p data

# Prefer a linked CSV URL. Fallback: file already uploaded to data/ on this VPS.
if [[ -n "${SCOREBOARD_SCORED_URL:-}" || -n "${SCOREBOARD_URL:-}" ]]; then
  chmod +x scripts/fetch-scoreboard.sh
  ./scripts/fetch-scoreboard.sh
elif [[ ! -f data/scoreboard_2026_scored.csv && ! -f data/scoreboard_2026.csv ]]; then
  cat >&2 <<EOF
[data] No scoreboard on this VPS yet.

Option A — link (recommended):
  1. Upload scoreboard_2026_scored.csv to Vultr Object Storage (or any host)
  2. Make it publicly readable (HTTPS URL)
  3. Re-run:
       SCOREBOARD_SCORED_URL='https://…/scoreboard_2026_scored.csv' \\
       VITE_API_URL='http://${PUBLIC_IP:-YOUR_IP}:8000' \\
       bash scripts/vultr-setup.sh

Option B — copy from your laptop:
       scp data/scoreboard_2026_scored.csv root@${PUBLIC_IP:-YOUR_IP}:$APP_DIR/data/
EOF
  exit 1
fi

export VITE_API_URL="${VITE_API_URL:-http://${PUBLIC_IP}:8000}"
export SCOREBOARD_SCORED_URL="${SCOREBOARD_SCORED_URL:-}"
export SCOREBOARD_URL="${SCOREBOARD_URL:-}"

echo "==> Building with VITE_API_URL=$VITE_API_URL"
docker compose up --build -d

echo
echo "Site:  http://${PUBLIC_IP}:5173"
echo "API:   http://${PUBLIC_IP}:8000/api/v1/health"
echo "Open firewall ports 5173 and 8000 in the Vultr dashboard if needed."
