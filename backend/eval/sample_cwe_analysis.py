"""Rank a reproducible random CVE sample and summarize CWE/KEV patterns."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from pathlib import Path

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = REPO_ROOT / "data"
SIGNAL_COLUMNS = ("exploitdb", "metasploit", "nuclei", "poc_github")
CWE_PATTERN = re.compile(r"\bCWE-\d+\b", re.IGNORECASE)


def load_cwe_names(path: Path) -> dict[str, str]:
	if not path.exists():
		return {}
	catalog = pd.read_csv(path, usecols=["cwe_id", "name"], dtype=str)
	return {
		cwe_id.strip().upper(): name.strip()
		for cwe_id, name in zip(catalog["cwe_id"], catalog["name"])
		if isinstance(cwe_id, str) and isinstance(name, str) and name.strip()
	}


def parse_cwe_ids(value: object) -> list[str]:
	if not isinstance(value, str):
		return []
	return sorted({match.upper() for match in CWE_PATTERN.findall(value)})


def create_scatter_svg(summary: pd.DataFrame, output_path: Path, sample_size: int, seed: int) -> None:
	width, height = 1100, 700
	left, right, top, bottom = 105, 50, 105, 100
	plot_width = width - left - right
	plot_height = height - top - bottom
	max_count = max(2, int(summary["cve_count"].max()))
	max_log = math.log10(max_count)

	def x_position(count: int) -> float:
		return left + math.log10(max(1, count)) / max_log * plot_width

	def y_position(rate: float) -> float:
		return top + (100 - rate) / 100 * plot_height

	parts = [
		f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
		'<rect width="100%" height="100%" fill="#f5f7f6"/>',
		'<style>text{font-family:Segoe UI,Arial,sans-serif;fill:#223238}.muted{fill:#66777b}.grid{stroke:#dbe3e1;stroke-width:1}</style>',
		'<text x="55" y="42" font-size="25" font-weight="700">CWE volume vs. known-exploited overlap</text>',
		f'<text x="55" y="70" class="muted" font-size="14">{sample_size} randomly sampled CVEs (seed {seed}); x = CVEs per CWE on log scale; y = KEV share</text>',
	]

	for tick in (0, 20, 40, 60, 80, 100):
		y = y_position(tick)
		parts.append(f'<line class="grid" x1="{left}" y1="{y:.1f}" x2="{width-right}" y2="{y:.1f}"/>')
		parts.append(f'<text x="{left-14}" y="{y+5:.1f}" text-anchor="end" font-size="12" class="muted">{tick}%</text>')

	x_ticks = sorted({1, 2, 5, 10, 20, 50, 100, max_count})
	for tick in x_ticks:
		if tick > max_count:
			continue
		x = x_position(tick)
		parts.append(f'<line class="grid" x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{height-bottom}"/>')
		parts.append(f'<text x="{x:.1f}" y="{height-bottom+24}" text-anchor="middle" font-size="12" class="muted">{tick}</text>')

	parts.extend(
		[
			f'<line x1="{left}" y1="{top}" x2="{left}" y2="{height-bottom}" stroke="#627477"/>',
			f'<line x1="{left}" y1="{height-bottom}" x2="{width-right}" y2="{height-bottom}" stroke="#627477"/>',
			f'<text x="{left + plot_width/2:.1f}" y="{height-28}" text-anchor="middle" font-size="14">CVE count per CWE (log scale)</text>',
			f'<text x="24" y="{top + plot_height/2:.1f}" text-anchor="middle" font-size="14" transform="rotate(-90 24 {top + plot_height/2:.1f})">Sample KEV rate</text>',
		]
	)

	for row in summary.itertuples(index=False):
		rate = float(row.kev_rate_pct)
		mix = min(1.0, rate / 100)
		red = round(38 + mix * 180)
		green = round(143 - mix * 78)
		blue = round(140 - mix * 80)
		color = f"#{red:02x}{green:02x}{blue:02x}"
		x = x_position(int(row.cve_count))
		y = y_position(rate)
		radius = 5 + min(5, math.sqrt(int(row.kev_count)) * 2)
		label = html.escape(f"{row.cwe_id}: {row.name}")
		parts.append(
			f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{radius:.1f}" fill="{color}" fill-opacity="0.82" stroke="#ffffff" stroke-width="1.5"><title>{label}; CVEs: {row.cve_count}; KEV: {row.kev_count} ({rate:.1f}%)</title></circle>'
		)

	labels = summary.sort_values(["cve_count", "cwe_id"], ascending=[False, True]).head(8)
	for offset, row in enumerate(labels.itertuples(index=False)):
		x = x_position(int(row.cve_count))
		y = y_position(float(row.kev_rate_pct))
		label_y = max(top + 14, min(height - bottom - 8, y - 10 - (offset % 2) * 13))
		parts.append(f'<text x="{x+8:.1f}" y="{label_y:.1f}" font-size="11" font-weight="600">{html.escape(row.cwe_id)}</text>')

	parts.append(f'<text x="{left}" y="{height-8}" class="muted" font-size="11">Color encodes KEV rate; bubble size increases with KEV count. CVEs may appear in multiple CWE categories.</text>')
	parts.append("</svg>")
	output_path.write_text("\n".join(parts), encoding="utf-8")


def run_analysis(
	data_dir: Path = DEFAULT_DATA_DIR,
	output_dir: Path | None = None,
	sample_size: int = 500,
	seed: int = 42,
) -> dict[str, object]:
	output_dir = output_dir or data_dir / "samples"
	output_dir.mkdir(parents=True, exist_ok=True)

	vulnerabilities = pd.read_csv(
		data_dir / "vulnerabilities.csv",
		usecols=["cve_id", "cwe_ids"],
		low_memory=False,
	)
	vulnerabilities = vulnerabilities.drop_duplicates("cve_id")
	if len(vulnerabilities) < sample_size:
		raise ValueError(f"Requested {sample_size} CVEs but only found {len(vulnerabilities)}")
	sample = vulnerabilities.sample(n=sample_size, random_state=seed).copy()

	score_path = data_dir / "scoreboard_2026.csv"
	if not score_path.exists():
		raise FileNotFoundError(f"Missing scoreboard data: {score_path}")
	scores = pd.read_csv(
		score_path,
		usecols=lambda column: column in {"cve_id", "snapshot_month", "epss", *SIGNAL_COLUMNS},
		low_memory=False,
	)
	if "snapshot_month" in scores.columns:
		scores = scores.sort_values("snapshot_month", kind="stable")
	scores = scores.drop_duplicates("cve_id", keep="last")
	scores["score_available"] = True

	for column in ("epss", *SIGNAL_COLUMNS):
		if column not in scores.columns:
			scores[column] = 0
	joined = sample.merge(scores, on="cve_id", how="left", suffixes=("", "_score"))
	joined["score_available"] = joined["score_available"].fillna(False).astype(bool)
	joined["epss_score"] = pd.to_numeric(joined["epss"], errors="coerce").fillna(0).clip(0, 1)
	signal_values = joined[list(SIGNAL_COLUMNS)].apply(pd.to_numeric, errors="coerce").fillna(0)
	joined["exploit_signal_score"] = (signal_values > 0).sum(axis=1) / len(SIGNAL_COLUMNS)
	joined["risk_score"] = 0.6 * joined["epss_score"] + 0.4 * joined["exploit_signal_score"]

	kev_path = data_dir / "known_exploited.csv"
	kev_ids = set(pd.read_csv(kev_path, usecols=["cve_id"], low_memory=False)["cve_id"].dropna())
	joined["is_kev"] = joined["cve_id"].isin(kev_ids)
	joined["cwe_ids"] = joined["cwe_ids"].fillna("").astype(str)
	joined["_cwe_list"] = joined["cwe_ids"].map(parse_cwe_ids)
	names = load_cwe_names(data_dir / "weakness_types.csv")
	joined["cwe_names"] = joined["_cwe_list"].map(
		lambda labels: "; ".join(f"{label}: {names.get(label, 'Name not found')}" for label in labels)
	)
	joined = joined.sort_values(["risk_score", "cve_id"], ascending=[False, True], kind="stable")
	joined["rank"] = range(1, len(joined) + 1)

	ranked_path = output_dir / f"sample_{sample_size}_ranked.csv"
	joined.drop(columns=["_cwe_list"]).to_csv(ranked_path, index=False)

	category_rows: list[dict[str, object]] = []
	for cwe_id in sorted({label for labels in joined["_cwe_list"] for label in labels}):
		category = joined[joined["_cwe_list"].map(lambda labels: cwe_id in labels)]
		count = len(category)
		kev_count = int(category["is_kev"].sum())
		scored = category.loc[category["score_available"]]
		category_rows.append(
			{
				"cwe_id": cwe_id,
				"name": names.get(cwe_id, "Name not found in CWE catalog"),
				"cve_count": count,
				"sample_share_pct": round(100 * count / sample_size, 2),
				"kev_count": kev_count,
				"kev_rate_pct": round(100 * kev_count / count, 2),
				"score_coverage_count": int(category["score_available"].sum()),
				"score_coverage_pct": round(100 * category["score_available"].mean(), 2),
				"mean_risk_score": round(float(category["risk_score"].mean()), 6),
				"mean_risk_score_scored_only": round(float(scored["risk_score"].mean()), 6) if len(scored) else None,
				"mean_rank": round(float(category["rank"].mean()), 2),
			}
		)

	category_summary = pd.DataFrame(category_rows).sort_values(
		["cve_count", "kev_count", "cwe_id"], ascending=[False, False, True]
	)
	category_path = output_dir / f"sample_{sample_size}_cwe_summary.csv"
	category_summary.to_csv(category_path, index=False)
	chart_path = output_dir / f"sample_{sample_size}_cwe_volume_vs_kev.svg"
	create_scatter_svg(category_summary, chart_path, sample_size, seed)

	return {
		"sample_size": sample_size,
		"seed": seed,
		"scored_cve_count": int(joined["score_available"].sum()),
		"unscored_cve_count": int((~joined["score_available"]).sum()),
		"kev_count": int(joined["is_kev"].sum()),
		"cwe_category_count": int(len(category_summary)),
		"ranked_csv": str(ranked_path),
		"cwe_summary_csv": str(category_path),
		"chart_svg": str(chart_path),
	}


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
	parser.add_argument("--output-dir", type=Path)
	parser.add_argument("--sample-size", type=int, default=500)
	parser.add_argument("--seed", type=int, default=42)
	args = parser.parse_args()
	print(json.dumps(run_analysis(args.data_dir, args.output_dir, args.sample_size, args.seed), indent=2))


if __name__ == "__main__":
	main()