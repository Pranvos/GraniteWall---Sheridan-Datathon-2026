from fastapi import FastAPI


app = FastAPI(title="GraniteWall API")


@app.get("/")
def get_status() -> dict[str, str]:
    """Return a simple confirmation that the API is running."""
    return {"status": "GraniteWall backend is running"}
