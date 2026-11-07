import pandas as pd
from sentence_transformers import SentenceTransformer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data" / "data"

def generate_vulnerability_embeddings(input_csv: str = "vulnerabilities_cleaned.csv", 
                                      output_csv: str = "vulnerabilities_embedded.csv",
                                      max_rows: int = 30000):
    """
    Read vulnerability descriptions, generate Granite embeddings, and save them.

    max_rows limits processing so large datasets can be handled in manageable
    runs. Pass None to process the entire input file.
    """
    print("Loading IBM Granite embedding model...")
    # Using the lightweight R2 model for hackathon speed
    model = SentenceTransformer("ibm-granite/granite-embedding-small-english-r2")
    
    input_path = DATA_DIR / input_csv
    if not input_path.exists():
        raise FileNotFoundError(f"Cleaned dataset not found at {input_path}")

    df = pd.read_csv(input_path, nrows=max_rows)
    
    # Ensure there are no missing descriptions
    df['description'] = df['description'].fillna("No description provided.")
    
    descriptions = df['description'].tolist()
    
    print(f"Generating embeddings for {len(descriptions)} vulnerabilities...")
    # The encode function automatically batches the processing
    embeddings = model.encode(descriptions, show_progress_bar=True)
    
    # Add the embeddings as a new column in the DataFrame
    df['embedding'] = embeddings.tolist()
    
    output_path = DATA_DIR / output_csv
    df.to_csv(output_path, index=False)
    print(f"Saved embedded data to {output_path}")

if __name__ == "__main__":
    generate_vulnerability_embeddings()