import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from pathlib import Path
import ast

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data" / "data"
SIGNAL_COLUMNS = ["exploitdb", "metasploit", "nuclei", "poc_github"]


def train_and_rank():
    embedded_path = DATA_DIR / "vulnerabilities_embedded.csv"
    known_exploited_path = DATA_DIR / "known_exploited.csv"
    scoreboard_path = DATA_DIR / "scoreboard_2026.csv"

    if not embedded_path.exists():
        raise FileNotFoundError(
            f"Embedded dataset not found at {embedded_path}. "
            "Run backend/core/embedder.py first."
        )
    if not known_exploited_path.exists():
        raise FileNotFoundError(
            f"Known exploited dataset not found at {known_exploited_path}"
        )
    if not scoreboard_path.exists():
        raise FileNotFoundError(f"Scoreboard dataset not found at {scoreboard_path}")

    df_embedded = pd.read_csv(embedded_path)
    known_exploited = pd.read_csv(known_exploited_path, usecols=["cve_id"])
    known_cves = set(known_exploited["cve_id"].dropna())
    df_embedded["is_exploited"] = df_embedded["cve_id"].isin(known_cves).astype(int)

    if isinstance(df_embedded["embedding"].iloc[0], str):
        df_embedded["embedding"] = df_embedded["embedding"].apply(ast.literal_eval)

    X = np.array(df_embedded["embedding"].tolist())
    y = df_embedded["is_exploited"].to_numpy()
    if len(np.unique(y)) < 2:
        raise ValueError(
            "Training requires both KEV labels (0 and 1). "
            f"Current embedded sample has label counts: {df_embedded['is_exploited'].value_counts().to_dict()}. "
            "Generate embeddings for a larger or representative dataset."
        )

    model = LogisticRegression(max_iter=1000)
    model.fit(X, y)

    df_score = pd.read_csv(scoreboard_path)

    if "epss" not in df_score.columns:
        raise ValueError("scoreboard_2026.csv must contain an epss column")

    for column in SIGNAL_COLUMNS:
        if column not in df_score.columns:
            df_score[column] = 0

    df_score["epss_score"] = pd.to_numeric(df_score["epss"], errors="coerce").fillna(0).clip(0, 1)
    signal_values = df_score[SIGNAL_COLUMNS].apply(pd.to_numeric, errors="coerce").fillna(0)
    df_score["exploit_signal_score"] = (signal_values > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
    df_score["direct_risk_score"] = (
        0.6 * df_score["epss_score"] + 0.4 * df_score["exploit_signal_score"]
    )

    if "embedding" in df_score.columns:
        if isinstance(df_score["embedding"].iloc[0], str):
            df_score["embedding"] = df_score["embedding"].apply(ast.literal_eval)
        X_score = np.array(df_score["embedding"].tolist())
        df_score["model_prediction_probability"] = model.predict_proba(X_score)[:, 1]
        df_score["risk_score"] = (
            0.5 * df_score["model_prediction_probability"]
            + 0.5 * df_score["direct_risk_score"]
        )
    else:
        df_score["model_prediction_probability"] = np.nan
        df_score["risk_score"] = df_score["direct_risk_score"]

    df_sorted = df_score.sort_values(by="risk_score", ascending=False)

    top_500 = df_sorted.head(500)
    output_path = DATA_DIR / "top500.csv"
    top_500[["cve_id"]].to_csv(output_path, index=False)
    print("Generated top500.csv successfully.")

if __name__ == "__main__":
    train_and_rank()