# GraniteWall

GraniteWall is a full-stack monorepo with a FastAPI backend and a React frontend powered by Vite and Tailwind CSS.

## Project structure

```text
GraniteWall/
├── backend/
│   ├── main.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── index.css
    │   └── main.tsx
    ├── package.json
    └── ...
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm

## IBM Granite model

GraniteWall uses IBM's text-embedding model through Hugging Face:

```text
ibm-granite/granite-embedding-small-english-r2
```

The model converts vulnerability descriptions into numerical embedding vectors
for downstream analysis and ranking. It is loaded by
`backend/core/embedder.py` with `sentence-transformers`. The training pipeline
uses those embeddings with a Logistic Regression classifier and writes a
reusable scored scoreboard artifact. The live vulnerability API serves
Granite-derived scores when that artifact exists and reports a direct-risk
fallback otherwise.

Hugging Face authentication is optional for public model downloads. If a token
is used, store it locally in the ignored `.env` file:

```env
HF_TOKEN=your_read_only_token
```

The IBM Granite TimeSeries model is not used by this project. GraniteWall uses
the Granite text-embedding model only.

## Easy installation after cloning

Clone the repository and open a terminal in the project directory:

```bash
git clone https://github.com/Pranvos/GraniteWall---Sheridan-Datathon-2026.git
cd GraniteWall---Sheridan-Datathon-2026
```

### Backend setup

In Git Bash:

```bash
py -3.13 -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

In PowerShell, activate the same environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

### Frontend setup

Open a second terminal from the project directory:

```bash
cd frontend
npm install
```

### Dataset setup

The large CSV datasets are intentionally excluded from GitHub. Download or
copy the dataset files separately into `data/` before running the API,
embedding pipeline, model trainer, or historical evaluation:

```text
data/
```

The expected files are:

```text
affected_products.csv
exploit_signals_2024.csv
exploit_signals_2025.csv
known_exploited.csv
references.csv
scoreboard_2026.csv
vulnerabilities.csv
weakness_types.csv
```

Verify the primary dataset from Git Bash:

```bash
test -f data/vulnerabilities.csv \
  && echo "Dataset found" \
  || { echo "Dataset missing: copy vulnerabilities.csv to data/"; exit 1; }
```

At minimum, the live API needs `scoreboard_2026.csv` and the exploit-signal
columns it contains. The historical evaluation needs the monthly exploit
signal files (`exploit_signals_2024.csv` and `exploit_signals_2025.csv`) and
`known_exploited.csv`; include `vulnerabilities.csv` to run the CVSS baseline.
The Granite training path additionally needs a cleaned vulnerability file
with descriptions and the generated `vulnerabilities_embedded.csv`.

The generated files are not downloads: create them locally as follows:

```bash
cd backend
python core/dataprocesser.py
python core/embedder.py
python core/model_trainer.py
```

These commands produce the cleaned/embedded data, the Granite model artifact,
`data/scoreboard_2026_scored.csv`, and `data/top500.csv`. Run the model
trainer only after both the embedded data and `known_exploited.csv` are
available.

## Run the backend and frontend simultaneously

Open two terminals from the repository root.

### Terminal 1: backend

```powershell
.\.venv\Scripts\Activate.ps1
cd backend
uvicorn main:app --reload
```

The API is available at http://127.0.0.1:8000. Its status endpoint is `GET /`.

### Terminal 2: frontend

```powershell
cd frontend
npm install
npm run dev
```

The SIEM dashboard is available at http://localhost:5173. It includes a
dark SOC-style shell, risk summary cards, historical ranking charts, a
paginated vulnerability queue, CVE search, severity/KEV filters, and a
vulnerability detail drawer.

The frontend requests the evaluation API automatically when it loads. It uses
`http://127.0.0.1:8000` by default; override this for another backend with a
local `frontend/.env` file:

```env
VITE_API_URL=http://127.0.0.1:8000
```

