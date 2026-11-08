"""Shared dataset path resolution (new helper — does not alter existing scripts)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Prefer local IBM dump; fall back to the README layout (data/data).
_CANDIDATES = (
    REPO_ROOT / "IBM" / "data",
    REPO_ROOT / "data" / "data",
)


def get_data_dir() -> Path:
    for path in _CANDIDATES:
        if path.is_dir():
            return path
    raise FileNotFoundError(
        "No dataset directory found. Expected one of:\n"
        + "\n".join(f"  - {p}" for p in _CANDIDATES)
    )


DATA_DIR = get_data_dir()
