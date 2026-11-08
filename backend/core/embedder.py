import argparse
import ast
import hashlib
import sqlite3
from contextlib import closing
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
MODEL_NAME = "ibm-granite/granite-embedding-small-english-r2"
CACHE_NAMESPACE = f"{MODEL_NAME}:description-text-v1"
DEFAULT_CACHE_PATH = DATA_DIR / "embedding_cache.sqlite3"


def _text_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _open_cache(cache_path: Path) -> sqlite3.Connection:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(cache_path)
    connection.execute(
        "CREATE TABLE IF NOT EXISTS embeddings ("
        "namespace TEXT NOT NULL, text_hash TEXT NOT NULL, vector BLOB NOT NULL, "
        "dimension INTEGER NOT NULL, PRIMARY KEY (namespace, text_hash))"
    )
    return connection


def _read_cached_vectors(cache_path: Path, text_hashes: set[str]) -> dict[str, list[float]]:
    if not text_hashes or not cache_path.exists():
        return {}
    vectors: dict[str, list[float]] = {}
    with closing(_open_cache(cache_path)) as connection:
        with connection:
            hashes = list(text_hashes)
            for offset in range(0, len(hashes), 500):
                batch = hashes[offset:offset + 500]
                placeholders = ",".join("?" for _ in batch)
                rows = connection.execute(
                    f"SELECT text_hash, vector, dimension FROM embeddings "
                    f"WHERE namespace = ? AND text_hash IN ({placeholders})",
                    [CACHE_NAMESPACE, *batch],
                )
                for text_hash, vector, dimension in rows:
                    vectors[text_hash] = np.frombuffer(vector, dtype=np.float32, count=dimension).tolist()
    return vectors


def _write_cached_vectors(cache_path: Path, vectors: dict[str, list[float]]) -> None:
    if not vectors:
        return
    with closing(_open_cache(cache_path)) as connection:
        with connection:
            connection.executemany(
                "INSERT OR REPLACE INTO embeddings (namespace, text_hash, vector, dimension) "
                "VALUES (?, ?, ?, ?)",
                [
                    (
                        CACHE_NAMESPACE,
                        text_hash,
                        np.asarray(vector, dtype=np.float32).tobytes(),
                        len(vector),
                    )
                    for text_hash, vector in vectors.items()
                ],
            )


def _seed_cache_from_csv(cache_path: Path, seed_path: Path) -> int:
    if not seed_path.exists():
        return 0
    seed_frame = pd.read_csv(seed_path, usecols=["description", "embedding"], low_memory=False)
    seed_frame["description"] = seed_frame["description"].fillna("No description provided.").astype(str)
    vectors = {}
    for text, value in zip(seed_frame["description"], seed_frame["embedding"]):
        vector = ast.literal_eval(value) if isinstance(value, str) else value
        vectors[_text_key(text)] = np.asarray(vector, dtype=np.float32).tolist()
    _write_cached_vectors(cache_path, vectors)
    return len(vectors)

def generate_vulnerability_embeddings(input_csv: str = "vulnerabilities_cleaned.csv", 
                                      output_csv: str = "vulnerabilities_embedded.csv",
                                      max_rows: int = 79621,
                                      batch_size: int = 32,
                                      cve_ids: list[str] | None = None,
                                      cache_path: str | Path | None = DEFAULT_CACHE_PATH,
                                      seed_cache_from: str | Path | None = None):
    """
    Read vulnerability descriptions, generate Granite embeddings, and save them.

    max_rows limits processing. batch_size controls the number of descriptions
    encoded at once.
    """
    input_path = DATA_DIR / input_csv
    if not input_path.exists():
        raise FileNotFoundError(f"Cleaned dataset not found at {input_path}")

    if cve_ids is not None:
        requested_ids = {cve_id.strip().upper() for cve_id in cve_ids if cve_id.strip()}
        if not requested_ids:
            raise ValueError("The requested CVE ID list is empty")
        remaining_ids = requested_ids.copy()
        selected_frames = []
        for chunk in pd.read_csv(input_path, chunksize=50000, dtype={"cve_id": str}):
            matches = chunk[chunk["cve_id"].str.upper().isin(remaining_ids)]
            if not matches.empty:
                selected_frames.append(matches)
                remaining_ids.difference_update(matches["cve_id"].str.upper())
            if not remaining_ids:
                break
        if remaining_ids:
            missing = ", ".join(sorted(remaining_ids)[:10])
            raise ValueError(
                f"Could not find {len(remaining_ids)} requested CVE IDs in {input_path}. "
                f"Examples: {missing}"
            )
        df = pd.concat(selected_frames, ignore_index=True).drop_duplicates("cve_id")
    else:
        df = pd.read_csv(input_path, nrows=max_rows, dtype={"cve_id": str})

    if df.empty:
        raise ValueError("No vulnerabilities selected for embedding")
    
    # Ensure there are no missing descriptions
    df['description'] = df['description'].fillna("No description provided.")
    
    descriptions = df["description"].astype(str).tolist()
    keys = [_text_key(text) for text in descriptions]
    vector_cache_path = Path(cache_path) if cache_path is not None else None
    if vector_cache_path is not None and seed_cache_from is not None:
        seeded = _seed_cache_from_csv(vector_cache_path, Path(seed_cache_from))
        if seeded:
            print(f"Seeded {seeded} vectors from {seed_cache_from}")

    vectors = (
        _read_cached_vectors(vector_cache_path, set(keys))
        if vector_cache_path is not None
        else {}
    )
    missing_texts: dict[str, str] = {}
    for text, key in zip(descriptions, keys):
        if key not in vectors:
            missing_texts.setdefault(key, text)

    print(f"Using {len(vectors)} cached vectors; encoding {len(missing_texts)} cache misses")
    if missing_texts:
        print("Loading IBM Granite embedding model...")
        model = SentenceTransformer(MODEL_NAME)
        missing_keys = list(missing_texts)
        encoded = model.encode(
            [missing_texts[key] for key in missing_keys],
            batch_size=batch_size,
            show_progress_bar=True,
        )
        new_vectors = {
            key: np.asarray(vector, dtype=np.float32).tolist()
            for key, vector in zip(missing_keys, encoded)
        }
        vectors.update(new_vectors)
        if vector_cache_path is not None:
            _write_cached_vectors(vector_cache_path, new_vectors)

    embeddings = [vectors[key] for key in keys]
    
    # Add the embeddings as a new column in the DataFrame
    df["embedding"] = embeddings
    
    output_path = DATA_DIR / output_csv
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Saved embedded data to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Granite embeddings for vulnerability descriptions")
    parser.add_argument("--input", default="vulnerabilities_cleaned.csv")
    parser.add_argument("--output", default="vulnerabilities_embedded.csv")
    parser.add_argument("--max-rows", type=int, default=79621)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--seed-cache-from", help="Import compatible vectors from an existing CSV")
    parser.add_argument("--no-cache", action="store_true", help="Do not read or write the vector cache")
    parser.add_argument(
        "--cve-ids-file",
        help="CSV containing a cve_id column; when provided, embed only those CVEs",
    )
    args = parser.parse_args()
    selected_ids = None
    if args.cve_ids_file:
        selected = pd.read_csv(args.cve_ids_file, usecols=["cve_id"], dtype=str)
        selected_ids = selected["cve_id"].dropna().tolist()
    generate_vulnerability_embeddings(
        input_csv=args.input,
        output_csv=args.output,
        max_rows=args.max_rows,
        batch_size=args.batch_size,
        cve_ids=selected_ids,
        cache_path=None if args.no_cache else args.cache,
        seed_cache_from=args.seed_cache_from,
    )