To test the connection, start both terminals above, open a cluster dashboard,
and confirm that the **Historical evaluation** panel shows **Connected**.
If the backend is stopped, the panel reports the request error instead.

## Run with Docker Compose

Docker deployment keeps the large datasets outside the images. Copy the
datasets listed above into `data/` first, then run from the repository root:

```bash
docker compose up --build
```

The production frontend is available at http://localhost:5173 and the API at
http://localhost:8000. The backend mounts `data/` read-only; no credentials or
dataset files are copied into either image. To point the built frontend at a
different public API URL, set `VITE_API_URL` when building:

```bash
VITE_API_URL=https://api.example.com docker compose up --build
```

Keep tokens such as `HF_TOKEN` in an ignored local `.env` or in the deployment
platform's secret manager; do not add them to Compose files or Docker images.

## Evaluation API

After running the historical backtest, the backend exposes:

```text
GET /api/v1/evaluation/results
GET /api/v1/evaluation/summary
```

Run the backtest from the repository root:

```bash
cd backend
python -m eval.run_backtest
```

### Build the Granite ranking artifact

After generating `data/vulnerabilities_embedded.csv`, train the Granite
classifier and score the live scoreboard:

```bash
cd backend
python core/model_trainer.py
```

This creates `backend/artifacts/granite_risk_model.joblib`,
`data/scoreboard_2026_scored.csv`, and `data/top500.csv`. The API automatically
uses `data/scoreboard_2026_scored.csv` when present. Without it, the API
remains available using the documented direct-risk fallback formula.

### Chosen live scoring policy

The live API uses the Granite-derived scored artifact whenever
`data/scoreboard_2026_scored.csv` is present. If that artifact has not been
generated, it deliberately falls back to the
direct-risk score (`0.6 * EPSS + 0.4 * exploit-signal score`) rather than
failing or silently returning an unscored response. The API health response
exposes `granite_model_available` so clients can show which path is active.

Start the API in another terminal:

```bash
cd backend
uvicorn main:app --reload
```

## SIEM API

The dashboard uses these read-only endpoints:

```text
GET /api/v1/health
GET /api/v1/risk/summary
GET /api/v1/vulnerabilities
GET /api/v1/vulnerabilities/{cve_id}
GET /api/v1/evaluation
GET /api/v1/evaluation/results
GET /api/v1/evaluation/summary
```

`/api/v1/vulnerabilities` supports `q`, `severity`, `kev_only`, `min_risk`,
`page`, `page_size`, `top_k`, `method`, `sort`, and `order` query parameters.
Supported methods are `direct_risk`, `epss`, `exploit_then_epss`, and
`cvss3`. The dashboard requests `top_k=500`, so its queue is only the selected
method's top 500 records, not the entire dataset.

The current historical evaluation does not yet show that `direct_risk` beats
the `exploit_then_epss` baseline. The generated summary reports average
precision@500 of approximately 2.22% for `direct_risk` versus 2.31% for
`exploit_then_epss`; improving that result requires a new ranking experiment,
not only changing the dashboard display.

## Exploit signal columns

The scoreboard includes signals from multiple security sources:

- `exploitdb`: ExploitDB has a known exploit.
- `metasploit`: Metasploit includes an exploit module.
- `nuclei`: Nuclei has a detection or exploitation template.
- `poc_github`: A proof of concept exists on GitHub.

Each signal contributes to the `exploit_signal_score`:

```text
exploit_signal_score = positive signals / 4
```

The direct risk score combines the EPSS score and exploit signals:

```text
direct_risk_score = 0.6 * EPSS + 0.4 * exploit_signal_score
```

When Granite artifacts have been generated, the served score combines the
classifier prediction with the direct-risk score:

```text
risk_score = 0.5 * model_prediction_probability + 0.5 * direct_risk_score
```

Sphere and queue categories use percentile bands within the selected top-500
ranking rather than fixed score cutoffs:

```text
Critical = top 5%
High     = next 15%
Medium   = next 30%
Low      = remaining 50%
```
