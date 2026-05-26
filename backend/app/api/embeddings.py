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

router = APIRouter()


class GenerateRequest(BaseModel):
    slide_id: uuid.UUID


@router.post("/generate")
async def generate_embeddings(req: GenerateRequest, db: AsyncSession = Depends(get_db)):
    slide = await db.get(Slide, req.slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    if slide.status != "tiled":
        raise HTTPException(status_code=400, detail=f"Slide must be tiled first (status={slide.status})")

    from app.workers.embed_worker import generate_embeddings as embed_task

    task = embed_task.delay(str(req.slide_id))
    return {"task_id": task.id, "slide_id": str(req.slide_id)}


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
    return {"patch_id": str(patch_id), "vector": emb.vector}


@router.get("/slide/{slide_id}/count")
async def embedding_count(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    count = await db.scalar(
        select(func.count(Embedding.id)).where(Embedding.slide_id == slide_id)
    )
    return {"slide_id": str(slide_id), "count": count or 0}


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


MAX_PROJECTION_PATCHES = 2000


@router.get("/slide/{slide_id}/projection", response_model=ProjectionResponse)
async def get_slide_projection(
    slide_id: uuid.UUID,
    method: str = Query(default="pca", pattern="^pca$"),
    n_components: int = Query(default=2, ge=2, le=3),
    db: AsyncSession = Depends(get_db),
):
    """Compute a PCA projection of all patch embeddings for a slide."""

    # 1) Fetch all embeddings with their patch coordinates
    stmt = (
        select(Embedding.patch_id, Embedding.vector, Patch.x, Patch.y)
        .join(Patch, Embedding.patch_id == Patch.id)
        .where(Embedding.slide_id == slide_id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        raise HTTPException(status_code=404, detail="No embeddings found for this slide")

    total_patches = len(rows)

    # 2) Sample if too many patches
    if len(rows) > MAX_PROJECTION_PATCHES:
        rows = random.sample(rows, MAX_PROJECTION_PATCHES)

    patch_ids = [row.patch_id for row in rows]
    vectors = np.array([row.vector for row in rows], dtype=np.float32)
    coords = {row.patch_id: (row.x, row.y) for row in rows}

    # 3) Run PCA
    pca = PCA(n_components=n_components)
    projected = pca.fit_transform(vectors)
    explained_variance = pca.explained_variance_ratio_.tolist()

    # 4) Fetch labels for these patches (bulk)
    label_stmt = select(PatchLabel.patch_id, PatchLabel.label).where(
        PatchLabel.patch_id.in_(patch_ids)
    )
    label_result = await db.execute(label_stmt)
    labels_map: dict[uuid.UUID, str] = {
        row.patch_id: row.label for row in label_result.all()
    }

    # 5) Fetch predictions from the latest inference job for this slide
    predictions_map: dict[uuid.UUID, tuple[str, float]] = {}

    latest_job_stmt = (
        select(InferenceJob.id)
        .where(InferenceJob.slide_id == slide_id, InferenceJob.status == "completed")
        .order_by(desc(InferenceJob.completed_at))
        .limit(1)
    )
    latest_job_id = await db.scalar(latest_job_stmt)

    if latest_job_id:
        pred_stmt = (
            select(
                PatchPrediction.patch_id,
                PatchPrediction.predicted_label,
                PatchPrediction.probabilities,
            )
            .where(
                PatchPrediction.inference_job_id == latest_job_id,
                PatchPrediction.patch_id.in_(patch_ids),
            )
        )
        pred_result = await db.execute(pred_stmt)
        for pred_row in pred_result.all():
            probs = pred_row.probabilities
            if isinstance(probs, dict):
                max_conf = max(probs.values()) if probs else 0.0
            elif isinstance(probs, list):
                max_conf = max(probs) if probs else 0.0
            else:
                max_conf = 0.0
            predictions_map[pred_row.patch_id] = (
                pred_row.predicted_label,
                float(max_conf),
            )

    # 6) Build response
    points: list[ProjectionPoint] = []
    for i, pid in enumerate(patch_ids):
        sx, sy = coords[pid]
        pred_info = predictions_map.get(pid)
        points.append(
            ProjectionPoint(
                patch_id=str(pid),
                x=float(projected[i, 0]),
                y=float(projected[i, 1]),
                label=labels_map.get(pid),
                prediction=pred_info[0] if pred_info else None,
                confidence=pred_info[1] if pred_info else None,
                slide_x=sx,
                slide_y=sy,
            )
        )

    return ProjectionResponse(
        method=method,
        points=points,
        explained_variance=explained_variance,
        total_patches=total_patches,
    )
