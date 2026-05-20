#!/usr/bin/env python3
"""Seed script: download CAMELYON16 sample patches and prepare demo data.

Since full WSI files are enormous (1-5 GB each), this script creates
synthetic demo data from small patch images for demonstration purposes.
For production, replace with real CAMELYON16 WSI downloads.

Usage:
    python scripts/seed_camelyon.py

Requires backend dependencies: pip install -r backend/requirements.txt
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

DATA_DIR = os.environ.get("DATA_DIR", str(Path(__file__).parent.parent / "data"))


def generate_synthetic_patches(
    n_normal: int = 200,
    n_tumor: int = 200,
) -> tuple[Path, Path]:
    """Generate synthetic H&E-like patches for demo.

    Normal tissue: pink/light tones
    Tumor tissue: darker purple/blue tones with more variation
    """
    normal_dir = Path(DATA_DIR) / "demo" / "normal"
    tumor_dir = Path(DATA_DIR) / "demo" / "tumor"
    normal_dir.mkdir(parents=True, exist_ok=True)
    tumor_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.RandomState(42)

    # Normal patches — light pink, uniform
    for i in range(n_normal):
        base = rng.randint(180, 240, size=(224, 224, 3), dtype=np.uint8)
        # Add pink tint (H&E normal tissue)
        base[:, :, 0] = np.clip(base[:, :, 0].astype(int) + 20, 0, 255)
        base[:, :, 2] = np.clip(base[:, :, 2].astype(int) - 30, 0, 255)
        # Add some cellular structure
        for _ in range(rng.randint(5, 20)):
            cx, cy = rng.randint(10, 214, size=2)
            r = rng.randint(3, 8)
            y_grid, x_grid = np.ogrid[-r:r+1, -r:r+1]
            mask = x_grid**2 + y_grid**2 <= r**2
            y_start = max(cy - r, 0)
            x_start = max(cx - r, 0)
            y_end = min(cy + r + 1, 224)
            x_end = min(cx + r + 1, 224)
            m = mask[:y_end-y_start, :x_end-x_start]
            base[y_start:y_end, x_start:x_end, 1][m] = np.clip(
                base[y_start:y_end, x_start:x_end, 1][m].astype(int) - 40, 0, 255
            )

        Image.fromarray(base).save(normal_dir / f"normal_{i:04d}.png")

    # Tumor patches — darker, more purple, irregular
    for i in range(n_tumor):
        base = rng.randint(120, 200, size=(224, 224, 3), dtype=np.uint8)
        # More purple/blue (tumor H&E)
        base[:, :, 0] = np.clip(base[:, :, 0].astype(int) + 30, 0, 255)
        base[:, :, 2] = np.clip(base[:, :, 2].astype(int) + 20, 0, 255)
        base[:, :, 1] = np.clip(base[:, :, 1].astype(int) - 40, 0, 255)
        # Dense irregular nuclei
        for _ in range(rng.randint(30, 80)):
            cx, cy = rng.randint(5, 219, size=2)
            r = rng.randint(2, 6)
            y_grid, x_grid = np.ogrid[-r:r+1, -r:r+1]
            mask = x_grid**2 + y_grid**2 <= r**2
            y_start = max(cy - r, 0)
            x_start = max(cx - r, 0)
            y_end = min(cy + r + 1, 224)
            x_end = min(cx + r + 1, 224)
            m = mask[:y_end-y_start, :x_end-x_start]
            dark = rng.randint(40, 100)
            base[y_start:y_end, x_start:x_end][m] = dark

        Image.fromarray(base).save(tumor_dir / f"tumor_{i:04d}.png")

    print(f"Generated {n_normal} normal + {n_tumor} tumor patches in {DATA_DIR}/demo/")
    return normal_dir, tumor_dir


def create_seed_csv(normal_dir: Path, tumor_dir: Path, output_path: Path) -> None:
    """Create a CSV that can be used after patches are imported to DB.

    This generates a mapping file: filename -> label.
    Actual patch_id mapping happens after DB import.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write("filename,label\n")
        for p in sorted(normal_dir.glob("*.png")):
            f.write(f"{p.name},normal\n")
        for p in sorted(tumor_dir.glob("*.png")):
            f.write(f"{p.name},tumor\n")
    print(f"Label CSV written to {output_path}")


def main():
    print("=" * 60)
    print("PathVision Demo Data Generator")
    print("=" * 60)

    normal_dir, tumor_dir = generate_synthetic_patches(200, 200)

    csv_path = Path(DATA_DIR) / "demo" / "labels.csv"
    create_seed_csv(normal_dir, tumor_dir, csv_path)

    print()
    print("Next steps:")
    print("1. Start the platform: docker compose up")
    print("2. Upload patches from data/demo/normal/ and data/demo/tumor/")
    print("   Or create a combined image and upload as a single slide")
    print("3. Generate embeddings")
    print("4. Upload labels CSV: data/demo/labels.csv")
    print("5. Train classifier with classes: normal, tumor")
    print("6. Run inference and view heatmap")
    print()
    print("For real CAMELYON16 data, download from:")
    print("  https://camelyon16.grand-challenge.org/Data/")


if __name__ == "__main__":
    main()
