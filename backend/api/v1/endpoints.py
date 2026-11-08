from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query


router = APIRouter()
REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_OUTPUT_DIR = REPO_ROOT / "backend" / "eval" / "output"
RESULTS_PATH = EVAL_OUTPUT_DIR / "backtest_results.csv"
SUMMARY_PATH = EVAL_OUTPUT_DIR / "backtest_results_summary.csv"
DATA_DIR = REPO_ROOT / "data"
SCOREBOARD_PATH = DATA_DIR / "scoreboard_2026.csv"
SCORED_SCOREBOARD_PATH = DATA_DIR / "scoreboard_2026_scored.csv"
VULNERABILITIES_PATH = DATA_DIR / "vulnerabilities.csv"
KEV_PATH = DATA_DIR / "known_exploited.csv"
SIGNAL_COLUMNS = ["exploitdb", "metasploit", "nuclei", "poc_github"]


def _read_csv(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Evaluation output not found: {path.name}. Run the backtest first.",
        )
    frame = pd.read_csv(path)
    return _json_records(frame)


def _load_scoreboard() -> pd.DataFrame:
    if not SCOREBOARD_PATH.exists():
        raise HTTPException(status_code=404, detail="Scoreboard dataset not found.")
    scored_path = SCORED_SCOREBOARD_PATH if SCORED_SCOREBOARD_PATH.exists() else SCOREBOARD_PATH
    frame = pd.read_csv(scored_path)
    for column in SIGNAL_COLUMNS:
        if column not in frame.columns:
            frame[column] = 0
    frame["epss"] = pd.to_numeric(frame.get("epss"), errors="coerce").fillna(0).clip(0, 1)
    frame["exploit_signal_count"] = (frame[SIGNAL_COLUMNS] > 0).sum(axis=1)
    frame["exploit_signal_score"] = frame["exploit_signal_count"] / len(SIGNAL_COLUMNS)
    if "risk_score" not in frame.columns:
        frame["risk_score"] = 0.6 * frame["epss"] + 0.4 * frame["exploit_signal_score"]
    frame["risk_model"] = (
        "granite_embedding"
        if scored_path == SCORED_SCOREBOARD_PATH and "model_prediction_probability" in frame
        else "direct_risk_fallback"
    )
    if KEV_PATH.exists():
        kev = pd.read_csv(KEV_PATH, usecols=["cve_id"])
        frame["is_kev"] = frame["cve_id"].isin(set(kev["cve_id"].dropna()))
    else:
        frame["is_kev"] = False
    return frame


def _json_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    records = frame.where(pd.notna(frame), None).to_dict("records")
    # Explicitly coerce pandas/numpy scalars so the API contract is plain JSON.
    return [
        {
            str(key): _json_value(value)
            for key, value in record.items()
        }
        for record in records
    ]


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if not isinstance(value, (str, bytes)):
        if pd.isna(value):
            return None
        if hasattr(value, "item"):
            return value.item()
    return value


def _percentile_categories(frame: pd.DataFrame, score_column: str) -> pd.Series:
    """Assign display categories by percentile within the ranked top-k set."""
    ranked = frame[score_column].rank(method="first", ascending=False, pct=True)
    return pd.cut(
        ranked,
        bins=[0, 0.05, 0.20, 0.50, 1.0],
        labels=["Critical", "High", "Medium", "Low"],
        include_lowest=True,
    ).astype(str)


