"""Ranking scores that mirror the IBM scoreboard baselines (+ our direct risk)."""

from __future__ import annotations

import pandas as pd

SIGNAL_COLUMNS = ["exploitdb", "metasploit", "nuclei", "poc_github"]


def _epss(df: pd.DataFrame) -> pd.Series:
    return pd.to_numeric(df["epss"], errors="coerce").fillna(0.0).clip(0, 1)


def _signals(df: pd.DataFrame) -> pd.DataFrame:
    out = df.reindex(columns=SIGNAL_COLUMNS).copy()
    for col in SIGNAL_COLUMNS:
        if col not in out.columns:
            out[col] = 0
    return out.apply(pd.to_numeric, errors="coerce").fillna(0)


def score_epss(df: pd.DataFrame) -> pd.Series:
    """Baseline: rank by EPSS alone."""
    return _epss(df)


def score_exploit_then_epss(df: pd.DataFrame) -> pd.Series:
    """
    Baseline: public exploit code first, then EPSS.
    Encoded as a single sortable float: signal_count + epss (signals dominate).
    """
    signals = _signals(df)
    signal_count = (signals > 0).sum(axis=1).astype(float)
    return signal_count + _epss(df)


def score_direct_risk(df: pd.DataFrame) -> pd.Series:
    """GraniteWall direct_risk_score = 0.6 * EPSS + 0.4 * exploit_signal_score."""
    signals = _signals(df)
    exploit_signal_score = (signals > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
    return 0.6 * _epss(df) + 0.4 * exploit_signal_score


def score_cvss3(df: pd.DataFrame) -> pd.Series:
    """Baseline: highest CVSS 3 first (requires a cvss3_score column)."""
    if "cvss3_score" not in df.columns:
        raise KeyError("cvss3_score missing — join vulnerabilities.csv before scoring")
    return pd.to_numeric(df["cvss3_score"], errors="coerce").fillna(0.0)


RANKERS = {
    "epss": score_epss,
    "exploit_then_epss": score_exploit_then_epss,
    "cvss3": score_cvss3,
    "direct_risk": score_direct_risk,
}
