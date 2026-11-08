"""Train and serve a chronological, multi-label CWE classifier."""

from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.linear_model import LogisticRegression


NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_PATH = REPO_ROOT / "data" / "cwe_vulnerabilities.csv"
DEFAULT_MODEL_PATH = REPO_ROOT / "data" / "cwe_classifier.joblib"
DEFAULT_CWE_NAMES_PATH = REPO_ROOT / "data" / "weakness_types.csv"
PAGE_SIZE = 2000

_CWE_PATTERN = re.compile(r"\bCWE-\d+\b", re.IGNORECASE)
_HEX_PATTERN = re.compile(r"\b0x[0-9a-f]+\b", re.IGNORECASE)
_WINDOWS_PATH_PATTERN = re.compile(r"(?<!\w)(?:[A-Za-z]:\\|\\\\)[^\s,;<>|]+")
_UNIX_PATH_PATTERN = re.compile(r"(?<!\w)/(?:[\w.@+-]+/)*[\w.@+-]+")
_VERSION_PATTERN = re.compile(
	r"\b[vV]?\d+(?:\.\d+){1,}(?:[-+][A-Za-z0-9.-]+)?\b"
)
CWE_NAMES = {
	"CWE-20": "Improper Input Validation",
	"CWE-22": "Path Traversal",
	"CWE-78": "OS Command Injection",
	"CWE-79": "Cross-Site Scripting (XSS)",
	"CWE-89": "SQL Injection",
	"CWE-94": "Code Injection",
	"CWE-119": "Improper Restriction of Operations within a Memory Buffer",
	"CWE-125": "Out-of-bounds Read",
	"CWE-200": "Exposure of Sensitive Information",
	"CWE-269": "Improper Privilege Management",
	"CWE-276": "Incorrect Default Permissions",
	"CWE-287": "Improper Authentication",
	"CWE-295": "Improper Certificate Validation",
	"CWE-306": "Missing Authentication for Critical Function",
	"CWE-327": "Use of a Broken or Risky Cryptographic Algorithm",
	"CWE-330": "Insufficiently Random Values",
	"CWE-352": "Cross-Site Request Forgery (CSRF)",
	"CWE-400": "Uncontrolled Resource Consumption",
	"CWE-434": "Unrestricted Upload of Dangerous File Type",
	"CWE-476": "NULL Pointer Dereference",
	"CWE-502": "Deserialization of Untrusted Data",
	"CWE-611": "Improper Restriction of XML External Entity Reference",
	"CWE-601": "Open Redirect",
	"CWE-787": "Out-of-bounds Write",
	"CWE-798": "Use of Hard-coded Credentials",
	"CWE-862": "Missing Authorization",
	"CWE-863": "Incorrect Authorization",
	"CWE-918": "Server-Side Request Forgery (SSRF)",
}


def clean_description(text: Any) -> str:
	"""Normalize unstable identifiers without removing security terminology."""
	if not isinstance(text, str):
		return ""
	text = _HEX_PATTERN.sub(" <HEX> ", text)
	text = _WINDOWS_PATH_PATTERN.sub(" <PATH> ", text)
	text = _UNIX_PATH_PATTERN.sub(" <PATH> ", text)
	text = _VERSION_PATTERN.sub(" <VERSION> ", text)
	return re.sub(r"\s+", " ", text).strip()


def _nvd_record_to_row(vulnerability: dict[str, Any]) -> dict[str, Any] | None:
	cve = vulnerability.get("cve", {})
	descriptions = cve.get("descriptions", [])
	description = next(
		(item.get("value", "") for item in descriptions if item.get("lang") == "en"),
		"",
	)
	if not description:
		return None

	weaknesses = cve.get("weaknesses", [])
	cwe_ids = sorted(
		{
			match.upper()
			for weakness in weaknesses
			for item in weakness.get("description", [])
			for match in _CWE_PATTERN.findall(item.get("value", ""))
		}
	)
	return {
		"cve_id": cve.get("id", ""),
		"published": cve.get("published", ""),
		"description": description,
		"cwe_ids": ";".join(cwe_ids),
	}


