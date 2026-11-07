from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_main() -> None:
    """Ensure the root endpoint returns a 200 OK status."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "GraniteWall backend is running"}

def test_data_summary_missing_file() -> None:
    """Ensure API handles missing dataset gracefully."""
    response = client.get("/api/v1/data/summary")
    # Will return 404 if data folder is not populated yet
    assert response.status_code in [200, 404]