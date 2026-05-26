import os
import shutil

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.models.classifier import Classifier
from app.models.embedding import Embedding
from app.models.inference_job import InferenceJob
from app.models.patch import Patch
from app.models.patch_label import PatchLabel
from app.models.slide import Slide

router = APIRouter()


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    slides_count = await db.scalar(select(func.count(Slide.id))) or 0
    patches_count = await db.scalar(select(func.count(Patch.id))) or 0
    embeddings_count = await db.scalar(select(func.count(Embedding.id))) or 0
    classifiers_count = await db.scalar(select(func.count(Classifier.id))) or 0
    jobs_count = await db.scalar(select(func.count(InferenceJob.id))) or 0
    ready_classifiers = await db.scalar(
        select(func.count(Classifier.id)).where(Classifier.status == "ready")
    ) or 0
    labels_count = await db.scalar(select(func.count(PatchLabel.id))) or 0
    interactive_labels = await db.scalar(
        select(func.count(PatchLabel.id)).where(PatchLabel.label_source == "interactive")
    ) or 0

    # Label class distribution (all sources)
    label_rows = await db.execute(
        select(PatchLabel.label, func.count(PatchLabel.id)).group_by(PatchLabel.label)
    )
    label_classes = {row[0]: row[1] for row in label_rows.all()}

    # Interactive-only class distribution
    interactive_rows = await db.execute(
        select(PatchLabel.label, func.count(PatchLabel.id))
        .where(PatchLabel.label_source == "interactive")
        .group_by(PatchLabel.label)
    )
    interactive_classes = {row[0]: row[1] for row in interactive_rows.all()}

    return {
        "slides": slides_count,
        "patches": patches_count,
        "embeddings": embeddings_count,
        "classifiers": classifiers_count,
        "ready_classifiers": ready_classifiers,
        "inference_jobs": jobs_count,
        "labels": labels_count,
        "interactive_labels": interactive_labels,
        "label_classes": label_classes,
        "interactive_classes": interactive_classes,
    }


@router.get("/recent")
async def get_recent_activity(db: AsyncSession = Depends(get_db)):
    # Recent slides
    slides = await db.execute(
        select(Slide.id, Slide.filename, Slide.status, Slide.created_at)
        .order_by(Slide.created_at.desc())
        .limit(5)
    )
    recent_slides = [
        {"type": "slide", "id": str(s[0]), "name": s[1], "status": s[2], "time": s[3].isoformat()}
        for s in slides.all()
    ]

    # Recent classifiers
    clfs = await db.execute(
        select(Classifier.id, Classifier.name, Classifier.status, Classifier.created_at)
        .order_by(Classifier.created_at.desc())
        .limit(5)
    )
    recent_clfs = [
        {"type": "classifier", "id": str(c[0]), "name": c[1], "status": c[2], "time": c[3].isoformat()}
        for c in clfs.all()
    ]

    # Recent inference jobs
    jobs = await db.execute(
        select(InferenceJob.id, InferenceJob.status, InferenceJob.created_at)
        .order_by(InferenceJob.created_at.desc())
        .limit(5)
    )
    recent_jobs = [
        {"type": "inference", "id": str(j[0]), "name": f"Job {str(j[0])[:8]}", "status": j[1], "time": j[2].isoformat()}
        for j in jobs.all()
    ]

    activity = recent_slides + recent_clfs + recent_jobs
    activity.sort(key=lambda x: x["time"], reverse=True)
    return activity[:10]


@router.get("/health")
async def health():
    # Disk usage
    data_dir = settings.DATA_DIR
    total, used, free = shutil.disk_usage(data_dir) if os.path.exists(data_dir) else (0, 0, 0)

    # GPU check
    gpu_available = False
    gpu_name = None
    try:
        import tensorflow as tf
        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            gpu_available = True
            gpu_name = gpus[0].name
    except Exception:
        pass

    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "disk_total_gb": round(total / (1024**3), 1),
        "disk_used_gb": round(used / (1024**3), 1),
        "disk_free_gb": round(free / (1024**3), 1),
    }