def collect_nvd_cves(
	start_date: str,
	end_date: str,
	output_path: str | Path = DEFAULT_DATA_PATH,
	api_key: str | None = None,
) -> pd.DataFrame:
	"""Collect NVD CVE descriptions and CWE labels in API-supported date windows."""
	start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
	end = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
	if start >= end:
		raise ValueError("start_date must be earlier than end_date")

	rows: list[dict[str, Any]] = []
	window_start = start
	while window_start < end:
		window_end = min(window_start + timedelta(days=119), end)
		start_stamp = window_start.strftime("%Y-%m-%dT%H:%M:%S.000")
		end_stamp = window_end.strftime("%Y-%m-%dT%H:%M:%S.000")
		start_index = 0

		while True:
			params = urlencode(
				{
					"pubStartDate": start_stamp,
					"pubEndDate": end_stamp,
					"resultsPerPage": PAGE_SIZE,
					"startIndex": start_index,
				}
			)
			headers = {"User-Agent": "GraniteWall-CWE-Classifier/1.0"}
			if api_key:
				headers["apiKey"] = api_key
			request = Request(f"{NVD_API_URL}?{params}", headers=headers)
			try:
				with urlopen(request, timeout=60) as response:
					payload = json.load(response)
			except (HTTPError, URLError, TimeoutError) as error:
				raise RuntimeError(f"NVD request failed: {error}") from error

			page = payload.get("vulnerabilities", [])
			rows.extend(
				row
				for item in page
				if (row := _nvd_record_to_row(item)) is not None
			)
			start_index += len(page)
			total_results = payload.get("totalResults", 0)
			if start_index >= total_results or not page:
				break
			time.sleep(0.7 if api_key else 6.0)

		window_start = window_end + timedelta(seconds=1)

	frame = pd.DataFrame(rows).drop_duplicates(subset="cve_id")
	destination = Path(output_path)
	destination.parent.mkdir(parents=True, exist_ok=True)
	frame.to_csv(destination, index=False)
	return frame


def _parse_cwe_labels(value: Any) -> list[str]:
	if isinstance(value, (list, tuple, set)):
		raw_values = value
	elif pd.isna(value):
		return []
	else:
		raw_values = re.split(r"[,;|\s]+", str(value))
	labels = {
		match.upper()
		for item in raw_values
		for match in _CWE_PATTERN.findall(str(item))
	}
	return sorted(labels)


def load_cwe_names(path: str | Path = DEFAULT_CWE_NAMES_PATH) -> dict[str, str]:
	"""Load CWE names from the local catalog, falling back to common built-ins."""
	names = CWE_NAMES.copy()
	catalog_path = Path(path)
	if catalog_path.exists():
		catalog = pd.read_csv(catalog_path, usecols=["cwe_id", "name"], dtype=str)
		for cwe_id, name in zip(catalog["cwe_id"], catalog["name"]):
			if cwe_id and name and name.strip():
				names[cwe_id.strip().upper()] = name.strip()
	return names


def cwe_display_name(cwe_id: str, names: dict[str, str] | None = None) -> str:
	"""Return a readable name for a known CWE ID, retaining unknown IDs."""
	normalized_id = cwe_id.strip().upper()
	name = (names or load_cwe_names()).get(normalized_id)
	return f"{normalized_id}: {name}" if name else f"{normalized_id}: Name not found in CWE catalog"


def summarize_cwe_csv(data_path: str | Path = DEFAULT_DATA_PATH) -> pd.DataFrame:
	"""Count CWE labels in a CSV and attach readable names for visualization."""
	frame = pd.read_csv(data_path, low_memory=False)
	labels_column = _find_column(frame, ("cwe_ids", "cwe", "weaknesses", "cwe_labels"))
	if labels_column is None:
		raise ValueError("CSV must include a CWE label column such as 'cwe_ids'")

	counts: Counter[str] = Counter()
	labeled_rows = 0
	for value in frame[labels_column]:
		labels = _parse_cwe_labels(value)
		if labels:
			labeled_rows += 1
			counts.update(labels)

	if not counts:
		raise ValueError("CSV contains no recognized CWE IDs")

	names = load_cwe_names()
	return pd.DataFrame(
		[
			{
				"cwe_id": cwe_id,
				"name": cwe_display_name(cwe_id, names),
				"cve_count": count,
				"percent_of_labeled_rows": round(100 * count / labeled_rows, 2),
			}
			for cwe_id, count in counts.most_common()
		]
	)


def _find_column(frame: pd.DataFrame, options: tuple[str, ...]) -> str | None:
	return next((name for name in options if name in frame.columns), None)


