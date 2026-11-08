from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_read_main() -> None:
    """Ensure the root endpoint returns a 200 OK status."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "GraniteWall backend is running"}


def test_health_endpoint() -> None:
    """Health reports dataset and evaluation availability without requiring data."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "scoreboard_available" in payload
    assert "granite_model_available" in payload
    assert "evaluation_available" in payload


def test_risk_summary_uses_percentile_bands() -> None:
    """Critical/High cards use top-500 percentile labels when scoreboard is present."""
    response = client.get("/api/v1/risk/summary")
    if response.status_code == 404:
        return
    assert response.status_code == 200
    payload = response.json()
    assert "critical" in payload
    assert "kev_catalog" in payload
    assert payload["critical"] >= 0
    if payload.get("top_k"):
        assert payload["critical"] + payload.get("high", 0) + payload.get("medium", 0) + payload.get("low", 0) == payload["top_k"]


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
