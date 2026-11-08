# GraniteWall backend 

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field


# FastAPI app configuration
app = FastAPI(
    title="GraniteWall API",
    version="0.1.0",
    description="IBM Track vulnerability prioritization API for the Sheridan Datathon 2026.",
)

# Severity weights used for a simple scoring model
SEVERITY_WEIGHTS = {
    "Critical": 40,
    "High": 28,
    "Medium": 16,
    "Low": 8,
    "Info": 4,
}


# Input schema for a custom vulnerability assessment request.
class VulnerabilityInput(BaseModel):
    title: str = Field(..., min_length=3, max_length=250)
    description: str = Field(..., min_length=10, max_length=2000)
    severity: Literal["Critical", "High", "Medium", "Low", "Info"] = "High"
    epss: float = Field(..., ge=0.0, le=1.0)


# Output schema returned by the API for dashboard rendering.
class VulnerabilityResult(BaseModel):
    id: str
    title: str
    severity: str
    epss: float
    risk_score: int
    category: str
    summary: str


def detect_category(text: str) -> str:
    """Classify a vulnerability using domain-specific text indicators.

    This is a lightweight heuristic that maps common exploit language to a
    category such as RCE, privilege escalation, or DoS. It is intentionally
    simple for the datathon demo, but it mirrors how a production system would
    use text analysis to support prioritization decisions.
    """
    lowered = text.lower()
    categories = {
        "Remote Code Execution": ["rce", "remote code execution", "deserialization", "command injection"],
        "Privilege Escalation": ["privilege escalation", "elevation", "sudo", "local exploit"],
        "Authentication Bypass": ["authentication bypass", "auth bypass", "session forgery", "credential"],
        "Denial of Service": ["denial of service", "dos", "memory exhaustion", "crash"],
        "Information Disclosure": ["information disclosure", "leak", "sensitive data", "exposure"],
    }

    for category, keywords in categories.items():
        if any(keyword in lowered for keyword in keywords):
            return category

    return "General Security Issue"


def score_vulnerability(title: str, description: str, severity: str, epss: float) -> tuple[int, str]:
    """Assign a vulnerability score and category.

    The score blends three signals:
    1. the CVSS-like severity weight,
    2. the EPSS probability score,
    3. keyword-based indicators of exploitability or impact.

    This is designed to simulate a prioritization engine that could later be
    upgraded with IBM Granite embeddings or a trained ML model.
    """
    text = f"{title} {description}".lower()

    # Count important exploit phrases and risky keywords in the description
    keyword_hits = sum(
        keyword in text
        for keyword in [
            "rce",
            "remote code execution",
            "privilege",
            "authentication",
            "bypass",
            "exploit",
            "code execution",
            "critical",
            "sandbox",
            "overflow",
            "dos",
            "leak",
        ]
    )

    base_weight = SEVERITY_WEIGHTS.get(severity, 12)
    epss_score = round(epss * 100)
    keyword_boost = min(25, keyword_hits * 5)
    composite = min(100, int(base_weight * 0.6 + epss_score * 0.25 + keyword_boost * 0.15))
    category = detect_category(text)
    return composite, category


# Demo data used to power the dashboard while the team is still building the full
# data ingestion and database pipeline

sample_vulnerabilities = [
    {
        "id": "CVE-2026-1001",
        "title": "Remote code execution in file parser",
        "severity": "Critical",
        "epss": 0.92,
        "description": "A vulnerable parsing routine allows remote attackers to execute arbitrary code via crafted input payloads.",
    },
    {
        "id": "CVE-2026-1002",
        "title": "Authentication bypass in admin portal",
        "severity": "High",
        "epss": 0.81,
        "description": "The authentication system accepts forged session tokens and allows unauthorized access to administrative functions.",
    },
    {
        "id": "CVE-2026-1003",
        "title": "Memory exhaustion in web server",
        "severity": "Medium",
        "epss": 0.64,
        "description": "An HTTP request can trigger excessive memory consumption and result in denial of service conditions.",
    },
]


@app.get("/")
def get_status() -> dict[str, str]:
    """Return the current API health and project context.

    This endpoint is useful for quick sanity checks in development and for the
    judging environment when confirming the backend is online.
    """
    return {
        "status": "GraniteWall backend is running",
        "track": "IBM Before the Breach",
        "mode": "vulnerability prioritization demo",
    }


@app.get("/api/stats")
def get_stats() -> dict[str, float | int | str]:
    """Return aggregate statistics for the dashboard summary cards.

    This endpoint is designed for front-end KPI tiles such as total findings,
    critical count, average EPSS, average risk score, and dominant category.
    """
    vulnerabilities = sample_vulnerabilities
    avg_epss = round(sum(item["epss"] for item in vulnerabilities) / len(vulnerabilities), 3)
    critical_count = sum(1 for item in vulnerabilities if item["severity"] == "Critical")
    avg_risk = round(
        sum(score_vulnerability(item["title"], item["description"], item["severity"], item["epss"])[0] for item in vulnerabilities)
        / len(vulnerabilities),
        2,
    )

    return {
        "total_vulnerabilities": len(vulnerabilities),
        "critical_count": critical_count,
        "avg_epss_score": avg_epss,
        "avg_risk_score": avg_risk,
        "top_risk_category": "Remote Code Execution",
    }


@app.get("/api/vulnerabilities", response_model=list[VulnerabilityResult])
def get_vulnerabilities(limit: int = 10, min_risk: int = 0) -> list[VulnerabilityResult]:
    """Return ranked vulnerabilities for the frontend dashboard.

    This list is the main backend contract used by the UI to show a priority
    table, top risks, and supporting details. In production, this would come
    from PostgreSQL and a model scoring pipeline rather than hardcoded demo data.
    """
    ranked: list[VulnerabilityResult] = []

    for index, item in enumerate(sample_vulnerabilities, start=1):
        risk_score, category = score_vulnerability(
            item["title"], item["description"], item["severity"], item["epss"]
        )

        if risk_score < min_risk:
            continue

        ranked.append(
            VulnerabilityResult(
                id=item["id"],
                title=item["title"],
                severity=item["severity"],
                epss=item["epss"],
                risk_score=risk_score,
                category=category,
                summary=f"Priority #{index} based on severity, EPSS momentum, and exploitability indicators.",
            )
        )

    return ranked[:limit]


@app.post("/api/analyze", response_model=VulnerabilityResult)
def analyze_vulnerability(payload: VulnerabilityInput) -> VulnerabilityResult:
    """Score a single vulnerability submitted by the client.

    This endpoint acts as a lightweight ML inference stub for the datathon
    frontend. It can later be connected to IBM Granite embeddings, a scikit-learn
    model, or a database-backed scoring service.
    """
    risk_score, category = score_vulnerability(
        payload.title,
        payload.description,
        payload.severity,
        payload.epss,
    )

    return VulnerabilityResult(
        id=f"CUSTOM-{abs(hash(payload.title)) % 100000}",
        title=payload.title,
        severity=payload.severity,
        epss=payload.epss,
        risk_score=risk_score,
        category=category,
        summary="Custom vulnerability assessment generated from the GraniteWall scoring model.",
    )
