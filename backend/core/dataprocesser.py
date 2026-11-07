import pandas as pd
from pathlib import Path

import os

REPO_ROOT = Path(__file__).resolve().parents[2]
# Assuming data is placed in a backend/data/ directory
DATA_DIR = REPO_ROOT / "data" / "data"

def load_vulnerabilities() -> pd.DataFrame:
    """Load vulnerabilities data and drop prohibited columns."""
    file_path = DATA_DIR / "vulnerabilities.csv"
    
    if not file_path.exists():
        raise FileNotFoundError(f"Dataset not found at {file_path}")
        
    df = pd.read_csv(file_path, low_memory=False)
    
    # Drop columns giving unfair future knowledge based on Datathon rules
    prohibited_columns = [
        "nvd_status", 
        "n_affected_cpes", 
        "n_references"
    ]
    
    columns_to_drop = [col for col in prohibited_columns if col in df.columns]
    df_cleaned = df.drop(columns=columns_to_drop)
    
    return df_cleaned

if __name__ == "__main__":
    df_cleaned = load_vulnerabilities()
    df_cleaned.to_csv(DATA_DIR / "vulnerabilities_cleaned.csv", index=False)