"""Path Foundation embedding generation (TensorFlow/Keras)."""

from __future__ import annotations

import logging

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)


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
        from huggingface_hub import from_pretrained_keras

        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            for gpu in gpus:
                tf.config.experimental.set_memory_growth(gpu, True)
            logger.info("TensorFlow GPU devices: %s", gpus)
        else:
            logger.info("No GPU found — using CPU for embeddings")

        logger.info("Loading Path Foundation model from HuggingFace...")
        self._model = from_pretrained_keras("google/path-foundation")
        self._infer = self._model.signatures["serving_default"]

        # Warmup
        dummy = tf.zeros((1, 224, 224, 3), dtype=tf.float32)
        self._infer(tf.constant(dummy))
        logger.info("Path Foundation model loaded and warmed up.")

    def embed_patch(self, img: np.ndarray) -> np.ndarray:
        """Single patch: (224,224,3) uint8 -> (384,) float32."""
        import tensorflow as tf

        tensor = tf.cast(tf.expand_dims(img, axis=0), tf.float32) / 255.0
        result = self._infer(tf.constant(tensor))
        return result["output_0"].numpy().flatten()

    def embed_batch(self, imgs: list[np.ndarray]) -> np.ndarray:
        """Batch: list of (224,224,3) uint8 -> (n, 384) float32."""
        import tensorflow as tf

        batch_size = settings.EMBEDDING_BATCH_SIZE
        all_embeddings = []

        for i in range(0, len(imgs), batch_size):
            batch = np.stack(imgs[i : i + batch_size])
            tensor = tf.cast(batch, tf.float32) / 255.0
            result = self._infer(tf.constant(tensor))
            all_embeddings.append(result["output_0"].numpy())

        return np.vstack(all_embeddings)
