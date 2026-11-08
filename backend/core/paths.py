"""Shared dataset path resolution."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Prefer a local IBM dump; otherwise use the repository data directory.
_CANDIDATES = (
    REPO_ROOT / "IBM" / "data",
    REPO_ROOT / "data",
)


def get_data_dir() -> Path:
    # Prefer a candidate that actually has a scoreboard (raw or scored).
    for path in _CANDIDATES:
        if (path / "scoreboard_2026_scored.csv").exists() or (path / "scoreboard_2026.csv").exists():
            return path
    for path in _CANDIDATES:
        if path.is_dir():
            return path
    raise FileNotFoundError(
        "No dataset directory found. Expected one of:\n"
        + "\n".join(f"  - {p}" for p in _CANDIDATES)
    )


DATA_DIR = get_data_dir()
