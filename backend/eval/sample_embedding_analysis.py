"""Train on separate CVEs, then rank a fixed sample with Granite embeddings."""

from __future__ import annotations

import argparse
import ast
import json
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
SAMPLE_DIR = DATA_DIR / "samples"
sys.path.insert(0, str(REPO_ROOT / "backend"))

from core.embedder import generate_vulnerability_embeddings
from eval.sample_cwe_analysis import create_scatter_svg, load_cwe_names, parse_cwe_ids

SIGNAL_COLUMNS = ("exploitdb", "metasploit", "nuclei", "poc_github")


def _embedding_matrix(values: pd.Series) -> np.ndarray:
	return np.vstack(
		[value if not isinstance(value, str) else ast.literal_eval(value) for value in values]
	)


def run_analysis(
	sample_size: int = 5000,
	seed: int = 42,
	positive_train_size: int | None = None,
	negative_train_size: int = 5000,
	batch_size: int = 64,
) -> dict[str, object]:
	cleaned_path = DATA_DIR / "vulnerabilities_cleaned.csv"
	if not cleaned_path.exists():
		raise FileNotFoundError(f"Run core/dataprocesser.py first: {cleaned_path}")

	SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
	sample_path = SAMPLE_DIR / f"sample_{sample_size}_ranked.csv"
	if sample_path.exists():
		sample = pd.read_csv(sample_path, usecols=["cve_id", "cwe_ids"], dtype={"cve_id": str})
	elif sample_size < 5000 and (SAMPLE_DIR / "sample_5000_ranked.csv").exists():
		sample = pd.read_csv(
			SAMPLE_DIR / "sample_5000_ranked.csv",
			usecols=["cve_id", "cwe_ids"],
			dtype={"cve_id": str},
		).sample(n=sample_size, random_state=seed)
	else:
		vulnerabilities = pd.read_csv(
			cleaned_path, usecols=["cve_id", "cwe_ids"], dtype={"cve_id": str}, low_memory=False
		).drop_duplicates("cve_id")
		sample = vulnerabilities.sample(n=sample_size, random_state=seed).copy()
	sample = sample.drop_duplicates("cve_id").reset_index(drop=True)
	if len(sample) != sample_size:
		raise ValueError(f"Expected {sample_size} unique sample CVEs, found {len(sample)}")
	sample_ids = set(sample["cve_id"])

	known_ids = set(
		pd.read_csv(DATA_DIR / "known_exploited.csv", usecols=["cve_id"], dtype={"cve_id": str})[
			"cve_id"
		].dropna()
	)
	vulnerability_ids = pd.read_csv(
		cleaned_path, usecols=["cve_id"], dtype={"cve_id": str}, low_memory=False
	)["cve_id"].dropna()
	available_ids = set(vulnerability_ids)
	training_positive_ids = sorted((known_ids & available_ids) - sample_ids)
	negative_pool = sorted(available_ids - known_ids - sample_ids)
	if not training_positive_ids or not negative_pool:
		raise ValueError("Need out-of-sample KEV positives and non-KEV CVEs for model training")
	if positive_train_size is not None:
		positive_count = min(positive_train_size, len(training_positive_ids))
		training_positive_ids = random.Random(seed).sample(training_positive_ids, positive_count)
	negative_count = min(negative_train_size, len(negative_pool))
	training_negative_ids = random.Random(seed + 1).sample(negative_pool, negative_count)
	training_ids = set(training_positive_ids) | set(training_negative_ids)
	all_embedding_ids = sorted(training_ids | sample_ids)

	embedding_path = SAMPLE_DIR / f"sample_{sample_size}_model_embeddings.csv"
	generate_vulnerability_embeddings(
		output_csv=embedding_path.name,
		batch_size=batch_size,
		cve_ids=all_embedding_ids,
	)
	embedded = pd.read_csv(embedding_path, dtype={"cve_id": str}, low_memory=False)
	embedded["is_kev"] = embedded["cve_id"].isin(known_ids).astype(int)
	training = embedded[embedded["cve_id"].isin(training_ids)]
	testing = embedded[embedded["cve_id"].isin(sample_ids)].copy()
	if len(training) != len(training_ids) or len(testing) != sample_size:
		raise ValueError("The embedding output did not contain every requested training and sample CVE")

	model = LogisticRegression(max_iter=1000, class_weight="balanced")	
	model.fit(_embedding_matrix(training["embedding"]), training["is_kev"])
	testing["model_prediction_probability"] = model.predict_proba(
		_embedding_matrix(testing["embedding"])
	)[:, 1]

	scoreboard = pd.read_csv(
		DATA_DIR / "scoreboard_2026.csv",
		usecols=lambda column: column in {"cve_id", "snapshot_month", "epss", *SIGNAL_COLUMNS},
		dtype={"cve_id": str},
		low_memory=False,
	)
	if "snapshot_month" in scoreboard.columns:
		scoreboard = scoreboard.sort_values("snapshot_month", kind="stable")
	scoreboard = scoreboard.drop_duplicates("cve_id", keep="last")
	scoreboard["score_available"] = True
	for column in ("epss", *SIGNAL_COLUMNS):
		if column not in scoreboard.columns:
			scoreboard[column] = 0

	joined = testing.merge(scoreboard, on="cve_id", how="left", suffixes=("", "_score"))
	joined["score_available"] = joined["score_available"].fillna(False).astype(bool)
	joined["epss_score"] = pd.to_numeric(joined["epss"], errors="coerce").fillna(0).clip(0, 1)
	signal_values = joined[list(SIGNAL_COLUMNS)].apply(pd.to_numeric, errors="coerce").fillna(0)
	joined["exploit_signal_score"] = (signal_values > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
	joined["direct_risk_score"] = 0.6 * joined["epss_score"] + 0.4 * joined["exploit_signal_score"]
	joined["risk_score"] = 0.5 * joined["model_prediction_probability"] + 0.5 * joined["direct_risk_score"]
	joined["is_kev"] = joined["cve_id"].isin(known_ids)
	joined = joined.sort_values(["risk_score", "cve_id"], ascending=[False, True], kind="stable")
	joined["rank"] = range(1, len(joined) + 1)

	output_ranked = SAMPLE_DIR / f"sample_{sample_size}_model_ranked.csv"
	joined.drop(columns=["embedding"], errors="ignore").to_csv(output_ranked, index=False)

	cwe_names = load_cwe_names(DATA_DIR / "weakness_types.csv")
	joined["_cwe_list"] = joined["cwe_ids"].map(parse_cwe_ids)
	category_rows = []
	for cwe_id in sorted({label for labels in joined["_cwe_list"] for label in labels}):
		category = joined[joined["_cwe_list"].map(lambda labels: cwe_id in labels)]
		count = len(category)
		kev_count = int(category["is_kev"].sum())
		category_rows.append(
			{
				"cwe_id": cwe_id,
				"name": cwe_names.get(cwe_id, "Name not found in CWE catalog"),
				"cve_count": count,
				"sample_share_pct": round(100 * count / sample_size, 2),
				"kev_count": kev_count,
				"kev_rate_pct": round(100 * kev_count / count, 2),
				"score_coverage_count": int(category["score_available"].sum()),
				"score_coverage_pct": round(100 * category["score_available"].mean(), 2),
				"mean_model_probability": round(float(category["model_prediction_probability"].mean()), 6),
				"mean_risk_score": round(float(category["risk_score"].mean()), 6),
				"mean_rank": round(float(category["rank"].mean()), 2),
			}
		)
	category_summary = pd.DataFrame(category_rows).sort_values(
		["cve_count", "kev_count", "cwe_id"], ascending=[False, False, True]
	)
	output_summary = SAMPLE_DIR / f"sample_{sample_size}_model_cwe_summary.csv"
	category_summary.to_csv(output_summary, index=False)
	output_chart = SAMPLE_DIR / f"sample_{sample_size}_model_cwe_volume_vs_kev.svg"
	create_scatter_svg(category_summary, output_chart, sample_size, seed)

	actual = joined["is_kev"].astype(int)
	metrics = {
		"sample_size": sample_size,
		"seed": seed,
		"training_rows": int(len(training)),
		"training_kev_positives": int(training["is_kev"].sum()),
		"training_non_kev_negatives": int((training["is_kev"] == 0).sum()),
		"sample_kev_matches": int(actual.sum()),
		"sample_scoreboard_coverage": int(joined["score_available"].sum()),
		"top_500_kev_hits": int(joined.head(500)["is_kev"].sum()),
		"average_precision": float(average_precision_score(actual, joined["risk_score"])),
		"roc_auc": float(roc_auc_score(actual, joined["risk_score"])) if actual.nunique() > 1 else None,
		"ranked_csv": str(output_ranked),
		"cwe_summary_csv": str(output_summary),
		"chart_svg": str(output_chart),
		"embedding_csv": str(embedding_path),
	}
	metrics_path = SAMPLE_DIR / f"sample_{sample_size}_model_metrics.json"
	metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
	return metrics


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--sample-size", type=int, default=5000)
	parser.add_argument("--seed", type=int, default=42)
	parser.add_argument("--positive-train-size", type=int)
	parser.add_argument("--negative-train-size", type=int, default=5000)
	parser.add_argument("--batch-size", type=int, default=64)
	args = parser.parse_args()
	print(json.dumps(
		run_analysis(
			args.sample_size,
			args.seed,
			args.positive_train_size,
			args.negative_train_size,
			args.batch_size,
		),
		indent=2,
	))


if __name__ == "__main__":
	main()