def _evaluation_payload() -> dict[str, Any]:
    """Build the complete, stable evaluation response shared by API routes."""
    results = _read_csv(RESULTS_PATH)
    summary = _read_csv(SUMMARY_PATH)
    result_frame = pd.DataFrame(results)
    summary_frame = pd.DataFrame(summary)

    months = sorted({str(row["month"]) for row in results if row.get("month") is not None})
    methods = sorted({str(row["method"]) for row in results if row.get("method") is not None})
    k_values = sorted(
        {
            int(row["k"])
            for row in results
            if row.get("k") is not None and pd.notna(row.get("k"))
        }
    )
    monthly_results = [
        {"month": month, "results": [row for row in results if str(row.get("month")) == month]}
        for month in months
    ]

    comparisons: list[dict[str, Any]] = []
    direct = summary_frame.loc[summary_frame["method"] == "direct_risk"] if not summary_frame.empty and "method" in summary_frame else pd.DataFrame()
    direct_precision = (
        float(direct.iloc[0]["avg_precision_at_k"])
        if not direct.empty and pd.notna(direct.iloc[0].get("avg_precision_at_k"))
        else None
    )
    for rank, row in enumerate(summary, start=1):
        method = row.get("method")
        method_rows = result_frame.loc[result_frame["method"] == method] if not result_frame.empty else pd.DataFrame()
        comparisons.append(
            {
                **row,
                "rank": rank,
                "delta_vs_direct_risk_precision": (
                    round(float(row["avg_precision_at_k"]) - direct_precision, 8)
                    if direct_precision is not None and row.get("avg_precision_at_k") is not None
                    else None
                ),
                "months_won_by_hits": int(
                    sum(
                        1
                        for month in months
                        if not result_frame.loc[result_frame["month"] == month].empty
                        and int(method_rows.loc[method_rows["month"] == month, "hits"].max())
                        == int(result_frame.loc[result_frame["month"] == month, "hits"].max())
                    )
                ),
            }
        )

    newest = max((RESULTS_PATH.stat().st_mtime, SUMMARY_PATH.stat().st_mtime))
    metadata = {
        "result_count": len(results),
        "summary_count": len(summary),
        "months": months,
        "methods": methods,
        "k_values": k_values,
        "default_k": k_values[0] if len(k_values) == 1 else None,
        "generated_at": datetime.fromtimestamp(newest, tz=timezone.utc).isoformat(),
        "sources": {
            "monthly_results": RESULTS_PATH.name,
            "method_summary": SUMMARY_PATH.name,
        },
        "model": {
            "name": "GraniteWall direct risk",
            "direct_risk_formula": "0.6 * epss + 0.4 * (positive_exploit_signals / 4)",
            "signal_columns": SIGNAL_COLUMNS,
            "baselines": methods,
        },
    }
    return {
        "results": results,
        "monthly_results": monthly_results,
        "summary": summary,
        "method_comparisons": comparisons,
        "metadata": metadata,
    }


@router.get("/evaluation/results")
def get_evaluation_results() -> dict:
    """Return month-by-month evaluation results."""
    payload = _evaluation_payload()
    return {
        "results": payload["results"],
        "monthly_results": payload["monthly_results"],
        "metadata": payload["metadata"],
    }


@router.get("/evaluation/summary")
def get_evaluation_summary() -> dict:
    """Return aggregate evaluation metrics by ranking method."""
    payload = _evaluation_payload()
    return {
        "summary": payload["summary"],
        "method_comparisons": payload["method_comparisons"],
        "metadata": payload["metadata"],
    }


@router.get("/evaluation")
def get_evaluation() -> dict[str, Any]:
    """Return all evaluation data in one response for dashboards and exports."""
    return _evaluation_payload()


@router.get("/health")
def get_api_health() -> dict:
    return {
        "status": "ok",
        "scoreboard_available": SCOREBOARD_PATH.exists(),
        "granite_model_available": SCORED_SCOREBOARD_PATH.exists(),
        "evaluation_available": RESULTS_PATH.exists() and SUMMARY_PATH.exists(),
    }


@router.get("/risk/summary")
def get_risk_summary() -> dict:
    frame = _load_scoreboard()
    return {
        "total": int(len(frame)),
        "kev": int(frame["is_kev"].sum()),
        "critical": int((frame["risk_score"] >= 0.75).sum()),
        "high": int(((frame["risk_score"] >= 0.5) & (frame["risk_score"] < 0.75)).sum()),
        "average_epss": round(float(frame["epss"].mean()), 6),
        "active_signals": int((frame["exploit_signal_count"] > 0).sum()),
        "signal_breakdown": {
            column: int((frame[column] > 0).sum()) for column in SIGNAL_COLUMNS
        },
    }


