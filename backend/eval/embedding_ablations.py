"""Small cached-vector ablations for the rolling embedding backtest."""

from __future__ import annotations

import argparse
import ast
import json
import random
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import OptimizeWarning
from sklearn.linear_model import LogisticRegression

warnings.filterwarnings('ignore', category=OptimizeWarning)

from core.paths import DATA_DIR
from eval.backtest import available_months, first_kev_month, load_exploit_signals
from eval.baselines import RANKERS
from eval.metrics import precision_at_k, rank_top_k

SAMPLE_DIR = DATA_DIR / "samples"
VECTOR_PATH = SAMPLE_DIR / "embedding_backtest_tuned_vectors.csv"
KNOWN_PATH = DATA_DIR / "known_exploited.csv"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
SIGNAL_COLUMNS = ("exploitdb", "metasploit", "nuclei", "poc_github")
WEIGHTS = tuple(step / 20 for step in range(21))


def _vector(value: object) -> np.ndarray:
	return np.asarray(ast.literal_eval(value) if isinstance(value, str) else value, dtype=np.float32)


def run_ablations(
	train_sizes: list[int] | None = None,
	seeds: list[int] | None = None,
	negative_test_size: int = 10000,
	validation_month_count: int = 6,
	k: int = 500,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, object]]:
	train_sizes = train_sizes or [1000, 5000, 10000]
	seeds = seeds or [42, 43, 44]
	if not VECTOR_PATH.exists():
		raise FileNotFoundError(f"Missing cached vectors: {VECTOR_PATH}")

	signals = load_exploit_signals(DATA_DIR)
	first_kev = first_kev_month(signals)
	months = available_months(signals)
	vector_frame = pd.read_csv(VECTOR_PATH, dtype={"cve_id": str}, low_memory=False)
	vector_frame = vector_frame.drop_duplicates("cve_id", keep="last").set_index("cve_id")
	vectors = {cve_id: _vector(value) for cve_id, value in vector_frame["embedding"].items()}
	vector_ids = set(vectors)
	known_frame = pd.read_csv(KNOWN_PATH, usecols=["cve_id"], dtype={"cve_id": str})
	known_ids = set(known_frame["cve_id"].dropna())
	descriptions = pd.read_csv(
		DATA_DIR / "vulnerabilities_cleaned.csv",
		usecols=["cve_id", "published"],
		dtype={"cve_id": str},
		low_memory=False,
	).drop_duplicates("cve_id").set_index("cve_id")
	published_month = descriptions["published"].astype(str).str.slice(0, 7)
	description_ids = set(descriptions.index)

	first_month, last_month = months[0], months[-1]
	test_positive_ids = {
		cve_id for cve_id in first_kev.index
		if first_month < first_kev[cve_id] <= last_month
	}
	negative_pool = sorted(
		(set(signals["cve_id"]) - set(first_kev.index) - known_ids)
		& description_ids
		- test_positive_ids
	)
	if len(negative_pool) < negative_test_size:
		raise ValueError(f"Only {len(negative_pool)} non-KEV controls are available")
	test_negative_ids = set(random.Random(42).sample(negative_pool, negative_test_size))
	test_ids = test_positive_ids | test_negative_ids
	missing_test_vectors = test_ids - vector_ids
	if missing_test_vectors:
		raise ValueError(
			f"{len(missing_test_vectors)} held-out CVEs lack cached vectors; run the cached embedder first"
		)

	positive_train_pool = (known_ids & set(first_kev.index) & description_ids & vector_ids) - test_ids
	negative_train_pool = sorted((vector_ids & description_ids) - known_ids - test_ids)
	max_train_size = max(train_sizes)
	if max_train_size > len(negative_train_pool):
		raise ValueError(
			f"Requested {max_train_size} training negatives but only "
			f"{len(negative_train_pool)} are cached outside the test cohort"
		)
	
	monthly_folds: dict[str, tuple[pd.DataFrame, set[str]]] = {}
	for month in months[:-1]:
		snapshot = signals.loc[signals["month"] == month].drop_duplicates("cve_id", keep="last")
		candidates = snapshot.loc[
			(snapshot["in_kev"] == 0) & snapshot["cve_id"].isin(test_ids)
		].drop_duplicates("cve_id", keep="last").reset_index(drop=True)
		if candidates.empty:
			continue
		candidate_ids = set(candidates["cve_id"])
		positives = {
			cve_id for cve_id in candidate_ids
			if cve_id in first_kev.index and first_kev[cve_id] > month
		}
		monthly_folds[month] = (candidates, positives)

	fold_months = list(monthly_folds)
	if validation_month_count < 1 or validation_month_count >= len(fold_months):
		raise ValueError("validation_month_count must leave at least one test month")
	validation_months = fold_months[:validation_month_count]
	test_months = fold_months[validation_month_count:]
	results: list[dict[str, object]] = []
	weight_results: list[dict[str, object]] = []
	selected_weights: list[dict[str, object]] = []

	for seed in seeds:
		seeded_negatives = random.Random(seed).sample(negative_train_pool, max_train_size)
		for train_size in train_sizes:
			negative_train_ids = set(seeded_negatives[:train_size])
			fold_scores: dict[str, tuple[pd.DataFrame, set[str], np.ndarray]] = {}
			for month, (candidates, positives) in monthly_folds.items():
				train_published = {
					cve_id for cve_id in (positive_train_pool | negative_train_ids)
					if cve_id in published_month.index and published_month[cve_id] <= month
				}
				train_positive = {
					cve_id for cve_id in train_published
					if cve_id in first_kev.index and first_kev[cve_id] <= month
				}
				train_negative = train_published - train_positive
				train_rows = sorted(train_positive | train_negative)
				if not train_positive or not train_negative:
					continue
				training_matrix = np.vstack([vectors[cve_id] for cve_id in train_rows])
				training_labels = np.asarray([cve_id in train_positive for cve_id in train_rows], dtype=np.int8)
				model = LogisticRegression(max_iter=1000, class_weight="balanced")
				model.fit(training_matrix, training_labels)
				candidate_matrix = np.vstack([vectors[cve_id] for cve_id in candidates["cve_id"]])
				probabilities = model.predict_proba(candidate_matrix)[:, 1]
				fold_scores[month] = (candidates.copy(), positives, probabilities)

			validation_hits: dict[float, list[int]] = {weight: [] for weight in WEIGHTS}
			for month in validation_months:
				candidates, positives, probabilities = fold_scores[month]
				candidates["model_probability"] = probabilities
				epss = pd.to_numeric(candidates["epss"], errors="coerce").fillna(0).clip(0, 1)
				signal_values = candidates.reindex(columns=SIGNAL_COLUMNS).apply(pd.to_numeric, errors="coerce").fillna(0)
				candidates["direct_risk_score"] = 0.6 * epss + 0.4 * (signal_values > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
				for weight in WEIGHTS:
					score = weight * probabilities + (1 - weight) * candidates["direct_risk_score"].to_numpy()
					hits = len(set(rank_top_k(candidates, pd.Series(score), k)) & positives)
					validation_hits[weight].append(hits)

			for weight, hits in validation_hits.items():
				weight_results.append(
					{
						"seed": seed,
						"train_negative_size": train_size,
						"embedding_weight": weight,
						"mean_validation_hits": float(np.mean(hits)),
					}
				)
			selected_weight = max(
				WEIGHTS,
				key=lambda weight: (float(np.mean(validation_hits[weight])), -weight),
			)
			selected_weights.append(
				{
					"seed": seed,
					"train_negative_size": train_size,
					"selected_embedding_weight": selected_weight,
					"validation_mean_hits": float(np.mean(validation_hits[selected_weight])),
				}
			)

			for month, (candidates, positives, probabilities) in fold_scores.items():
				phase = "validation" if month in validation_months else "test"
				candidates["model_probability"] = probabilities
				epss = pd.to_numeric(candidates["epss"], errors="coerce").fillna(0).clip(0, 1)
				signal_values = candidates.reindex(columns=SIGNAL_COLUMNS).apply(pd.to_numeric, errors="coerce").fillna(0)
				candidates["direct_risk_score"] = 0.6 * epss + 0.4 * (signal_values > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
				score_functions = {
					"tuned_blend": selected_weight * probabilities + (1 - selected_weight) * candidates["direct_risk_score"].to_numpy(),
					"embedding_only": probabilities,
					"direct_risk": RANKERS["direct_risk"](candidates).to_numpy(),
					"exploit_then_epss": RANKERS["exploit_then_epss"](candidates).to_numpy(),
					"epss": RANKERS["epss"](candidates).to_numpy(),
				}
				for method, scores in score_functions.items():
					ranked = rank_top_k(candidates, pd.Series(scores), k)
					metrics = precision_at_k(ranked, positives, k)
					metrics.update(
						{
							"seed": seed,
							"train_negative_size": train_size,
							"selected_embedding_weight": selected_weight,
							"month": month,
							"phase": phase,
							"method": method,
							"n_candidates": len(candidates),
							"n_positive": len(positives),
							"n_train_positive": sum(1 for cve_id in positive_train_pool if cve_id in published_month.index and published_month[cve_id] <= month and cve_id in first_kev.index and first_kev[cve_id] <= month),
						}
					)
					results.append(metrics)

	results_frame = pd.DataFrame(results)
	test_results = results_frame.loc[results_frame["phase"] == "test"]
	summary = (
		test_results.groupby(["train_negative_size", "method"], as_index=False)
		.agg(
			seeds=("seed", "nunique"),
			months=("month", "nunique"),
			avg_hits=("hits", "mean"),
			std_hits=("hits", "std"),
			avg_precision_at_k=("precision_at_k", "mean"),
			avg_recall_at_k=("recall_at_k", "mean"),
			avg_positives=("n_positive", "mean"),
			avg_candidates=("n_candidates", "mean"),
		)
		.sort_values(["train_negative_size", "avg_hits"], ascending=[True, False])
	)
	weights_frame = pd.DataFrame(weight_results)
	selected_frame = pd.DataFrame(selected_weights)
	OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
	results_frame.to_csv(OUTPUT_DIR / "embedding_ablations_results.csv", index=False)
	summary.to_csv(OUTPUT_DIR / "embedding_ablations_summary.csv", index=False)
	weights_frame.to_csv(OUTPUT_DIR / "embedding_ablations_weights.csv", index=False)
	selected_frame.to_csv(OUTPUT_DIR / "embedding_ablations_selected_weights.csv", index=False)
	return results_frame, summary, weights_frame, selected_frame


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--train-sizes", default="1000,5000,10000")
	parser.add_argument("--seeds", default="42,43,44")
	parser.add_argument("--negative-test-size", type=int, default=10000)
	parser.add_argument("--validation-month-count", type=int, default=6)
	parser.add_argument("--k", type=int, default=500)
	args = parser.parse_args()
	results, summary, weights, selected = run_ablations(
		train_sizes=[int(value) for value in args.train_sizes.split(",")],
		seeds=[int(value) for value in args.seeds.split(",")],
		negative_test_size=args.negative_test_size,
		validation_month_count=args.validation_month_count,
		k=args.k,
	)
	print(summary.to_string(index=False))
	print("\nSelected weights:")
	print(selected.to_string(index=False))


if __name__ == "__main__":
	main()
