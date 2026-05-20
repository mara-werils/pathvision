"""FAISS-based similar patch search."""

from __future__ import annotations

import logging
from pathlib import Path

import faiss
import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

DIMENSION = settings.EMBEDDING_DIM  # 384


class SearchService:
    _instance: SearchService | None = None

    def __init__(self) -> None:
        self.index: faiss.IndexFlatIP | None = None
        self.patch_ids: list[str] = []
        self.slide_ids: list[str] = []
        self.index_dir = Path(settings.DATA_DIR) / "faiss"
        self.index_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get_instance(cls) -> SearchService:
        if cls._instance is None:
            cls._instance = cls()
            cls._instance.load()
        return cls._instance

    def build_index(
        self,
        embeddings: np.ndarray,
        patch_ids: list[str],
        slide_ids: list[str],
    ) -> int:
        """Build FAISS index from embeddings.

        Args:
            embeddings: (n, 384) float32
            patch_ids: list of patch UUID strings
            slide_ids: list of slide UUID strings (aligned with patch_ids)

        Returns:
            Number of vectors indexed.
        """
        embeddings = embeddings.astype(np.float32).copy()
        faiss.normalize_L2(embeddings)

        self.index = faiss.IndexFlatIP(DIMENSION)
        self.index.add(embeddings)
        self.patch_ids = patch_ids
        self.slide_ids = slide_ids

        self._save()
        logger.info("FAISS index built: %d vectors", len(patch_ids))
        return len(patch_ids)

    def search(
        self,
        query_embedding: np.ndarray,
        k: int = 20,
        exclude_slide_id: str | None = None,
    ) -> list[dict]:
        """Find k most similar patches.

        Returns:
            List of {patch_id, slide_id, similarity}.
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        query = query_embedding.reshape(1, -1).astype(np.float32).copy()
        faiss.normalize_L2(query)

        # Fetch more results if we need to filter
        fetch_k = k * 3 if exclude_slide_id else k
        fetch_k = min(fetch_k, self.index.ntotal)

        scores, indices = self.index.search(query, fetch_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            sid = self.slide_ids[idx]
            if exclude_slide_id and sid == exclude_slide_id:
                continue
            results.append({
                "patch_id": self.patch_ids[idx],
                "slide_id": sid,
                "similarity": round(float(score), 4),
            })
            if len(results) >= k:
                break

        return results

    def get_stats(self) -> dict:
        return {
            "total_vectors": self.index.ntotal if self.index else 0,
            "dimension": DIMENSION,
            "index_file": str(self.index_dir / "patches.index"),
        }

    def _save(self) -> None:
        if self.index is None:
            return
        faiss.write_index(self.index, str(self.index_dir / "patches.index"))
        np.save(str(self.index_dir / "patch_ids.npy"), np.array(self.patch_ids))
        np.save(str(self.index_dir / "slide_ids.npy"), np.array(self.slide_ids))

    def load(self) -> None:
        index_path = self.index_dir / "patches.index"
        if not index_path.exists():
            logger.info("No FAISS index found — will be built on first request")
            return
        self.index = faiss.read_index(str(index_path))
        self.patch_ids = np.load(str(self.index_dir / "patch_ids.npy")).tolist()
        self.slide_ids = np.load(str(self.index_dir / "slide_ids.npy")).tolist()
        logger.info("FAISS index loaded: %d vectors", self.index.ntotal)
