"""Ranking metrics for top-k exploit prediction."""

from __future__ import annotations

from typing import Iterable

import pandas as pd


def precision_at_k(ranked_ids: Iterable[str], positive_ids: set[str], k: int = 500) -> dict:
    ranked = list(ranked_ids)[:k]
    hits = sum(1 for cve in ranked if cve in positive_ids)
    return {
        "k": k,
        "hits": hits,
        "precision_at_k": hits / k if k else 0.0,
        "recall_at_k": hits / len(positive_ids) if positive_ids else 0.0,
        "n_positive": len(positive_ids),
        "n_candidates": None,
    }


def rank_top_k(df: pd.DataFrame, score: pd.Series, k: int = 500) -> list[str]:
    ordered = (
        df.assign(_score=score.to_numpy())
        .sort_values(["_score", "cve_id"], ascending=[False, True])
        .head(k)
    )
    return ordered["cve_id"].tolist()
