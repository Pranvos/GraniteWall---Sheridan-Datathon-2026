"""
Month-by-month historical backtest on exploit_signals_2024/2025.

For each snapshot month t:
  - candidates = CVEs observed at t with in_kev == 0
  - positives  = those candidates that become in_kev == 1 in a later month
  - rank by each baseline / direct_risk using only features known at t
  - report hits / precision@k (default k=500), same spirit as the IBM scoreboard
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from core.paths import DATA_DIR
from eval.baselines import RANKERS
from eval.metrics import precision_at_k, rank_top_k

SIGNAL_FILES = ("exploit_signals_2024.csv", "exploit_signals_2025.csv")
USECOLS = [
    "month",
    "cve_id",
    "epss",
    "in_kev",
    "exploitdb",
    "metasploit",
    "nuclei",
    "poc_github",
]


def load_exploit_signals(data_dir: Path | None = None) -> pd.DataFrame:
    root = data_dir or DATA_DIR
    frames: list[pd.DataFrame] = []
    for name in SIGNAL_FILES:
        path = root / name
        if not path.exists():
            raise FileNotFoundError(f"Missing signals file: {path}")
        frames.append(pd.read_csv(path, usecols=USECOLS, low_memory=False))
    signals = pd.concat(frames, ignore_index=True)
    signals["month"] = signals["month"].astype(str)
    signals["in_kev"] = pd.to_numeric(signals["in_kev"], errors="coerce").fillna(0).astype(int)
    return signals


def load_cvss_lookup(data_dir: Path | None = None) -> pd.Series:
    """Optional CVSS join for the contest CVSS baseline (today's NVD scores)."""
    root = data_dir or DATA_DIR
    path = root / "vulnerabilities.csv"
    if not path.exists():
        return pd.Series(dtype=float)
    vulns = pd.read_csv(path, usecols=["cve_id", "cvss3_score"], low_memory=False)
    return pd.to_numeric(vulns.set_index("cve_id")["cvss3_score"], errors="coerce")


def first_kev_month(signals: pd.DataFrame) -> pd.Series:
    """Earliest month each CVE appears with in_kev == 1."""
    positive = signals.loc[signals["in_kev"] == 1, ["cve_id", "month"]]
    return positive.groupby("cve_id")["month"].min()


def available_months(signals: pd.DataFrame) -> list[str]:
    return sorted(signals["month"].unique().tolist())


def evaluate_month(
    signals: pd.DataFrame,
    month: str,
    first_kev: pd.Series,
    cvss: pd.Series | None = None,
    k: int = 500,
    methods: list[str] | None = None,
) -> list[dict]:
    """Score every requested ranker for one snapshot month."""
    snap = signals.loc[signals["month"] == month].copy()
    if snap.empty:
        return []

    # Mirror scoreboard: only rank vulns not already on KEV at snapshot time
    candidates = snap.loc[snap["in_kev"] == 0].copy()
    if candidates.empty:
        return []

    if cvss is not None and not cvss.empty:
        candidates["cvss3_score"] = candidates["cve_id"].map(cvss)

    later_kev = first_kev[first_kev > month]
    positives = set(candidates.loc[candidates["cve_id"].isin(later_kev.index), "cve_id"])

    method_names = methods or [m for m in RANKERS if m != "cvss3" or "cvss3_score" in candidates.columns]
    rows: list[dict] = []
    for name in method_names:
        if name == "cvss3" and "cvss3_score" not in candidates.columns:
            continue
        score_fn = RANKERS[name]
        try:
            scores = score_fn(candidates)
        except KeyError:
            continue
        top = rank_top_k(candidates, scores, k=k)
        metrics = precision_at_k(top, positives, k=k)
        metrics.update(
            {
                "month": month,
                "method": name,
                "n_candidates": int(len(candidates)),
            }
        )
        rows.append(metrics)
    return rows


def run_backtest(
    months: list[str] | None = None,
    k: int = 500,
    data_dir: Path | None = None,
    include_cvss: bool = True,
) -> pd.DataFrame:
    """
    Run the full (or filtered) historical backtest.

    Parameters
    ----------
    months:
        Snapshot months to evaluate (YYYY-MM). Default = all months except the
        last (need a future window for labels).
    """
    root = data_dir or DATA_DIR
    signals = load_exploit_signals(root)
    first_kev = first_kev_month(signals)
    cvss = load_cvss_lookup(root) if include_cvss else pd.Series(dtype=float)

    all_months = available_months(signals)
    if len(all_months) < 2:
        raise ValueError("Need at least two months of exploit signals to backtest")

    # Last month has no "later" labels in-file — skip unless user forces it
    default_months = all_months[:-1]
    target_months = months or default_months
    target_months = [m for m in target_months if m in all_months]

    methods = list(RANKERS.keys()) if include_cvss else [m for m in RANKERS if m != "cvss3"]

    results: list[dict] = []
    for month in target_months:
        results.extend(
            evaluate_month(
                signals,
                month,
                first_kev,
                cvss=cvss,
                k=k,
                methods=methods,
            )
        )

    if not results:
        return pd.DataFrame()

    return pd.DataFrame(results).sort_values(["month", "hits", "method"], ascending=[True, False, True])


def summarize(results: pd.DataFrame) -> pd.DataFrame:
    """Average precision@k / hits across months per method."""
    if results.empty:
        return results
    return (
        results.groupby("method", as_index=False)
        .agg(
            months=("month", "nunique"),
            avg_hits=("hits", "mean"),
            avg_precision_at_k=("precision_at_k", "mean"),
            avg_recall_at_k=("recall_at_k", "mean"),
            avg_positives=("n_positive", "mean"),
            avg_candidates=("n_candidates", "mean"),
        )
        .sort_values("avg_hits", ascending=False)
    )
