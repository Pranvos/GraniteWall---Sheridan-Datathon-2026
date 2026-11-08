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


def test_evaluation_endpoints_return_stable_shapes() -> None:
    """Evaluation routes expose both legacy keys and dashboard-ready metadata."""
    response = client.get("/api/v1/evaluation")
    if response.status_code == 404:
        return
    assert response.status_code == 200
    payload = response.json()
    assert {"results", "monthly_results", "summary", "method_comparisons", "metadata"} <= payload.keys()
    assert {"months", "methods", "k_values", "model"} <= payload["metadata"].keys()

    results = client.get("/api/v1/evaluation/results")
    summary = client.get("/api/v1/evaluation/summary")
    assert results.status_code == 200
    assert summary.status_code == 200
    assert "monthly_results" in results.json()
    assert "method_comparisons" in summary.json()