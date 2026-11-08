# GraniteWall frontend

React + Vite + Tailwind + Three.js (R3F) UI for the vulnerability factor globe and cluster dashboards.

## Run

```bash
cd frontend
npm install
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)

## How the backend links in

### Current state

The UI does **not** call the FastAPI backend yet. Globe clusters and dashboard payloads come from local mock builders in `src/data/clusters.js` (`buildClusters`).

The backend (`../backend`) currently exposes only:

- `GET http://127.0.0.1:8000/` → `{ "status": "GraniteWall backend is running" }`

So you can run frontend alone for demos. Wire the API when cluster/model endpoints exist.

### Intended connection

| Piece | Role |
| --- | --- |
| Frontend | Globe, factor nodes (X / Y / Z), portal into dashboard charts |
| Backend | Serve real cluster summaries + per-cluster analytics from IBM Granite / IBM CVE data |

Suggested env var (add when wiring fetch):

```bash
# frontend/.env.local
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Usage pattern:

```js
const base = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const res = await fetch(`${base}/api/clusters`)
const clusters = await res.json()
```

Optional Vite proxy (avoids CORS in local dev) — in `vite.config.js`:

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
```

Then call `/api/...` with no host. Backend must enable CORS for `http://localhost:5173` if you skip the proxy (e.g. FastAPI `CORSMiddleware`).

### Payload the UI expects

Replace `buildClusters()` with API data shaped like this (one object per factor node):

```json
{
  "id": "c-blue",
  "name": "Vulnerability Factor X",
  "label": "Factor X",
  "color": "#0033FF",
  "glow": "#6688FF",
  "risk": "Signal",
  "signalCount": 12,
  "riskScore": 78,
  "dashboard": {
    "clusterId": "c-blue",
    "clusterName": "Vulnerability Factor X",
    "accent": "#0033FF",
    "metrics": {
      "analyzed": 2400,
      "hotspots": 9,
      "graniteConfidence": 0.91,
      "exploitRate": 0.27
    },
    "weeks": [{ "week": "W1", "detections": 40, "mitigated": 22 }],
    "riskBreakdown": [
      { "name": "Critical", "value": 30, "fill": "#FF334B" },
      { "name": "High", "value": 25, "fill": "#F59E0B" },
      { "name": "Medium", "value": 20, "fill": "#0033FF" },
      { "name": "Low", "value": 12, "fill": "#A3A3A3" }
    ],
    "vulns": [
      {
        "id": "CVE-2024-12345",
        "title": "Example title",
        "severity": "Critical",
        "confidence": 0.88,
        "exploitProb": 0.42
      }
    ]
  }
}
```

Suggested backend routes (not implemented yet):

- `GET /api/clusters` — array of the objects above (powers the globe)
- `GET /api/clusters/{id}` — single cluster dashboard payload
- `GET /` — health check (already exists)

### Run both sides

```bash
# terminal 1
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# terminal 2
cd frontend
npm install
npm run dev
```

## Links

Repo / nav links live in `src/data/links.js` (`SITE_LINKS.github`, `SITE_LINKS.devpost`).
