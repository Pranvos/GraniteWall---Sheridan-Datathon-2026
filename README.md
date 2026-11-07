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
copy the dataset files separately into:

```text
data/data/
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
test -f data/data/vulnerabilities.csv \
  && echo "Dataset found" \
  || { echo "Dataset missing: copy vulnerabilities.csv to data/data/"; exit 1; }
```

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

The dashboard is available at http://localhost:5173.

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