def _prepare_dataset(data_path: str | Path) -> tuple[pd.DataFrame, str, str]:
	frame = pd.read_csv(data_path, low_memory=False)
	description_column = _find_column(frame, ("description", "cve_description"))
	date_column = _find_column(frame, ("published", "published_date", "publishedDate"))
	labels_column = _find_column(frame, ("cwe_ids", "cwe", "weaknesses", "cwe_labels"))
	missing = [
		name
		for name, column in (
			("description", description_column),
			("published date", date_column),
			("CWE labels", labels_column),
		)
		if column is None
	]
	if missing:
		raise ValueError(f"Dataset is missing required columns: {', '.join(missing)}")

	frame = frame[[description_column, date_column, labels_column]].copy()
	frame.columns = ["description", "published", "cwe_ids"]
	frame["description"] = frame["description"].fillna("").map(clean_description)
	frame["published"] = pd.to_datetime(frame["published"], errors="coerce", utc=True)
	frame["cwe_ids"] = frame["cwe_ids"].map(_parse_cwe_labels)
	frame = frame.dropna(subset=["published"])
	frame = frame[(frame["description"] != "") & frame["cwe_ids"].map(bool)]
	frame = frame.sort_values("published", kind="stable").reset_index(drop=True)
	if len(frame) < 10:
		raise ValueError("At least 10 dated CVEs with descriptions and CWE labels are required")
	return frame, "description", "cwe_ids"


def _fit_classifier(texts: pd.Series, labels: np.ndarray) -> tuple[TfidfVectorizer, OneVsRestClassifier]:
	vectorizer = TfidfVectorizer(
		ngram_range=(1, 2),
		min_df=1,
		max_features=100_000,
		sublinear_tf=True,
		strip_accents="unicode",
	)
	features = vectorizer.fit_transform(texts)
	classifier = OneVsRestClassifier(
		LogisticRegression(
			class_weight="balanced",
			max_iter=1000,
			solver="liblinear",
		)
	)
	classifier.fit(features, labels)
	return vectorizer, classifier


def _tune_thresholds(actual: np.ndarray, probabilities: np.ndarray) -> np.ndarray:
	thresholds = np.full(probabilities.shape[1], 0.5)
	for label_index in range(probabilities.shape[1]):
		truth = actual[:, label_index]
		if truth.min() == truth.max():
			continue
		candidates = np.unique(probabilities[:, label_index])
		best_f1 = -1.0
		for threshold in candidates:
			predicted = probabilities[:, label_index] >= threshold
			score = f1_score(truth, predicted, zero_division=0)
			if score > best_f1:
				best_f1 = score
				thresholds[label_index] = threshold
	return np.clip(thresholds, 0.05, 0.95)


def train_classifier(
	data_path: str | Path = DEFAULT_DATA_PATH,
	model_path: str | Path = DEFAULT_MODEL_PATH,
	test_fraction: float = 0.2,
) -> dict[str, Any]:
	"""Train on older CVEs and evaluate on the newest chronological holdout."""
	if not 0.05 <= test_fraction <= 0.4:
		raise ValueError("test_fraction must be between 0.05 and 0.4")
	frame, _, _ = _prepare_dataset(data_path)
	split_index = int(len(frame) * (1 - test_fraction))
	training = frame.iloc[:split_index].reset_index(drop=True)
	testing = frame.iloc[split_index:].reset_index(drop=True)
	validation_index = max(1, int(len(training) * 0.8))
	fitting = training.iloc[:validation_index].reset_index(drop=True)
	validation = training.iloc[validation_index:].reset_index(drop=True)

	label_binarizer = MultiLabelBinarizer()
	fitting_labels = label_binarizer.fit_transform(fitting["cwe_ids"])
	viable = (fitting_labels.sum(axis=0) >= 2) & (fitting_labels.sum(axis=0) < len(fitting))
	categories = label_binarizer.classes_[viable]
	if len(categories) == 0:
		raise ValueError("Training data needs at least one CWE with two positive and two negative examples")

	def encode(part: pd.DataFrame) -> np.ndarray:
		return np.isin(
			categories[None, :],
			np.asarray([labels for labels in part["cwe_ids"]], dtype=object)[:, None],
		).astype(int)

	validation_actual = encode(validation)
	validation_vectorizer, validation_classifier = _fit_classifier(
		fitting["description"], fitting_labels[:, viable]
	)
	validation_probabilities = validation_classifier.predict_proba(
		validation_vectorizer.transform(validation["description"])
	)
	thresholds = _tune_thresholds(validation_actual, validation_probabilities)

	training_labels = encode(training)
	vectorizer, classifier = _fit_classifier(training["description"], training_labels)
	test_actual = encode(testing)
	test_probabilities = classifier.predict_proba(vectorizer.transform(testing["description"]))
	test_predictions = test_probabilities >= thresholds

	per_category = {}
	for index, category in enumerate(categories):
		per_category[str(category)] = {
			"precision": float(precision_score(test_actual[:, index], test_predictions[:, index], zero_division=0)),
			"recall": float(recall_score(test_actual[:, index], test_predictions[:, index], zero_division=0)),
			"f1": float(f1_score(test_actual[:, index], test_predictions[:, index], zero_division=0)),
			"threshold": float(thresholds[index]),
			"test_support": int(test_actual[:, index].sum()),
		}
	metrics = {
		"macro_f1": float(f1_score(test_actual, test_predictions, average="macro", zero_division=0)),
		"macro_precision": float(precision_score(test_actual, test_predictions, average="macro", zero_division=0)),
		"macro_recall": float(recall_score(test_actual, test_predictions, average="macro", zero_division=0)),
		"train_rows": int(len(training)),
		"test_rows": int(len(testing)),
		"train_end": training["published"].max().isoformat(),
		"test_start": testing["published"].min().isoformat(),
		"per_category": per_category,
	}
	artifact = {
		"vectorizer": vectorizer,
		"classifier": classifier,
		"categories": categories.tolist(),
		"thresholds": thresholds.tolist(),
		"metrics": metrics,
	}
	destination = Path(model_path)
	destination.parent.mkdir(parents=True, exist_ok=True)
	joblib.dump(artifact, destination)
	return metrics


