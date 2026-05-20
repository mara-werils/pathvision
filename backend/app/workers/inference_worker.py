"""Celery task: run a trained classifier on all embeddings of a slide."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.embedding import Embedding
from app.models.inference_job import InferenceJob
from app.models.patch_prediction import PatchPrediction
from app.models.slide import Slide
from app.services.classifier_service import ClassifierService
from app.workers.celery_app import celery

logger = logging.getLogger(__name__)
engine = create_engine(settings.DATABASE_URL_SYNC)


@celery.task(bind=True, name="app.workers.inference_worker.run_inference")
def run_inference(self, job_id: str) -> dict:
    jid = uuid.UUID(job_id)
    svc = ClassifierService()

    with Session(engine) as db:
        job = db.get(InferenceJob, jid)
        if not job:
            return {"error": "Job not found"}

        from app.models.classifier import Classifier

        clf_record = db.get(Classifier, job.classifier_id)
        if not clf_record or clf_record.status != "ready":
            job.status = "error"
            db.commit()
            return {"error": "Classifier not ready"}

        # Get embeddings for this slide
        rows = db.execute(
            select(Embedding.patch_id, Embedding.vector)
            .where(Embedding.slide_id == job.slide_id)
        ).all()

        if not rows:
            job.status = "error"
            db.commit()
            return {"error": "No embeddings for this slide"}

        job.status = "running"
        job.progress_total = len(rows)
        db.commit()

        patch_ids = [r[0] for r in rows]
        embeddings = np.array([r[1] for r in rows], dtype=np.float32)

        result = svc.predict(clf_record.model_path, embeddings)
        class_names = clf_record.class_names

        predictions_db = []
        for pid, pred_cls, probs in zip(
            patch_ids, result["predictions"], result["probabilities"]
        ):
            predictions_db.append(
                PatchPrediction(
                    inference_job_id=jid,
                    patch_id=pid,
                    predicted_class=pred_cls,
                    predicted_label=class_names[pred_cls],
                    probabilities=probs,
                )
            )

        db.bulk_save_objects(predictions_db)

        # Summary
        preds = np.array(result["predictions"])
        summary = {
            "total_patches": len(preds),
            "class_distribution": {
                name: int((preds == i).sum())
                for i, name in enumerate(class_names)
            },
            "class_names": class_names,
        }

        # Generate heatmap
        heatmap_path = None
        try:
            from app.models.patch import Patch
            from app.services.heatmap_service import HeatmapService

            slide = db.get(Slide, job.slide_id)
            if slide and slide.width and slide.height:
                # Build prediction data with coordinates
                patch_map = {}
                patches_db = db.execute(
                    select(Patch.id, Patch.x, Patch.y).where(Patch.slide_id == job.slide_id)
                ).all()
                for pid_row, x_row, y_row in patches_db:
                    patch_map[pid_row] = (x_row, y_row)

                hm_predictions = []
                for pid, pred_cls, probs in zip(
                    patch_ids, result["predictions"], result["probabilities"]
                ):
                    coords = patch_map.get(pid)
                    if coords:
                        hm_predictions.append({
                            "x": coords[0],
                            "y": coords[1],
                            "predicted_class": pred_cls,
                            "confidence": max(probs),
                            "probabilities": probs,
                        })

                hm_dir = Path(settings.DATA_DIR) / "heatmaps"
                hm_dir.mkdir(parents=True, exist_ok=True)
                hm_path = str(hm_dir / f"{job_id}.png")

                HeatmapService().generate(
                    predictions=hm_predictions,
                    slide_width=slide.width,
                    slide_height=slide.height,
                    patch_size=224,
                    level_downsample=1.0,
                    save_path=hm_path,
                )
                heatmap_path = hm_path

                # Also generate confidence map for class 1 (e.g. tumor)
                if len(class_names) >= 2:
                    conf_path = str(hm_dir / f"{job_id}_conf.png")
                    HeatmapService().generate_confidence_map(
                        predictions=hm_predictions,
                        slide_width=slide.width,
                        slide_height=slide.height,
                        patch_size=224,
                        level_downsample=1.0,
                        target_class=1,
                        save_path=conf_path,
                    )
        except Exception as e:
            logger.warning("Heatmap generation failed: %s", e)

        job.status = "complete"
        job.progress_current = len(rows)
        job.summary = summary
        job.heatmap_path = heatmap_path
        job.completed_at = datetime.now(timezone.utc)
        db.commit()

        logger.info("Inference job %s complete: %d patches", job_id, len(rows))
        return {"job_id": job_id, "status": "complete", "summary": summary}
