"""Celery task: generate embeddings for all patches of a slide using a chosen model."""

from __future__ import annotations

import logging
import uuid

import numpy as np
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.embedding import Embedding
from app.models.patch import Patch
from app.models.slide import Slide
from app.services.embedding_service import EmbeddingService, is_model_installed
from app.workers.celery_app import celery

logger = logging.getLogger(__name__)
engine = create_engine(settings.DATABASE_URL_SYNC)


@celery.task(bind=True, name="app.workers.embed_worker.generate_embeddings")
def generate_embeddings(self, slide_id: str, model_id: str = "path-foundation-v1") -> dict:
    sid = uuid.UUID(slide_id)

    if not is_model_installed(model_id):
        return {"error": f"Model '{model_id}' is not installed."}

    svc = EmbeddingService.get_instance()

    with Session(engine) as db:
        slide = db.get(Slide, sid)
        if not slide:
            return {"error": "Slide not found"}

        patches = db.execute(
            select(Patch).where(Patch.slide_id == sid).order_by(Patch.x, Patch.y)
        ).scalars().all()

        if not patches:
            return {"error": "No patches found — tile the slide first"}

        # Skip patches that already have embeddings for this model
        existing = set(
            db.execute(
                select(Embedding.patch_id).where(
                    Embedding.slide_id == sid,
                    Embedding.model_version == model_id,
                )
            ).scalars().all()
        )
        todo = [p for p in patches if p.id not in existing]

        if not todo:
            return {"slide_id": slide_id, "model_id": model_id, "embedded": 0, "status": "already done"}

        total = len(todo)
        batch_size = settings.EMBEDDING_BATCH_SIZE
        embedded = 0

        for i in range(0, total, batch_size):
            batch_patches = todo[i : i + batch_size]
            imgs = []
            for p in batch_patches:
                img = np.array(Image.open(p.file_path).convert("RGB"))
                imgs.append(img)

            vectors = svc.embed_batch(imgs, model_id=model_id)

            for p, vec in zip(batch_patches, vectors):
                db.add(
                    Embedding(
                        patch_id=p.id,
                        slide_id=sid,
                        vector=vec.tolist(),
                        model_version=model_id,
                    )
                )

            embedded += len(batch_patches)
            db.commit()

            self.update_state(
                state="PROGRESS",
                meta={"current": embedded, "total": total, "model_id": model_id},
            )
            logger.info(
                "Embedded %d/%d patches for slide %s (model=%s)",
                embedded, total, slide_id, model_id,
            )

        return {"slide_id": slide_id, "model_id": model_id, "embedded": embedded, "status": "done"}
