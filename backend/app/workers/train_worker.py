"""Celery task: train a linear probe classifier from labeled embeddings."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import numpy as np
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.classifier import Classifier
from app.models.embedding import Embedding
from app.models.patch_label import PatchLabel
from app.services.classifier_service import ClassifierService
from app.workers.celery_app import celery

logger = logging.getLogger(__name__)
engine = create_engine(settings.DATABASE_URL_SYNC)


@celery.task(bind=True, name="app.workers.train_worker.train_classifier")
def train_classifier(self, classifier_id: str) -> dict:
    cid = uuid.UUID(classifier_id)
    svc = ClassifierService()

    with Session(engine) as db:
        clf_record = db.get(Classifier, cid)
        if not clf_record:
            return {"error": "Classifier not found"}

        class_names = clf_record.class_names  # list[str]
        class_to_idx = {name: i for i, name in enumerate(class_names)}

        # Get labeled patches that have embeddings, filtered by label_source if set
        query = (
            select(Embedding.vector, PatchLabel.label)
            .join(PatchLabel, PatchLabel.patch_id == Embedding.patch_id)
            .where(PatchLabel.label.in_(class_names))
        )
        if clf_record.label_source:
            query = query.where(PatchLabel.label_source == clf_record.label_source)

        rows = db.execute(query).all()

        if len(rows) < 10:
            clf_record.status = "error"
            clf_record.metrics = {"error": f"Not enough labeled data ({len(rows)} samples, need >= 10)"}
            db.commit()
            return {"error": "Not enough labeled data"}

        embeddings = np.array([r[0] for r in rows], dtype=np.float32)
        labels = np.array([class_to_idx[r[1]] for r in rows], dtype=np.int64)

        # Save path
        clf_dir = Path(settings.DATA_DIR) / "classifiers"
        clf_dir.mkdir(parents=True, exist_ok=True)
        save_path = str(clf_dir / f"{classifier_id}.joblib")

        try:
            metrics = svc.train(embeddings, labels, class_names, save_path)

            clf_record.model_path = save_path
            clf_record.n_training_samples = len(labels)
            clf_record.metrics = metrics
            clf_record.status = "ready"
            db.commit()

            logger.info("Classifier %s trained — AUC: %s", classifier_id, metrics.get("auc"))
            return {"classifier_id": classifier_id, "status": "ready", "metrics": metrics}

        except Exception as e:
            logger.exception("Training failed for classifier %s", classifier_id)
            clf_record.status = "error"
            clf_record.metrics = {"error": str(e)}
            db.commit()
            return {"error": str(e)}
