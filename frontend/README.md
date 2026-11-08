# GraniteWall frontend

React + Vite + Tailwind + Three.js (R3F) UI for the vulnerability-factor
globe and SIEM dashboard.

## Run

```bash
cd frontend
npm install
npm run dev
```

The app is available at <http://localhost:5173>. It expects the FastAPI
backend at `http://127.0.0.1:8000` by default. To use another backend, create
`frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

## Current API integration

The frontend loads live data from the FastAPI API; globe points are not mock
clusters. On load and when filters change, it requests:

| Endpoint | Use |
| --- | --- |
| `GET /api/v1/health` | Backend, dataset, Granite-artifact, and evaluation status |
| `GET /api/v1/risk/summary` | Risk totals and exploit-signal counts |
| `GET /api/v1/vulnerabilities` | Filtered, paginated operations queue and top-500 globe records |
| `GET /api/v1/vulnerabilities/{cve_id}` | Details for a selected CVE |
| `GET /api/v1/evaluation` | Consolidated historical evaluation payload |
| `GET /api/v1/evaluation/summary` | Aggregate historical ranking metrics |
| `GET /api/v1/evaluation/results` | Month-by-month historical evaluation results |

`/api/v1/vulnerabilities` supports `q`, `severity`, `kev_only`, `min_risk`,
`page`, `page_size`, `top_k`, `method`, `sort`, and `order`. The supported
ranking methods are `direct_risk`, `epss`, `exploit_then_epss`, and `cvss3`.
The operations queue requests `top_k=500` and displays 25 records per page;
the globe requests the same top 500 directly.

The dashboard's three lens controls select the corresponding ranking method:
semantic language uses EPSS, architectural weakness uses CVSS3, and temporal
momentum uses public exploit plus EPSS. Selecting a globe point opens its CVE
details and can route it to the operations queue.

## Backend and scoring prerequisites

Start the backend from the repository root in a separate terminal:

```powershell
.\.venv\Scripts\Activate.ps1
cd backend
uvicorn main:app --reload
```

The backend requires the datasets described in the root README. If
`data/scoreboard_2026_scored.csv` exists, the API serves the Granite-derived
scored artifact. Otherwise it stays available with the documented direct-risk
fallback.

Evaluation data is optional for the main queue but required for the
**Historical evaluation** panel. Generate it from the repository's historical
signal datasets before starting or refreshing the dashboard:

```bash
cd backend
python -m eval.run_backtest
```

If `vulnerabilities.csv` is unavailable, use `--no-cvss` to skip the CVSS
baseline. The backend then writes the result and summary CSVs under
`backend/eval/output/`, which the evaluation endpoints read.

## Links

Repository and Devpost links are defined in `src/data/links.js`.
