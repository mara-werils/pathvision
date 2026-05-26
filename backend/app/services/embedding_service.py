"""Multi-model embedding backbone with registry and Path Foundation default."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ModelConfig:
    id: str
    name: str
    hub_id: str
    dim: int
    framework: str
    description: str
    best_for: list[str] = field(default_factory=list)


MODEL_REGISTRY: dict[str, ModelConfig] = {
    "path-foundation-v1": ModelConfig(
        id="path-foundation-v1",
        name="Google Path Foundation",
        hub_id="google/path-foundation",
        dim=384,
        framework="tensorflow",
        description="ViT-S/14 trained on pathology images. Good general-purpose baseline.",
        best_for=["general", "breast", "lung"],
    ),
    "uni-v1": ModelConfig(
        id="uni-v1",
        name="UNI (Harvard)",
        hub_id="MahmoodLab/UNI",
        dim=1024,
        framework="pytorch",
        description="ViT-H trained on 100K slides, 20 tissue types. Strong all-rounder.",
        best_for=["pan-cancer", "rare-tumors"],
    ),
    "conch-v1": ModelConfig(
        id="conch-v1",
        name="CONCH (Vision-Language)",
        hub_id="MahmoodLab/CONCH",
        dim=512,
        framework="pytorch",
        description="Vision-language model. Enables text-guided search and zero-shot classification.",
        best_for=["zero-shot", "text-search", "multi-task"],
    ),
}

# Models that are actually loadable in this environment
_INSTALLED_MODELS: set[str] = {"path-foundation-v1"}


def get_model_info(model_id: str) -> ModelConfig:
    """Return config for a registered model or raise ``KeyError``."""
    if model_id not in MODEL_REGISTRY:
        raise KeyError(
            f"Unknown model '{model_id}'. "
            f"Available: {', '.join(MODEL_REGISTRY)}"
        )
    return MODEL_REGISTRY[model_id]


def list_available_models() -> list[dict[str, Any]]:
    """Return metadata for every registered model, including install status."""
    result: list[dict[str, Any]] = []
    for cfg in MODEL_REGISTRY.values():
        result.append({
            "id": cfg.id,
            "name": cfg.name,
            "dim": cfg.dim,
            "framework": cfg.framework,
            "description": cfg.description,
            "best_for": list(cfg.best_for),
            "installed": cfg.id in _INSTALLED_MODELS,
        })
    return result


def is_model_installed(model_id: str) -> bool:
    return model_id in _INSTALLED_MODELS


# ---------------------------------------------------------------------------
# Embedding service (singleton per model)
# ---------------------------------------------------------------------------

class EmbeddingService:
    """Singleton that holds the Path Foundation model and generates embeddings."""

    _instance: EmbeddingService | None = None
    _model = None
    _infer = None

    @classmethod
    def get_instance(cls) -> EmbeddingService:
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._load_model()
        return cls._instance

    def _load_model(self) -> None:
        import tensorflow as tf
        from huggingface_hub import snapshot_download

        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            for gpu in gpus:
                tf.config.experimental.set_memory_growth(gpu, True)
            logger.info("TensorFlow GPU devices: %s", gpus)
        else:
            logger.info("No GPU found — using CPU for embeddings")

        logger.info("Downloading Path Foundation model from HuggingFace...")
        model_path = snapshot_download("google/path-foundation")
        logger.info("Loading SavedModel from %s", model_path)

        self._model = tf.saved_model.load(model_path)
        self._infer = self._model.signatures["serving_default"]

        # Warmup
        dummy = tf.zeros((1, 224, 224, 3), dtype=tf.float32)
        self._infer(dummy)
        logger.info("Path Foundation model loaded and warmed up.")

    def embed_patch(self, img: np.ndarray, model_id: str = "path-foundation-v1") -> np.ndarray:
        """Single patch: (224,224,3) uint8 -> (dim,) float32."""
        self._ensure_model(model_id)
        import tensorflow as tf

        tensor = tf.cast(tf.expand_dims(img, axis=0), tf.float32) / 255.0
        result = self._infer(tensor)
        out_key = list(result.keys())[0]
        return result[out_key].numpy().flatten()

    def embed_batch(self, imgs: list[np.ndarray], model_id: str = "path-foundation-v1") -> np.ndarray:
        """Batch: list of (224,224,3) uint8 -> (n, dim) float32."""
        self._ensure_model(model_id)
        import tensorflow as tf

        batch_size = settings.EMBEDDING_BATCH_SIZE
        all_embeddings = []
        out_key = None

        for i in range(0, len(imgs), batch_size):
            batch = np.stack(imgs[i : i + batch_size])
            tensor = tf.cast(batch, tf.float32) / 255.0
            result = self._infer(tensor)
            if out_key is None:
                out_key = list(result.keys())[0]
            all_embeddings.append(result[out_key].numpy())

        return np.vstack(all_embeddings)

    @staticmethod
    def _ensure_model(model_id: str) -> None:
        """Validate that the requested model is installed and usable."""
        if model_id not in MODEL_REGISTRY:
            raise ValueError(
                f"Unknown model '{model_id}'. "
                f"Available: {', '.join(MODEL_REGISTRY)}"
            )
        if model_id not in _INSTALLED_MODELS:
            cfg = MODEL_REGISTRY[model_id]
            raise RuntimeError(
                f"Model '{cfg.name}' ({model_id}) is not installed. "
                f"Install with: pip install {cfg.framework} && "
                f"huggingface-cli download {cfg.hub_id}"
            )