@router.get("/vulnerabilities")
def get_vulnerabilities(
    q: str | None = Query(default=None, max_length=100),
    severity: str | None = Query(default=None, pattern="^(critical|high|medium|low)$"),
    kev_only: bool = False,
    min_risk: float = Query(default=0, ge=0, le=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=500),
    top_k: int | None = Query(default=None, ge=1, le=1000),
    method: str = Query(default="direct_risk", pattern="^(direct_risk|epss|exploit_then_epss|cvss3)$"),
    sort: str = Query(default="risk_score"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    frame = _load_scoreboard()
    if q:
        frame = frame[frame["cve_id"].astype(str).str.contains(q, case=False, na=False)]
    if kev_only:
        frame = frame[frame["is_kev"]]
    frame = frame[frame["risk_score"] >= min_risk]
    if method == "epss":
        frame["ranking_score"] = frame["epss"]
    elif method == "exploit_then_epss":
        frame["ranking_score"] = frame["exploit_signal_count"] + frame["epss"]
    elif method == "cvss3":
        if not VULNERABILITIES_PATH.exists():
            raise HTTPException(status_code=404, detail="Vulnerability dataset is required for CVSS ranking.")
        cvss = pd.read_csv(VULNERABILITIES_PATH, usecols=["cve_id", "cvss3_score"], low_memory=False)
        cvss["cvss3_score"] = pd.to_numeric(cvss["cvss3_score"], errors="coerce").fillna(0)
        frame = frame.merge(cvss, on="cve_id", how="left")
        frame["ranking_score"] = frame["cvss3_score"].fillna(0)
    else:
        frame["ranking_score"] = frame["risk_score"]
    allowed_sort = {"cve_id", "published", "epss", "risk_score", "ranking_score", "exploit_signal_count"}
    sort_column = sort if sort in allowed_sort else "ranking_score"
    frame = frame.sort_values(sort_column, ascending=order == "asc")
    if top_k is not None:
        frame = frame.head(top_k)
    frame["severity_category"] = _percentile_categories(frame, "ranking_score")
    if severity:
        frame = frame[frame["severity_category"].str.lower() == severity]
    total = len(frame)
    start = (page - 1) * page_size
    rows = frame.iloc[start : start + page_size].copy()
    output_columns = [
        "cve_id",
        "published",
        "epss",
        "exploit_signal_count",
        "exploit_signal_score",
        "risk_score",
        "severity_category",
        "ranking_score",
        "is_kev",
        "risk_model",
        *SIGNAL_COLUMNS,
    ]
    if "cvss3_score" in rows:
        output_columns.append("cvss3_score")
    return {
        "items": _json_records(rows[output_columns]),
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": (total + page_size - 1) // page_size,
        "ranking_method": method,
        "top_k": top_k,
        "risk_model": str(rows["risk_model"].iloc[0]) if not rows.empty else (
            "granite_embedding" if SCORED_SCOREBOARD_PATH.exists() else "direct_risk_fallback"
        ),
    }


@router.get("/vulnerabilities/{cve_id}")
def get_vulnerability(cve_id: str) -> dict:
    frame = _load_scoreboard()
    match = frame[frame["cve_id"].astype(str).str.upper() == cve_id.upper()]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Vulnerability not found: {cve_id}")
    record = _json_records(match.iloc[[0]])[0]
    if VULNERABILITIES_PATH.exists():
        for chunk in pd.read_csv(VULNERABILITIES_PATH, usecols=lambda column: column in {"cve_id", "description", "cvss3_score", "cvss3_severity", "cwe_ids"}, chunksize=50000):
            details = chunk[chunk["cve_id"].astype(str).str.upper() == cve_id.upper()]
            if not details.empty:
                record.update(_json_records(details.iloc[[0]])[0])
                break
    return record
