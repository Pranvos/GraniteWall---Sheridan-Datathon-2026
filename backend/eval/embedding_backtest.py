"""Rolling monthly backtest for the Granite embedding risk model."""

from __future__ import annotations

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

from core.embedder import generate_vulnerability_embeddings
from core.paths import DATA_DIR
from eval.backtest import available_months, first_kev_month, load_exploit_signals
from eval.baselines import RANKERS
from eval.metrics import precision_at_k, rank_top_k

EMBEDDINGS_PATH = DATA_DIR / "samples" / "sample_1000_model_embeddings.csv"
SAMPLE_DIR = DATA_DIR / "samples"
TEST_EMBEDDINGS_PATH = SAMPLE_DIR / "embedding_backtest_test_vectors.csv"
VECTOR_CACHE_PATH = SAMPLE_DIR / "granite_vector_cache.sqlite3"
KNOWN_EXPLOITED_PATH = DATA_DIR / "known_exploited.csv"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
SIGNAL_COLUMNS = ("exploitdb", "metasploit", "nuclei", "poc_github")


def _matrix(values: pd.Series) -> np.ndarray:
	return np.vstack(
		[value if not isinstance(value, str) else ast.literal_eval(value) for value in values]
	)


def run_embedding_backtest(
	k: int = 500,
	negative_test_size: int = 10000,
	negative_train_size: int = 10000,
	seed: int = 42,
	batch_size: int = 64,
	tuning_month_count: int = 6,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, object]]:
	"""Tune blend weight on early months; report performance on later months."""
	if not EMBEDDINGS_PATH.exists():
		raise FileNotFoundError(f"Missing embeddings: {EMBEDDINGS_PATH}")

	signals = load_exploit_signals(DATA_DIR)
	first_kev = first_kev_month(signals)
	months = available_months(signals)
	if len(months) < 2:
		raise ValueError("Need at least two snapshot months for a rolling backtest")

	base_embeddings = pd.read_csv(EMBEDDINGS_PATH, dtype={"cve_id": str}, low_memory=False)
	base_embeddings = base_embeddings.drop_duplicates("cve_id")
	embedded_ids = set(base_embeddings["cve_id"])
	known_frame = pd.read_csv(
		KNOWN_EXPLOITED_PATH,
		usecols=["cve_id", "date_added"],
		dtype={"cve_id": str},
	)
	known_frame["date_added_month"] = pd.to_datetime(known_frame["date_added"], errors="coerce").dt.strftime("%Y-%m")
	known_frame = known_frame.dropna(subset=["cve_id", "date_added_month"]).drop_duplicates("cve_id")
	known_month = known_frame.set_index("cve_id")["date_added_month"]
	known_ids = set(known_month.index)

	# Hold out later KEV additions and a separate random non-KEV cohort for testing.
	first_month = months[0]
	last_month = months[-1]
	test_positive_ids = {
		cve_id
		for cve_id in first_kev.index
		if first_month < first_kev[cve_id] <= last_month
	}
	description_ids = set(
		pd.read_csv(
			DATA_DIR / "vulnerabilities_cleaned.csv",
			usecols=["cve_id"],
			dtype={"cve_id": str},
			low_memory=False,
		)["cve_id"].dropna()
	)
	negative_pool = sorted(
		(set(signals["cve_id"]) - set(first_kev.index) - known_ids)
		& description_ids
		- test_positive_ids
	)
	if len(negative_pool) < negative_test_size:
		raise ValueError(
			f"Requested {negative_test_size} negative controls but found {len(negative_pool)} with descriptions"
		)
	test_negative_ids = set(random.Random(seed).sample(negative_pool, negative_test_size))
	test_ids = test_positive_ids | test_negative_ids
	known_training_ids = (known_ids & set(first_kev.index) & description_ids) - test_ids
	negative_training_pool = sorted(description_ids - known_ids - test_ids)
	if negative_train_size < 0 or len(negative_training_pool) < negative_train_size:
		raise ValueError(
			f"Requested {negative_train_size} negative training examples but found "
			f"{len(negative_training_pool)} with descriptions"
		)
	negative_training_ids = set(
		random.Random(seed + 1).sample(negative_training_pool, negative_train_size)
	)
	train_ids = (embedded_ids - test_ids - (known_ids - set(first_kev.index))) | known_training_ids | negative_training_ids

	SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
	all_vector_ids = train_ids | test_ids
	all_vectors_path = SAMPLE_DIR / "embedding_backtest_tuned_vectors.csv"
	generate_vulnerability_embeddings(
		output_csv=str(all_vectors_path.relative_to(DATA_DIR)),
		batch_size=batch_size,
		cve_ids=sorted(all_vector_ids),
		cache_path=VECTOR_CACHE_PATH,
		seed_cache_from=EMBEDDINGS_PATH,
	)
	embedded_frame = pd.read_csv(all_vectors_path, dtype={"cve_id": str}, low_memory=False)
	embedded_frame = embedded_frame.drop_duplicates("cve_id", keep="last").set_index("cve_id")
	embedded_frame["_vector"] = list(_matrix(embedded_frame["embedding"]))
	embedded_ids = set(embedded_frame.index)

	published = pd.read_csv(
		DATA_DIR / "vulnerabilities_cleaned.csv",
		usecols=["cve_id", "published"],
		dtype={"cve_id": str},
		low_memory=False,
	).drop_duplicates("cve_id").set_index("cve_id")["published"]
	published_month = published.astype(str).str.slice(0, 7)
	
	folds: dict[str, tuple[pd.DataFrame, set[str]]] = {}
	for month in months[:-1]:
		snapshot = signals.loc[signals["month"] == month].drop_duplicates("cve_id", keep="last")
		candidates = snapshot.loc[
			(snapshot["in_kev"] == 0) & snapshot["cve_id"].isin(test_ids)
		].copy()
		if candidates.empty:
			continue

		candidate_ids = set(candidates["cve_id"])
		positives = {
			cve_id for cve_id in candidate_ids
			if cve_id in first_kev.index and first_kev[cve_id] > month
		}
		train_published_ids = {
			cve_id for cve_id in train_ids
			if cve_id in published_month.index and published_month[cve_id] <= month
		}
		train_positive_ids = {
			cve_id for cve_id in train_published_ids
			if cve_id in first_kev.index and first_kev[cve_id] <= month
		}
		train_negative_ids = train_published_ids - train_positive_ids
		train_rows = sorted(train_positive_ids | train_negative_ids)
		if not train_positive_ids or not train_negative_ids:
			continue

		training_matrix = np.vstack(embedded_frame.loc[train_rows, "_vector"].to_numpy())
		training_labels = np.array([cve_id in train_positive_ids for cve_id in train_rows], dtype=int)
		model = LogisticRegression(max_iter=1000, class_weight="balanced")
		model.fit(training_matrix, training_labels)

		candidates = candidates.drop_duplicates("cve_id", keep="last").reset_index(drop=True)
		candidate_matrix = np.vstack(embedded_frame.loc[candidates["cve_id"], "_vector"].to_numpy())
		model_probabilities = model.predict_proba(candidate_matrix)[:, 1]
		candidates["model_probability"] = model_probabilities
		for column in ("epss", *SIGNAL_COLUMNS):
			if column not in candidates.columns:
				candidates[column] = 0
		epss = pd.to_numeric(candidates["epss"], errors="coerce").fillna(0).clip(0, 1)
		signal_values = candidates[list(SIGNAL_COLUMNS)].apply(pd.to_numeric, errors="coerce").fillna(0)
		signal_score = (signal_values > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
		candidates["direct_risk_score"] = 0.6 * epss + 0.4 * signal_score
		candidates["n_train"] = len(train_rows)
		candidates["n_train_positive"] = len(train_positive_ids)
		candidates["n_train_negative"] = len(train_negative_ids)
		folds[month] = (candidates, positives)

	months_with_data = list(folds)
	if tuning_month_count < 1 or tuning_month_count >= len(months_with_data):
		raise ValueError("tuning_month_count must leave at least one later test month")
	validation_months = months_with_data[:tuning_month_count]
	test_months = months_with_data[tuning_month_count:]

	tuning_rows: list[dict[str, object]] = []
	for weight_step in range(21):
		embedding_weight = weight_step / 20
		hits_by_month = []
		for month in validation_months:
			candidates, positives = folds[month]
			score = (
				embedding_weight * candidates["model_probability"]
				+ (1 - embedding_weight) * candidates["direct_risk_score"]
			)
			hits_by_month.append(len(set(rank_top_k(candidates, score, k)) & positives))
		tuning_rows.append(
			{
				"embedding_weight": embedding_weight,
				"mean_validation_hits": float(np.mean(hits_by_month)),
				"validation_months": len(validation_months),
			}
		)
	tuning_table = pd.DataFrame(tuning_rows).sort_values(
		["mean_validation_hits", "embedding_weight"], ascending=[False, True]
	).reset_index(drop=True)
	selected_weight = float(tuning_table.iloc[0]["embedding_weight"])

	rows: list[dict[str, object]] = []
	for month in months_with_data:
		candidates, positives = folds[month]
		phase = "validation" if month in validation_months else "test"
		score_functions = {
			"embedding_blend": lambda frame: (
				selected_weight * frame["model_probability"]
				+ (1 - selected_weight) * frame["direct_risk_score"]
			),
			"embedding_only": lambda frame: frame["model_probability"],
			"direct_risk": RANKERS["direct_risk"],
			"exploit_then_epss": RANKERS["exploit_then_epss"],
			"epss": RANKERS["epss"],
		}
		for method, score_function in score_functions.items():
			ranked_ids = rank_top_k(candidates, score_function(candidates), k=k)
			metrics = precision_at_k(ranked_ids, positives, k=k)
			metrics.update(
				{
					"month": month,
					"phase": phase,
					"method": method,
					"embedding_weight": selected_weight,
					"n_candidates": int(len(candidates)),
					"n_train": int(candidates["n_train"].iloc[0]),
					"n_train_positive": int(candidates["n_train_positive"].iloc[0]),
					"n_train_negative": int(candidates["n_train_negative"].iloc[0]),
					"test_embedding_coverage": 1.0,
				}
			)
			rows.append(metrics)

	results = pd.DataFrame(rows)
	if results.empty:
		raise ValueError("No monthly folds had candidates and both training classes")
	test_results = results.loc[results["phase"] == "test"]
	summary = (
		test_results.groupby("method", as_index=False)
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
	cohort = {
		"evaluation": "rolling monthly; trained only on labels known by each snapshot month",
		"k": k,
		"first_month": months[0],
		"last_evaluated_month": months_with_data[-1],
		"months_evaluated": len(months_with_data),
		"validation_months": validation_months,
		"test_months": test_months,
		"selected_embedding_weight": selected_weight,
		"tuning_metric": "mean hits@k across validation months",
		"heldout_future_kev_ids": len(test_positive_ids),
		"heldout_random_non_kev_ids": len(test_negative_ids),
		"training_pool_ids": len(train_ids),
		"negative_training_sample_size": len(negative_training_ids),
		"random_seed": seed,
		"negative_control_sample_size": negative_test_size,
		"candidates_restricted_to_precomputed_embeddings": True,
		"cache_path": str(VECTOR_CACHE_PATH),
		"description_snapshot_history_available": False,
		"description_temporal_note": "The source CSV contains current descriptions, not historical monthly versions.",
		"cvss_baseline_included": False,
	}

	OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
	output_stem = f"embedding_backtest_{len(test_ids)}_train{negative_train_size}_tuned"
	results.to_csv(OUTPUT_DIR / f"{output_stem}_results.csv", index=False)
	summary.to_csv(OUTPUT_DIR / f"{output_stem}_summary.csv", index=False)
	tuning_table.to_csv(OUTPUT_DIR / f"{output_stem}_weights.csv", index=False)
	(OUTPUT_DIR / f"{output_stem}_cohort.json").write_text(json.dumps(cohort, indent=2), encoding="utf-8")
	return results, summary, cohort


def main() -> None:
	import argparse

	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--k", type=int, default=500)
	parser.add_argument("--negative-test-size", type=int, default=10000)
	parser.add_argument("--negative-train-size", type=int, default=10000)
	parser.add_argument("--seed", type=int, default=42)
	parser.add_argument("--batch-size", type=int, default=64)
	parser.add_argument("--tuning-month-count", type=int, default=6)
	args = parser.parse_args()
	_, summary, cohort = run_embedding_backtest(
		k=args.k,
		negative_test_size=args.negative_test_size,
		negative_train_size=args.negative_train_size,
		seed=args.seed,
		batch_size=args.batch_size,
		tuning_month_count=args.tuning_month_count,
	)
	print(json.dumps(cohort, indent=2))
	print(summary.to_string(index=False))


if __name__ == "__main__":
	main()