def predict_cwe_probabilities(
	descriptions: list[str], model: dict[str, Any] | str | Path
) -> pd.DataFrame:
	"""Return per-CWE probabilities for incoming vulnerability descriptions."""
	artifact = joblib.load(model) if isinstance(model, (str, Path)) else model
	cleaned = [clean_description(text) for text in descriptions]
	probabilities = artifact["classifier"].predict_proba(
		artifact["vectorizer"].transform(cleaned)
	)
	return pd.DataFrame(probabilities, columns=artifact["categories"])


def predict_cwe_tags(
	descriptions: list[str], model: dict[str, Any] | str | Path
) -> pd.DataFrame:
	"""Return predicted tags and their probabilities for each input description."""
	artifact = joblib.load(model) if isinstance(model, (str, Path)) else model
	probabilities = predict_cwe_probabilities(descriptions, artifact)
	thresholds = np.asarray(artifact["thresholds"])
	predictions = probabilities.to_numpy() >= thresholds
	result = pd.DataFrame({"description": descriptions})
	result["predicted_cwes"] = [
		";".join(category for category, selected in zip(artifact["categories"], row) if selected)
		for row in predictions
	]
	for category in artifact["categories"]:
		result[f"cwe_{category.lower()}_probability"] = probabilities[category].to_numpy()
	return result


def add_cwe_features(
	frame: pd.DataFrame,
	model: dict[str, Any] | str | Path,
	text_column: str = "description",
) -> pd.DataFrame:
	"""Append CWE probability features for downstream exploit/risk models."""
	if text_column not in frame.columns:
		raise ValueError(f"Input frame must include a {text_column!r} column")
	artifact = joblib.load(model) if isinstance(model, (str, Path)) else model
	predictions = predict_cwe_tags(frame[text_column].fillna("").astype(str).tolist(), artifact)
	features = predictions.drop(columns=["description", "predicted_cwes"])
	return pd.concat([frame.reset_index(drop=True), features.reset_index(drop=True)], axis=1)


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	commands = parser.add_subparsers(dest="command", required=True)
	collect = commands.add_parser("collect", help="Download CVEs and CWE labels from NVD")
	collect.add_argument("--start", required=True, help="UTC start date, e.g. 2020-01-01")
	collect.add_argument("--end", required=True, help="UTC end date, e.g. 2021-01-01")
	collect.add_argument("--output", type=Path, default=DEFAULT_DATA_PATH)
	collect.add_argument("--api-key")
	train = commands.add_parser("train", help="Train and evaluate the CWE classifier")
	train.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
	train.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
	train.add_argument("--test-fraction", type=float, default=0.2)
	summarize = commands.add_parser("summarize", help="Show CWE names and counts in a CSV")
	summarize.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
	summarize.add_argument("--out", type=Path, help="Output CSV path (default: <input>_cwe_summary.csv)")
	args = parser.parse_args()

	if args.command == "collect":
		frame = collect_nvd_cves(args.start, args.end, args.output, args.api_key)
		print(f"Collected {len(frame)} CVEs to {args.output}")
	elif args.command == "train":
		print(json.dumps(train_classifier(args.data, args.model, args.test_fraction), indent=2))
	else:
		report = summarize_cwe_csv(args.data)
		output_path = args.out or args.data.with_name(f"{args.data.stem}_cwe_summary.csv")
		output_path.parent.mkdir(parents=True, exist_ok=True)
		report.to_csv(output_path, index=False)
		print(report.to_string(index=False))
		print(f"\nWrote summary to {output_path}")


if __name__ == "__main__":
	main()
