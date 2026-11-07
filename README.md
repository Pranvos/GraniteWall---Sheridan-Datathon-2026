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

## Run the backend and frontend simultaneously

Open two terminals from the repository root.

### Terminal 1: backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
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