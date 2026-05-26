import random
import uuid
from typing import Optional

import numpy as np
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sklearn.decomposition import PCA
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.embedding import Embedding
from app.models.inference_job import InferenceJob
from app.models.patch import Patch
from app.models.patch_label import PatchLabel
from app.models.patch_prediction import PatchPrediction
from app.models.slide import Slide
from app.services.embedding_service import list_available_models, get_model_info, MODEL_REGISTRY

MAX_PROJECTION_PATCHES = 2000


class ProjectionPoint(BaseModel):
    patch_id: str
    x: float
    y: float
    label: Optional[str] = None
    prediction: Optional[str] = None
    confidence: Optional[float] = None
    slide_x: int
    slide_y: int


class ProjectionResponse(BaseModel):
    method: str
    points: list[ProjectionPoint]
    explained_variance: list[float]
    total_patches: int

router = APIRouter()


class GenerateRequest(BaseModel):
    slide_id: uuid.UUID
    model_id: str = "path-foundation-v1"


@router.get("/models")
async def get_available_models():
    """Return list of all registered embedding models with metadata."""
    return list_available_models()


@router.post("/generate")
async def generate_embeddings(req: GenerateRequest, db: AsyncSession = Depends(get_db)):
    # Validate model_id
    if req.model_id not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{req.model_id}'. Available: {', '.join(MODEL_REGISTRY)}",
        )

    slide = await db.get(Slide, req.slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    if slide.status != "tiled":
        raise HTTPException(status_code=400, detail=f"Slide must be tiled first (status={slide.status})")

    from app.workers.embed_worker import generate_embeddings as embed_task

    task = embed_task.delay(str(req.slide_id), req.model_id)
    return {"task_id": task.id, "slide_id": str(req.slide_id), "model_id": req.model_id}


@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        meta = result.info or {}
        return {
            "status": "running",
            "current": meta.get("current", 0),
            "total": meta.get("total", 0),
        }
    if result.state == "SUCCESS":
        return {"status": "done", "result": result.result}
    if result.state == "FAILURE":
        return {"status": "error", "error": str(result.result)}
    return {"status": result.state}


@router.get("/patch/{patch_id}")
async def get_patch_embedding(patch_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Embedding).where(Embedding.patch_id == patch_id).limit(1)
    )
    emb = result.scalar_one_or_none()
    if not emb:
        raise HTTPException(status_code=404, detail="No embedding for this patch")
    return {"patch_id": str(patch_id), "vector": emb.vector, "model_version": emb.model_version}


@router.get("/slide/{slide_id}/count")
async def embedding_count(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    count = await db.scalar(
        select(func.count(Embedding.id)).where(Embedding.slide_id == slide_id)
    )
    return {"slide_id": str(slide_id), "count": count or 0}


@router.get("/slide/{slide_id}/projection", response_model=ProjectionResponse)
async def get_slide_projection(
    slide_id: uuid.UUID,
    method: str = Query(default="pca", pattern="^pca$"),
    n_components: int = Query(default=2, ge=2, le=3),
    db: AsyncSession = Depends(get_db),
):
    """Compute a PCA projection of all patch embeddings for a slide."""
    stmt = (
        select(Embedding.patch_id, Embedding.vector, Patch.x, Patch.y)
        .join(Patch, Embedding.patch_id == Patch.id)
        .where(Embedding.slide_id == slide_id)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No embeddings found for this slide")

    total_patches = len(rows)
    if len(rows) > MAX_PROJECTION_PATCHES:
        rows = random.sample(rows, MAX_PROJECTION_PATCHES)

    patch_ids = [r.patch_id for r in rows]
    vectors = np.array([r.vector for r in rows], dtype=np.float32)
    coords = {r.patch_id: (r.x, r.y) for r in rows}

    pca = PCA(n_components=n_components)
    projected = pca.fit_transform(vectors)
    explained_variance = pca.explained_variance_ratio_.tolist()

    label_result = await db.execute(select(PatchLabel.patch_id, PatchLabel.label).where(PatchLabel.patch_id.in_(patch_ids)))
    labels_map = {r.patch_id: r.label for r in label_result.all()}

    predictions_map: dict[uuid.UUID, tuple[str, float]] = {}
    latest_job_id = await db.scalar(
        select(InferenceJob.id).where(InferenceJob.slide_id == slide_id, InferenceJob.status == "complete")
        .order_by(desc(InferenceJob.completed_at)).limit(1)
    )
    if latest_job_id:
        pred_result = await db.execute(
            select(PatchPrediction.patch_id, PatchPrediction.predicted_label, PatchPrediction.probabilities)
            .where(PatchPrediction.inference_job_id == latest_job_id, PatchPrediction.patch_id.in_(patch_ids))
        )
        for pr in pred_result.all():
            probs = pr.probabilities
            max_conf = max(probs.values() if isinstance(probs, dict) else probs) if probs else 0.0
            predictions_map[pr.patch_id] = (pr.predicted_label, float(max_conf))

    points = []
    for i, pid in enumerate(patch_ids):
        sx, sy = coords[pid]
        pred = predictions_map.get(pid)
        points.append(ProjectionPoint(
            patch_id=str(pid), x=float(projected[i, 0]), y=float(projected[i, 1]),
            label=labels_map.get(pid), prediction=pred[0] if pred else None,
            confidence=pred[1] if pred else None, slide_x=sx, slide_y=sy,
        ))

    return ProjectionResponse(method=method, points=points, explained_variance=explained_variance, total_patches=total_patches)
