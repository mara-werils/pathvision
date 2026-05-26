import uuid
from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.embedding import Embedding
from app.models.slide import Slide
from app.services.embedding_service import list_available_models, get_model_info, MODEL_REGISTRY

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
