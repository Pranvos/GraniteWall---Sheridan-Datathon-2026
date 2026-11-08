import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
import joblib
from pathlib import Path
import ast

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
MODEL_DIR = REPO_ROOT / "backend" / "artifacts"
MODEL_PATH = MODEL_DIR / "granite_risk_model.joblib"
SCORED_PATH = DATA_DIR / "scoreboard_2026_scored.csv"
SIGNAL_COLUMNS = ["exploitdb", "metasploit", "nuclei", "poc_github"]


def percentile_categories(frame: pd.DataFrame, score_column: str = "risk_score") -> pd.Series:
    """Assign balanced display categories within a ranked result set."""
    ranked = frame[score_column].rank(method="first", ascending=False, pct=True)
    return pd.cut(
        ranked,
        bins=[0, 0.05, 0.20, 0.50, 1.0],
        labels=["Critical", "High", "Medium", "Low"],
        include_lowest=True,
    ).astype(str)


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

    if "embedding" not in df_score.columns:
        embedding_lookup = df_embedded[["cve_id", "embedding"]].drop_duplicates("cve_id")
        df_score = df_score.merge(embedding_lookup, on="cve_id", how="left")

    has_embedding = df_score["embedding"].notna()
    if has_embedding.any():
        embeddings = df_score.loc[has_embedding, "embedding"]
        if isinstance(embeddings.iloc[0], str):
            embeddings = embeddings.apply(ast.literal_eval)
        X_score = np.array(embeddings.tolist())
        df_score["model_prediction_probability"] = np.nan
        df_score.loc[has_embedding, "model_prediction_probability"] = model.predict_proba(X_score)[:, 1]
        df_score["risk_score"] = (
            0.5 * df_score["model_prediction_probability"].fillna(0)
            + 0.5 * df_score["direct_risk_score"]
        )
    else:
        raise ValueError(
            "No scoreboard records matched embedded vulnerability descriptions. "
            "Generate embeddings from a dataset containing the scoreboard CVE IDs."
        )

    df_sorted = df_score.sort_values(by="risk_score", ascending=False)
    top_500 = df_sorted.head(500).copy()
    top_500["severity_category"] = percentile_categories(top_500)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    df_score.drop(columns=["embedding"], errors="ignore").to_csv(SCORED_PATH, index=False)
    output_path = DATA_DIR / "top500.csv"
    top_500[["cve_id", "risk_score", "severity_category"]].to_csv(output_path, index=False)
    print(f"Saved Granite model to {MODEL_PATH}")
    print(f"Saved scored scoreboard to {SCORED_PATH}")
    print("Generated top500.csv successfully.")

if __name__ == "__main__":
    train_and_rank()