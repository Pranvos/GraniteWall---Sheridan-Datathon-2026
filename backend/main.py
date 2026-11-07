from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1.endpoints import router as data_router

app = FastAPI(title="GraniteWall API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_router, prefix="/api/v1")

@app.get("/")
def get_status() -> dict[str, str]:
    """Return a simple confirmation that the API is running."""
    return {"status": "GraniteWall backend is running"}